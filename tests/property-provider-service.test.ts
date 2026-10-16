import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { ensurePlatform } from '../src/lib/platform';
import { scopeWorkspaceForAccess } from '../src/lib/fabric';
import { verifyAudit } from '../src/lib/service';
import { calculateCma } from '../src/lib/analytics';
import { executePropertyProviderAction, getPropertyProviderSnapshot, propertyProviderActionSchema, propertyProviderPolicy } from '../src/lib/property-provider-service';
import { FixturePropertyProvider, FIXTURE_PROPERTY_ADDRESS } from '../src/lib/providers/fixture-property';
import { PropertyProviderError, type PropertyDataProvider, type ProviderResult } from '../src/lib/providers/property-provider';
import { GET, POST } from '../src/app/api/providers/property/route';
import { GET as report } from '../src/app/api/report/route';
import { POST as reviewGrant } from '../src/app/api/fabric/grants/route';
process.env.SQLITE_PATH = resolve('.data', `provider-service-${randomUUID()}.sqlite`); delete process.env.DATABASE_URL; delete process.env.APP_ORIGIN;
after(async () => closeDatabase());
const owner = () => register({ name: 'Provider Test Owner', email: `${randomUUID()}@example.test`, password: 'private provider passphrase 1234' });
type User = Awaited<ReturnType<typeof owner>>['user'];
const lookup = { action: 'getProperty', query: { address: FIXTURE_PROPERTY_ADDRESS } };
function configure(extra: Record<string, string> = {}) {
  process.env.RENTCAST_API_KEY = `TEST-ONLY-NO-LIVE-CREDENTIAL-${randomUUID()}`;
  process.env.PROPERTY_PROVIDER_ENABLED = 'true';
  process.env.PROPERTY_PROVIDER_POLICY_JSON = JSON.stringify({ providerId: 'rentcast', version: 'synthetic-policy-v1', reviewedBy: 'Synthetic independent operator', reviewedAt: new Date(Date.now() - 10000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), licenseReference: 'SYNTHETIC TEST CONTRACT; no actual provider access', termsUrl: 'https://example.test/test-contract', allowedUses: ['research', 'valuation', 'market', 'export'], retentionHours: 1, cacheTtlMinutes: 30, requiresProfessionalVerification: false });
  process.env.PROPERTY_PROVIDER_MONTHLY_REQUEST_LIMIT = '50'; process.env.PROPERTY_PROVIDER_TENANT_MONTHLY_REQUEST_LIMIT = '20'; process.env.PROPERTY_PROVIDER_USER_MONTHLY_REQUEST_LIMIT = '10'; process.env.PROPERTY_PROVIDER_MAX_CONCURRENCY = '2'; process.env.PROPERTY_PROVIDER_MONTHLY_BUDGET_USD = '5'; process.env.PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD = '0.1'; Object.assign(process.env, extra);
}
async function grant(actor: User) { await mutateWorkspace(actor, workspace => { ensurePlatform(workspace).providerGrants.push({ id: randomUUID(), providerId: 'rentcast', regionIds: ['us'], allowedUses: ['research', 'valuation', 'market', 'export'], licenseReference: 'Synthetic test grant', terms: 'Synthetic test only; does not authorize real RentCast data', issuedAt: new Date(Date.now() - 10000).toISOString(), verifiedAt: new Date(Date.now() - 10000).toISOString(), reviewedBy: 'Synthetic independent operator', expiresAt: new Date(Date.now() + 86400000).toISOString() }); }); }
function mockProvider(onCall: () => Promise<void> = async () => {}) {
  const base = new FixturePropertyProvider(); let calls = 0;
  async function run<T>(method: () => Promise<ProviderResult<T>>) { calls++; await onCall(); return method(); }
  const provider: PropertyDataProvider = { id: 'rentcast', getProperty: q => run(() => base.getProperty(q)), searchProperties: q => run(() => base.searchProperties(q)), getSaleListings: q => run(() => base.getSaleListings(q)), getValuation: q => run(() => base.getValuation(q)), getComparables: q => run(() => base.getComparables(q)), getMarketStatistics: q => run(() => base.getMarketStatistics(q)), getCoverage: () => base.getCoverage() };
  return { provider, calls: () => calls };
}

