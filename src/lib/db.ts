import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type { Actor, Workspace } from './types';
import { databasePoolOptions } from './database-config';

export class DatabaseConfigurationError extends Error {}

type SqlValue = string | number | null | Uint8Array;
export type DbTransaction = { query<T = Record<string, unknown>>(sql: string, values?: SqlValue[]): Promise<T[]> };
let sqlite: DatabaseSync | undefined;
let pool: Pool | undefined;
let verifiedPool = false;
let lock: Promise<unknown> = Promise.resolve();
const localSchema = `
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('owner','agent','viewer')), password_hash TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS workspaces(tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), data BLOB NOT NULL, encrypted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS property_locations(tenant_id TEXT NOT NULL REFERENCES tenants(id),property_id TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,PRIMARY KEY(tenant_id,property_id));
CREATE TABLE IF NOT EXISTS billing_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS team_invitations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),token_hash TEXT NOT NULL UNIQUE,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('agent','viewer')),expires_at TEXT NOT NULL,created_by TEXT NOT NULL,used_at TEXT);
CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),user_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,scopes TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS account_security(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,is_demo INTEGER NOT NULL DEFAULT 0,secret TEXT,pending_secret TEXT,pending_until TEXT,enabled_at TEXT,last_counter BIGINT NOT NULL DEFAULT -1,recovery_hashes TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS session_assurance(hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,mfa_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_mail_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS homeowner_rooms(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,property_key TEXT NOT NULL,address TEXT NOT NULL,data BLOB NOT NULL,encrypted INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,owner_id,property_key));
CREATE TABLE IF NOT EXISTS room_grants(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),room_id TEXT NOT NULL REFERENCES homeowner_rooms(id) ON DELETE CASCADE,email TEXT NOT NULL,role TEXT NOT NULL,permissions TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,invite_expires_at TEXT NOT NULL,access_expires_at TEXT NOT NULL,user_id TEXT,accepted_at TEXT,revoked_at TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS room_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),room_id TEXT NOT NULL REFERENCES homeowner_rooms(id) ON DELETE CASCADE,sequence INTEGER NOT NULL,at TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL,UNIQUE(room_id,sequence));
CREATE TABLE IF NOT EXISTS room_memberships(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,room_id TEXT NOT NULL,tenant_id TEXT NOT NULL REFERENCES tenants(id),grant_id TEXT NOT NULL,PRIMARY KEY(user_id,room_id));
`;

function localDb() {
  if (process.env.NODE_ENV === 'production')
    throw new DatabaseConfigurationError('Production requires PostgreSQL DATABASE_URL; local SQLite is disabled.');
  if (!sqlite) {
    const filename = resolve(process.env.SQLITE_PATH || '.data/ascent.sqlite');
    mkdirSync(dirname(filename), { recursive: true });
    sqlite = new DatabaseSync(filename);
    sqlite.exec(localSchema);
  }
  return sqlite;
}

