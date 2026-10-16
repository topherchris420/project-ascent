import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calculateCma } from './analytics';
import { HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace } from './db';
import { scopeWorkspaceForAccess } from './fabric';
import { inspectFairHousing } from './fair-housing';
import type { FairHousingSurface } from './domain-types';
import { appendAudit, find } from './service';
import { recordProductAction } from './product';
import type { Actor, CmaAssumptions, Workspace } from './types';
import type { MigrationCommit, MigrationEntity, MigrationKind, MigrationOperation, MigrationPreview, MigrationRow, MigrationState } from './migration-types';

export const migrationFields: Record<MigrationKind, string[]> = { contacts: ['name', 'email', 'stage', 'budget', 'preferences'], preferences: ['email', 'preferences'], searches: ['email', 'name', 'query', 'maxPrice'], milestones: ['transactionId', 'title', 'dueAt'], notes: ['email', 'note', 'date'], documentRefs: ['documentId', 'label'] };
const kind = z.enum(['contacts', 'preferences', 'searches', 'milestones', 'notes', 'documentRefs']);
const partialAssumptions = z.strictObject({ sqftRate: z.number().min(0).max(1000).optional(), bedroomValue: z.number().min(0).max(1e6).optional(), bathroomValue: z.number().min(0).max(1e6).optional(), conditionValue: z.number().min(0).max(1e6).optional(), monthlyTrend: z.number().min(-0.1).max(0.1).optional(), maxDistanceMiles: z.number().min(0.1).max(100).optional(), maxAgeDays: z.number().int().min(1).max(1825).optional(), maxSizeRatio: z.number().min(1).max(3).optional() });
export const migrationActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('preview'), kind, csv: z.string().min(1).max(60000), mapping: z.record(z.string().max(100), z.string().max(100)).default({}), sourceName: z.string().trim().min(1).max(150), attestation: z.strictObject({ authorized: z.literal(true), noMls: z.literal(true) }) }),
  z.strictObject({ action: z.literal('commit'), previewId: z.uuid(), baseHash: z.string().length(64), consent: z.literal(true), decisions: z.record(z.string().regex(/^\d+$/), z.enum(['skip', 'update'])).default({}) }),
  z.strictObject({ action: z.literal('rollback'), commitId: z.uuid() }),
  z.strictObject({ action: z.literal('compare'), cmaId: z.string().min(1).max(100), baselineAssumptions: partialAssumptions, candidateAssumptions: partialAssumptions, expectedDatasetHash: z.string().length(64).optional() }),
]);
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}` : JSON.stringify(value) ?? 'null';
export const migrationHash = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
export function ensureMigration(workspace: Workspace): MigrationState { return workspace.migration ??= { version: 1, previews: [], commits: [], documentRefs: [] }; }
export function purgeMigrationPreviews(workspace: Workspace, at = new Date().toISOString()) {
  const state = ensureMigration(workspace); state.previews = state.previews.filter(item => Date.parse(item.expiresAt) > Date.parse(at));
  for (const commit of state.commits) if (Date.parse(commit.rollbackUntil) <= Date.parse(at)) commit.operations = [];
}
export const migrationBaseHash = (workspace: Workspace) => migrationHash({ clients: workspace.clients, searches: workspace.savedSearches, transactions: workspace.transactions, documents: workspace.documents, documentRefs: workspace.migration?.documentRefs ?? [] });

/** RFC 4180 quoted fields, doubled quotes and quoted CR/LF; no evaluation or adapters. */
export function parseCsv(csv: string): string[][] {
  if (Buffer.byteLength(csv, 'utf8') > 100000) throw new HttpError(413, 'CSV exceeds 100 KB.');
  csv = csv.replace(/^\uFEFF/, ''); const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; if (row.length > 30) throw new HttpError(400, 'CSV has more than 30 columns.'); };
  const finishRow = () => { finishField(); if (row.some(value => value.length)) rows.push(row); row = []; if (rows.length > 201) throw new HttpError(400, 'Preview at most 200 data rows.'); };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) { if (char === '"') { if (csv[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += char; }
    else if (char === ',') finishField();
    else if (char === '\n' || char === '\r') { finishRow(); if (char === '\r' && csv[i + 1] === '\n') i++; }
    else if (char === '"' && !field && !closed) quoted = true;
    else { if (closed || char === '"') throw new HttpError(400, 'Malformed CSV quoting.'); field += char; }
    if (field.length > 5000) throw new HttpError(400, 'A CSV field exceeds 5,000 characters.');
  }
  if (quoted) throw new HttpError(400, 'CSV contains an unterminated quoted field.');
  if (field.length || row.length || closed) finishRow();
  if (rows.length < 2) throw new HttpError(400, 'Include a header and at least one data row.');
  rows[0] = rows[0].map(value => value.trim());
  if (rows[0].some(value => !value || value.length > 100) || new Set(rows[0].map(value => value.toLowerCase())).size !== rows[0].length) throw new HttpError(400, 'CSV headers must be nonempty and unique.');
  if (rows.slice(1).some(item => item.length !== rows[0].length)) throw new HttpError(400, 'CSV rows must match the header column count.');
  return rows;
}
const clean = (value: unknown, maximum = 5000) => z.string().trim().max(maximum).refine(text => !/[\u0000\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text), 'Invalid control character.').parse(value);
const email = (value: unknown) => z.email().max(254).parse(clean(value, 254)).toLowerCase();
const amount = (value: string) => z.number().finite().min(0).max(1e9).parse(Number(value.replace(/[$,]/g, '')));
const isoDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('Use a real ISO date.'); return new Date(value).toISOString(); };
function planRows(workspace: Workspace, importKind: MigrationKind, csv: string, mapping: Record<string, string>): MigrationRow[] {
  const [headers, ...values] = parseCsv(csv); const allowed = migrationFields[importKind];
  if (headers.some(header => /(mls|listing|parcel|soldprice|closeprice|saleprice|latitude|longitude|unparsedaddress|property)/i.test(header))) throw new HttpError(400, 'MLS/property rows are not supported by the user-workflow importer. Use authorized source ingestion.');
  if (Object.keys(mapping).some(key => !allowed.includes(key))) throw new HttpError(400, 'Mapping contains an unsupported target field.');
  const selected = Object.fromEntries(allowed.flatMap(target => { const header = mapping[target] || headers.find(item => item.toLowerCase() === target.toLowerCase()); if (!header) return []; const index = headers.indexOf(header); if (index < 0) throw new HttpError(400, `Mapped column ${header} is missing.`); return [[target, index]]; }));
  const scoped = scopeWorkspaceForAccess(workspace); const seen = new Map<string, string>();
  return values.map((cells, index) => {
    const raw = Object.fromEntries(Object.entries(selected).map(([key, cell]) => [key, cells[cell as number]])); let entity: MigrationEntity = 'client';
    try {
      let proposed: Record<string, unknown> = {}, existing: Record<string, unknown> | undefined, parentId: string | undefined;
      if (['contacts', 'preferences', 'searches', 'notes'].includes(importKind)) {
        const address = email(raw.email); const client = scoped.clients.find(item => item.email.trim().toLowerCase() === address); parentId = client?.id;
        if (importKind === 'contacts') { proposed = { email: address, name: z.string().min(1).max(150).parse(clean(raw.name, 150)) }; if (raw.stage) proposed.stage = z.enum(['lead', 'active', 'under-contract', 'closed']).parse(raw.stage); if (raw.budget) proposed.budget = amount(raw.budget); if ('preferences' in raw) proposed.preferences = clean(raw.preferences); existing = client as unknown as Record<string, unknown>; }
        if (importKind === 'preferences') { if (!client) throw new Error('No existing client matches this email. Import contacts first.'); proposed = { preferences: clean(raw.preferences) }; existing = client as unknown as Record<string, unknown>; }
        if (importKind === 'searches') { entity = 'search'; if (!client) throw new Error('No existing client matches this email.'); proposed = { clientId: client.id, name: z.string().min(1).max(150).parse(clean(raw.name, 150)), query: clean(raw.query ?? '', 500), maxPrice: amount(raw.maxPrice) }; existing = scoped.savedSearches.find(item => item.clientId === client.id && item.name.toLowerCase() === String(proposed.name).toLowerCase()) as unknown as Record<string, unknown>; }
        if (importKind === 'notes') { entity = 'note'; if (!client) throw new Error('No existing client matches this email.'); proposed = { note: z.string().min(1).parse(clean(raw.note)), date: raw.date ? isoDate(raw.date) : new Date().toISOString() }; existing = client.timeline.find(item => item.note === proposed.note) as unknown as Record<string, unknown>; }
      } else if (importKind === 'milestones') { entity = 'milestone'; const target = find(scoped.transactions, clean(raw.transactionId, 100), 'Transaction'); parentId = target.id; proposed = { title: z.string().min(1).max(200).parse(clean(raw.title, 200)), dueAt: isoDate(raw.dueAt) }; existing = target.milestones.find(item => item.title.toLowerCase() === String(proposed.title).toLowerCase()) as unknown as Record<string, unknown>; }
      else { entity = 'documentRef'; const document = find(scoped.documents, clean(raw.documentId, 100), 'Uploaded document'); proposed = { documentId: document.id, label: z.string().min(1).max(200).parse(clean(raw.label || document.name, 200)) }; existing = workspace.migration?.documentRefs.find(item => item.documentId === document.id && item.label === proposed.label) as unknown as Record<string, unknown>; }
      validateImportedText(entity, proposed);
      const identity = importKind === 'contacts' || importKind === 'preferences' ? String(raw.email).toLowerCase().trim() : `${entity}:${parentId ?? ''}:${proposed.name ?? proposed.title ?? proposed.note ?? proposed.documentId}`;
      const bodyHash = migrationHash(proposed), prior = seen.get(identity); if (prior) return { row: index + 2, entity, status: prior === bodyHash ? 'skip' : 'invalid', proposed, message: prior === bodyHash ? 'Duplicate input row.' : 'Conflicting duplicate input identity; resolve the source CSV first.' };
      seen.set(identity, bodyHash);
      const conflictFields = existing ? Object.keys(proposed).filter(key => migrationHash(existing![key]) !== migrationHash(proposed[key])) : [];
      return { row: index + 2, entity, parentId, targetId: existing?.id as string | undefined ?? randomUUID(), proposed, status: existing ? conflictFields.length && entity !== 'note' ? 'conflict' : 'skip' : 'create', ...(conflictFields.length ? { conflictFields } : {}) };
    } catch (error) { return { row: index + 2, entity, status: 'invalid', proposed: {}, message: error instanceof z.ZodError ? 'Check mapped values and required fields.' : error instanceof Error ? error.message : 'Invalid row.' }; }
  });
}
type ObjectRecord = Record<string, unknown>;
function collection(workspace: Workspace, entity: MigrationEntity, parentId?: string): ObjectRecord[] {
  if (entity === 'client') return workspace.clients as unknown as ObjectRecord[];
  if (entity === 'search') return workspace.savedSearches as unknown as ObjectRecord[];
  if (entity === 'documentRef') return ensureMigration(workspace).documentRefs as unknown as ObjectRecord[];
  if (entity === 'milestone') return find(workspace.transactions, parentId ?? '', 'Transaction').milestones as unknown as ObjectRecord[];
  return find(workspace.clients, parentId ?? '', 'Client').timeline as unknown as ObjectRecord[];
}
function validateRowAccess(workspace: Workspace, row: MigrationRow) {
  const scoped = scopeWorkspaceForAccess(workspace);
  if (row.entity === 'client' && workspace.clients.some(client => client.id === row.targetId)) find(scoped.clients, row.targetId!, 'Client');
  if (row.entity === 'milestone') find(scoped.transactions, row.parentId ?? '', 'Transaction');
  if (row.entity === 'note' || row.entity === 'search') find(scoped.clients, row.parentId ?? '', 'Client');
  if (row.entity === 'documentRef') find(scoped.documents, String(row.proposed.documentId), 'Uploaded document');
}
function validateImportedText(entity: MigrationEntity, proposed: Record<string, unknown>) {
  const candidates: { text: string; surface: FairHousingSurface }[] = [];
  if (entity === 'client' && typeof proposed.preferences === 'string') candidates.push({ text: proposed.preferences, surface: 'client-preferences' });
  if (entity === 'search') candidates.push({ text: `${proposed.name ?? ''}\n${proposed.query ?? ''}`, surface: 'search' });
  if (entity === 'note') candidates.push({ text: String(proposed.note ?? ''), surface: 'client-communication' });
  for (const candidate of candidates) { const assessment = inspectFairHousing(candidate.text, { surface: candidate.surface }); if (assessment.decision !== 'allow') throw new HttpError(422, `Import held by ${assessment.policyVersion}: clarify or remove unsupported preference criteria before importing. This automated check is not legal certification.`); }
}
const summary = (preview: MigrationPreview) => ({ ...preview, rows: preview.rows });
const commitSummary = ({ operations: _privateUndo, ...commit }: MigrationCommit) => commit;
export function migrationSnapshot(workspace: Workspace) {
  const scoped = scopeWorkspaceForAccess(workspace);
  const state = ensureMigration(scoped), accessible = new Set(scoped.documents.map(item => item.id));
  return { previews: state.previews.filter(item => Date.parse(item.expiresAt) > Date.now()).map(summary), commits: state.commits.map(commitSummary), documentRefs: state.documentRefs.filter(item => accessible.has(item.documentId)), fields: migrationFields, policy: { previewMinutes: 30, maxRows: 200, maxCsvCharacters: 60000, rollbackDays: 7, noMls: true, note: 'Private user-owned workflow import. No MLS ingestion, binary duplication or implicit consent. Expired preview data is purged on access/maintenance.' } };
}
export async function getMigrationSnapshot(actor: Actor) { return (await mutateWorkspace(actor, workspace => { purgeMigrationPreviews(workspace); return migrationSnapshot(workspace); })).result; }
export async function executeMigrationAction(actor: Actor, raw: unknown) {
  requireEditor(actor); const input = migrationActionSchema.parse(raw);
  if (input.action === 'compare') {
    const workspace = scopeWorkspaceForAccess(await getWorkspace(actor.tenantId), 'export'); const record = find(workspace.cmas, input.cmaId, 'CMA'); const snapshot = record.result.inputSnapshot;
    if (!snapshot) throw new HttpError(422, 'The CMA has no frozen input dataset.');
    const datasetHash = migrationHash({ ...snapshot, asOf: record.result.asOf }); if (input.expectedDatasetHash && input.expectedDatasetHash !== datasetHash) throw new HttpError(409, 'Comparison dataset hashes differ.');
    const baseline = calculateCma(snapshot.subject, snapshot.candidates, { ...record.result.assumptions, ...input.baselineAssumptions } as CmaAssumptions, record.result.asOf); const candidate = calculateCma(snapshot.subject, snapshot.candidates, { ...record.result.assumptions, ...input.candidateAssumptions } as CmaAssumptions, record.result.asOf);
    return { comparison: { datasetHash, equivalentDataset: true, baseline, candidate, delta: candidate.estimate - baseline.estimate, note: 'Same frozen dataset and as-of, explicit assumption variants. Deterministic sensitivity only; no Homesolo comparison or accuracy superiority.' } };
  }
  return (await mutateWorkspace(actor, workspace => {
    const state = ensureMigration(workspace); purgeMigrationPreviews(workspace); const now = new Date().toISOString();
    if (input.action === 'preview') {
      const rows = planRows(workspace, input.kind, input.csv, input.mapping); const preview: MigrationPreview = { id: randomUUID(), kind: input.kind, sourceName: input.sourceName, createdAt: now, expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), baseHash: migrationBaseHash(workspace), rows, summary: rows.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts; }, {}) };
      state.previews.unshift(preview); state.previews = state.previews.slice(0, 10); appendAudit(workspace, actor, 'migrationPreview', preview.id, `${input.kind}: ${rows.length} bounded rows previewed with authorized/no-MLS attestation. No user fields copied into audit.`); return { preview: summary(preview) };
    }
    if (input.action === 'rollback') {
      const commit = find(state.commits, input.commitId, 'Import commit'); if (actor.role !== 'owner' && commit.createdBy !== actor.id) throw new HttpError(403, 'Only the importer or owner may roll back this import.');
      if (commit.status === 'rolled-back') return { commit: commitSummary(commit), ...commit.rollbackResult };
      if (Date.parse(commit.rollbackUntil) <= Date.now()) throw new HttpError(410, 'The private undo window has expired.');
      let rolledBack = 0, preserved = 0;
      for (const operation of [...commit.operations].reverse()) {
        try { validateRowAccess(workspace, { row: 0, entity: operation.entity, targetId: operation.targetId, parentId: operation.parentId, status: 'update', proposed: operation.after }); } catch { preserved++; continue; }
        let items: ObjectRecord[]; try { items = collection(workspace, operation.entity, operation.parentId); } catch { preserved++; continue; }
        const index = items.findIndex(item => item.id === operation.targetId), target = items[index]; if (!target) { preserved++; continue; }
        if (operation.created) {
          const referenced = operation.entity === 'client' && (workspace.transactions.some(item => item.clientId === operation.targetId) || workspace.savedSearches.some(item => item.clientId === operation.targetId));
          if (!referenced && migrationHash(target) === migrationHash(operation.after)) { items.splice(index, 1); rolledBack++; } else preserved++;
        } else for (const field of Object.keys(operation.after)) { if (migrationHash(target[field]) === migrationHash(operation.after[field])) { if (Object.hasOwn(operation.before, field)) target[field] = operation.before[field]; else delete target[field]; rolledBack++; } else preserved++; }
      }
      commit.status = 'rolled-back'; commit.rolledBackAt = now; commit.rollbackResult = { rolledBack, preserved }; commit.operations = []; appendAudit(workspace, actor, 'migrationRollback', commit.id, `${rolledBack} unchanged imported fields/records reverted; ${preserved} later-changed or referenced items preserved.`); return { commit: commitSummary(commit), rolledBack, preserved };
    }
    const prior = state.commits.find(item => item.previewId === input.previewId); if (prior) return { commit: commitSummary(prior), duplicate: true };
    const preview = state.previews.find(item => item.id === input.previewId); if (!preview) throw new HttpError(410, 'Preview expired or was not found in this workspace.');
    if (input.baseHash !== preview.baseHash || migrationBaseHash(workspace) !== preview.baseHash) throw new HttpError(409, 'Workspace data changed after preview. Create a fresh preview; nothing was imported.');
    for (const row of preview.rows) if (row.status === 'conflict' && !input.decisions[String(row.row)]) throw new HttpError(409, `Choose skip or update for conflicting row ${row.row}.`);
    const commit: MigrationCommit = { id: randomUUID(), previewId: preview.id, kind: preview.kind, createdAt: now, createdBy: actor.id, rollbackUntil: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'committed', operations: [], created: 0, updated: 0, skipped: 0 };
    for (const row of preview.rows) {
      if (row.status === 'invalid' || row.status === 'skip' || input.decisions[String(row.row)] === 'skip') { commit.skipped++; continue; }
      validateRowAccess(workspace, row); validateImportedText(row.entity, row.proposed); const items = collection(workspace, row.entity, row.parentId); const existing = items.find(item => item.id === row.targetId);
      if (existing) { const before = Object.fromEntries(Object.keys(row.proposed).filter(key => Object.hasOwn(existing, key)).map(key => [key, structuredClone(existing[key])])); Object.assign(existing, row.proposed); commit.operations.push({ entity: row.entity, targetId: row.targetId!, parentId: row.parentId, created: false, before, after: structuredClone(row.proposed) }); commit.updated++; }
      else {
        const defaults = row.entity === 'client' ? { stage: 'lead', budget: 0, preferences: '', savedPropertyIds: [], timeline: [{ date: now, note: 'Authorized contact import.' }] } : row.entity === 'search' ? { createdAt: now } : row.entity === 'milestone' ? { status: 'pending' } : row.entity === 'documentRef' ? { importId: commit.id } : {};
        const created = { id: row.targetId!, ...defaults, ...row.proposed }; items.push(created); commit.operations.push({ entity: row.entity, targetId: row.targetId!, parentId: row.parentId, created: true, before: {}, after: structuredClone(created) }); commit.created++;
      }
    }
    preview.committedId = commit.id; state.commits.unshift(commit); state.commits = state.commits.slice(0, 50); state.previews = state.previews.filter(item => item.id !== preview.id); appendAudit(workspace, actor, 'migrationCommit', commit.id, `${commit.created} created, ${commit.updated} updated, ${commit.skipped} skipped with explicit consent; import content excluded from audit.`); recordProductAction(workspace, actor, 'migrationCommit', commit.id); return { commit: commitSummary(commit) };
  })).result;
}
export function csvCell(value: unknown): string { let text = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
export function portableExport(workspace: Workspace) {
  const scoped = scopeWorkspaceForAccess(workspace, 'export');
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), organization: scoped.settings.organization, mode: scoped.mode, asOf: scoped.asOf, properties: scoped.properties, sources: scoped.sources, clients: scoped.clients, savedSearches: scoped.savedSearches, offers: scoped.offers, transactions: scoped.transactions, documents: scoped.documents.map(document => ({ ...document, downloadPath: `/api/documents/${encodeURIComponent(document.id)}` })), cmas: scoped.cmas.map(record => { const { inputSnapshot: _raw, ...result } = record.result; return { ...record, result }; }), note: 'Permission-filtered portable records. No account credentials, platform secrets, billing tokens or binary document duplication. Download documents through the authenticated private route.' };
}
export function portableCsv(workspace: Workspace): string { const data = portableExport(workspace); return [['name', 'email', 'stage', 'budget', 'preferences'], ...data.clients.map(client => [client.name, client.email, client.stage, client.budget, client.preferences])].map(row => row.map(csvCell).join(',')).join('\r\n'); }
