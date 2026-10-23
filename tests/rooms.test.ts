import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { register } from '../src/lib/auth';
import { closeDatabase, transaction } from '../src/lib/db';
import {
  acceptGrant,
  addNote,
  createGrant,
  createRoom,
  deleteRoom,
  deleteRoomDocument,
  exportRoom,
  getRoom,
  listGrants,
  listRooms,
  readRoomDocument,
  revokeGrant,
  roomAudit,
  setStage,
  updateSection,
  uploadRoomDocument,
} from '../src/lib/rooms';
import type { Actor } from '../src/lib/types';
import { ZodError } from 'zod';

process.env.SQLITE_PATH = resolve('.data', `rooms-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64');
after(async () => closeDatabase());

const account = async (label: string): Promise<Actor> =>
  (
    await register({
      name: `${label} Person`,
      email: `${label}-${randomUUID()}@example.test`,
      password: 'room test password 123',
    })
  ).user;
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n% ${text}\n`);
const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    // The API maps validation errors to 400, as handleError does.
    return error instanceof ZodError ? 400 : ((error as { status?: number }).status ?? 500);
  }
};
async function setup() {
  const owner = await account('owner');
  const agent = await account('agent');
  const stranger = await account('stranger');
  const { id } = await createRoom(owner, { propertyKey: 'dc:0800____0842', address: '1 Example St NW' });
  let room = await getRoom(owner, id);
  room = await updateSection(owner, id, 'milestones', {
    version: room.version,
    items: [{ id: 'milestone-1', title: 'Listing photos', due: '2026-11-01', status: 'planned' }],
  });
  room = await updateSection(owner, id, 'tasks', {
    version: room.version,
    items: [{ id: 'task-0001', title: 'Call the lender', assignee: 'me', due: null, done: false }],
  });
  await addNote(owner, id, { text: 'Private: lowest price I would accept', shared: false });
  await addNote(owner, id, { text: 'Shared: showings after 5pm', shared: true });
  const shared = await uploadRoomDocument(
    owner,
    id,
    { name: 'disclosure.pdf', type: 'application/pdf', bytes: pdf('disclosure') },
    'documents',
  );
  const privateDoc = await uploadRoomDocument(
    owner,
    id,
    { name: 'payoff.pdf', type: 'application/pdf', bytes: pdf('payoff') },
    'financing',
  );
  return { owner, agent, stranger, id, sharedDoc: shared.document, privateDoc: privateDoc.document };
}
const viewOnly = (documentId: string) => ({
  role: 'agent',
  permissions: {
    sections: ['milestones', 'documents', 'notes'],
    documents: [documentId],
    download: false,
    addNotes: false,
  },
  accessDays: 30,
});

test('a room belongs to its owner: other tenants cannot see it, and it opens with labeled common checklists', async () => {
  const { owner, stranger, id, sharedDoc } = await setup();
  const again = await createRoom(owner, { propertyKey: 'dc:0800____0842', address: '1 Example St NW' });
  assert.deepEqual(again, { id, created: false });
  const room = await getRoom(owner, id);
  assert.equal(room.access, 'owner');
  assert.equal(room.stage, 'preparing');
  assert.ok((room.financing ?? []).some(item => /Closing disclosure/.test(item.label)));
  assert.ok((room.settlement ?? []).some(item => /Wire instructions confirmed by phone/.test(item.label)));
  assert.equal(await status(getRoom(stranger, id)), 404);
  assert.equal(await status(readRoomDocument(stranger, id, sharedDoc.id)), 404);
  assert.equal(await status(updateSection(stranger, id, 'tasks', { version: 1, items: [] })), 404);
  assert.equal(await status(getRoom(owner, 'not-a-uuid')), 404);
  assert.deepEqual((await listRooms(stranger)).owned, []);
});

test('contents and documents are encrypted at rest', async () => {
  const { id, owner } = await setup();
  const rows = await transaction(owner.tenantId, tx =>
    tx.query<{ data: Uint8Array; encrypted: number }>('SELECT data,encrypted FROM homeowner_rooms WHERE id=$1', [id]),
  );
  assert.equal(rows[0].encrypted, 1);
  assert.doesNotMatch(Buffer.from(rows[0].data).toString('latin1'), /lowest price|Listing photos/);
  const docs = await transaction(owner.tenantId, tx =>
    tx.query<{ data: Uint8Array; encrypted: number }>('SELECT data,encrypted FROM documents WHERE tenant_id=$1', [
      owner.tenantId,
    ]),
  );
  assert.ok(docs.length >= 2 && docs.every(doc => doc.encrypted === 1));
  assert.ok(docs.every(doc => !Buffer.from(doc.data).toString('latin1').includes('%PDF')));
});