function pgPool() {
  if (!pool)
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ...databasePoolOptions(),
      ...(process.env.PGSSL === 'require' ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  return pool;
}

const pgTx = (client: PoolClient): DbTransaction => ({
  async query<T>(sql: string, values: SqlValue[] = []) {
    return (await client.query(sql, values)).rows as T[];
  },
});

async function serialize<T>(callback: () => Promise<T>): Promise<T> {
  const previous = lock;
  let release!: () => void;
  lock = new Promise<void>(done => {
    release = done;
  });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

export async function transaction<T>(tenantId: string | null, callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') encryptionKey();
    const client = await pgPool().connect();
    try {
      if (!verifiedPool && process.env.NODE_ENV === 'production') {
        const roles = await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
        if (roles.rows[0]?.rolsuper || roles.rows[0]?.rolbypassrls)
          throw new Error('Application database role must not be superuser or BYPASSRLS.');
        const policies = await client.query(
          "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname IN ('workspaces','documents','property_locations','billing_events','team_invitations','api_keys')",
        );
        if (policies.rows.length !== 6 || policies.rows.some(row => !row.relrowsecurity || !row.relforcerowsecurity))
          throw new Error(
            'All six tenant tables must have enabled and forced RLS. Apply migrations before serving requests.',
          );
        const identity = await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename IN ('account_security','session_assurance','password_resets','auth_mail_outbox')",
        );
        if (identity.rows.length !== 4)
          throw new DatabaseConfigurationError(
            'Apply account-security migration 004 and runtime grants before serving private accounts.',
          );
        verifiedPool = true;
      }
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await callback(pgTx(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return serialize(async () => {
    const db = localDb();
    db.exec('BEGIN IMMEDIATE');
    const tx: DbTransaction = {
      async query<T>(sql: string, values: SqlValue[] = []) {
        const prepared = db.prepare(sql.replace(/\$\d+/g, '?').replace(/ FOR UPDATE\b/g, ''));
        return prepared.all(...values) as T[];
      },
    };
    try {
      const result = await callback(tx);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

export async function getWorkspace(tenantId: string): Promise<Workspace> {
  return transaction(tenantId, async tx => {
    const rows = await tx.query<{ data: string | Workspace }>('SELECT data FROM workspaces WHERE tenant_id=$1', [
      tenantId,
    ]);
    if (!rows[0]) throw new Error('Workspace unavailable');
    return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  });
}

export async function syncPropertyLocations(tx: DbTransaction, tenantId: string, workspace: Workspace) {
  await tx.query('DELETE FROM property_locations WHERE tenant_id=$1', [tenantId]);
  for (const property of workspace.properties)
    await tx.query('INSERT INTO property_locations(tenant_id,property_id,lat,lng) VALUES($1,$2,$3,$4)', [
      tenantId,
      property.id,
      property.lat,
      property.lng,
    ]);
}

export async function nearbyPropertyIds(
  tenantId: string,
  lat: number,
  lng: number,
  miles: number,
): Promise<string[] | null> {
  if (!process.env.DATABASE_URL) return null;
  return transaction(tenantId, async tx => {
    const rows = await tx.query<{ property_id: string }>(
      'SELECT property_id FROM property_locations WHERE tenant_id=$1 AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4)',
      [tenantId, lng, lat, miles * 1609.344],
    );
    return rows.map(row => row.property_id);
  });
}

export async function mutateWorkspace<T>(
  actor: Actor,
  callback: (workspace: Workspace, tx: DbTransaction) => Promise<T> | T,
): Promise<{ workspace: Workspace; result: T }> {
  return transaction(actor.tenantId, async tx => {
    const rows = await tx.query<{ data: string | Workspace; version: number }>(
      'SELECT data,version FROM workspaces WHERE tenant_id=$1 FOR UPDATE',
      [actor.tenantId],
    );
    if (!rows[0]) throw new Error('Workspace unavailable');
    const workspace: Workspace = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const result = await callback(workspace, tx);
    const updated = await tx.query(
      'UPDATE workspaces SET data=$1,version=version+1 WHERE tenant_id=$2 AND version=$3 RETURNING version',
      [JSON.stringify(workspace), actor.tenantId, rows[0].version],
    );
    if (!updated.length) throw new Error('Concurrent workspace update; retry your action.');
    return { workspace, result };
  });
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return transaction(null, async tx => {
    const now = Date.now();
    await tx.query('DELETE FROM rate_limits WHERE expires_at<$1', [now]);
    const row = await tx.query<{ count: number }>(
      'INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count',
      [key, now + windowMs],
    );
    return row[0].count <= limit;
  });
}

function encryptionKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('APP_ENCRYPTION_KEY required');
    return null;
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be base64 encoding of 32 random bytes');
  return key;
}

/** AES-256-GCM with a fresh IV when APP_ENCRYPTION_KEY is set (required in production); plain bytes otherwise. */
export function sealBytes(bytes: Buffer): { data: Buffer; encrypted: 0 | 1 } {
  const key = encryptionKey();
  if (!key) return { data: bytes, encrypted: 0 };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { data: Buffer.concat([iv, cipher.getAuthTag(), encrypted]), encrypted: 1 };
}

export function openBytes(stored: Uint8Array, encrypted: number | boolean): Buffer {
  const data = Buffer.from(stored);
  if (!encrypted) return data;
  const key = encryptionKey();
  if (!key) throw new Error('Document encryption key unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

export async function storeDocument(tx: DbTransaction, tenantId: string, id: string, bytes: Buffer) {
  const sealed = sealBytes(bytes);
  await tx.query('INSERT INTO documents(id,tenant_id,data,encrypted,created_at) VALUES($1,$2,$3,$4,$5)', [
    id,
    tenantId,
    sealed.data,
    sealed.encrypted,
    new Date().toISOString(),
  ]);
}

/** Reads a document inside an existing tenant transaction, so an access check and the read cannot be split. */
export async function readDocumentIn(tx: DbTransaction, tenantId: string, id: string): Promise<Buffer | null> {
  const rows = await tx.query<{ data: Uint8Array; encrypted: number }>(
    'SELECT data,encrypted FROM documents WHERE id=$1 AND tenant_id=$2',
    [id, tenantId],
  );
  return rows[0] ? openBytes(rows[0].data, rows[0].encrypted) : null;
}

export async function readDocument(tenantId: string, id: string): Promise<Buffer | null> {
  return transaction(tenantId, tx => readDocumentIn(tx, tenantId, id));
}

export async function deleteDocumentIn(tx: DbTransaction, tenantId: string, id: string) {
  await tx.query('DELETE FROM documents WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
}

export async function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = undefined;
  }
  if (pool) {
    await pool.end();
    pool = undefined;
    verifiedPool = false;
  }
}
