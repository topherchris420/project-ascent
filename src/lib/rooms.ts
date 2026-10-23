import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { auditDigest, digest, HttpError, requireEditor } from './auth';
import {
  deleteDocumentIn,
  openBytes,
  readDocumentIn,
  sealBytes,
  storeDocument,
  transaction,
  type DbTransaction,
} from './db';
import { validateUpload } from './service';
import type { Actor } from './types';
import {
  collaboratorRoles,
  grantInputSchema,
  permissionsSchema,
  required,
  ROOM_LIMITS,
  ROOM_VERSION,
  roomSectionLabels,
  roomDataSchema,
  roomSections,
  roomStages,
  sectionSchemas,
  type EditableSection,
  type RoomData,
  type RoomDocument,
  type RoomPermissions,
} from './room-model';

/**
 * Owner-controlled Transaction Rooms. A homeowner keeps one room per property: milestones, tasks, deadlines,
 * documents, quotes, inspection items, financing and settlement checklists, notes, decisions and references to
 * saved briefs. Contents are encrypted at rest in the owner's tenant. Nothing is shared until the owner creates a
 * grant for one email address, naming the sections and documents it covers, whether files can be downloaded and
 * when access ends. The invited person must sign in with that email to accept; every request re-checks the grant,
 * so revoking or expiring it ends access at once. Every change, view of a shared room and download is appended to
 * a hash-linked audit only the owner can read.
 */
