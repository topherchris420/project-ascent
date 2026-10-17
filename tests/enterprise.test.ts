import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { digest, register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace, transaction } from '../src/lib/db';
import { processStripeWebhook } from '../src/lib/billing';
import { apiKeyActionSchema, authenticateIntegration, listApiKeys, manageApiKey } from '../src/lib/enterprise';
import { verifyAudit } from '../src/lib/service';
import { GET as propertiesGet } from '../src/app/api/v1/properties/route';
import { GET as cmasGet } from '../src/app/api/v1/cmas/route';
import { GET as keysGet, POST as keysPost } from '../src/app/api/integrations/keys/route';

process.env.SQLITE_PATH = resolve('.data', `enterprise-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
process.env.APP_ORIGIN = 'http://localhost:3040';
process.env.STRIPE_SECRET_KEY = 'sk_test_enterprise_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_enterprise_mock_only';
process.env.STRIPE_PRICE_ENTERPRISE = 'price_enterprise_mock';
after(async () => closeDatabase());
const owner = () =>
  register({
    seed: 'demo',
    name: 'Enterprise Test Owner',
    email: `${randomUUID()}@example.test`,
    password: 'enterprise isolated passphrase 1234',
  });
const tokenRequest = (token: string, resource = 'properties', query = '') =>
  new Request(`http://localhost:3040/api/v1/${resource}${query}`, { headers: { authorization: `Bearer ${token}` } });
const adminRequest = (token: string, body?: unknown) =>
  new Request('http://localhost:3040/api/integrations/keys', {
    method: body ? 'POST' : 'GET',
    headers: { cookie: sessionCookie(token), origin: 'http://localhost:3040', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function subscription(tenantId: string, status = 'active', offset = 0) {
  const event = {
    id: `evt_${randomUUID()}`,
    type: status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
    created: Math.floor(Date.now() / 1000) + offset,
    livemode: false,
    data: {
      object: {
        id: `sub_${tenantId}`,
        customer: `cus_${tenantId}`,
        status,
        metadata: { tenantId },
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        items: { data: [{ price: { id: 'price_enterprise_mock' } }] },
      },
    },
  };
  const raw = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${raw}`).digest('hex')}`;
  await processStripeWebhook(raw, signature);
}
async function createKey(
  account: Awaited<ReturnType<typeof owner>>,
  scopes: ('properties:read' | 'cmas:read')[] = ['properties:read', 'cmas:read'],
) {
  const result = await manageApiKey(account.user, {
    action: 'create',
    name: 'Synthetic integration',
    scopes,
    expiresInDays: 30,
  });
  assert.ok('token' in result);
  return result as { key: { id: string; name: string; scopes: string[]; expiresAt: string }; token: string };
}

test('key creation needs Enterprise, but owner metadata and cleanup remain available on Free', async () => {
  const account = await owner();
  assert.deepEqual(await listApiKeys(account.user), { keys: [] });
  await assert.rejects(createKey(account), /Enterprise/);
  await assert.rejects(listApiKeys({ ...account.user, role: 'viewer' }), /owner/);
  assert.equal(
    apiKeyActionSchema.safeParse({
      action: 'create',
      name: 'Fake upgrade',
      scopes: ['properties:read'],
      plan: 'enterprise',
    }).success,
    false,
  );
  assert.equal(
    apiKeyActionSchema.safeParse({ action: 'create', name: 'Too long', scopes: ['properties:read'], expiresInDays: 91 })
      .success,
    false,
  );
  assert.equal(
    apiKeyActionSchema.safeParse({ action: 'create', name: 'Write key', scopes: ['properties:write'] }).success,
    false,
  );
});

test('tokens are high entropy, shown once, hashed in storage and absent from lists and audit', async () => {
  const account = await owner();
  await subscription(account.user.tenantId);
  const created = await createKey(account);
  assert.match(created.token, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  const stored = await transaction(account.user.tenantId, tx =>
    tx.query<{ token_hash: string }>('SELECT token_hash FROM api_keys WHERE id=$1 AND tenant_id=$2', [
      created.key.id,
      account.user.tenantId,
    ]),
  );
  assert.equal(stored[0].token_hash, digest(created.token));
  assert.notEqual(stored[0].token_hash, created.token);
  const listed = await listApiKeys(account.user);
  assert.equal(listed.keys.length, 1);
  assert.ok(!JSON.stringify(listed).includes(created.token));
  assert.ok(!JSON.stringify(listed).includes(stored[0].token_hash));
  const workspace = await getWorkspace(account.user.tenantId);
  assert.ok(!JSON.stringify(workspace.audit).includes(created.token));
  assert.equal(verifyAudit(workspace), true);
});

test('read-only token scopes, tenant prefix and bounded export queries prevent privilege escalation', async () => {
  const a = await owner(),
    b = await owner();
  await subscription(a.user.tenantId);
  await subscription(b.user.tenantId);
  await mutateWorkspace(a.user, workspace => {
    workspace.properties[0].description = 'TENANT-A-ONLY';
  });
  await mutateWorkspace(b.user, workspace => {
    workspace.properties[0].description = 'TENANT-B-ONLY';
  });
  const created = await createKey(a, ['properties:read']);
  const response = await propertiesGet(tokenRequest(created.token, 'properties', '?limit=2'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.properties.length, 2);
  assert.equal(body.limit, 2);
  assert.ok(JSON.stringify(body).includes('TENANT-A-ONLY'));
  assert.ok(!JSON.stringify(body).includes('TENANT-B-ONLY'));
  assert.equal((await cmasGet(tokenRequest(created.token, 'cmas'))).status, 403);
  assert.equal((await propertiesGet(new Request('http://localhost:3040/api/v1/properties'))).status, 401);
  assert.equal((await propertiesGet(tokenRequest(`${b.user.tenantId}.${created.token.split('.')[1]}`))).status, 401);
  assert.equal((await propertiesGet(tokenRequest(created.token, 'properties', '?limit=101'))).status, 400);
  assert.equal((await propertiesGet(tokenRequest(created.token, 'properties', '?q=not-a-real-fixture'))).status, 200);
  await assert.rejects(manageApiKey(b.user, { action: 'revoke', id: created.key.id }), /not found/);
});

test('revocation, expiry, subscription cancellation and owner membership changes deny data use', async () => {
  const account = await owner();
  await subscription(account.user.tenantId);
  const revoked = await createKey(account),
    expired = await createKey(account),
    active = await createKey(account);
  await manageApiKey(account.user, { action: 'revoke', id: revoked.key.id });
  assert.equal((await propertiesGet(tokenRequest(revoked.token))).status, 401);
  await transaction(account.user.tenantId, tx =>
    tx.query('UPDATE api_keys SET expires_at=$1 WHERE id=$2 AND tenant_id=$3', [
      '2000-01-01T00:00:00Z',
      expired.key.id,
      account.user.tenantId,
    ]),
  );
  assert.equal((await propertiesGet(tokenRequest(expired.token))).status, 401);
  await subscription(account.user.tenantId, 'canceled', 1);
  assert.equal((await propertiesGet(tokenRequest(active.token))).status, 403);
  await assert.rejects(createKey(account), /Enterprise/);
  assert.equal((await listApiKeys(account.user)).keys.length, 3);
  await manageApiKey(account.user, { action: 'revoke', id: active.key.id });
  assert.equal((await propertiesGet(tokenRequest(active.token))).status, 401);
  const member = await owner();
  await subscription(member.user.tenantId);
  const memberKey = await createKey(member);
  await transaction(null, tx => tx.query('UPDATE users SET role=$1 WHERE id=$2', ['agent', member.user.id]));
  await assert.rejects(authenticateIntegration(tokenRequest(memberKey.token), 'properties:read'), /no longer eligible/);
});

test('source export authorization hides restricted records and raw/excluded CMA snapshots', async () => {
  const account = await owner();
  await subscription(account.user.tenantId);
  const key = await createKey(account);
  await mutateWorkspace(account.user, workspace => {
    const sourceId = 'restricted-license-source';
    workspace.sources.push({
      id: sourceId,
      label: 'RESTRICTED-LICENSE-SENTINEL',
      kind: 'licensed',
      observedAt: workspace.asOf,
      license: 'No provider export grant exists.',
      confidence: 0,
    });
    const restricted = {
      ...workspace.properties[0],
      id: 'restricted-property',
      address: 'DO-NOT-EXPORT-ADDRESS',
      sourceId,
    };
    workspace.properties.push(restricted);
    const existing = workspace.cmas[0];
    workspace.cmas.push({
      ...structuredClone(existing),
      id: 'restricted-cma',
      name: 'DO-NOT-EXPORT-CMA',
      propertyId: restricted.id,
      result: {
        ...structuredClone(existing.result),
        subjectId: restricted.id,
        sourceIds: [sourceId],
        inputSnapshot: { subject: restricted, candidates: [restricted] },
      },
    });
    existing.result.excluded.push({ propertyId: 'excluded-raw-sentinel', reason: 'EXCLUDED-RAW-SENTINEL' });
    if (existing.result.inputSnapshot) existing.result.inputSnapshot.subject.description = 'ARCHIVED-RAW-SENTINEL';
  });
  const propertyBody = await (await propertiesGet(tokenRequest(key.token))).text();
  assert.ok(!propertyBody.includes('DO-NOT-EXPORT-ADDRESS'));
  assert.ok(!propertyBody.includes('RESTRICTED-LICENSE-SENTINEL'));
  const cmaResponse = await cmasGet(tokenRequest(key.token, 'cmas'));
  assert.equal(cmaResponse.status, 200);
  const cmaBody = await cmaResponse.text();
  assert.ok(!cmaBody.includes('DO-NOT-EXPORT-CMA'));
  assert.ok(!cmaBody.includes('inputSnapshot'));
  assert.ok(!cmaBody.includes('EXCLUDED-RAW-SENTINEL'));
  assert.ok(!cmaBody.includes('ARCHIVED-RAW-SENTINEL'));
  assert.ok(JSON.parse(cmaBody).cmas.length > 0);
});

test('HTTP key administration requires owner session and same origin; reads consume bounded quota', async () => {
  assert.equal((await keysGet(new Request('http://localhost:3040/api/integrations/keys'))).status, 401);
  const account = await owner();
  await subscription(account.user.tenantId);
  const body = { action: 'create', name: 'HTTP integration', scopes: ['properties:read'] };
  const crossOrigin = new Request('http://localhost:3040/api/integrations/keys', {
    method: 'POST',
    headers: {
      cookie: sessionCookie(account.token),
      origin: 'https://other.invalid',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  assert.equal((await keysPost(crossOrigin)).status, 403);
  const createdResponse = await keysPost(adminRequest(account.token, body));
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  process.env.PLAN_ENTERPRISE_FABRIC_QUERIES = '1';
  try {
    assert.equal((await propertiesGet(tokenRequest(created.token))).status, 200);
    assert.equal((await propertiesGet(tokenRequest(created.token))).status, 429);
  } finally {
    delete process.env.PLAN_ENTERPRISE_FABRIC_QUERIES;
  }
  const revoked = await keysPost(adminRequest(account.token, { action: 'revoke', id: created.key.id }));
  assert.equal(revoked.status, 200);
  assert.ok((await revoked.json()).keys[0].revokedAt);
});
