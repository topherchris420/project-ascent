import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DEMO_AS_OF } from './analytics';
import { HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace, syncPropertyLocations } from './db';
import { appendAudit, refreshGraph } from './service';
import { assertProviderAccess, ensurePlatform, hasVerifiedLicense, requireOwner, reserveUsage } from './platform';
import { adapterRegistry, applyFabricProjection, bootstrapFabric, demoSource, ingestBatch, regionConfig, regionCoverage, regions, scopeWorkspaceForAccess, sourceAccess, sourceFreshness, syntheticRegionPayload } from './fabric';
import type { FabricAccessContext, FabricSource, FabricState } from './fabric-types';
import type { Actor, Workspace } from './types';

const regionId = z.string().regex(/^[a-z][a-z0-9-]{1,49}$/);
export const fabricActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('selectRegion'), regionId }),
  z.object({ action: z.literal('syncDemo'), regionId }),
  z.object({ action: z.literal('syncProvider'), regionId, providerId: z.string().trim().min(1).max(100) }),
]);
const sourceSchema = z.object({ id: z.string().min(1).max(100), providerId: z.string().min(1).max(100), label: z.string().min(1).max(200), kind: z.enum(['public', 'licensed']), adapter: z.enum(['reso', 'assessor', 'census']), regionIds: z.array(regionId).min(1).max(100), observedAt: z.iso.datetime(), expectedUpdateHours: z.number().positive().max(87600), license: z.object({ label: z.string().min(1).max(2000), allowedUses: z.array(z.enum(['research', 'valuation', 'market', 'export'])).min(1), exportAllowed: z.boolean(), retentionDays: z.number().int().min(1).max(3650), expiresAt: z.iso.datetime().optional(), termsUrl: z.url().optional() }), documentationUrl: z.url() });

function accessContext(workspace: Workspace): FabricAccessContext {
  const platform = ensurePlatform(workspace);
  const fabric = workspace.fabric;
  if (fabric) fabric.grants = platform.providerGrants.filter((grant) => !grant.revokedAt).map((grant) => ({ id: grant.id, providerId: grant.providerId, regionIds: grant.regionIds, allowedUses: grant.allowedUses.filter((use): use is 'research' | 'valuation' | 'market' | 'export' => ['research', 'valuation', 'market', 'export'].includes(use)), verifiedAt: grant.verifiedAt, verifiedBy: grant.reviewedBy, expiresAt: grant.expiresAt }));
  return { credentialVerified: hasVerifiedLicense(workspace), credentialExpiresAt: platform.verification.expiresAt };
}
function snapshot(original: Workspace) {
  const workspace = scopeWorkspaceForAccess(original, 'research');
  const fabric = workspace.fabric!;
  const context = accessContext(workspace);
  const now = new Date().toISOString();
  return { workspace, fabric, regions, selectedRegion: regionConfig(fabric.selectedRegionId), coverage: regionCoverage(fabric, context, now), access: fabric.sources.map((source) => sourceAccess(source, fabric, context, fabric.selectedRegionId, 'research', now)), adapters: adapterRegistry,
    integrationStatus: { liveEnabled: process.env.FABRIC_LIVE_ENABLED === 'true', configured: Boolean(process.env.FABRIC_PROVIDER_URL && process.env.FABRIC_SOURCE_JSON), note: 'Configured adapter support is not proof of provider access or nationwide coverage. Live fetching requires independent grants and an explicit operator enablement.' } };
}

export async function getFabricSnapshot(actor: Actor) {
  let workspace = await getWorkspace(actor.tenantId);
  if (!workspace.fabric) {
    const initialized = await mutateWorkspace(actor, async (current, tx) => {
      if (!current.fabric) {
        bootstrapFabric(current); applyFabricProjection(current, accessContext(current));
        appendAudit(current, actor, 'initializeFabric', 'fabric', 'Fictional DMV and existing Austin fixtures admitted through the canonical pipeline; all previous workflow references retained.'); refreshGraph(current);
        await syncPropertyLocations(tx, actor.tenantId, current);
      }
      return null;
    }); workspace = initialized.workspace;
  }
  return snapshot(workspace);
}