const newId = () => `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
const checklistFrom = (labels: string[]) => labels.map(label => ({ id: newId(), label, done: false, note: '' }));
function emptyRoomData(actorId: string, at: string): RoomData {
  return {
    version: ROOM_VERSION,
    stage: 'preparing',
    stageHistory: [{ at, from: null, to: 'preparing', actorId }],
    retentionDays: 730,
    milestones: [],
    tasks: [],
    deadlines: [],
    quotes: [],
    inspection: [],
    // Common steps, labeled as such in the interface; the contract and the settlement agent define the real ones.
    financing: checklistFrom([
      'Pre-approval letter or proof of funds',
      'Loan application submitted',
      'Appraisal ordered',
      'Appraisal received',
      'Loan commitment or clear to close',
      'Closing disclosure received at least three business days before closing',
    ]),
    settlement: checklistFrom([
      'Settlement or title company chosen',
      'Title search and title insurance',
      'Wire instructions confirmed by phone at a number you already know',
      'Final walk-through',
      'Keys, codes, utilities and mail',
      'Deed recorded',
    ]),
    notes: [],
    decisions: [],
    references: [],
    documents: [],
  };
}

let roomsVerified = false;
/** PostgreSQL deployments must have migration 005 with forced RLS before any room is served. */
async function assertRoomStorage(tx: DbTransaction) {
  if (roomsVerified || !process.env.DATABASE_URL) return;
  const tables = await tx.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname IN ('homeowner_rooms','room_grants','room_events')",
  );
  const index = await tx.query(
    "SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename='room_memberships'",
  );
  if (tables.length !== 3 || tables.some(row => !row.relrowsecurity || !row.relforcerowsecurity) || index.length !== 1)
    throw new HttpError(503, 'Transaction Rooms are unavailable until database migration 005 is applied.');
  roomsVerified = true;
}

type RoomRow = {
  id: string;
  tenant_id: string;
  owner_id: string;
  property_key: string;
  address: string;
  data: Uint8Array;
  encrypted: number;
  version: number;
  created_at: string | Date;
  updated_at: string | Date;
};
type GrantRow = {
  id: string;
  tenant_id: string;
  room_id: string;
  email: string;
  role: (typeof collaboratorRoles)[number];
  permissions: string;
  token_hash: string;
  invite_expires_at: string | Date;
  access_expires_at: string | Date;
  user_id: string | null;
  accepted_at: string | Date | null;
  revoked_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
};
const isoOf = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const decode = (row: RoomRow): RoomData =>
  roomDataSchema.parse(JSON.parse(openBytes(row.data, row.encrypted).toString('utf8')));

async function appendEvent(
  tx: DbTransaction,
  room: Pick<RoomRow, 'id' | 'tenant_id'>,
  actorId: string,
  action: string,
  detail: string,
) {
  const last = await tx.query<{ sequence: number; hash: string }>(
    'SELECT sequence,hash FROM room_events WHERE room_id=$1 AND tenant_id=$2 ORDER BY sequence DESC LIMIT 1',
    [room.id, room.tenant_id],
  );
  const event = {
    sequence: String((last[0] ? Number(last[0].sequence) : 0) + 1),
    at: new Date().toISOString(),
    actorId,
    action,
    detail: detail.slice(0, 500),
    previousHash: last[0]?.hash ?? 'genesis',
  };
  await tx.query(
    'INSERT INTO room_events(id,tenant_id,room_id,sequence,at,actor_id,action,detail,previous_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      randomUUID(),
      room.tenant_id,
      room.id,
      Number(event.sequence),
      event.at,
      actorId,
      action,
      event.detail,
      event.previousHash,
      auditDigest(event),
    ],
  );
}

async function writeData(tx: DbTransaction, row: RoomRow, data: RoomData, expectedVersion = row.version) {
  const sealed = sealBytes(Buffer.from(JSON.stringify(roomDataSchema.parse(data)), 'utf8'));
  const updated = await tx.query(
    'UPDATE homeowner_rooms SET data=$1,encrypted=$2,version=version+1,updated_at=$3 WHERE id=$4 AND tenant_id=$5 AND version=$6 RETURNING version',
    [sealed.data, sealed.encrypted, new Date().toISOString(), row.id, row.tenant_id, expectedVersion],
  );
  if (!updated.length)
    throw new HttpError(409, 'This room changed since you opened it. Reload to see the latest version.');
  return Number((updated[0] as { version: number }).version);
}

/** Expired documents are removed whenever the room is opened, by anyone with access. */
async function enforceRetention(tx: DbTransaction, row: RoomRow, data: RoomData, actorId: string) {
  const now = new Date().toISOString();
  const expired = data.documents.filter(document => document.deleteAfter <= now);
  if (!expired.length) return { data, version: row.version };
  for (const document of expired) {
    await deleteDocumentIn(tx, row.tenant_id, document.id);
    await appendEvent(
      tx,
      row,
      actorId,
      'room.document-expired',
      `${document.name} reached its retention date and was deleted.`,
    );
  }
  const next = { ...data, documents: data.documents.filter(document => document.deleteAfter > now) };
  return { data: next, version: await writeData(tx, row, next) };
}

type Access =
  | { kind: 'owner'; row: RoomRow; data: RoomData }
  | { kind: 'collaborator'; row: RoomRow; data: RoomData; grant: GrantRow; permissions: RoomPermissions };

function activeGrant(grant: GrantRow | undefined, actor: Actor, now = Date.now()) {
  return (
    !!grant &&
    grant.user_id === actor.id &&
    !!grant.accepted_at &&
    !grant.revoked_at &&
    new Date(grant.access_expires_at).getTime() > now &&
    grant.email === actor.email.toLowerCase()
  );
}

/**
 * Resolves the actor's access inside the room's tenant transaction. An owner is the room's creator in their own
 * tenant; anyone else needs a membership whose grant is accepted by them, unrevoked and unexpired, checked here on
 * every call. Anything else is "not found", so room identifiers reveal nothing.
 */
async function withRoom<T>(actor: Actor, roomId: string, callback: (tx: DbTransaction, access: Access) => Promise<T>) {
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) throw new HttpError(404, 'Room not found.');
  const memberships = await transaction(null, tx =>
    tx.query<{ tenant_id: string; grant_id: string }>(
      'SELECT tenant_id,grant_id FROM room_memberships WHERE user_id=$1 AND room_id=$2',
      [actor.id, roomId],
    ),
  );
  const tenantId = memberships[0]?.tenant_id ?? actor.tenantId;
  return transaction(tenantId, async tx => {
    await assertRoomStorage(tx);
    const rows = await tx.query<RoomRow>('SELECT * FROM homeowner_rooms WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [
      roomId,
      tenantId,
    ]);
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Room not found.');
    if (row.tenant_id === actor.tenantId && row.owner_id === actor.id) {
      const kept = await enforceRetention(tx, row, decode(row), actor.id);
      return callback(tx, { kind: 'owner', row: { ...row, version: kept.version }, data: kept.data });
    }
    const grants = memberships[0]
      ? await tx.query<GrantRow>('SELECT * FROM room_grants WHERE id=$1 AND room_id=$2 AND tenant_id=$3', [
          memberships[0].grant_id,
          roomId,
          tenantId,
        ])
      : [];
    if (!activeGrant(grants[0], actor)) throw new HttpError(404, 'Room not found.');
    const kept = await enforceRetention(tx, row, decode(row), actor.id);
    return callback(tx, {
      kind: 'collaborator',
      row: { ...row, version: kept.version },
      data: kept.data,
      grant: grants[0],
      permissions: permissionsSchema.parse(JSON.parse(grants[0].permissions)),
    });
  });
}
function requireOwner(access: Access): asserts access is Extract<Access, { kind: 'owner' }> {
  if (access.kind !== 'owner') throw new HttpError(403, 'Only the room’s owner can do this.');
}

const documentVisible = (permissions: RoomPermissions, document: RoomDocument) =>
  permissions.sections.includes('documents') &&
  (permissions.documents === 'all'
    ? permissions.sections.includes(document.section) || document.section === 'documents'
    : permissions.documents.includes(document.id));

/** What one person may see. A collaborator gets only the granted sections, shared notes and permitted files. */
function view(access: Access) {
  const { row, data } = access;
  const base = {
    id: row.id,
    propertyKey: row.property_key,
    address: row.address,
    version: row.version,
    stage: data.stage,
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
  if (access.kind === 'owner')
    return { ...base, access: 'owner' as const, permissions: null, ...data, version: row.version };
  const { permissions } = access;
  const allowed = new Set(permissions.sections);
  const sections: Partial<RoomData> = {};
  for (const section of roomSections) {
    if (!allowed.has(section)) continue;
    if (section === 'notes') sections.notes = data.notes.filter(note => note.shared);
    else if (section === 'documents')
      sections.documents = data.documents.filter(document => documentVisible(permissions, document));
    else (sections as Record<string, unknown>)[section] = data[section];
  }
  return {
    ...base,
    access: 'collaborator' as const,
    role: access.grant.role,
    accessExpiresAt: isoOf(access.grant.access_expires_at),
    permissions,
    ...sections,
  };
}
export type RoomView = ReturnType<typeof view>;

export async function createRoom(actor: Actor, raw: unknown) {
  requireEditor(actor);
  const input = z
    .object({
      propertyKey: z.string().regex(/^(dc|dc-condos|maryland):[A-Za-z0-9_]{4,32}$/),
      address: required(160),
    })
    .strict()
    .parse(raw);
  const id = randomUUID();
  const at = new Date().toISOString();
  return transaction(actor.tenantId, async tx => {
    await assertRoomStorage(tx);
    const existing = await tx.query<{ id: string }>(
      'SELECT id FROM homeowner_rooms WHERE tenant_id=$1 AND owner_id=$2 AND property_key=$3',
      [actor.tenantId, actor.id, input.propertyKey],
    );
    if (existing[0]) return { id: existing[0].id, created: false };
    const sealed = sealBytes(Buffer.from(JSON.stringify(emptyRoomData(actor.id, at)), 'utf8'));
    await tx.query(
      'INSERT INTO homeowner_rooms(id,tenant_id,owner_id,property_key,address,data,encrypted,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9)',
      [id, actor.tenantId, actor.id, input.propertyKey, input.address, sealed.data, sealed.encrypted, at, at],
    );
    await appendEvent(
      tx,
      { id, tenant_id: actor.tenantId },
      actor.id,
      'room.created',
      `Room opened for ${input.address}.`,
    );
    return { id, created: true };
  });
}

export async function listRooms(actor: Actor) {
  const owned = await transaction(actor.tenantId, async tx => {
    await assertRoomStorage(tx);
    return tx.query<{ id: string; property_key: string; address: string; updated_at: string | Date }>(
      'SELECT id,property_key,address,updated_at FROM homeowner_rooms WHERE tenant_id=$1 AND owner_id=$2 ORDER BY updated_at DESC',
      [actor.tenantId, actor.id],
    );
  });
  const memberships = await transaction(null, tx =>
    tx.query<{ room_id: string }>('SELECT room_id FROM room_memberships WHERE user_id=$1', [actor.id]),
  );
  const shared = [];
  for (const membership of memberships.slice(0, 50)) {
    try {
      const room = await withRoom(actor, membership.room_id, async (_tx, access) => view(access));
      if (room.access === 'collaborator')
        shared.push({ id: room.id, address: room.address, role: room.role, accessExpiresAt: room.accessExpiresAt });
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 404)) throw error;
    }
  }
  return {
    owned: owned.map(row => ({
      id: row.id,
      propertyKey: row.property_key,
      address: row.address,
      updatedAt: isoOf(row.updated_at),
    })),
    shared,
  };
}

export async function getRoom(actor: Actor, roomId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    if (access.kind === 'collaborator')
      await appendEvent(tx, access.row, actor.id, 'room.viewed', `Viewed by ${actor.email} (${access.grant.role}).`);
    return view(access);
  });
}

export async function updateSection(actor: Actor, roomId: string, section: string, raw: unknown) {
  if (!(section in sectionSchemas)) throw new HttpError(404, 'That section cannot be edited this way.');
  const key = section as EditableSection;
  const input = z
    .object({ version: z.number().int().min(1), items: sectionSchemas[key] })
    .strict()
    .parse(raw);
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const data = { ...access.data, [key]: input.items } as RoomData;
    const version = await writeData(tx, access.row, data, input.version);
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.section-updated',
      `${roomSectionLabels[key]}: ${input.items.length} item(s).`,
    );
    return view({ ...access, row: { ...access.row, version }, data });
  });
}

export async function setStage(actor: Actor, roomId: string, raw: unknown) {
  const input = z
    .object({
      version: z.number().int().min(1),
      stage: z.enum(roomStages),
      retentionDays: z.number().int().min(ROOM_LIMITS.minRetentionDays).max(ROOM_LIMITS.maxRetentionDays).optional(),
    })
    .strict()
    .parse(raw);
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const at = new Date().toISOString();
    const changed = input.stage !== access.data.stage;
    const data: RoomData = {
      ...access.data,
      stage: input.stage,
      retentionDays: input.retentionDays ?? access.data.retentionDays,
      stageHistory: changed
        ? [...access.data.stageHistory, { at, from: access.data.stage, to: input.stage, actorId: actor.id }].slice(-200)
        : access.data.stageHistory,
    };
    const version = await writeData(tx, access.row, data, input.version);
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.stage-changed',
      `${access.data.stage} → ${input.stage}; documents uploaded from now on are kept ${data.retentionDays} days.`,
    );
    return view({ ...access, row: { ...access.row, version }, data });
  });
}

export async function addNote(actor: Actor, roomId: string, raw: unknown) {
  const input = z
    .object({ text: required(2000), shared: z.boolean() })
    .strict()
    .parse(raw);
  return withRoom(actor, roomId, async (tx, access) => {
    if (
      access.kind === 'collaborator' &&
      !(access.permissions.addNotes && access.permissions.sections.includes('notes'))
    )
      throw new HttpError(403, 'The owner has not allowed you to add notes to this room.');
    const note = {
      id: newId(),
      at: new Date().toISOString(),
      authorId: actor.id,
      authorName: actor.name,
      text: input.text,
      // A collaborator's note is always visible to the owner; an owner chooses whether to share theirs.
      shared: access.kind === 'collaborator' ? true : input.shared,
    };
    const data = { ...access.data, notes: [...access.data.notes, note].slice(-500) };
    const version = await writeData(tx, access.row, data);
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.note-added',
      note.shared ? 'Shared note added.' : 'Private note added.',
    );
    return view({ ...access, row: { ...access.row, version }, data } as Access);
  });
}

export async function uploadRoomDocument(
  actor: Actor,
  roomId: string,
  file: { name: string; type: string; bytes: Buffer },
  section: string,
) {
  validateUpload(file.name, file.type, file.bytes);
  const target = z.enum(roomSections).parse(section);
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    if (access.data.documents.length >= ROOM_LIMITS.documents)
      throw new HttpError(413, `A room holds up to ${ROOM_LIMITS.documents} documents. Delete one to add another.`);
    const now = new Date();
    const document: RoomDocument = {
      id: randomUUID(),
      name: file.name.replace(/[\r\n<>\\/"]/g, '_').slice(0, 180),
      mime: file.type === 'application/pdf' ? 'application/pdf' : 'text/plain',
      size: file.bytes.length,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      section: target,
      uploadedAt: now.toISOString(),
      uploadedBy: actor.id,
      deleteAfter: new Date(now.getTime() + access.data.retentionDays * 86_400_000).toISOString(),
    };
    await storeDocument(tx, access.row.tenant_id, document.id, file.bytes);
    const data = { ...access.data, documents: [...access.data.documents, document] };
    const version = await writeData(tx, access.row, data);
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.document-uploaded',
      `${document.name} (${document.size} bytes, sha256 ${document.sha256.slice(0, 12)}…).`,
    );
    return { document, room: view({ ...access, row: { ...access.row, version }, data }) };
  });
}

export async function deleteRoomDocument(actor: Actor, roomId: string, documentId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const document = access.data.documents.find(item => item.id === documentId);
    if (!document) throw new HttpError(404, 'Document not found.');
    await deleteDocumentIn(tx, access.row.tenant_id, document.id);
    const data = { ...access.data, documents: access.data.documents.filter(item => item.id !== documentId) };
    const version = await writeData(tx, access.row, data);
    await appendEvent(tx, access.row, actor.id, 'room.document-deleted', `${document.name} deleted.`);
    return view({ ...access, row: { ...access.row, version }, data });
  });
}

/** The permission check and the read happen in one transaction, so a revocation cannot slip between them. */
export async function readRoomDocument(actor: Actor, roomId: string, documentId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    const document = access.data.documents.find(item => item.id === documentId);
    if (!document) throw new HttpError(404, 'Document not found.');
    if (access.kind === 'collaborator') {
      if (!documentVisible(access.permissions, document)) throw new HttpError(404, 'Document not found.');
      if (!access.permissions.download)
        throw new HttpError(403, 'The owner shared this document for viewing its details only, not for download.');
    }
    const bytes = await readDocumentIn(tx, access.row.tenant_id, document.id);
    if (!bytes) throw new HttpError(404, 'Document bytes are unavailable.');
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.document-downloaded',
      `${document.name} downloaded by ${actor.email}.`,
    );
    return { document, bytes };
  });
}

export async function createGrant(actor: Actor, roomId: string, raw: unknown) {
  const input = grantInputSchema.parse(raw);
  const email = input.email.toLowerCase().trim();
  if (email === actor.email.toLowerCase()) throw new HttpError(400, 'You already own this room.');
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const now = Date.now();
    const grants = await tx.query<GrantRow>('SELECT * FROM room_grants WHERE room_id=$1 AND tenant_id=$2', [
      roomId,
      access.row.tenant_id,
    ]);
    const active = grants.filter(grant => !grant.revoked_at && new Date(grant.access_expires_at).getTime() > now);
    if (active.length >= ROOM_LIMITS.activeGrants)
      throw new HttpError(
        403,
        `A room can have up to ${ROOM_LIMITS.activeGrants} active collaborators. Revoke one first.`,
      );
    if (input.permissions.documents !== 'all') {
      const known = new Set(access.data.documents.map(document => document.id));
      if (input.permissions.documents.some(id => !known.has(id)))
        throw new HttpError(400, 'A selected document is not in this room.');
    }
    const id = randomUUID();
    const token = `room.${access.row.tenant_id}.${randomBytes(32).toString('base64url')}`;
    const inviteExpiresAt = new Date(now + ROOM_LIMITS.inviteDays * 86_400_000).toISOString();
    const accessExpiresAt = new Date(now + input.accessDays * 86_400_000).toISOString();
    await tx.query(
      'INSERT INTO room_grants(id,tenant_id,room_id,email,role,permissions,token_hash,invite_expires_at,access_expires_at,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        id,
        access.row.tenant_id,
        roomId,
        email,
        input.role,
        JSON.stringify(input.permissions),
        digest(token),
        inviteExpiresAt,
        accessExpiresAt,
        actor.id,
        new Date(now).toISOString(),
      ],
    );
    await appendEvent(
      tx,
      access.row,
      actor.id,
      'room.grant-created',
      `${input.role} invitation for ${email}: ${input.permissions.sections.join(', ')}; download ${input.permissions.download ? 'allowed' : 'not allowed'}; access until ${accessExpiresAt.slice(0, 10)}.`,
    );
    return {
      id,
      email,
      role: input.role,
      inviteExpiresAt,
      accessExpiresAt,
      token,
      acceptanceUrl: `${process.env.APP_ORIGIN || 'http://localhost:3040'}/home/room#invite=${encodeURIComponent(token)}`,
      note: 'Send this private link to the person yourself. No email was sent, and the link is shown only once. They must sign in with this email address to accept.',
    };
  });
}

