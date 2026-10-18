import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { authenticate, register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace, transaction } from '../src/lib/db';
import {
  acceptInvitation,
  assertProviderAccess,
  changeMember,
  effectivePlan,
  ensurePlatform,
  getEntitlements,
  hasVerifiedLicense,
  inviteMember,
  listTeam,
  recordModelUsage,
  reserveUsage,
} from '../src/lib/platform';
import {
  billingSnapshot,
  openCheckout,
  openPortal,
  processStripeWebhook,
  verifyStripeSignature,
} from '../src/lib/billing';
import { executeAction, verifyAudit } from '../src/lib/service';

process.env.SQLITE_PATH = resolve('.data', `platform-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
process.env.APP_ORIGIN = 'http://localhost:3040';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock_only';
process.env.STRIPE_PRICE_PRO = 'price_pro_test';
process.env.STRIPE_PRICE_TEAM = 'price_team_test';
after(async () => closeDatabase());
const owner = () =>
  register({
    seed: 'demo',
    name: 'Platform Owner',
    email: `${randomUUID()}@example.test`,
    password: 'test platform password 123',
  });
function signedEvent(tenantId: string, status: string, created: number, overrides: Record<string, unknown> = {}) {
  const event = {
    id: `evt_${randomUUID()}`,
    type: status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
    created,
    livemode: false,
    data: {
      object: {
        id: 'sub_test',
        customer: 'cus_test',
        status,
        metadata: { tenantId },
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        items: { data: [{ price: { id: 'price_team_test' } }] },
        ...overrides,
      },
    },
  };
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    event,
    raw,
    signature: `t=${timestamp},v1=${createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${raw}`).digest('hex')}`,
  };
}

test('Free Explorer is permanent and useful without checkout, verification, or model credentials', async () => {
  const account = await owner();
  const workspace = await getWorkspace(account.user.tenantId);
  assert.equal(effectivePlan(workspace), 'free');
  assert.equal(getEntitlements(workspace).basicCmaUnlimited, true);
  assert.equal(hasVerifiedLicense(workspace), false);
  const snapshot = await billingSnapshot(account.user);
  const free = snapshot.plans.find(plan => plan.id === 'free')!;
  assert.equal(free.permanentFree, true);
  assert.equal(free.checkoutConfigured, false);
  assert.equal(free.priceLabel, 'Free forever');
  for (let n = 0; n < 3; n++)
    await executeAction(account.user, { type: 'saveCma', propertyId: 'property-01', name: `Unlimited basic CMA ${n}` });
  const afterCma = await getWorkspace(account.user.tenantId);
  assert.equal(ensurePlatform(afterCma).usage.aiRequests, 0);
  await assert.rejects(executeAction(account.user, { type: 'setPaidPlan', plan: 'enterprise' }));
});

test('monthly quotas are atomic, token cost estimates idempotent, and rollover retains history', async () => {
  process.env.PLAN_FREE_AI_REQUESTS = '2';
  process.env.AI_INPUT_USD_PER_MILLION = '1';
  process.env.AI_OUTPUT_USD_PER_MILLION = '2';
  const account = await owner();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => reserveUsage(account.user, 'aiRequests')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(ensurePlatform(await getWorkspace(account.user.tenantId)).usage.aiRequests, 2);
  const reference = randomUUID();
  await recordModelUsage(account.user, 1000, 2000, reference);
  await recordModelUsage(account.user, 1000, 2000, reference);
  let platform = ensurePlatform(await getWorkspace(account.user.tenantId));
  assert.equal(platform.usage.inputTokens, 1000);
  assert.equal(platform.usage.outputTokens, 2000);
  assert.equal(platform.usage.estimatedCostUsd, 0.005);
  await mutateWorkspace(account.user, workspace => {
    ensurePlatform(workspace).usage.period = '2000-01';
  });
  await reserveUsage(account.user, 'aiRequests');
  platform = ensurePlatform(await getWorkspace(account.user.tenantId));
  assert.equal(platform.usage.aiRequests, 1);
  assert.equal(platform.usageHistory?.at(-1)?.period, '2000-01');
  delete process.env.PLAN_FREE_AI_REQUESTS;
});

