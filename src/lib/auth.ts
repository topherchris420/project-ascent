import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { syncPropertyLocations, transaction } from './db';
import { createDemoWorkspace } from './seed';
import type { Actor } from './types';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'ascent_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
// PostgreSQL jsonb reorders keys. Canonical primitive event fields keep hashes stable after persistence.
export const auditDigest = (event: Record<string, string>) => digest(JSON.stringify(Object.fromEntries(Object.entries(event).sort(([a], [b]) => a.localeCompare(b)))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [, salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(key, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type UserRow = { id: string; tenant_id: string; name: string; email: string; role: Actor['role']; password_hash: string | null };
const actorFrom = (row: UserRow): Actor => ({ id: row.id, tenantId: row.tenant_id, name: row.name, email: row.email, role: row.role });
export async function createSession(user: Actor) {
  const token = randomBytes(32).toString('base64url');
  await transaction(null, async (tx) => {
    await tx.query('DELETE FROM sessions WHERE expires_at<$1', [new Date().toISOString()]);
    await tx.query('INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token), user.id, new Date(Date.now() + SESSION_MS).toISOString()]);
  });
  return { user, token };
}

export async function register(input: { name: string; email: string; password: string; organization?: string }) {
  const tenantId = randomUUID(); const id = randomUUID();
  const email = input.email.toLowerCase().trim();
  const passwordHash = await hashPassword(input.password);
  await transaction(tenantId, async (tx) => {
    const existing = await tx.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.length) throw new HttpError(409, 'An account with this email already exists.');
    await tx.query('INSERT INTO tenants(id,created_at) VALUES($1,$2)', [tenantId, new Date().toISOString()]);
    await tx.query('INSERT INTO users(id,tenant_id,name,email,role,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, tenantId, input.name, email, 'owner', passwordHash, new Date().toISOString()]);
    const workspace = createDemoWorkspace();
    if (input.organization) workspace.settings.organization = input.organization;
    const audit = { id: randomUUID(), actorId: id, action: 'registerWorkspace', entityId: tenantId, at: new Date().toISOString(), details: 'Private tenant created with explicitly synthetic demonstration records.', previousHash: 'genesis' };
    workspace.audit.push({ ...audit, hash: auditDigest(audit) });
    await tx.query('INSERT INTO workspaces(tenant_id,version,data) VALUES($1,1,$2)', [tenantId, JSON.stringify(workspace)]);
    await syncPropertyLocations(tx, tenantId, workspace);
  });
  return createSession({ id, tenantId, name: input.name, email, role: 'owner' });
}

export async function login(email: string, password: string) {
  const rows = await transaction(null, (tx) => tx.query<UserRow>('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]));
  const row = rows[0];
  const valid = await verifyPassword(password, row?.password_hash || 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64));
  if (!row || !row.password_hash || !valid) throw new HttpError(401, 'Email or password is incorrect.');
  return createSession(actorFrom(row));
}

export async function demoSession(name = 'Alex Morgan') {
  // Each demo receives a separate tenant and an unguessable account, never a shared global workspace.
  return register({ name, email: `demo-${randomUUID()}@demo.invalid`, password: randomBytes(32).toString('base64url'), organization: 'Ascent Demonstration' });
}

export function sessionToken(request: Request): string | null {
  const match = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = match.slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function authenticate(request: Request): Promise<Actor> {
  const token = sessionToken(request);
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  const rows = await transaction(null, (tx) => tx.query<UserRow>('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=$1 AND sessions.expires_at>$2', [digest(token), new Date().toISOString()]));
  if (!rows[0]) throw new HttpError(401, 'Session expired. Sign in again.');
  return actorFrom(rows[0]);
}

export async function logout(request: Request) {
  const token = sessionToken(request);
  if (token) await transaction(null, (tx) => tx.query('DELETE FROM sessions WHERE hash=$1', [digest(token)]));
}

export function sessionCookie(token: string, clear = false): string {
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function requireEditor(actor: Actor) {
  if (actor.role !== 'owner' && actor.role !== 'agent') throw new HttpError(403, 'Your role permits viewing only. An agent or owner must approve changes.');
}