test('an invitation is accepted only by its email, once, before it expires', async () => {
  const { owner, agent, stranger, id, sharedDoc } = await setup();
  const invite = await createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: agent.email.toUpperCase() });
  assert.match(invite.note, /No email was sent/);
  assert.equal(await status(acceptGrant(stranger, { token: invite.token })), 403);
  assert.equal(await status(getRoom(stranger, id)), 404);
  assert.deepEqual(await acceptGrant(agent, { token: invite.token }), { roomId: id, address: '1 Example St NW' });
  assert.equal(await status(acceptGrant(agent, { token: invite.token })), 400, 'a token works once');
  assert.equal(await status(acceptGrant(agent, { token: `${invite.token}x` })), 400);
  const late = await createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: stranger.email });
  await transaction(owner.tenantId, tx =>
    tx.query('UPDATE room_grants SET invite_expires_at=$1 WHERE id=$2', ['2020-01-01T00:00:00.000Z', late.id]),
  );
  assert.equal(await status(acceptGrant(stranger, { token: late.token })), 400);
  assert.equal(await status(createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: owner.email })), 400);
  assert.equal(await status(createGrant(agent, id, { ...viewOnly(sharedDoc.id), email: stranger.email })), 403);
});

test('a collaborator sees only granted sections, shared notes and permitted documents, and cannot change them', async () => {
  const { owner, agent, id, sharedDoc, privateDoc } = await setup();
  await acceptGrant(agent, {
    token: (await createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: agent.email })).token,
  });
  const room = await getRoom(agent, id);
  assert.equal(room.access, 'collaborator');
  assert.deepEqual(
    room.milestones?.map(item => item.title),
    ['Listing photos'],
  );
  assert.equal(room.tasks, undefined);
  assert.equal(room.financing, undefined);
  assert.deepEqual(
    room.notes?.map(note => note.text),
    ['Shared: showings after 5pm'],
  );
  assert.deepEqual(
    room.documents?.map(doc => doc.id),
    [sharedDoc.id],
  );
  assert.doesNotMatch(JSON.stringify(room), /lowest price|payoff|Call the lender|stageHistory|retentionDays/);
  assert.equal(await status(readRoomDocument(agent, id, sharedDoc.id)), 403, 'shared for viewing only');
  assert.equal(await status(readRoomDocument(agent, id, privateDoc.id)), 404);
  assert.equal(await status(updateSection(agent, id, 'milestones', { version: room.version, items: [] })), 403);
  assert.equal(await status(addNote(agent, id, { text: 'hello', shared: false })), 403);
  assert.equal(
    await status(
      uploadRoomDocument(agent, id, { name: 'a.pdf', type: 'application/pdf', bytes: pdf('a') }, 'documents'),
    ),
    403,
  );
  assert.equal(await status(listGrants(agent, id)), 403);
  assert.equal(await status(roomAudit(agent, id)), 403);
  assert.equal(await status(exportRoom(agent, id)), 403);
  assert.equal(await status(deleteRoom(agent, id)), 403);
  assert.deepEqual(
    (await listRooms(agent)).shared.map(item => item.id),
    [id],
  );
});

test('download and note permissions are explicit, downloads are audited, and revocation ends access at once', async () => {
  const { owner, agent, id, sharedDoc } = await setup();
  const invite = await createGrant(owner, id, {
    email: agent.email,
    role: 'attorney',
    permissions: { sections: ['documents', 'notes'], documents: 'all', download: true, addNotes: true },
    accessDays: 14,
  });
  await acceptGrant(agent, { token: invite.token });
  const download = await readRoomDocument(agent, id, sharedDoc.id);
  assert.equal(download.bytes.toString(), pdf('disclosure').toString());
  const room = await getRoom(agent, id);
  assert.deepEqual(
    room.documents?.map(doc => doc.name),
    ['disclosure.pdf'],
    'a financing file is not in a shared section',
  );
  const noted = await addNote(agent, id, { text: 'Please send the HOA resale package.', shared: false });
  assert.equal(noted.notes?.at(-1)?.shared, true, 'a collaborator note is always visible to the owner');
  const audit = await roomAudit(owner, id);
  assert.equal(audit.verified, true);
  assert.ok(
    audit.entries.some(entry => entry.action === 'room.document-downloaded' && entry.detail.includes(agent.email)),
  );
  assert.ok(audit.entries.some(entry => entry.action === 'room.viewed'));
  await revokeGrant(owner, id, invite.id);
  assert.equal(await status(getRoom(agent, id)), 404);
  assert.equal(await status(readRoomDocument(agent, id, sharedDoc.id)), 404);
  assert.deepEqual((await listRooms(agent)).shared, []);
  assert.equal((await listGrants(owner, id)).find(grant => grant.id === invite.id)?.status, 'revoked');
});