test('checkout stays disabled even with configured prices; no HTTP request or entitlement change', async () => {
  const account = await owner();
  const mock: typeof fetch = async () => {
    throw new Error('Must not contact Stripe');
  };
  await assert.rejects(openCheckout(account.user, 'team', mock), /Ascent is free/);
  await assert.rejects(openCheckout(account.user, 'enterprise', mock), /disabled/);
  await assert.rejects(openCheckout({ ...account.user, role: 'agent' }, 'team', mock), /owner/);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'free');
  assert.deepEqual(
    (await billingSnapshot(account.user)).plans.map(plan => plan.id),
    ['free'],
  );
  await assert.rejects(openPortal(account.user, mock), /no Stripe customer/);
});

test('signed lifecycle grants, deduplicates, downgrades past_due and cancellation, and rejects stale events', async () => {
  const account = await owner();
  const now = Math.floor(Date.now() / 1000) - 20;
  const active = signedEvent(account.user.tenantId, 'active', now);
  await processStripeWebhook(active.raw, active.signature);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'team');
  assert.equal((await processStripeWebhook(active.raw, active.signature)).duplicate, true);
  const overdue = signedEvent(account.user.tenantId, 'past_due', now + 1);
  await processStripeWebhook(overdue.raw, overdue.signature);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'free');
  const restored = signedEvent(account.user.tenantId, 'active', now + 2, {
    items: { data: [{ price: { id: 'price_pro_test' } }] },
  });
  await processStripeWebhook(restored.raw, restored.signature);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'pro');
  const canceled = signedEvent(account.user.tenantId, 'canceled', now + 3);
  await processStripeWebhook(canceled.raw, canceled.signature);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'free');
  const stale = signedEvent(account.user.tenantId, 'active', now + 2);
  assert.ok((await processStripeWebhook(stale.raw, stale.signature)).ignored);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'free');
  const sameSecond = signedEvent(account.user.tenantId, 'active', now + 3);
  assert.ok((await processStripeWebhook(sameSecond.raw, sameSecond.signature)).ignored);
  const workspace = await getWorkspace(account.user.tenantId);
  assert.equal(workspace.clients.length, 3);
  assert.equal(hasVerifiedLicense(workspace), false);
  assert.equal(verifyAudit(workspace), true);
  const portalMock: typeof fetch = async (url, init) => {
    assert.match(String(url), /billing_portal\/sessions/);
    assert.equal(new URLSearchParams(String(init?.body)).get('customer'), 'cus_test');
    return Response.json({ url: 'https://billing.stripe.com/p/session/mock' });
  };
  assert.match((await openPortal(account.user, portalMock)).url, /billing.stripe.com/);
});