export async function acceptGrant(actor: Actor, raw: unknown) {
  const { token } = z
    .object({ token: z.string().min(60).max(200) })
    .strict()
    .parse(raw);
  const [prefix, tenantId] = token.split('.');
  if (prefix !== 'room' || !/^[0-9a-f-]{36}$/i.test(tenantId ?? ''))
    throw new HttpError(400, 'This invitation link is not valid.');
  return transaction(tenantId, async tx => {
    await assertRoomStorage(tx);
    const rows = await tx.query<GrantRow>('SELECT * FROM room_grants WHERE token_hash=$1 AND tenant_id=$2 FOR UPDATE', [
      digest(token),
      tenantId,
    ]);
    const grant = rows[0];
    const now = Date.now();
    if (!grant || grant.revoked_at || grant.accepted_at || new Date(grant.invite_expires_at).getTime() <= now)
      throw new HttpError(400, 'This invitation is invalid, expired, revoked or already used.');
    if (grant.email !== actor.email.toLowerCase())
      throw new HttpError(
        403,
        'This invitation was sent to a different email address. Sign in with that address to accept it.',
      );
    const room = await tx.query<RoomRow>(
      'SELECT id,tenant_id,owner_id,address FROM homeowner_rooms WHERE id=$1 AND tenant_id=$2',
      [grant.room_id, tenantId],
    );
    if (!room[0]) throw new HttpError(400, 'This invitation is invalid, expired, revoked or already used.');
    if (room[0].owner_id === actor.id) throw new HttpError(400, 'You already own this room.');
    await tx.query('UPDATE room_grants SET user_id=$1,accepted_at=$2 WHERE id=$3 AND tenant_id=$4', [
      actor.id,
      new Date(now).toISOString(),
      grant.id,
      tenantId,
    ]);
    await tx.query('DELETE FROM room_memberships WHERE user_id=$1 AND room_id=$2', [actor.id, grant.room_id]);
    await tx.query('INSERT INTO room_memberships(user_id,room_id,tenant_id,grant_id) VALUES($1,$2,$3,$4)', [
      actor.id,
      grant.room_id,
      tenantId,
      grant.id,
    ]);
    await appendEvent(
      tx,
      room[0],
      actor.id,
      'room.grant-accepted',
      `${actor.email} accepted the ${grant.role} invitation.`,
    );
    return { roomId: grant.room_id, address: room[0].address };
  });
}

