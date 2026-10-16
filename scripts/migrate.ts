import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { closeDatabase, transaction } from '../src/lib/db';

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    await transaction(null, async () => undefined);
    console.log('Local SQLite schema is ready. PostgreSQL/PostGIS deployment requires DATABASE_URL.');
    await closeDatabase(); return;
  }
  const pool = new Pool({ connectionString, ...(process.env.PGSSL === 'require' ? { ssl: { rejectUnauthorized: true } } : {}) });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1427836991)');
    await client.query('CREATE TABLE IF NOT EXISTS ascent_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(resolve('migrations'))).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
    for (const file of files) {
      const version = file.slice(0, -4); const present = await client.query('SELECT version FROM ascent_migrations WHERE version=$1', [version]);
      if (!present.rowCount) { await client.query(await readFile(resolve('migrations', file), 'utf8')); await client.query('INSERT INTO ascent_migrations(version) VALUES($1)', [version]); console.log(`Applied PostgreSQL migration ${version}.`); }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