test('webhook signatures, customer binding, unknown prices and independent provider licenses prevent escalation', async () => {
  const account = await owner();
  const now = Math.floor(Date.now() / 1000) - 10;
  const event = signedEvent(account.user.tenantId, 'active', now);
  assert.throws(() => verifyStripeSignature(event.raw + ' ', event.signature), /invalid/);
  assert.throws(() => verifyStripeSignature(event.raw, event.signature, Date.now() + 600000), /expired/);
  const unknown = signedEvent(account.user.tenantId, 'active', now, {
    items: { data: [{ price: { id: 'price_not_configured' } }] },
  });
  await processStripeWebhook(unknown.raw, unknown.signature);
  assert.equal(effectivePlan(await getWorkspace(account.user.tenantId)), 'free');
  const active = signedEvent(account.user.tenantId, 'active', now + 1);
  await processStripeWebhook(active.raw, active.signature);
  const mismatch = signedEvent(account.user.tenantId, 'active', now + 2, { customer: 'cus_other' });
  assert.ok((await processStripeWebhook(mismatch.raw, mismatch.signature)).ignored);
  const workspace = await getWorkspace(account.user.tenantId);
  assert.throws(
    () => assertProviderAccess(workspace, { providerId: 'mls', regionId: 'austin', use: 'valuation' }),
    /verification/,
  );
  const platform = ensurePlatform(workspace);
  platform.verification = {
    status: 'verified',
    reviewedBy: 'external-reviewer',
    reviewedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    evidence: [{ url: 'https://licensing.example.gov/verification/123' }],
  };
  assert.equal(hasVerifiedLicense(workspace), true);
  assert.throws(
    () => assertProviderAccess(workspace, { providerId: 'mls', regionId: 'austin', use: 'valuation' }),
    /provider license/,
  );
  platform.providerGrants.push({
    id: 'grant',
    providerId: 'mls',
    regionIds: ['austin'],
    allowedUses: ['valuation'],
    licenseReference: 'contract-123',
    terms: 'No redistribution',
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    verifiedAt: new Date().toISOString(),
    reviewedBy: 'licensor-reviewer',
  });
  assert.equal(
    assertProviderAccess(workspace, { providerId: 'mls', regionId: 'austin', use: 'valuation' }).id,
    'grant',
  );
  assert.throws(
    () => assertProviderAccess(workspace, { providerId: 'mls', regionId: 'different-market', use: 'valuation' }),
    /provider license/,
  );
  platform.providerGrants[0].revokedAt = new Date().toISOString();
  assert.throws(
    () => assertProviderAccess(workspace, { providerId: 'mls', regionId: 'austin', use: 'valuation' }),
    /provider license/,
  );
});

test('one-time hashed invitations add scoped members without moving existing private accounts', async () => {
  process.env.PLAN_FREE_SEATS = '3';
  try {
    const account = await owner();
    const other = await owner();
    await assert.rejects(inviteMember(account.user, { email: other.user.email, role: 'agent' }), /existing account/);
    const invited = await inviteMember(account.user, { email: `${randomUUID()}@example.test`, role: 'agent' });
    const rows = await transaction(account.user.tenantId, tx =>
      tx.query<{ token_hash: string }>('SELECT token_hash FROM team_invitations WHERE id=$1', [invited.id]),
    );
    assert.notEqual(rows[0].token_hash, invited.token);
    const member = await acceptInvitation({
      token: invited.token,
      name: 'New Agent',
      password: 'invited member password',
    });
    assert.equal(member.user.tenantId, account.user.tenantId);
    assert.equal(member.user.role, 'agent');
    await assert.rejects(
      acceptInvitation({ token: invited.token, name: 'Replay', password: 'invited member password' }),
      /already used/,
    );
    await assert.rejects(changeMember(other.user, member.user.id, 'viewer'), /not found/);
    await assert.rejects(changeMember(member.user, account.user.id, 'viewer'), /owner/);
    await changeMember(account.user, member.user.id, 'viewer');
    assert.equal(
      (await authenticate(new Request('http://localhost:3040', { headers: { cookie: sessionCookie(member.token) } })))
        .role,
      'viewer',
    );
    await assert.rejects(changeMember(account.user, account.user.id, 'remove'), /cannot/);
    assert.equal((await listTeam(account.user)).members.length, 2);
    assert.equal((await getWorkspace(other.user.tenantId)).clients.length, 3);
    await changeMember(account.user, member.user.id, 'remove');
    await assert.rejects(
      authenticate(new Request('http://localhost:3040', { headers: { cookie: sessionCookie(member.token) } })),
      /expired/,
    );
    assert.equal(verifyAudit(await getWorkspace(account.user.tenantId)), true);
  } finally {
    delete process.env.PLAN_FREE_SEATS;
  }
});
