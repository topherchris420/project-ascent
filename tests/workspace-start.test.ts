import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { authenticate, demoSession, register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { bootstrapFabric, ensureDemoRegion, createFabricState } from '../src/lib/fabric';
import { executeFabricAction, getFabricSnapshot } from '../src/lib/fabric-service';
import { createDemoWorkspace, createEmptyWorkspace } from '../src/lib/seed';
import { calculateCma, DEMO_AS_OF, replayCma } from '../src/lib/analytics';
import { verifyAudit } from '../src/lib/service';
import { GET as authGet, POST as authPost } from '../src/app/api/auth/[action]/route';
import { GET as workspaceGet } from '../src/app/api/workspace/route';

process.env.SQLITE_PATH = resolve('.data', `workspace-start-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
after(async () => {
  await closeDatabase();
});

const credentials = () => ({
  name: 'Start Test Owner',
  email: `${randomUUID()}@example.test`,
  password: 'a private starting passphrase 123',
});

test('a new account starts empty: no fictional records, honest audit, nothing injected on first open', async () => {
  const account = await register({ ...credentials(), organization: 'Independent Start Brokerage' });
  const workspace = await getWorkspace(account.user.tenantId);
  assert.equal(workspace.mode, 'licensed');
  assert.equal(workspace.settings.organization, 'Independent Start Brokerage');
  for (const key of ['properties', 'sources', 'clients', 'offers', 'transactions', 'cmas', 'outcomes'] as const)
    assert.equal(workspace[key].length, 0, `${key} start empty`);
  assert.equal(workspace.audit.length, 1);
  assert.match(workspace.audit[0].details, /created empty/i);
  assert.doesNotMatch(workspace.audit[0].details, /synthetic demonstration records/);

  // Opening the workspace initializes the fabric but never invents regional records for a professional tenant.
  const opened = await getFabricSnapshot(account.user);
  assert.equal(opened.workspace.properties.length, 0);
  assert.equal(opened.workspace.clients.length, 0);
  assert.equal(opened.fabric.records.length, 0);
  assert.ok(!opened.workspace.audit.some(event => event.action === 'repairDemoProjection'));
  assert.equal(verifyAudit(opened.workspace), true);
});

test('the isolated demonstration tenant still receives the full labeled fixture', async () => {
  const demo = await demoSession('Fixture Visitor');
  const workspace = await getWorkspace(demo.user.tenantId);
  assert.equal(workspace.mode, 'demo');
  assert.equal(workspace.asOf, DEMO_AS_OF);
  assert.equal(workspace.properties.length, 12);
  assert.ok(workspace.properties.every(property => property.description.includes('SYNTHETIC DEMO ONLY')));
  assert.match(workspace.audit[0].details, /synthetic demonstration records/);
  const opened = await getFabricSnapshot(demo.user);
  assert.equal(opened.workspace.properties.filter(property => property.state === 'VA').length, 9);
  assert.ok(opened.workspace.clients.some(client => client.id === 'client-dmv-01'));
});

test('loading the practice fixture is an explicit, audited opt-in that labels the workspace as a demonstration', async () => {
  const account = await register(credentials());
  await getFabricSnapshot(account.user);
  const loaded = await executeFabricAction(account.user, { action: 'syncDemo', regionId: 'dmv' });
  assert.equal(loaded.workspace.mode, 'demo');
  assert.equal(loaded.workspace.asOf, DEMO_AS_OF);
  assert.equal(loaded.workspace.properties.filter(property => property.state === 'VA').length, 9);
  assert.ok(loaded.fabric.records.every(record => record.synthetic));
  assert.ok(loaded.workspace.clients.some(client => client.name === 'Riley — demo seller'));
  const audit = loaded.workspace.audit.find(event => event.action === 'syncFabricDemo');
  assert.ok(audit);
  assert.match(audit.details, /at the owner's request/);
  assert.equal(verifyAudit(loaded.workspace), true);

  // Selecting the other fixture region ingests it on demand rather than relying on a bootstrap side effect.
  const austin = await executeFabricAction(account.user, { action: 'selectRegion', regionId: 'austin' });
  assert.equal(austin.fabric.selectedRegionId, 'austin');
  assert.ok(austin.fabric.records.some(record => record.regionId === 'austin'));
  assert.equal(austin.workspace.clients.filter(client => client.id === 'client-dmv-01').length, 1);
});

test('bootstrapFabric only authors fixture records for demonstration workspaces', () => {
  const empty = createEmptyWorkspace('Gated');
  const fabric = bootstrapFabric(empty);
  assert.equal(fabric.records.length, 0);
  assert.equal(fabric.sources.length, 0);
  const demo = createDemoWorkspace();
  const seeded = bootstrapFabric(demo);
  assert.ok(seeded.records.some(record => record.regionId === 'dmv'));
  assert.ok(seeded.records.some(record => record.regionId === 'austin'));
  const state = createFabricState();
  assert.equal(ensureDemoRegion(state, 'dmv', DEMO_AS_OF), true);
  assert.equal(ensureDemoRegion(state, 'dmv', DEMO_AS_OF), false, 'a region is authored once');
});

test('the HTTP registration route never accepts a seed from the request body', async () => {
  const email = `${randomUUID()}@example.test`;
  const response = await authPost(
    new Request('http://localhost:3040/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3040' },
      body: JSON.stringify({
        name: 'Route Registrant',
        email,
        password: 'route registration passphrase 123',
        seed: 'demo',
      }),
    }),
    { params: Promise.resolve({ action: 'register' }) },
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')!;
  const token = /ascent_session=([A-Za-z0-9_-]{43})/.exec(cookie)![1];
  const actor = await authenticate(
    new Request('http://localhost:3040/api/workspace', { headers: { cookie: sessionCookie(token) } }),
  );
  const opened = await workspaceGet(
    new Request('http://localhost:3040/api/workspace?initialize=1', { headers: { cookie: sessionCookie(token) } }),
  );
  const body = (await opened.json()) as { workspace: { mode: string; properties: unknown[]; clients: unknown[] } };
  assert.equal(actor.email, email);
  assert.equal(body.workspace.mode, 'licensed');
  assert.equal(body.workspace.properties.length, 0);
  assert.equal(body.workspace.clients.length, 0);
});

test('replay reproduces every frozen demo CMA from its archived evidence and exposes tampering', () => {
  const workspace = createDemoWorkspace();
  for (const record of workspace.cmas) {
    const replay = replayCma(record);
    assert.equal(replay.reproduced, true, replay.verdict);
    assert.equal(replay.recomputedHash, record.result.calculationHash);
    assert.deepEqual(replay.differences, []);
    assert.ok(replay.elapsedMs >= 0);
  }
  const tampered = JSON.parse(JSON.stringify(workspace.cmas[0]));
  tampered.result.estimate += 10000;
  const caught = replayCma(tampered);
  assert.equal(caught.reproduced, false);
  assert.ok(caught.differences.some(item => item.includes('Estimate recomputed')));
  assert.match(caught.verdict, /does not match/);

  const subtle = JSON.parse(JSON.stringify(workspace.cmas[0]));
  subtle.result.comps[0].weight += 0.01;
  const checksumOnly = replayCma(subtle);
  assert.equal(checksumOnly.reproduced, false);
  assert.ok(checksumOnly.differences.some(item => item.includes('no longer matches its own checksum')));

  const stripped = JSON.parse(JSON.stringify(workspace.cmas[0]));
  delete stripped.result.inputSnapshot;
  const missing = replayCma(stripped);
  assert.equal(missing.reproduced, false);
  assert.match(missing.verdict, /without its raw input evidence/);

  // Replay reads only the archive: changing current records never changes the verdict.
  workspace.properties[0].sqft += 1000;
  assert.equal(replayCma(workspace.cmas[0]).reproduced, true);
  const fresh = calculateCma(workspace.properties[0], workspace.properties, {}, DEMO_AS_OF);
  assert.notEqual(fresh.calculationHash, workspace.cmas[0].result.calculationHash);
});

test('/api/auth/me: no session is signed out, a stale session is 401, a real one is the user', async () => {
  const me = (cookie?: string) =>
    authGet(new Request('http://localhost:3040/api/auth/me', { headers: cookie ? { cookie } : {} }), {
      params: Promise.resolve({ action: 'me' }),
    });
  const anonymous = await me();
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), { user: null });
  // A cookie that is not a session token at all is treated as signed out (see the route's comment).
  assert.equal((await me('ascent_session=short')).status, 200);
  assert.equal((await me(sessionCookie('A'.repeat(43)).split(';')[0])).status, 401);
  const account = await register({ ...credentials(), organization: 'Me Endpoint Brokerage' });
  const signedIn = await me(sessionCookie(account.token).split(';')[0]);
  assert.equal(signedIn.status, 200);
  assert.equal(((await signedIn.json()) as { user: { id: string } }).user.id, account.user.id);
});