test('readiness reports current rights and remaining shared quotas without provider probes', async () => {
  configure({ PROPERTY_PROVIDER_MONTHLY_REQUEST_LIMIT: '10', PROPERTY_PROVIDER_USER_MONTHLY_REQUEST_LIMIT: '2' });
  const account = await owner(), mocked = mockProvider();
  let status = await getPropertyProviderSnapshot(account.user);
  assert.equal(status.readiness.configurationReady, true); assert.equal(status.readiness.canRequestNewData, false);
  assert.ok(status.readiness.permissions.every(permission => !permission.allowed)); assert.equal(status.readiness.subscriptionStatus, 'not-probed');
  await grant(account.user); status = await getPropertyProviderSnapshot(account.user);
  assert.equal(status.readiness.canRequestNewData, true); assert.equal(status.readiness.remaining.shared, 10); assert.equal(status.readiness.remaining.user, 2);
  await executePropertyProviderAction(account.user, lookup, mocked.provider); status = await getPropertyProviderSnapshot(account.user);
  assert.equal(status.readiness.remaining.shared, 9); assert.equal(status.readiness.remaining.user, 1); assert.equal(mocked.calls(), 1);
  const viewer = await getPropertyProviderSnapshot({ ...account.user, role: 'viewer' }); assert.equal(viewer.readiness.canRequestNewData, false); assert.match(viewer.readiness.blockers.join(' '), /viewing role/);
});

