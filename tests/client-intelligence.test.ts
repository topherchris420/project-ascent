import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { evaluateSavedSearch } from '../src/lib/client-intelligence';
import { createDemoWorkspace } from '../src/lib/seed';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { executeAction, verifyAudit } from '../src/lib/service';
import { scopeWorkspaceForAccess } from '../src/lib/fabric';
import type { Property, SavedSearch } from '../src/lib/types';
process.env.SQLITE_PATH = resolve('.data', `client-intelligence-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(closeDatabase);
const owner = () =>
  register({
    seed: 'demo',
    name: 'Client workflow test',
    email: `${randomUUID()}@example.test`,
    password: 'client workflow private passphrase 123',
  });
const property = createDemoWorkspace().properties[0];
const search: SavedSearch = {
  id: 'test-search',
  name: 'Objective criteria',
  query: property.city,
  maxPrice: property.price,
  createdAt: '2026-10-15',
  criteria: {
    minBedrooms: property.beds,
    minBathrooms: property.baths,
    minSqft: property.sqft,
    state: property.state,
    zip: property.zip,
    status: 'active',
  },
};

test('matching applies budget, literal geography, status and structural criteria with inspectable exclusions', () => {
  assert.equal(evaluateSavedSearch(search, [property])[0].matched, true);
  const overBudget = evaluateSavedSearch({ ...search, maxPrice: property.price - 1 }, [property])[0];
  assert.equal(overBudget.matched, false);
  assert.match(overBudget.failed.join(' '), /exceeds/);
  const outside = evaluateSavedSearch(
    { ...search, criteria: { ...search.criteria, state: 'VA', minBedrooms: property.beds + 1 } },
    [property],
  )[0];
  assert.equal(outside.failed.length, 2);
  const missing = evaluateSavedSearch(search, [{ ...property, sqft: undefined } as unknown as Property])[0];
  assert.equal(missing.matched, false);
  assert.equal(missing.needsEvidence, true);
  assert.deepEqual(missing.missing, ['living area (sqft)']);
  const invalidPrice = evaluateSavedSearch(search, [{ ...property, price: NaN }])[0];
  assert.equal(invalidPrice.matched, false);
  assert.ok(invalidPrice.missing.length);
  assert.equal(
    evaluateSavedSearch({ ...search, criteria: undefined }, [{ ...property, status: 'sold' }])[0].matched,
    false,
    'Legacy searches default to active inventory, not fictional inferred availability.',
  );
});
test('the same matching engine operates on independent market fixtures without a jurisdiction conditional', () => {
  const austin = property,
    dmv = {
      ...property,
      id: 'independent-dmv-fixture',
      address: 'Fictional Northern Ridge',
      city: 'Arlington',
      state: 'VA',
      zip: '22207',
    };
  for (const target of [austin, dmv]) {
    const criteria = {
      ...search,
      query: target.city,
      criteria: { ...search.criteria, state: target.state, zip: target.zip },
    };
    const matches = evaluateSavedSearch(criteria, [austin, dmv]).filter(match => match.matched);
    assert.deepEqual(
      matches.map(match => match.propertyId),
      [target.id],
    );
  }
});
test('saved-search review creates source-backed deduplicated alerts; follow-ups persist and reopen', async () => {
  const { user } = await owner();
  const saved = await executeAction(user, {
    type: 'saveSearch',
    name: search.name,
    query: search.query,
    maxPrice: search.maxPrice,
    criteria: search.criteria,
    clientId: 'client-02',
  });
  const id = saved.workspace.savedSearches.at(-1)!.id;
  const first = await executeAction(user, { type: 'reviewSavedSearch', id });
  assert.ok((first.result as { createdAlerts: number }).createdAlerts > 0);
  const alerts = first.workspace.alerts.filter(alert => alert.searchId === id);
  assert.ok(alerts.every(alert => alert.clientId === 'client-02' && alert.sourceIds.length === 1));
  const second = await executeAction(user, { type: 'reviewSavedSearch', id });
  assert.equal((second.result as { createdAlerts: number }).createdAlerts, 0);
  assert.equal((second.result as { providerRequests: number }).providerRequests, 0);
  const task = await executeAction(user, {
    type: 'saveFollowUp',
    clientId: 'client-02',
    title: 'Confirm the objective budget and timing',
    dueAt: '2026-10-20',
    propertyId: property.id,
  });
  const taskId = (task.result as { id: string }).id;
  assert.ok(task.workspace.nodes.some(node => node.id === taskId && node.type === 'client-follow-up'));
  assert.ok(task.workspace.edges.some(edge => edge.to === id && edge.relation === 'matches_saved_criteria'));
  await executeAction(user, { type: 'setFollowUpStatus', clientId: 'client-02', id: taskId, status: 'complete' });
  let persisted = await getWorkspace(user.tenantId);
  assert.ok(persisted.clients[1].followUps?.[0].completedAt);
  await executeAction(user, { type: 'setFollowUpStatus', clientId: 'client-02', id: taskId, status: 'pending' });
  await executeAction(user, {
    type: 'setClientProperty',
    clientId: 'client-02',
    propertyId: property.id,
    saved: false,
  });
  persisted = await getWorkspace(user.tenantId);
  assert.equal(persisted.clients[1].followUps?.[0].completedAt, undefined);
  assert.ok(!persisted.clients[1].savedPropertyIds.includes(property.id));
  assert.equal(verifyAudit(persisted), true);
});
test('client actions enforce viewer, cross-tenant, valid-date and Fair Housing boundaries', async () => {
  const one = await owner(),
    two = await owner();
  const created = await executeAction(one.user, {
    type: 'saveClient',
    name: 'Private fixture client',
    email: 'private@example.test',
    stage: 'active',
    budget: 800000,
    preferences: 'Three bedrooms',
  });
  const clientId = created.workspace.clients[0].id;
  await assert.rejects(
    executeAction(two.user, {
      type: 'saveFollowUp',
      clientId,
      title: 'Private cross-tenant task',
      dueAt: '2026-10-20',
    }),
    /not found/,
  );
  await assert.rejects(
    executeAction(
      { ...one.user, role: 'viewer' },
      { type: 'saveFollowUp', clientId, title: 'Read-only change', dueAt: '2026-10-20' },
    ),
    /viewing only/,
  );
  await assert.rejects(
    executeAction(one.user, { type: 'saveFollowUp', clientId, title: 'Invalid calendar', dueAt: '2026-02-30' }),
  );
  await assert.rejects(
    executeAction(one.user, {
      type: 'saveFollowUp',
      clientId,
      title: 'Show neighborhoods with Christians only',
      dueAt: '2026-10-20',
    }),
    /protected|exclusion|preference/i,
  );
  await mutateWorkspace(one.user, workspace => {
    workspace.savedSearches[0].query = 'Find neighborhoods with whites only';
  });
  await assert.rejects(
    executeAction(one.user, { type: 'reviewSavedSearch', id: 'search-01' }),
    /protected|exclusion|preference/i,
  );
  assert.ok((await getWorkspace(one.user.tenantId)).domain!.safetyEvents.length >= 2);
});
test('withheld property rights also withhold associated follow-ups and generated matching alerts', async () => {
  const { user } = await owner();
  const task = await executeAction(user, {
    type: 'saveFollowUp',
    clientId: 'client-02',
    title: 'Protected record text sentinel',
    dueAt: '2026-10-20',
    propertyId: property.id,
  });
  const taskId = (task.result as { id: string }).id;
  await mutateWorkspace(user, workspace => {
    workspace.properties[0].sourceId = 'unavailable-license';
  });
  const scoped = scopeWorkspaceForAccess(await getWorkspace(user.tenantId));
  assert.ok(!JSON.stringify(scoped.clients).includes('Protected record text sentinel'));
  await assert.rejects(
    executeAction(user, { type: 'setFollowUpStatus', clientId: 'client-02', id: taskId, status: 'complete' }),
    /permissions/,
  );
});
