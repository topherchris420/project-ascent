/** Synthetic local PostgreSQL only. Never accepts a production source or an existing restore target. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const url = new URL(process.env.DRILL_DATABASE_URL || 'postgres://invalid');
assert.ok(process.argv.includes('--local-synthetic'), 'Explicit --local-synthetic required.');
assert.ok(
  ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/postgres',
  'Only a loopback admin connection to postgres is accepted.',
);
const suffix = randomBytes(6).toString('hex');
const source = `ascent_drill_source_${suffix}`;
const target = `ascent_drill_restore_${suffix}`;
const role = `ascent_drill_role_${suffix}`;
const password = randomBytes(32).toString('hex');
const key = randomBytes(32).toString('base64');
const dir = resolve('.data', `backup-drill-${suffix}`);
assert.ok(dir.startsWith(resolve('.data') + (process.platform === 'win32' ? '\\' : '/')));
mkdirSync(dir, { recursive: true });
const dump = resolve(dir, 'synthetic.dump');
const admin = new Pool({ connectionString: url.toString() });
const connect = (database: string, asApp = false) => {
  const value = new URL(url);
  value.pathname = `/${database}`;
  if (asApp) {
    value.username = role;
    value.password = password;
  }
  return value.toString();
};
async function configure(database: string, migrate = false) {
  const pool = new Pool({ connectionString: connect(database) });
  try {
    if (migrate)
      for (const file of readdirSync('migrations')
        .filter(file => /^\d+.*\.sql$/.test(file))
        .sort())
        await pool.query(readFileSync(resolve('migrations', file), 'utf8'));
    await pool.query(
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
  } finally {
    await pool.end();
  }
}
async function main() {
  const db = await import('../src/lib/db');
  try {
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    );
    for (const name of [source, target]) {
      assert.match(name, /^ascent_drill_(source|restore)_[a-f0-9]{12}$/);
      await admin.query(`CREATE DATABASE ${name}`);
    }
    await configure(source, true);
    Object.assign(process.env, {
      DATABASE_URL: connect(source, true),
      NODE_ENV: 'production',
      APP_ENCRYPTION_KEY: key,
      APP_ORIGIN: 'https://ascent.example.invalid',
      RESEND_API_KEY: 'mock-delivery-only',
      AUTH_MAIL_FROM: 'Ascent <drill@example.invalid>',
    });
    const auth = await import('../src/lib/auth');
    const security = await import('../src/lib/account-security');
    const { TOTP, Secret } = await import('otpauth');
    const first = await auth.register({
      name: 'Synthetic drill owner',
      email: 'restore-test@example.invalid',
      password: 'synthetic long password only',
    });
    const second = await auth.register({
      name: 'Other synthetic owner',
      email: 'other-test@example.invalid',
      password: 'synthetic long password only',
    });
    const request = (token: string) =>
      new Request('https://ascent.example.invalid', { headers: { cookie: auth.sessionCookie(token) } });
    await assert.rejects(auth.authenticate(request(first.token)), /Authenticator verification/);
    const setup = await security.beginMfa(first.user, 'synthetic long password only');
    const codes = await security.enableMfa(
      first.user,
      new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate(),
    );
    const signedIn = await auth.login(first.user.email, 'synthetic long password only', codes.recoveryCodes[0]);
    await auth.authenticate(request(signedIn.token));
    const content = Buffer.from('Synthetic encrypted document for restore acceptance');
    await db.transaction(first.user.tenantId, tx =>
      db.storeDocument(tx, first.user.tenantId, 'synthetic-drill-document', content),
    );
    await security.requestPasswordReset(first.user.email);
    await db.closeDatabase();
    const childEnv = {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: source,
    };
    execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dump], {
      env: childEnv,
      stdio: 'pipe',
    });
    execFileSync('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', target, dump], {
      env: { ...childEnv, PGDATABASE: target },
      stdio: 'pipe',
    });
    await configure(target);
    process.env.DATABASE_URL = connect(target, true);
    assert.deepEqual(await db.readDocument(first.user.tenantId, 'synthetic-drill-document'), content);
    assert.equal(await db.readDocument(second.user.tenantId, 'synthetic-drill-document'), null);
    const foreign = await db.transaction(second.user.tenantId, tx =>
      tx.query('SELECT tenant_id FROM workspaces WHERE tenant_id=$1', [first.user.tenantId]),
    );
    assert.equal(foreign.length, 0);
    await auth.authenticate(request(signedIn.token));
    await assert.rejects(
      auth.login(first.user.email, 'synthetic long password only', codes.recoveryCodes[0]),
      /fresh|unused/,
    );
    await auth.login(first.user.email, 'synthetic long password only', codes.recoveryCodes[1]);
    let resetToken = '';
    const delivery = await security.deliverAuthMail(async (_url, options) => {
      resetToken = /#token=([A-Za-z0-9_-]{43})/.exec(JSON.parse(String(options?.body)).text)![1];
      return Response.json({ id: 'synthetic-mail-only' });
    });
    assert.equal(delivery.sent, 1);
    await security.resetPassword(resetToken, 'new synthetic restore password');
    await assert.rejects(auth.authenticate(request(signedIn.token)), /expired/);
    await assert.rejects(
      security.resetPassword(resetToken, 'another synthetic restore password'),
      /invalid or expired/,
    );
    await assert.rejects(auth.login(first.user.email, 'new synthetic restore password'), /code/);
    await auth.login(first.user.email, 'new synthetic restore password', codes.recoveryCodes[2]);
    const { providerReady } = await import('../src/lib/inference/config');
    process.env.GROQ_API_KEY = 'mock-never-requested';
    process.env.AI_DATA_SHARING = 'approved';
    assert.match(
      providerReady({ provider: 'groq', model: 'openai/gpt-oss-20b', task: 'everyday', reason: 'Synthetic check' })
        .reason,
      /Independent AI accuracy review/,
    );
    const isolation = await db.transaction(first.user.tenantId, tx => tx.query('SELECT tenant_id FROM workspaces'));
    assert.equal(isolation.length, 1);
    console.log(
      JSON.stringify(
        {
          passed: true,
          checks: [
            'all migrations',
            'restricted role and forced RLS',
            'production privileged MFA enforcement',
            'encrypted document restored with separate key',
            'tenant isolation after restore',
            'sessions restored',
            'MFA recovery replay rejected after restore',
            'encrypted recovery outbox restored and delivered through mocked transport',
            'password reset consumes token, revokes sessions and preserves MFA in PostgreSQL',
            'production AI review gate enforced',
          ],
          scope: 'Disposable local synthetic PostgreSQL; not a production backup or provider recovery drill.',
        },
        null,
        2,
      ),
    );
  } finally {
    await db.closeDatabase();
    for (const name of [source, target]) {
      assert.match(name, /^ascent_drill_(source|restore)_[a-f0-9]{12}$/);
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
    rmSync(dump, { force: true });
  }
}
main().catch(() => {
  console.error('Synthetic backup/restore drill failed. Credentials and database records are not logged.');
  process.exitCode = 1;
});