test('a private local technical assessment cannot authorize production data access', () => {
  configure(); const previous = process.env.NODE_ENV;
  process.env.PROPERTY_PROVIDER_POLICY_JSON = JSON.stringify({ ...JSON.parse(process.env.PROPERTY_PROVIDER_POLICY_JSON!), deploymentScope: 'local-development' });
  try { Object.assign(process.env, { NODE_ENV: 'development' }); assert.ok(propertyProviderPolicy()); Object.assign(process.env, { NODE_ENV: 'production' }); assert.equal(propertyProviderPolicy(), undefined); }
  finally { if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test('production also withholds cached records and frozen CMA outputs approved only for local development', async () => {
  configure(); const account = await owner(); await grant(account.user);
  process.env.PROPERTY_PROVIDER_POLICY_JSON = JSON.stringify({ ...JSON.parse(process.env.PROPERTY_PROVIDER_POLICY_JSON!), deploymentScope: 'local-development' });
  const mock = mockProvider(); await executePropertyProviderAction(account.user, lookup, mock.provider); await executePropertyProviderAction(account.user, { action: 'searchProperties', query: { zipCode: '22207' } }, mock.provider);
  const saved = await executePropertyProviderAction(account.user, { action: 'saveCma', subjectId: 'fixture-property-1', fixture: false, omitUnobservedCondition: true }) as { result: { cma: { id: string } } };
  const workspace = await getWorkspace(account.user.tenantId), previous = process.env.NODE_ENV;
  try { Object.assign(process.env, { NODE_ENV: 'production' }); const scoped = scopeWorkspaceForAccess(workspace); assert.equal(scoped.providerData!.cache.length, 0); assert.ok(!scoped.cmas.some(cma => cma.id === saved.result.cma.id)); }
  finally { if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); }
});

test('default disabled state makes no call and rejects client configuration, broad unbounded searches and nonconsensual CMA fields', async () => {
  delete process.env.RENTCAST_API_KEY; delete process.env.PROPERTY_PROVIDER_ENABLED; delete process.env.PROPERTY_PROVIDER_POLICY_JSON;
  const account = await owner(), mocked = mockProvider(); const status = await getPropertyProviderSnapshot(account.user); assert.equal(status.configured, false); assert.equal(status.enabled, false);
  await assert.rejects(executePropertyProviderAction(account.user, lookup, mocked.provider), /disabled|unconfigured/); assert.equal(mocked.calls(), 0);
  assert.equal(propertyProviderActionSchema.safeParse({ ...lookup, apiKey: 'client-secret' }).success, false);
  assert.equal(propertyProviderActionSchema.safeParse({ action: 'searchProperties', query: { limit: 1000 } }).success, false);
  assert.equal(propertyProviderActionSchema.safeParse({ action: 'saveCma', subjectId: 'x', fixture: true, omitUnobservedCondition: false }).success, false);
});

test('fixture supports property, listing, valuation, market, closed-sale CMA, reproducible report and tenant isolation without provider spend', async () => {
  const account = await owner(), other = await owner();
  for (const action of ['getProperty', 'getValuation', 'getComparables'] as const) await executePropertyProviderAction(account.user, { action, query: { address: FIXTURE_PROPERTY_ADDRESS }, fixture: true });
  await executePropertyProviderAction(account.user, { action: 'getSaleListings', query: { zipCode: '22207' }, fixture: true }); await executePropertyProviderAction(account.user, { action: 'getMarketStatistics', query: { zipCode: '22207' }, fixture: true });
  await assert.rejects(executePropertyProviderAction(account.user, { action: 'saveCma', subjectId: 'fixture-property-1', fixture: true, omitUnobservedCondition: true }), /No eligible recorded closed sales/);
  await executePropertyProviderAction(account.user, { action: 'searchProperties', query: { zipCode: '22207' }, fixture: true });
  const saved = await executePropertyProviderAction(account.user, { action: 'saveCma', subjectId: 'fixture-property-1', fixture: true, omitUnobservedCondition: true }) as { result: { cma: { id: string; result: { comps: unknown[]; inputSnapshot: { subject: { condition?: number; listedAt?: string; dom?: number } }; assumptions: { conditionValue: number } } } } };
  assert.ok(saved.result.cma.result.comps.length >= 3); assert.equal(saved.result.cma.result.assumptions.conditionValue, 0); assert.equal(saved.result.cma.result.inputSnapshot.subject.condition, undefined); assert.equal(saved.result.cma.result.inputSnapshot.subject.listedAt, undefined); assert.equal(saved.result.cma.result.inputSnapshot.subject.dom, undefined);
  const response = await report(new Request(`http://localhost:3040/api/report?cmaId=${saved.result.cma.id}`, { headers: { cookie: sessionCookie(account.token) } })); assert.equal(response.status, 200); assert.match(await response.text(), /synthetic/i);
  const frozen = (await getWorkspace(account.user.tenantId)).cmas.find(cma => cma.id === saved.result.cma.id)!.result; assert.equal(calculateCma(frozen.inputSnapshot!.subject, frozen.inputSnapshot!.candidates, frozen.assumptions, frozen.asOf).calculationHash, frozen.calculationHash);
  const status = await getPropertyProviderSnapshot(account.user); assert.equal(status.usage.tenantRequests, 0); assert.equal(status.usage.reservedCostUsd, 0); assert.ok(status.records.length >= 7); assert.equal(status.valuations.length, 1); assert.equal(status.markets.length, 1); assert.equal((await getPropertyProviderSnapshot(other.user)).records.length, 0); assert.equal(verifyAudit(await getWorkspace(account.user.tenantId)), true);
});

test('reviewed Explorer contract and independent grant are distinct from payment and professional verification; cached data revokes immediately', async () => {
  configure(); const account = await owner(), mocked = mockProvider();
  await assert.rejects(executePropertyProviderAction(account.user, lookup, mocked.provider), /provider grant/); assert.equal(mocked.calls(), 0); await grant(account.user);
  await executePropertyProviderAction(account.user, lookup, mocked.provider); await executePropertyProviderAction(account.user, lookup, mocked.provider); assert.equal(mocked.calls(), 1);
  let status = await getPropertyProviderSnapshot(account.user); assert.equal(status.records.length, 1); assert.equal(status.usage.userRequests, 1); assert.equal(status.usage.reservedCostUsd, 0.1); assert.equal(ensurePlatform(await getWorkspace(account.user.tenantId)).verification.status, 'unsubmitted');
  await mutateWorkspace(account.user, workspace => { workspace.platform!.providerGrants[0].revokedAt = new Date().toISOString(); }); status = await getPropertyProviderSnapshot(account.user); assert.equal(status.records.length, 0); assert.equal(scopeWorkspaceForAccess(await getWorkspace(account.user.tenantId)).providerData!.cache.length, 0); await assert.rejects(executePropertyProviderAction(account.user, lookup, mocked.provider), /provider grant/); assert.equal(mocked.calls(), 1);
});

test('per-user quotas and hard spend cap reserve failed attempts without retries or raw query text in health/audit', async () => {
  configure({ PROPERTY_PROVIDER_USER_MONTHLY_REQUEST_LIMIT: '1' }); const account = await owner(); await grant(account.user); let calls = 0;
  const mocked = mockProvider(async () => { calls++; throw new PropertyProviderError('timeout', 'RAW-PROVIDER-BODY-SENTINEL'); });
  await assert.rejects(executePropertyProviderAction(account.user, lookup, mocked.provider), /timeout/); assert.equal(calls, 1);
  await assert.rejects(executePropertyProviderAction(account.user, { action: 'getMarketStatistics', query: { zipCode: '22207' } }, mocked.provider), /monthly tenant or user/); assert.equal(calls, 1);
  const status = await getPropertyProviderSnapshot(account.user); assert.equal(status.usage.userRequests, 1); assert.equal(status.usage.reservedCostUsd, 0.1); assert.equal(status.health.lastRequest!.status, 'failed'); assert.ok(!JSON.stringify(status.health).includes(FIXTURE_PROPERTY_ADDRESS)); assert.ok(!JSON.stringify((await getWorkspace(account.user.tenantId)).audit).includes('RAW-PROVIDER-BODY-SENTINEL'));
  configure({ PROPERTY_PROVIDER_MONTHLY_BUDGET_USD: '0.05' }); const next = await owner(); await grant(next.user); await assert.rejects(executePropertyProviderAction(next.user, lookup, mocked.provider), /spend budget/); assert.equal(calls, 1);
});

test('global cap is atomic across tenants, and same-tenant identical in-flight requests coalesce', async () => {
  configure({ PROPERTY_PROVIDER_MONTHLY_REQUEST_LIMIT: '1' }); const a = await owner(), b = await owner(); await grant(a.user); await grant(b.user); const mocked = mockProvider();
  const results = await Promise.allSettled([executePropertyProviderAction(a.user, lookup, mocked.provider), executePropertyProviderAction(b.user, lookup, mocked.provider)]); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(mocked.calls(), 1);
  configure(); const account = await owner(); await grant(account.user); let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; }); const slow = mockProvider(async () => { started(); await wait; });
  const first = executePropertyProviderAction(account.user, lookup, slow.provider); await ready; const second = executePropertyProviderAction(account.user, lookup, slow.provider); release(); await Promise.all([first, second]); assert.equal(slow.calls(), 1); assert.equal((await getPropertyProviderSnapshot(account.user)).usage.userRequests, 1);
});

