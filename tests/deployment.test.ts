import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { allowedAppOrigins, checkDeployment, workspaceIsAvailable } from '../src/lib/deployment';
import { databasePoolOptions } from '../src/lib/database-config';
import {
  DOCUMENT_LIMIT_LABEL,
  MAX_DOCUMENT_BYTES,
  MAX_MULTIPART_BYTES,
  documentSizeError,
} from '../src/lib/upload-limits';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace, readDocument, storeDocument } from '../src/lib/db';
import { validateUpload } from '../src/lib/service';
import { POST as uploadPost } from '../src/app/api/documents/route';
import { GET as documentGet } from '../src/app/api/documents/[id]/route';

process.env.SQLITE_PATH = resolve('.data', `deployment-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
after(closeDatabase);

const configured = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime@db.example.invalid/ascent?sslmode=require',
  APP_ORIGIN: 'https://ascent.example.invalid',
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CRON_SECRET: 'synthetic-cron-secret-for-configuration-tests',
};

test('deployment readiness refuses incomplete production configuration while local exploration stays available', () => {
  assert.equal(checkDeployment({}).configured, false);
  assert.equal(workspaceIsAvailable({ NODE_ENV: 'production' }), false);
  assert.equal(workspaceIsAvailable({ VERCEL: '1' }), false);
  assert.equal(workspaceIsAvailable({ NODE_ENV: 'development' }), true);
  assert.equal(workspaceIsAvailable(configured), true);
  assert.equal(
    checkDeployment(configured).databaseVerified,
    false,
    'configuration is not proof a database was migrated',
  );
});

test('a Vercel deployment accepts platform-owned HTTPS origins without weakening origin validation', () => {
  const vercel = {
    ...configured,
    APP_ORIGIN: undefined,
    VERCEL: '1',
    VERCEL_URL: 'ascent-unique-deployment.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'project-ascent-theta.vercel.app',
  };
  assert.deepEqual(allowedAppOrigins(vercel), [
    'https://project-ascent-theta.vercel.app',
    'https://ascent-unique-deployment.vercel.app',
  ]);
  assert.equal(checkDeployment(vercel).configured, true);
  assert.equal(workspaceIsAvailable(vercel), true);
  assert.equal(checkDeployment({ ...vercel, VERCEL: undefined }).configured, false);
  assert.equal(checkDeployment({ ...vercel, APP_ORIGIN: 'https://bad.example/path' }).configured, false);
  assert.deepEqual(allowedAppOrigins({ ...vercel, APP_ORIGIN: 'https://ascent.example.invalid' }), [
    'https://ascent.example.invalid',
  ]);
  assert.deepEqual(allowedAppOrigins({
    ...vercel,
    VERCEL_URL: 'evil.example@another.example',
    VERCEL_PROJECT_PRODUCTION_URL: 'https://fake.example',
  }), []);
});

test('production origin, database protocol and document encryption configuration are validated without exposing values', () => {
  for (const APP_ORIGIN of [
    'http://ascent.example.invalid',
    'https://ascent.example.invalid/',
    'https://ascent.example.invalid/path',
    'https://person@ascent.example.invalid',
  ])
    assert.equal(checkDeployment({ ...configured, APP_ORIGIN }).configured, false);
  for (const APP_ENCRYPTION_KEY of ['', 'not-base64', Buffer.alloc(31).toString('base64')])
    assert.equal(checkDeployment({ ...configured, APP_ENCRYPTION_KEY }).configured, false);
  assert.equal(checkDeployment({ ...configured, DATABASE_URL: 'https://db.example.invalid' }).configured, false);
  const report = checkDeployment({ ...configured, GROQ_API_KEY: 'synthetic-provider-credential-never-publish' });
  const text = JSON.stringify(report);
  for (const value of [
    configured.DATABASE_URL,
    configured.APP_ENCRYPTION_KEY,
    configured.CRON_SECRET,
    'synthetic-provider-credential-never-publish',
  ])
    assert.equal(text.includes(value), false);
  assert.equal(report.checks.find(check => check.name === 'AI_BUDGETS')?.ok, false);
  assert.equal(report.configured, true, 'missing optional inference does not block deterministic workflows');
});

test('a local data policy cannot pass the production configuration check and no provider is contacted', () => {
  const report = checkDeployment({
    ...configured,
    PROPERTY_PROVIDER_ENABLED: 'true',
    PROPERTY_PROVIDER_POLICY_JSON: JSON.stringify({ deploymentScope: 'local-development' }),
  });
  assert.equal(report.checks.find(check => check.name === 'PROPERTY_PROVIDER_POLICY')?.ok, false);
  assert.equal(report.configured, true, 'provider rights are enforced separately from account access');
});

test('serverless pool defaults conserve per-instance connections and bound acquisition and idle lifetime', () => {
  assert.equal(databasePoolOptions({ VERCEL: '1' }).max, 2);
  assert.equal(databasePoolOptions({ NODE_ENV: 'production' }).max, 2);
  assert.equal(databasePoolOptions({}).max, 8);
  assert.equal(databasePoolOptions({ VERCEL: '1', PG_POOL_MAX: '1' }).max, 1);
  for (const PG_POOL_MAX of ['0', '-2', 'Infinity', '10000', '1.2', 'invalid'])
    assert.equal(databasePoolOptions({ VERCEL: '1', PG_POOL_MAX }).max, 2);
  const options = databasePoolOptions({ VERCEL: '1' });
  assert.equal(options.connectionTimeoutMillis, 8000);
  assert.equal(options.idleTimeoutMillis, 10000);
  assert.equal(options.allowExitOnIdle, true);
});

test('document boundaries leave multipart headroom below the hosting platform payload limit', () => {
  assert.ok(MAX_MULTIPART_BYTES < 4_500_000);
  assert.ok(MAX_MULTIPART_BYTES > MAX_DOCUMENT_BYTES);
  assert.equal(DOCUMENT_LIMIT_LABEL, '4 MB');
  assert.equal(documentSizeError(MAX_DOCUMENT_BYTES), undefined);
  assert.ok(documentSizeError(MAX_DOCUMENT_BYTES + 1));
  assert.ok(documentSizeError(0));
  assert.doesNotThrow(() => validateUpload('limit.txt', 'text/plain', Buffer.alloc(MAX_DOCUMENT_BYTES, 65)));
  assert.throws(() => validateUpload('oversize.txt', 'text/plain', Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65)), /4 MB/);
});

const account = () =>
  register({
    name: 'Hobby fixture user',
    email: `${randomUUID()}@example.test`,
    password: 'synthetic hosting acceptance passphrase',
  });
const headers = (token: string) => ({ cookie: sessionCookie(token), origin: 'http://localhost:3040' });

test('HTTP upload accepts the exact file limit, preserves private bytes and rejects one byte more', async () => {
  const { user, token } = await account();
  const body = (size: number) => {
    const form = new FormData();
    form.set('transactionId', 'transaction-02');
    form.set('file', new File([new Uint8Array(size).fill(65)], 'boundary.txt', { type: 'text/plain' }));
    return form;
  };
  const accepted = await uploadPost(
    new Request('http://localhost:3040/api/documents', {
      method: 'POST',
      headers: headers(token),
      body: body(MAX_DOCUMENT_BYTES),
    }),
  );
  assert.equal(accepted.status, 200);
  const { result } = await accepted.json();
  assert.equal((await readDocument(user.tenantId, result.id))?.length, MAX_DOCUMENT_BYTES);
  assert.equal((await getWorkspace(user.tenantId)).documents[0].textExtraction?.status, 'partial');
  const rejected = await uploadPost(
    new Request('http://localhost:3040/api/documents', {
      method: 'POST',
      headers: headers(token),
      body: body(MAX_DOCUMENT_BYTES + 1),
    }),
  );
  assert.equal(rejected.status, 413);
  assert.match((await rejected.json()).error, /4 MB/);
  assert.equal((await getWorkspace(user.tenantId)).documents.length, 1);
});

test('oversized declared and chunked request bodies are rejected before multipart parsing and storage', async () => {
  const { user, token } = await account();
  const declared = await uploadPost(
    new Request('http://localhost:3040/api/documents', {
      method: 'POST',
      headers: { ...headers(token), 'content-length': String(MAX_MULTIPART_BYTES + 1) },
      body: 'not multipart',
    }),
  );
  assert.equal(declared.status, 413);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_MULTIPART_BYTES + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const chunked = await uploadPost(
    new Request('http://localhost:3040/api/documents', {
      method: 'POST',
      headers: headers(token),
      body: stream,
      duplex: 'half',
    } as RequestInit),
  );
  assert.equal(chunked.status, 413);
  assert.equal(cancelled, true);
  assert.equal((await getWorkspace(user.tenantId)).documents.length, 0);
});

test('large legacy documents remain stored and private but return a useful error instead of exceeding a Vercel response', async () => {
  const { user, token } = await account(),
    foreign = await account();
  const id = randomUUID(),
    bytes = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 65);
  await mutateWorkspace(user, async (workspace, tx) => {
    workspace.documents.push({
      id,
      transactionId: 'transaction-02',
      name: 'legacy.txt',
      size: bytes.length,
      mime: 'text/plain',
      sha256: 'synthetic-legacy-hash',
      uploadedAt: new Date().toISOString(),
      extractedDates: [],
    });
    await storeDocument(tx, user.tenantId, id, bytes);
  });
  const request = (token: string) =>
    new Request(`http://localhost:3040/api/documents/${id}`, { headers: { cookie: sessionCookie(token) } });
  const before = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    assert.equal((await documentGet(request(token), { params: Promise.resolve({ id }) })).status, 413);
    assert.equal((await documentGet(request(foreign.token), { params: Promise.resolve({ id }) })).status, 404);
    assert.equal((await readDocument(user.tenantId, id))?.length, bytes.length);
  } finally {
    if (before === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = before;
  }
});