test('expired access is refused even with an accepted grant', async () => {
  const { owner, agent, id, sharedDoc } = await setup();
  const invite = await createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: agent.email });
  await acceptGrant(agent, { token: invite.token });
  await transaction(owner.tenantId, tx =>
    tx.query('UPDATE room_grants SET access_expires_at=$1 WHERE id=$2', ['2020-01-01T00:00:00.000Z', invite.id]),
  );
  assert.equal(await status(getRoom(agent, id)), 404);
  assert.equal((await listGrants(owner, id))[0].status, 'expired');
});

test('uploads are validated, stale writes are refused, and the audit detects tampering', async () => {
  const { owner, id } = await setup();
  assert.equal(
    await status(
      uploadRoomDocument(
        owner,
        id,
        { name: 'x.pdf', type: 'application/pdf', bytes: Buffer.from('not a pdf') },
        'documents',
      ),
    ),
    415,
  );
  assert.equal(
    await status(
      uploadRoomDocument(
        owner,
        id,
        { name: 'x.exe', type: 'application/octet-stream', bytes: Buffer.from('MZ') },
        'documents',
      ),
    ),
    415,
  );
  assert.equal(
    await status(
      uploadRoomDocument(
        owner,
        id,
        { name: 'big.txt', type: 'text/plain', bytes: Buffer.alloc(4_000_001, 97) },
        'documents',
      ),
    ),
    413,
  );
  assert.equal(
    await status(
      uploadRoomDocument(owner, id, { name: 'a.txt', type: 'text/plain', bytes: Buffer.from('a') }, 'nowhere'),
    ),
    400,
  );
  assert.equal(await status(updateSection(owner, id, 'tasks', { version: 1, items: [] })), 409);
  assert.equal(await status(updateSection(owner, id, 'documents', { version: 1, items: [] })), 404);
  const room = await getRoom(owner, id);
  assert.equal(
    await status(
      updateSection(owner, id, 'tasks', {
        version: room.version,
        items: [{ id: 'task-0002', title: '<script>', assignee: 'x'.repeat(81), due: null, done: false }],
      }),
    ),
    400,
  );
  await transaction(owner.tenantId, tx =>
    tx.query("UPDATE room_events SET detail='edited' WHERE room_id=$1 AND sequence=2", [id]),
  );
  assert.equal((await roomAudit(owner, id)).verified, false);
});

test('documents past their retention date are deleted when the room is next opened', async t => {
  const { owner, id, sharedDoc } = await setup();
  const room = await getRoom(owner, id);
  await setStage(owner, id, { version: room.version, stage: 'closed', retentionDays: 30 });
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 800 * 86_400_000 });
  const later = await getRoom(owner, id);
  t.mock.timers.reset();
  assert.deepEqual(later.documents, []);
  const stored = await transaction(owner.tenantId, tx =>
    tx.query('SELECT id FROM documents WHERE id=$1', [sharedDoc.id]),
  );
  assert.deepEqual(stored, []);
  const audit = await roomAudit(owner, id);
  assert.ok(audit.entries.some(entry => entry.action === 'room.document-expired'));
  assert.ok(later.stageHistory?.some(entry => entry.to === 'closed'));
});

test('the owner can export, delete a document and delete the whole room with every file and grant', async () => {
  const { owner, agent, id, sharedDoc, privateDoc } = await setup();
  await acceptGrant(agent, {
    token: (await createGrant(owner, id, { ...viewOnly(sharedDoc.id), email: agent.email })).token,
  });
  const exported = await exportRoom(owner, id);
  assert.equal(exported.format, 'ascent-transaction-room-export-1');
  assert.doesNotMatch(JSON.stringify(exported), /room\.[0-9a-f-]{36}\.|token/i);
  assert.equal(exported.audit.verified, true);
  await deleteRoomDocument(owner, id, privateDoc.id);
  assert.equal(await status(readRoomDocument(owner, id, privateDoc.id)), 404);
  assert.deepEqual(await deleteRoom(owner, id), { deleted: true, documents: 1 });
  assert.equal(await status(getRoom(owner, id)), 404);
  assert.equal(await status(getRoom(agent, id)), 404);
  const left = await transaction(owner.tenantId, async tx => ({
    documents: await tx.query('SELECT id FROM documents WHERE id=$1', [sharedDoc.id]),
    memberships: await tx.query('SELECT user_id FROM room_memberships WHERE room_id=$1', [id]),
    grants: await tx.query('SELECT id FROM room_grants WHERE room_id=$1', [id]),
  }));
  assert.deepEqual(left, { documents: [], memberships: [], grants: [] });
});

test('migration 005 enables and forces row-level security on every room table', () => {
  const sql = readFileSync(resolve('migrations', '005_homeowner_rooms.sql'), 'utf8');
  for (const table of ['homeowner_rooms', 'room_grants', 'room_events']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`));
    assert.match(
      sql,
      new RegExp(`CREATE POLICY \\w+ ON ${table} USING\\(tenant_id=current_setting\\('app.tenant_id',true\\)\\)`),
    );
  }
});