export async function listGrants(actor: Actor, roomId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const rows = await tx.query<GrantRow>(
      'SELECT * FROM room_grants WHERE room_id=$1 AND tenant_id=$2 ORDER BY created_at',
      [roomId, access.row.tenant_id],
    );
    const now = Date.now();
    return rows.map(grant => ({
      id: grant.id,
      email: grant.email,
      role: grant.role,
      permissions: permissionsSchema.parse(JSON.parse(grant.permissions)),
      status: grant.revoked_at
        ? 'revoked'
        : new Date(grant.access_expires_at).getTime() <= now
          ? 'expired'
          : grant.accepted_at
            ? 'active'
            : new Date(grant.invite_expires_at).getTime() <= now
              ? 'invitation expired'
              : 'invited',
      inviteExpiresAt: isoOf(grant.invite_expires_at),
      accessExpiresAt: isoOf(grant.access_expires_at),
      acceptedAt: isoOf(grant.accepted_at),
      revokedAt: isoOf(grant.revoked_at),
    }));
  });
}

export async function revokeGrant(actor: Actor, roomId: string, grantId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const rows = await tx.query<GrantRow>(
      'SELECT * FROM room_grants WHERE id=$1 AND room_id=$2 AND tenant_id=$3 FOR UPDATE',
      [grantId, roomId, access.row.tenant_id],
    );
    if (!rows[0]) throw new HttpError(404, 'Collaborator not found.');
    if (!rows[0].revoked_at)
      await tx.query('UPDATE room_grants SET revoked_at=$1 WHERE id=$2 AND tenant_id=$3', [
        new Date().toISOString(),
        grantId,
        access.row.tenant_id,
      ]);
    await tx.query('DELETE FROM room_memberships WHERE room_id=$1 AND grant_id=$2', [roomId, grantId]);
    await appendEvent(tx, access.row, actor.id, 'room.grant-revoked', `Access for ${rows[0].email} revoked.`);
    return { revoked: true };
  });
}

