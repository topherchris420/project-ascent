import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { executeAction, verifyAudit } from '../src/lib/service';
import {
  ensureProduct,
  executeProductAction,
  experimentAssignment,
  productActionSchema,
  productSnapshot,
  recordProductAction,
} from '../src/lib/product';
import { GET, POST } from '../src/app/api/product/route';
process.env.SQLITE_PATH = resolve('.data', `product-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
after(async () => closeDatabase());
const owner = () =>
  register({
    seed: 'demo',
    name: 'Metrics Test Owner',
    email: `${randomUUID()}@example.test`,
    password: 'private metrics passphrase 1234',
  });

test('metrics are off by default and the complete flag registry remains configurable for a new tenant', async () => {
  const account = await owner(),
    workspace = await getWorkspace(account.user.tenantId);
  const snapshot = productSnapshot(workspace, account.user);
  assert.equal(snapshot.consent, false);
  assert.equal(snapshot.flags.length, 3);
  assert.ok(snapshot.flags.every(flag => !flag.enabled && flag.assignment === 'off'));
  await executeProductAction(account.user, { action: 'event', eventId: randomUUID(), feature: 'cma', kind: 'open' });
  await executeAction(account.user, {
    type: 'saveCma',
    propertyId: 'property-01',
    name: 'No collection without consent',
  });
  assert.deepEqual(ensureProduct(await getWorkspace(account.user.tenantId)).metrics, []);
});

test('opt-in aggregate opens, timings and structured errors deduplicate without retaining raw identifiers or text', async () => {
  const account = await owner();
  await executeProductAction(account.user, { action: 'consent', enabled: true });
  const eventId = randomUUID();
  await executeProductAction(account.user, { action: 'event', eventId, feature: 'cma', kind: 'open' });
  await executeProductAction(account.user, { action: 'event', eventId, feature: 'cma', kind: 'open' });
  await executeProductAction(account.user, {
    action: 'event',
    eventId: randomUUID(),
    feature: 'cma',
    kind: 'timing',
    durationMs: 1250,
  });
  await executeProductAction(account.user, {
    action: 'event',
    eventId: randomUUID(),
    feature: 'cma',
    kind: 'error',
    errorCode: 'timeout',
  });
  const state = ensureProduct(await getWorkspace(account.user.tenantId)),
    metric = state.metrics[0];
  assert.equal(metric.opens, 1);
  assert.equal(metric.timingCount, 1);
  assert.equal(metric.totalDurationMs, 1250);
  assert.equal(metric.errors.timeout, 1);
  assert.ok(!JSON.stringify(state).includes(eventId));
  assert.ok(!JSON.stringify(state).includes(account.user.id));
  assert.equal(
    productActionSchema.safeParse({
      action: 'event',
      eventId: randomUUID(),
      feature: 'cma',
      kind: 'open',
      address: 'Private address',
    }).success,
    false,
  );
  await assert.rejects(
    executeProductAction(account.user, { action: 'event', eventId: randomUUID(), feature: 'cma', kind: 'timing' }),
    /duration/,
  );
  await executeProductAction(account.user, { action: 'consent', enabled: false });
  await executeProductAction(account.user, { action: 'event', eventId: randomUUID(), feature: 'cma', kind: 'open' });
  assert.equal(ensureProduct(await getWorkspace(account.user.tenantId)).metrics[0].opens, 1);
});

test('completion needs actual audited work, deduplicates service instrumentation and refuses seeded or other-actor evidence', async () => {
  const account = await owner();
  await executeProductAction(account.user, { action: 'consent', enabled: true });
  const seed = (await getWorkspace(account.user.tenantId)).cmas[0];
  await assert.rejects(
    executeProductAction(account.user, {
      action: 'event',
      eventId: randomUUID(),
      feature: 'cma',
      kind: 'complete',
      entityId: seed.id,
    }),
    /real audited workflow/,
  );
  const saved = await executeAction(account.user, {
    type: 'saveCma',
    propertyId: 'property-01',
    name: 'ACTUAL-PRIVATE-TITLE-SENTINEL',
  });
  const id = (saved.result as { id: string }).id;
  await executeProductAction(account.user, {
    action: 'event',
    eventId: randomUUID(),
    feature: 'cma',
    kind: 'complete',
    entityId: id,
  });
  let workspace = await getWorkspace(account.user.tenantId);
  assert.equal(ensureProduct(workspace).metrics.find(metric => metric.feature === 'cma')!.completedTasks, 1);
  await assert.rejects(
    executeProductAction(
      { ...account.user, id: 'unrelated-member' },
      { action: 'event', eventId: randomUUID(), feature: 'cma', kind: 'complete', entityId: id },
    ),
    /real audited workflow/,
  );
  await mutateWorkspace(account.user, target => {
    assert.equal(recordProductAction(target, account.user, 'saveCma', 'no-real-evidence'), false);
  });
  workspace = await getWorkspace(account.user.tenantId);
  const encoded = JSON.stringify(ensureProduct(workspace));
  assert.ok(!encoded.includes(id));
  assert.ok(!encoded.includes('ACTUAL-PRIVATE-TITLE-SENTINEL'));
  assert.equal(verifyAudit(workspace), true);
});

test('owner configures stable assignments and transparent priority assumptions; agents cannot alter consent or experiments', async () => {
  const account = await owner();
  await assert.rejects(
    executeProductAction({ ...account.user, role: 'agent' }, { action: 'consent', enabled: true }),
    /owner/,
  );
  await executeProductAction(account.user, {
    action: 'flag',
    id: 'guided-academy',
    enabled: true,
    treatmentPercent: 50,
  });
  const first = productSnapshot(await getWorkspace(account.user.tenantId), account.user).flags.find(
    flag => flag.id === 'guided-academy',
  )!;
  assert.equal(first.assignment, experimentAssignment(account.user.tenantId, first));
  assert.equal(
    first.assignment,
    productSnapshot(await getWorkspace(account.user.tenantId), account.user).flags.find(flag => flag.id === first.id)!
      .assignment,
  );
  assert.equal(
    experimentAssignment(account.user.tenantId, { id: 'guided-academy', enabled: true, treatmentPercent: 0 }),
    'control',
  );
  assert.equal(
    experimentAssignment(account.user.tenantId, { id: 'guided-academy', enabled: true, treatmentPercent: 100 }),
    'treatment',
  );
  const result = await executeProductAction(account.user, {
    action: 'priority',
    feature: 'cma',
    impact: 4,
    confidence: 0.5,
    differentiation: 3,
    effort: 2,
  });
  assert.equal(result.result.priorities[0].score, 3);
  assert.match(result.result.note, /do not establish a winning/);
  await executeProductAction(account.user, { action: 'resetMetrics' });
  assert.deepEqual(ensureProduct(await getWorkspace(account.user.tenantId)).metrics, []);
});

test('HTTP metrics endpoints require session, enforce CSRF, reject raw PII, and preserve tenant boundaries', async () => {
  assert.equal((await GET(new Request('http://localhost:3040/api/product'))).status, 401);
  const account = await owner(),
    other = await owner();
  const post = (body: unknown, origin = 'http://localhost:3040') =>
    POST(
      new Request('http://localhost:3040/api/product', {
        method: 'POST',
        headers: { cookie: sessionCookie(account.token), origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await post({ action: 'consent', enabled: true }, 'https://other.invalid')).status, 403);
  assert.equal((await post({ action: 'consent', enabled: true, tenantId: other.user.tenantId })).status, 400);
  assert.equal((await post({ action: 'consent', enabled: true })).status, 200);
  assert.equal(productSnapshot(await getWorkspace(other.user.tenantId), other.user).consent, false);
});