/** Endpoint and host policy are server-only. No endpoint or token is accepted from a client request. */
export function validateProviderUrl(raw: string, allowedHosts: string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('Provider URL must use HTTPS, an explicitly allowed hostname, no credentials, and the default TLS port.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || url.hostname.includes(':') || /^\d+(\.\d+){3}$/.test(url.hostname)) throw new Error('Literal/private/local network destinations are not permitted.');
  return url;
}
export async function fetchProviderPayload(url: string, allowedHosts: string[], token: string | undefined, fetcher: typeof fetch = fetch): Promise<unknown> {
  const allowed = validateProviderUrl(url, allowedHosts);
  const response = await fetcher(allowed, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}; no data was changed.`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('json')) throw new Error('Provider did not return JSON.');
  if (!response.body) throw new Error('Provider returned no content.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Provider response exceeds the 5 MB ingestion bound.'); } chunks.push(next.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Provider returned invalid JSON.'); }
}

export async function executeFabricAction(actor: Actor, raw: unknown, fetcher: typeof fetch = fetch) {
  requireEditor(actor);
  const action = fabricActionSchema.parse(raw);
  regionConfig(action.regionId);
  if (action.action === 'syncProvider') {
    const current = await getWorkspace(actor.tenantId);
    let source: FabricSource;
    try { source = sourceSchema.parse(JSON.parse(process.env.FABRIC_SOURCE_JSON || 'null')); } catch { throw new HttpError(503, 'A server-configured source and explicit license policy are required. No provider connection was attempted.'); }
    if (source.providerId !== action.providerId) throw new HttpError(403, 'Requested provider does not match the server-configured source.');
    if (source.kind === 'licensed') assertProviderAccess(current, { providerId: source.providerId, regionId: action.regionId, use: 'research' });
    const fabric = current.fabric ?? bootstrapFabric(current);
    const access = sourceAccess(source, fabric, accessContext(current), action.regionId, 'research', new Date().toISOString());
    if (!access.allowed) throw new HttpError(403, access.reasons.join(' '));
    if (process.env.FABRIC_LIVE_ENABLED !== 'true') throw new HttpError(503, 'Live ingestion is disabled until the operator validates licensing, read-path scope and retention. Synthetic Explorer remains functional.');
    if (!process.env.FABRIC_PROVIDER_URL || (source.kind === 'licensed' && !process.env.FABRIC_PROVIDER_TOKEN)) throw new HttpError(503, 'An explicit provider URL and required token must be configured server-side. No credential probes are performed.');
    await reserveUsage(actor, 'fabricQueries');
    let payload: unknown; let failure = '';
    try { payload = await fetchProviderPayload(process.env.FABRIC_PROVIDER_URL, (process.env.FABRIC_ALLOWED_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean), process.env.FABRIC_PROVIDER_TOKEN, fetcher); }
    catch (error) { failure = error instanceof Error ? error.message : 'Provider request failed.'; }
    const changed = await mutateWorkspace(actor, async (workspace, tx) => {
      const state = workspace.fabric ?? bootstrapFabric(workspace); const context = accessContext(workspace); const now = new Date().toISOString();
      if (source.kind === 'licensed') assertProviderAccess(workspace, { providerId: source.providerId, regionId: action.regionId, use: 'research' }, now);
      if (failure) state.runs.unshift({ id: `run-${randomUUID()}`, sourceId: source.id, regionId: action.regionId, startedAt: now, finishedAt: now, status: 'failed', received: 0, inserted: 0, updated: 0, unchanged: 0, quarantined: 0, errors: [failure] });
      else {
        // This is the response observation time, not a guarantee that the underlying listing was updated.
        const observedSource = { ...source, observedAt: now };
        const run = ingestBatch(state, observedSource, action.regionId, payload, context, now);
        if (payload && typeof payload === 'object' && '@odata.nextLink' in payload) run.errors.push('Only the bounded first page was ingested. The provider reported another page; inventory coverage is incomplete.');
        if (run.status === 'success' || run.status === 'partial') { state.dataMode = 'authorized'; state.selectedRegionId = action.regionId; workspace.mode = 'licensed'; workspace.asOf = now; applyFabricProjection(workspace, context, now); }
      }
      appendAudit(workspace, actor, 'syncFabricProvider', source.id, failure ? 'Provider failure recorded without raw payload or credentials.' : 'Authorized bounded ingestion recorded with provenance, quarantine and version history.'); refreshGraph(workspace); await syncPropertyLocations(tx, actor.tenantId, workspace); return null;
    });
    return snapshot(changed.workspace);
  }
  const changed = await mutateWorkspace(actor, async (workspace, tx) => {
    const fabric = workspace.fabric ?? bootstrapFabric(workspace);
    if (action.action === 'syncDemo') ingestBatch(fabric, demoSource(action.regionId), action.regionId, syntheticRegionPayload(action.regionId), { credentialVerified: false }, workspace.asOf);
    fabric.selectedRegionId = action.regionId; fabric.dataMode = 'demo'; workspace.mode = 'demo'; workspace.asOf = DEMO_AS_OF;
    applyFabricProjection(workspace, accessContext(workspace));
    appendAudit(workspace, actor, action.action === 'syncDemo' ? 'syncFabricDemo' : 'selectFabricRegion', action.regionId, 'Explicitly synthetic fixture mode. Existing clients, offers, valuations and transactions retained.'); refreshGraph(workspace); await syncPropertyLocations(tx, actor.tenantId, workspace); return null;
  });
  return snapshot(changed.workspace);
}

export const grantReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('grant'), providerId: z.string().min(1).max(100), regionIds: z.array(regionId).min(1).max(100), allowedUses: z.array(z.enum(['research', 'valuation', 'market', 'export'])).min(1), licenseReference: z.string().trim().min(3).max(200), terms: z.string().trim().min(10).max(5000), expiresAt: z.iso.datetime(), reviewedBy: z.string().trim().min(3).max(150) }),
  z.object({ action: z.literal('revoke'), id: z.string().min(1).max(100), reviewedBy: z.string().trim().min(3).max(150) }),
]);
export async function reviewProviderGrant(actor: Actor, raw: unknown, secret: string | null) {
  requireOwner(actor);
  const expected = process.env.DATA_GRANT_REVIEW_SECRET;
  if (!expected || expected.length < 32) throw new HttpError(503, 'Trusted provider-grant review is not configured. Workspace owners cannot self-assert provider permissions.');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!secret || !timingSafeEqual(hash(secret), hash(expected))) throw new HttpError(403, 'Trusted operator review credentials are required independently of workspace ownership and payment.');
  const input = grantReviewSchema.parse(raw);
  if (input.action === 'grant') {
    // 'us' is an explicit national entitlement scope, not a claim that a local MLS covers the country.
    input.regionIds.forEach(id => { if (id !== 'us') regionConfig(id); });
    if (Date.parse(input.expiresAt) <= Date.now()) throw new HttpError(400, 'A provider grant must expire in the future.');
  }
  const changed = await mutateWorkspace(actor, (workspace) => {
    const platform = ensurePlatform(workspace); const now = new Date().toISOString(); let id: string;
    if (input.action === 'grant') { id = randomUUID(); platform.providerGrants.push({ id, providerId: input.providerId, regionIds: input.regionIds, allowedUses: input.allowedUses, licenseReference: input.licenseReference, terms: input.terms, issuedAt: now, expiresAt: input.expiresAt, verifiedAt: now, reviewedBy: input.reviewedBy }); }
    else { const grant = platform.providerGrants.find((item) => item.id === input.id); if (!grant) throw new HttpError(404, 'Provider grant not found.'); grant.revokedAt = now; id = grant.id; }
    if (workspace.fabric) accessContext(workspace);
    appendAudit(workspace, actor, input.action === 'grant' ? 'reviewProviderGrant' : 'revokeProviderGrant', id, `Trusted operator ${input.reviewedBy}; rights do not replace professional verification.`);
    return { id, action: input.action };
  });
  return { workspace: scopeWorkspaceForAccess(changed.workspace, 'research'), result: changed.result };
}

/** Scheduled fetching is explicitly opt-in and uses the same entitlement/transport pipeline as manual sync. */
export async function runScheduledFabricSync(actor: Actor, fetcher: typeof fetch = fetch): Promise<{ status: 'skipped' | 'attempted' | 'failed'; reason: string }> {
  const skip = async (reason: string) => {
    await mutateWorkspace(actor, (workspace) => { appendAudit(workspace, actor, 'scheduledFabricSyncSkipped', 'fabric', reason); return null; });
    return { status: 'skipped' as const, reason };
  };
  if (process.env.FABRIC_SCHEDULED_SYNC !== 'true' || process.env.FABRIC_LIVE_ENABLED !== 'true') return skip('Automatic provider synchronization is disabled by explicit operator configuration.');
  let source: FabricSource;
  try { source = sourceSchema.parse(JSON.parse(process.env.FABRIC_SOURCE_JSON || 'null')); }
  catch { return skip('A complete configured source policy is unavailable.'); }
  if (!process.env.FABRIC_PROVIDER_URL || (source.kind === 'licensed' && !process.env.FABRIC_PROVIDER_TOKEN)) return skip('An explicit authorized provider endpoint/token is unavailable.');
  const workspace = await getWorkspace(actor.tenantId);
  const regionId = workspace.fabric?.selectedRegionId ?? source.regionIds[0];
  try {
    regionConfig(regionId);
    if (source.kind === 'licensed') assertProviderAccess(workspace, { providerId: source.providerId, regionId, use: 'research' });
    const state = workspace.fabric ?? bootstrapFabric(workspace);
    const context = accessContext(workspace);
    const access = sourceAccess(source, state, context, regionId, 'research', new Date().toISOString());
    if (!access.allowed) return skip(access.reasons.join(' '));
    const stored = state.sources.find((entry) => entry.id === source.id);
    if (stored && sourceFreshness(stored, new Date().toISOString()).status === 'fresh') return skip('Stored source observation remains within its declared refresh policy; no provider call was made.');
    const result = await executeFabricAction(actor, { action: 'syncProvider', regionId, providerId: source.providerId }, fetcher);
    const latest = result.fabric.runs.find((run) => run.sourceId === source.id);
    return latest?.status === 'failed' || latest?.status === 'denied' ? { status: 'failed', reason: latest.errors.join(' ') || 'Provider ingestion failed; prior records are preserved.' } : { status: 'attempted', reason: 'Bounded provider synchronization completed through the authorized ingestion pipeline.' };
  } catch {
    return skip('Required provider access, configuration or usage allowance is unavailable; no unattended bypass is permitted.');
  }
}
