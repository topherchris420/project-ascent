import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import type { Actor, Workspace } from './types';

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
`;

function localDb() {
  if (process.env.NODE_ENV === 'production') throw new DatabaseConfigurationError('Production requires PostgreSQL DATABASE_URL; local SQLite is disabled.');
  if (!sqlite) {
    const filename = resolve(process.env.SQLITE_PATH || '.data/ascent.sqlite');
    mkdirSync(dirname(filename), { recursive: true });
    sqlite = new DatabaseSync(filename);
    sqlite.exec(localSchema);
  }
  return sqlite;
}

function pgPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, ...(process.env.PGSSL === 'require' ? { ssl: { rejectUnauthorized: true } } : {}) });
  return pool;
}

const pgTx = (client: PoolClient): DbTransaction => ({
  async query<T>(sql: string, values: SqlValue[] = []) { return (await client.query(sql, values)).rows as T[]; },
});

async function serialize<T>(callback: () => Promise<T>): Promise<T> {
  const previous = lock;
  let release!: () => void;
  lock = new Promise<void>((done) => { release = done; });
  await previous;
  try { return await callback(); } finally { release(); }
}

export async function transaction<T>(tenantId: string | null, callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') encryptionKey();
    const client = await pgPool().connect();
    try {
      if (!verifiedPool && process.env.NODE_ENV === 'production') {
        const roles = await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
        if (roles.rows[0]?.rolsuper || roles.rows[0]?.rolbypassrls) throw new Error('Application database role must not be superuser or BYPASSRLS.');
        const policies = await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname IN ('workspaces','documents','property_locations','billing_events','team_invitations','api_keys')");
        if (policies.rows.length !== 6 || policies.rows.some((row) => !row.relrowsecurity || !row.relforcerowsecurity)) throw new Error('All six tenant tables must have enabled and forced RLS. Apply migrations before serving requests.');
        verifiedPool = true;
      }
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const result = await callback(pgTx(client));
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  return serialize(async () => {
    const db = localDb();
    db.exec('BEGIN IMMEDIATE');
    const tx: DbTransaction = { async query<T>(sql: string, values: SqlValue[] = []) {
      const prepared = db.prepare(sql.replace(/\$\d+/g, '?').replace(/ FOR UPDATE\b/g, ''));
      return prepared.all(...values) as T[];
    } };
    try { const result = await callback(tx); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  });
}

export async function getWorkspace(tenantId: string): Promise<Workspace> {
  return transaction(tenantId, async (tx) => {
    const rows = await tx.query<{ data: string | Workspace }>('SELECT data FROM workspaces WHERE tenant_id=$1', [tenantId]);
    if (!rows[0]) throw new Error('Workspace unavailable');
    return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  });
}

export async function syncPropertyLocations(tx: DbTransaction, tenantId: string, workspace: Workspace) {
  await tx.query('DELETE FROM property_locations WHERE tenant_id=$1', [tenantId]);
  for (const property of workspace.properties) await tx.query('INSERT INTO property_locations(tenant_id,property_id,lat,lng) VALUES($1,$2,$3,$4)', [tenantId, property.id, property.lat, property.lng]);
}

export async function nearbyPropertyIds(tenantId: string, lat: number, lng: number, miles: number): Promise<string[] | null> {
  if (!process.env.DATABASE_URL) return null;
  return transaction(tenantId, async (tx) => {
    const rows = await tx.query<{ property_id: string }>('SELECT property_id FROM property_locations WHERE tenant_id=$1 AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4)', [tenantId, lng, lat, miles * 1609.344]);
    return rows.map((row) => row.property_id);
  });
}

export async function mutateWorkspace<T>(actor: Actor, callback: (workspace: Workspace, tx: DbTransaction) => Promise<T> | T): Promise<{ workspace: Workspace; result: T }> {
  return transaction(actor.tenantId, async (tx) => {
    const rows = await tx.query<{ data: string | Workspace; version: number }>('SELECT data,version FROM workspaces WHERE tenant_id=$1 FOR UPDATE', [actor.tenantId]);
    if (!rows[0]) throw new Error('Workspace unavailable');
    const workspace: Workspace = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const result = await callback(workspace, tx);
    const updated = await tx.query('UPDATE workspaces SET data=$1,version=version+1 WHERE tenant_id=$2 AND version=$3 RETURNING version', [JSON.stringify(workspace), actor.tenantId, rows[0].version]);
    if (!updated.length) throw new Error('Concurrent workspace update; retry your action.');
    return { workspace, result };
  });
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return transaction(null, async (tx) => {
    const now = Date.now();
    await tx.query('DELETE FROM rate_limits WHERE expires_at<$1', [now]);
    const row = await tx.query<{ count: number }>('INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count', [key, now + windowMs]);
    return row[0].count <= limit;
  });
}

function encryptionKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) { if (process.env.NODE_ENV === 'production') throw new Error('APP_ENCRYPTION_KEY required'); return null; }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be base64 encoding of 32 random bytes');
  return key;
}

export async function storeDocument(tx: DbTransaction, tenantId: string, id: string, bytes: Buffer) {
  const key = encryptionKey();
  let data = bytes;
  if (key) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]); data = Buffer.concat([iv, cipher.getAuthTag(), encrypted]); }
  await tx.query('INSERT INTO documents(id,tenant_id,data,encrypted,created_at) VALUES($1,$2,$3,$4,$5)', [id, tenantId, data, key ? 1 : 0, new Date().toISOString()]);
}

export async function readDocument(tenantId: string, id: string): Promise<Buffer | null> {
  return transaction(tenantId, async (tx) => {
    const rows = await tx.query<{ data: Uint8Array; encrypted: number }>('SELECT data,encrypted FROM documents WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    if (!rows[0]) return null;
    const data = Buffer.from(rows[0].data);
    if (!rows[0].encrypted) return data;
    const key = encryptionKey(); if (!key) throw new Error('Document encryption key unavailable');
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  });
}

export async function closeDatabase() {
  if (sqlite) { sqlite.close(); sqlite = undefined; }
  if (pool) { await pool.end(); pool = undefined; verifiedPool = false; }
}
