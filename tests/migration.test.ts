import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { executeAction, uploadDocument, verifyAudit } from '../src/lib/service';
import {
  executeMigrationAction,
  getMigrationSnapshot,
  migrationActionSchema,
  parseCsv,
  portableCsv,
  portableExport,
} from '../src/lib/migration';
import type { MigrationCommit, MigrationKind, MigrationPreview } from '../src/lib/migration-types';
process.env.SQLITE_PATH = resolve('.data', `migration-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(async () => closeDatabase());
const owner = () =>
  register({
    name: 'Import Owner',
    email: `${randomUUID()}@example.test`,
    password: 'private migration passphrase 1234',
  });
const attestation = { authorized: true, noMls: true };
async function preview(
  actor: Awaited<ReturnType<typeof owner>>['user'],
  kind: MigrationKind,
  csv: string,
  mapping: Record<string, string> = {},
) {
  return (
    (await executeMigrationAction(actor, {
      action: 'preview',
      kind,
      csv,
      mapping,
      sourceName: 'Synthetic authorized source',
      attestation,
    })) as { preview: MigrationPreview }
  ).preview;
}
async function commit(
  actor: Awaited<ReturnType<typeof owner>>['user'],
  item: MigrationPreview,
  decisions: Record<string, string> = {},
) {
  return (await executeMigrationAction(actor, {
    action: 'commit',
    previewId: item.id,
    baseHash: item.baseHash,
    consent: true,
    decisions,
  })) as { commit: Omit<MigrationCommit, 'operations'>; duplicate?: boolean };
}

test('CSV parser supports quoted newlines/doubled quotes and rejects malformed or ambiguous input', () => {
  const parsed = parseCsv('name,email,preferences\r\n"Alex, ""A""",alex@example.test,"First line\nSecond line"\r\n');
  assert.equal(parsed[1][0], 'Alex, "A"');
  assert.equal(parsed[1][2], 'First line\nSecond line');
  assert.throws(() => parseCsv('name,email\n"unclosed,a@example.test'), /unterminated/);
  assert.throws(() => parseCsv('name,email\n"ok"junk,a@example.test'), /quoting/);
  assert.throws(() => parseCsv('email,EMAIL\na,b'), /unique/);
  assert.throws(() => parseCsv('name,email\na,b,c'), /column count/);
});
test('preview is private/nonmutating; explicit commit is idempotent and audit omits imported text', async () => {
  const account = await owner(),
    other = await owner();
  const before = await getWorkspace(account.user.tenantId);
  const item = await preview(
    account.user,
    'contacts',
    'Full Name,Mail,Preferences\nNew Contact,new@example.test,"Private imported note"',
    { name: 'Full Name', email: 'Mail', preferences: 'Preferences' },
  );
  assert.equal(item.summary.create, 1);
  assert.equal((await getWorkspace(account.user.tenantId)).clients.length, before.clients.length);
  assert.equal((await getMigrationSnapshot(other.user)).previews.length, 0);
  assert.equal(
    migrationActionSchema.safeParse({ action: 'commit', previewId: item.id, baseHash: item.baseHash, consent: false })
      .success,
    false,
  );
  await assert.rejects(commit(other.user, item), /expired|not found/);
  const result = await commit(account.user, item);
  assert.equal(result.commit.created, 1);
  assert.equal((await commit(account.user, item)).duplicate, true);
  const workspace = await getWorkspace(account.user.tenantId);
  assert.equal(workspace.clients.filter(client => client.email === 'new@example.test').length, 1);
  assert.ok(!JSON.stringify(workspace.audit).includes('Private imported note'));
  assert.equal(verifyAudit(workspace), true);
});
test('conflicts require a decision; rollback reverts only unchanged imported fields and preserves manual edits', async () => {
  const account = await owner();
  const original = (await getWorkspace(account.user.tenantId)).clients[0];
  const item = await preview(
    account.user,
    'contacts',
    `name,email,preferences\nImported name,${original.email},Imported preferences`,
  );
  assert.equal(item.rows[0].status, 'conflict');
  await assert.rejects(commit(account.user, item), /conflicting/);
  const imported = await commit(account.user, item, { '2': 'update' });
  const current = (await getWorkspace(account.user.tenantId)).clients.find(client => client.id === original.id)!;
  await executeAction(account.user, {
    type: 'saveClient',
    id: current.id,
    name: 'Later manual name',
    email: current.email,
    stage: current.stage,
    budget: current.budget,
    preferences: current.preferences,
  });
  await executeAction(account.user, { type: 'addClientNote', id: current.id, note: 'Later manual relationship work' });
  const rollback = (await executeMigrationAction(account.user, {
    action: 'rollback',
    commitId: imported.commit.id,
  })) as { rolledBack: number; preserved: number };
  assert.ok(rollback.preserved >= 1);
  assert.ok(rollback.rolledBack >= 1);
  const restored = (await getWorkspace(account.user.tenantId)).clients.find(client => client.id === original.id)!;
  assert.equal(restored.name, 'Later manual name');
  assert.equal(restored.preferences, original.preferences);
  assert.ok(restored.timeline.some(note => note.note === 'Later manual relationship work'));
});
test('concurrent edits refuse a stale preview and expired previews cannot commit', async () => {
  const account = await owner();
  const item = await preview(account.user, 'contacts', 'name,email\nConcurrent,concurrent@example.test');
  await executeAction(account.user, { type: 'addClientNote', id: 'client-01', note: 'Changed after preview' });
  await assert.rejects(commit(account.user, item), /changed after preview/);
  const expired = await preview(account.user, 'contacts', 'name,email\nExpired,expired@example.test');
  await mutateWorkspace(account.user, workspace => {
    workspace.migration!.previews.find(record => record.id === expired.id)!.expiresAt = '2000-01-01T00:00:00Z';
  });
  await assert.rejects(commit(account.user, expired), /expired/);
  assert.equal(
    (await getWorkspace(account.user.tenantId)).clients.some(client => client.email === 'expired@example.test'),
    false,
  );
});
test('searches, notes, reviewed milestones and private document references import without duplicate binaries', async () => {
  const account = await owner();
  const workspace = await getWorkspace(account.user.tenantId);
  const client = workspace.clients[0],
    transaction = workspace.transactions[0];
  const uploaded = await uploadDocument(account.user, transaction.id, {
    name: 'private-import.txt',
    type: 'text/plain',
    bytes: Buffer.from('Private synthetic supporting document'),
  });
  for (const [kind, csv] of [
    ['searches', `email,name,query,maxPrice\n${client.email},Imported search,Austin,800000`],
    ['notes', `email,note\n${client.email},"Authorized note\nwith quoted newline"`],
    ['milestones', `transactionId,title,dueAt\n${transaction.id},Imported review deadline,2026-12-01`],
    ['documentRefs', `documentId,label\n${uploaded.result.id},Imported supporting reference`],
  ] as [MigrationKind, string][]) {
    const item = await preview(account.user, kind, csv);
    assert.equal(item.rows[0].status, 'create');
    await commit(account.user, item);
  }
  const after = await getWorkspace(account.user.tenantId);
  assert.equal(after.documents.length, workspace.documents.length + 1);
  assert.equal(after.migration!.documentRefs[0].documentId, uploaded.result.id);
  assert.ok(after.clients[0].timeline.some(note => note.note.includes('\n')));
  assert.ok(after.savedSearches.some(search => search.name === 'Imported search'));
  assert.ok(after.transactions[0].milestones.some(item => item.title === 'Imported review deadline'));
});
test('rollback preserves a newly imported contact referenced by later work; source authority cannot import MLS rows', async () => {
  const account = await owner();
  const item = await preview(account.user, 'contacts', 'name,email\nLinked,linked@example.test');
  const imported = await commit(account.user, item);
  const client = (await getWorkspace(account.user.tenantId)).clients.find(
    record => record.email === 'linked@example.test',
  )!;
  await executeAction(account.user, {
    type: 'saveSearch',
    name: 'Later manual search',
    query: 'Austin',
    maxPrice: 900000,
    clientId: client.id,
  });
  await executeMigrationAction(account.user, { action: 'rollback', commitId: imported.commit.id });
  assert.ok((await getWorkspace(account.user.tenantId)).clients.some(record => record.id === client.id));
  await assert.rejects(
    preview(account.user, 'contacts', 'name,email,ListingKey\nFake,fake@example.test,MLS123'),
    /MLS\/property/,
  );
  assert.equal(
    migrationActionSchema.safeParse({
      action: 'preview',
      kind: 'contacts',
      csv: 'a,b',
      sourceName: 'No rights',
      attestation: { authorized: false, noMls: true },
    }).success,
    false,
  );
});
test('portable JSON is permission filtered and excludes credentials; CSV escapes spreadsheet formulas', async () => {
  const account = await owner();
  await mutateWorkspace(account.user, workspace => {
    workspace.clients[0].name = '=HYPERLINK("https://example.invalid")';
    workspace.platform = {
      ...workspace.platform!,
      version: 1,
      plan: 'free',
      billing: { status: 'free', customerId: 'BILLING-SECRET-SENTINEL' },
      verification: { status: 'unsubmitted' },
      providerGrants: [],
      usage: {
        period: '2026-10',
        aiRequests: 0,
        fabricQueries: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        events: [],
      },
    };
    workspace.sources.push({
      id: 'restricted-portability',
      label: 'Restricted',
      kind: 'licensed',
      observedAt: workspace.asOf,
      license: 'No export rights',
      confidence: 0,
    });
    workspace.properties.push({
      ...workspace.properties[0],
      id: 'restricted',
      address: 'DO-NOT-EXPORT-SENTINEL',
      sourceId: 'restricted-portability',
    });
  });
  const workspace = await getWorkspace(account.user.tenantId),
    json = JSON.stringify(portableExport(workspace));
  assert.ok(!json.includes('BILLING-SECRET-SENTINEL'));
  assert.ok(!json.includes('DO-NOT-EXPORT-SENTINEL'));
  assert.ok(!json.includes('password_hash'));
  const csv = portableCsv(workspace);
  assert.ok(csv.includes('"\'=HYPERLINK'));
  assert.ok(parseCsv(csv)[1][0].startsWith("'="));
});
test('side-by-side evaluation uses exactly the frozen dataset, refuses a mismatched hash and makes no superiority claim', async () => {
  const account = await owner();
  const id = (await getWorkspace(account.user.tenantId)).cmas[0].id;
  const compared = (await executeMigrationAction(account.user, {
    action: 'compare',
    cmaId: id,
    baselineAssumptions: {},
    candidateAssumptions: {},
  })) as { comparison: { datasetHash: string; equivalentDataset: boolean; delta: number; note: string } };
  assert.equal(compared.comparison.equivalentDataset, true);
  assert.equal(compared.comparison.delta, 0);
  assert.match(compared.comparison.note, /not an accuracy validation/);
  await assert.rejects(
    executeMigrationAction(account.user, {
      action: 'compare',
      cmaId: id,
      baselineAssumptions: {},
      candidateAssumptions: {},
      expectedDatasetHash: '0'.repeat(64),
    }),
    /hashes differ/,
  );
});

test('import applies the same fair housing hold to preferences, searches and notes instead of bypassing manual workflows', async () => {
  const account = await owner(),
    workspace = await getWorkspace(account.user.tenantId),
    email = workspace.clients[0].email;
  for (const [kind, csv] of [
    ['preferences', `email,preferences\n${email},Only show neighborhoods with white families`],
    [
      'searches',
      `email,name,query,maxPrice\n${email},Unsafe preference,Only show neighborhoods with white families,800000`,
    ],
    ['notes', `email,note\n${email},Only show neighborhoods with white families`],
  ] as [MigrationKind, string][]) {
    const item = await preview(account.user, kind, csv);
    assert.equal(item.rows[0].status, 'invalid');
    assert.match(item.rows[0].message!, /Import held/);
    const result = await commit(account.user, item);
    assert.equal(result.commit.created + result.commit.updated, 0);
  }
  assert.ok(!JSON.stringify((await getWorkspace(account.user.tenantId)).audit).includes('white families'));
});