test('rights and expiry are rechecked after transport, fixtures never satisfy live cache, and professional-required contracts fail closed', async () => {
  configure(); const account = await owner(); await grant(account.user); await executePropertyProviderAction(account.user, { ...lookup, fixture: true }); const mocked = mockProvider(async () => { await mutateWorkspace(account.user, workspace => { workspace.platform!.providerGrants[0].revokedAt = new Date().toISOString(); }); });
  await assert.rejects(executePropertyProviderAction(account.user, lookup, mocked.provider), /provider grant|rights changed/); assert.equal(mocked.calls(), 1); assert.equal((await getPropertyProviderSnapshot(account.user)).records.every(record => record.fixture), true);
  configure(); const next = await owner(); await grant(next.user); const policy = JSON.parse(process.env.PROPERTY_PROVIDER_POLICY_JSON!); policy.requiresProfessionalVerification = true; process.env.PROPERTY_PROVIDER_POLICY_JSON = JSON.stringify(policy); await assert.rejects(executePropertyProviderAction(next.user, lookup, mocked.provider), /professional verification/);
});

test('HTTP provider queries enforce session, CSRF, tenant isolation and viewer role without accepting client credentials', async () => {
  assert.equal((await GET(new Request('http://localhost:3040/api/providers/property'))).status, 401); const account = await owner();
  const post = (body: unknown, origin = 'http://localhost:3040') => POST(new Request('http://localhost:3040/api/providers/property', { method: 'POST', headers: { cookie: sessionCookie(account.token), origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post({ ...lookup, fixture: true }, 'https://other.invalid')).status, 403); assert.equal((await post({ ...lookup, fixture: true, token: 'client-secret' })).status, 400); assert.equal((await post({ ...lookup, fixture: true })).status, 200); await assert.rejects(executePropertyProviderAction({ ...account.user, role: 'viewer' }, { ...lookup, fixture: true }), /viewing only/);
});

test('conservative global spend remains capped when the configured per-request rate decreases during a month', async () => {
  configure({ PROPERTY_PROVIDER_MONTHLY_BUDGET_USD: '1', PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD: '0.8' }); const account = await owner(); await grant(account.user); const mocked = mockProvider();
  await executePropertyProviderAction(account.user, lookup, mocked.provider); process.env.PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD = '0.3';
  await assert.rejects(executePropertyProviderAction(account.user, { action: 'getMarketStatistics', query: { zipCode: '22207' } }, mocked.provider), /spend cap/); assert.equal(mocked.calls(), 1); const status = await getPropertyProviderSnapshot(account.user); assert.equal(status.budget.globallyReservedCostUsd, 0.8); assert.equal(status.health.latencySamples, 1); assert.ok(status.health.averageLatencyMs! >= 0);
});

test('retention expiry physically removes private cached payload on access; revoked original grant cannot be replaced by an unrelated grant for a frozen CMA', async () => {
  configure(); const account = await owner(); await grant(account.user); const mocked = mockProvider();
  await executePropertyProviderAction(account.user, { action: 'searchProperties', query: { zipCode: '22207' } }, mocked.provider);
  const saved = await executePropertyProviderAction(account.user, { action: 'saveCma', subjectId: 'fixture-property-1', omitUnobservedCondition: true }) as { result: { cma: { id: string } } };
  let workspace = await getWorkspace(account.user.tenantId); assert.ok(scopeWorkspaceForAccess(workspace).cmas.some(cma => cma.id === saved.result.cma.id));
  await grant(account.user); await mutateWorkspace(account.user, current => { current.platform!.providerGrants[0].revokedAt = new Date().toISOString(); }); workspace = await getWorkspace(account.user.tenantId); assert.equal(scopeWorkspaceForAccess(workspace).cmas.some(cma => cma.id === saved.result.cma.id), false);
  await executePropertyProviderAction(account.user, lookup, mocked.provider); await mutateWorkspace(account.user, current => { for (const cache of current.providerData!.cache) cache.observedAt = new Date(Date.now() - 2 * 3600000).toISOString(); });
  assert.equal((await getPropertyProviderSnapshot(account.user)).records.length, 0); assert.equal((await getWorkspace(account.user.tenantId)).providerData!.cache.length, 0);
});

test('trusted national grant HTTP route authorizes the real Explorer query path without accepting owner self-approval', async () => {
  configure(); const account = await owner(), mocked = mockProvider(); const previous = process.env.DATA_GRANT_REVIEW_SECRET; process.env.DATA_GRANT_REVIEW_SECRET = 'independent-national-contract-review-'.repeat(2);
  const body = { action: 'grant', providerId: 'rentcast', regionIds: ['us'], allowedUses: ['research', 'valuation', 'market', 'export'], licenseReference: 'SYNTHETIC HTTP REVIEW TEST ONLY', terms: 'Contract-path regression using synthetic provider responses. No real provider access is authorized by this test.', expiresAt: new Date(Date.now() + 86400000).toISOString(), reviewedBy: 'Synthetic independent national contract reviewer' };
  const request = (trusted: boolean) => new Request('http://localhost:3040/api/fabric/grants', { method: 'POST', headers: { cookie: sessionCookie(account.token), origin: 'http://localhost:3040', 'content-type': 'application/json', ...(trusted ? { 'x-data-grant-review-secret': process.env.DATA_GRANT_REVIEW_SECRET! } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await reviewGrant(request(false))).status, 403); assert.equal((await getWorkspace(account.user.tenantId)).platform?.providerGrants.length ?? 0, 0);
    const reviewed = await reviewGrant(request(true)); assert.equal(reviewed.status, 200, await reviewed.text());
    await executePropertyProviderAction(account.user, lookup, mocked.provider); assert.equal(mocked.calls(), 1); assert.equal((await getPropertyProviderSnapshot(account.user)).records.length, 1); assert.equal(ensurePlatform(await getWorkspace(account.user.tenantId)).verification.status, 'unsubmitted');
  } finally { if (previous === undefined) delete process.env.DATA_GRANT_REVIEW_SECRET; else process.env.DATA_GRANT_REVIEW_SECRET = previous; }
});