export async function roomAudit(actor: Actor, roomId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    const events = await tx.query<{
      sequence: number;
      at: string | Date;
      actor_id: string;
      action: string;
      detail: string;
      previous_hash: string;
      hash: string;
    }>(
      'SELECT sequence,at,actor_id,action,detail,previous_hash,hash FROM room_events WHERE room_id=$1 AND tenant_id=$2 ORDER BY sequence',
      [roomId, access.row.tenant_id],
    );
    const entries = events.map(event => ({
      sequence: Number(event.sequence),
      at: isoOf(event.at)!,
      actorId: event.actor_id,
      action: event.action,
      detail: event.detail,
      previousHash: event.previous_hash,
      hash: event.hash,
    }));
    const verified = entries.every(
      (entry, index) =>
        entry.sequence === index + 1 &&
        entry.previousHash === (index ? entries[index - 1].hash : 'genesis') &&
        auditDigest({
          sequence: String(entry.sequence),
          at: entry.at,
          actorId: entry.actorId,
          action: entry.action,
          detail: entry.detail,
          previousHash: entry.previousHash,
        }) === entry.hash,
    );
    return { verified, entries };
  });
}

/** A private copy for the owner: contents, collaborators (never tokens) and the audit. File bytes stay in the room. */
export async function exportRoom(actor: Actor, roomId: string) {
  const room = await withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    await appendEvent(tx, access.row, actor.id, 'room.exported', 'Private export downloaded by the owner.');
    return view(access);
  });
  return {
    format: 'ascent-transaction-room-export-1',
    exportedAt: new Date().toISOString(),
    privacy:
      'Private: notes, documents list, collaborators and audit for one room. Downloaded copies cannot be recalled.',
    room,
    collaborators: await listGrants(actor, roomId),
    audit: await roomAudit(actor, roomId),
  };
}

export async function deleteRoom(actor: Actor, roomId: string) {
  return withRoom(actor, roomId, async (tx, access) => {
    requireOwner(access);
    for (const document of access.data.documents) await deleteDocumentIn(tx, access.row.tenant_id, document.id);
    await tx.query('DELETE FROM room_memberships WHERE room_id=$1', [roomId]);
    await tx.query('DELETE FROM room_events WHERE room_id=$1 AND tenant_id=$2', [roomId, access.row.tenant_id]);
    await tx.query('DELETE FROM room_grants WHERE room_id=$1 AND tenant_id=$2', [roomId, access.row.tenant_id]);
    await tx.query('DELETE FROM homeowner_rooms WHERE id=$1 AND tenant_id=$2', [roomId, access.row.tenant_id]);
    return { deleted: true, documents: access.data.documents.length };
  });
}
