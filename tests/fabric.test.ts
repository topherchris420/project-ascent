import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  activePropertyIds,
  applyFabricProjection,
  bootstrapFabric,
  createFabricState,
  demoSource,
  ingestBatch,
  matchCanonical,
  normalizeIncoming,
  projectProperty,
  registerRegion,
  regionCoverage,
  regionalAssumptions,
  scopeWorkspaceForAccess,
  sourceAccess,
  sourceFreshness,
  syntheticRegionPayload,
} from '../src/lib/fabric';
import { calculateCma, DEMO_AS_OF } from '../src/lib/analytics';
import { createDemoWorkspace } from '../src/lib/seed';
import type { FabricSource } from '../src/lib/fabric-types';
import {
  executeFabricAction,
  fetchProviderPayload,
  getFabricSnapshot,
  reviewProviderGrant,
  runScheduledFabricSync,
  validateProviderUrl,
} from '../src/lib/fabric-service';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { ensurePlatform } from '../src/lib/platform';
import { verifyAudit } from '../src/lib/service';

process.env.SQLITE_PATH = resolve('.data', `fabric-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(async () => {
  await closeDatabase();
});
const explorer = { credentialVerified: false };
const payload = () => syntheticRegionPayload('dmv');
const restricted = (): FabricSource => ({
  ...demoSource('dmv'),
  id: 'licensed-test',
  providerId: 'provider-test',
  kind: 'licensed',
  license: {
    ...demoSource('dmv').license,
    label: 'Test explicit restricted license',
    exportAllowed: false,
    allowedUses: ['research', 'valuation'],
  },
});

test('opening a workspace repairs missing demo projections after provider-first fabric initialization without replacing prior work', async () => {
  const account = await register({
    name: 'Provider first fixture',
    email: `${randomUUID()}@example.test`,
    password: 'provider first passphrase 1234',
  });
  await mutateWorkspace(account.user, workspace => {
    bootstrapFabric(workspace);
    workspace.clients[0].preferences = 'Retained private objective preferences';
  });
  const first = await getFabricSnapshot(account.user);
  assert.equal(first.workspace.properties.filter(property => property.state === 'VA').length, 9);
  assert.equal(first.workspace.properties.filter(property => property.state === 'TX').length, 12);
  assert.equal(first.workspace.cmas.length, 2);
  assert.equal(first.workspace.clients[0].preferences, 'Retained private objective preferences');
  assert.equal(first.workspace.audit.filter(event => event.action === 'repairDemoProjection').length, 1);
  const again = await getFabricSnapshot(account.user);
  assert.equal(again.workspace.properties.length, 21);
  assert.equal(again.workspace.audit.filter(event => event.action === 'repairDemoProjection').length, 1);
  assert.equal(verifyAudit(again.workspace), true);
});

test('Explorer admits permitted synthetic/public sources without credentials, while paid-plan claims confer no restricted rights', () => {
  const fabric = createFabricState();
  assert.equal(sourceAccess(demoSource('dmv'), fabric, explorer, 'dmv', 'research', DEMO_AS_OF).allowed, true);
  const publicSource: FabricSource = { ...demoSource('dmv'), kind: 'public' };
  assert.equal(sourceAccess(publicSource, fabric, explorer, 'dmv', 'research', DEMO_AS_OF).allowed, true);
  const denied = sourceAccess(restricted(), fabric, explorer, 'dmv', 'research', DEMO_AS_OF);
  assert.equal(denied.allowed, false);
  assert.ok(denied.reasons.some(reason => reason.includes('credential')));
  assert.ok(denied.reasons.some(reason => reason.includes('provider grant')));
});

test('restricted data requires BOTH current professional verification and independently reviewed provider/region/use grant', () => {
  const fabric = createFabricState(),
    source = restricted();
  const verified = { credentialVerified: true, credentialExpiresAt: '2027-01-01T00:00:00.000Z' };
  assert.equal(sourceAccess(source, fabric, verified, 'dmv', 'research', DEMO_AS_OF).allowed, false);
  fabric.grants.push({
    id: 'grant',
    providerId: source.providerId,
    regionIds: ['dmv'],
    allowedUses: ['research', 'valuation'],
    verifiedAt: '2026-10-01T00:00:00.000Z',
    verifiedBy: 'Independent test reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(sourceAccess(source, fabric, explorer, 'dmv', 'research', DEMO_AS_OF).allowed, false);
  assert.equal(sourceAccess(source, fabric, verified, 'dmv', 'research', DEMO_AS_OF).allowed, true);
  assert.equal(sourceAccess(source, fabric, verified, 'austin', 'research', DEMO_AS_OF).allowed, false);
  assert.equal(sourceAccess(source, fabric, verified, 'dmv', 'export', DEMO_AS_OF).allowed, false);
  fabric.grants[0].expiresAt = '2026-10-14T00:00:00.000Z';
  assert.equal(sourceAccess(source, fabric, verified, 'dmv', 'research', DEMO_AS_OF).allowed, false);
});

test('license expiration and credential expiration deny ingestion without changing canonical records', () => {
  const fabric = createFabricState();
  const source = demoSource('dmv');
  source.license.expiresAt = '2026-10-01T00:00:00.000Z';
  const run = ingestBatch(fabric, source, 'dmv', payload(), explorer, DEMO_AS_OF);
  assert.equal(run.status, 'denied');
  assert.equal(fabric.records.length, 0);
  assert.equal(fabric.runs.length, 1);
  assert.match(run.errors[0], /expired/);
});

test('DMV and Austin fixtures share canonical normalization and the same CMA engine, with no geographic engine branching', () => {
  const fabric = createFabricState();
  for (const id of ['dmv', 'austin']) {
    const run = ingestBatch(fabric, demoSource(id), id, syntheticRegionPayload(id), explorer, DEMO_AS_OF);
    assert.equal(run.inserted, 9);
    assert.equal(run.status, 'success');
    const properties = fabric.records
      .filter(record => record.regionId === id)
      .map(projectProperty)
      .filter(value => value !== null);
    const result = calculateCma(properties[0], properties, {}, DEMO_AS_OF);
    assert.equal(result.comps.length, 5);
    assert.ok(Number.isFinite(result.estimate));
    assert.equal(result.version, 'ascent-cma-1.0');
  }
  assert.equal(fabric.records.length, 18);
  assert.ok(fabric.records.every(record => record.synthetic && record.quality.score === 100));
});

test('new jurisdiction is a registry configuration and adapter mapping, not an analytics-engine rewrite', () => {
  registerRegion({
    id: 'test-california',
    name: 'Synthetic Alameda test',
    states: ['CA'],
    countyFips: ['06001'],
    center: { lat: 37.8, lng: -122.2 },
    description: 'Unit-test registry entry, no live coverage.',
  });
  const source = { ...demoSource('dmv'), id: 'test-ca-source', regionIds: ['test-california'] };
  const raw = payload()[0];
  Object.assign(raw, {
    ListingKey: 'ca-test-1',
    CountyFips: '06001',
    StateOrProvince: 'CA',
    City: 'Fictional city',
    Latitude: 37.8,
    Longitude: -122.2,
  });
  const fabric = createFabricState();
  assert.equal(ingestBatch(fabric, source, 'test-california', [raw], explorer, DEMO_AS_OF).inserted, 1);
  assert.equal(projectProperty(fabric.records[0])!.state, 'CA');
  assert.throws(() => syntheticRegionPayload('test-california'), /No authored demonstration fixture/);
});

test('incomplete assessor records remain research-only without manufactured listing price, condition or CMA', () => {
  const fabric = createFabricState();
  const source: FabricSource = { ...demoSource('dmv'), id: 'assessor-test', kind: 'public', adapter: 'assessor' };
  const raw = {
    id: 'tax-1',
    county_fips: '51013',
    parcel_id: 'PARCEL-1',
    address: '100 Example Parcel Way',
    city: 'Arlington',
    state: 'VA',
    zip: '22204',
    lat: 38.88,
    lng: -77.1,
    assessed_value: 900000,
    sqft: 2000,
    year_built: 1980,
  };
  const run = ingestBatch(fabric, source, 'dmv', [raw], explorer, DEMO_AS_OF);
  assert.equal(run.inserted, 1);
  assert.equal(fabric.records[0].facts.price, undefined);
  assert.equal(fabric.records[0].facts.condition, undefined);
  assert.ok(fabric.records[0].missingFields.includes('status'));
  assert.ok(fabric.records[0].missingFields.includes('price'));
  assert.equal(projectProperty(fabric.records[0]), null);
  assert.ok(fabric.records[0].quality.score < 100);
  const coverage = regionCoverage(fabric, explorer, DEMO_AS_OF).find(item => item.regionId === 'dmv')!;
  assert.equal(coverage.capabilities.propertyResearch, true);
  assert.equal(coverage.capabilities.cma, false);
  assert.equal(coverage.projectable, 0);
});

test('Census geographic linking records approximate location without inventing property or valuation facts', () => {
  const incoming = normalizeIncoming(
    'census',
    {
      id: 'geocode-1',
      matchedAddress: '100 EXAMPLE WAY',
      state: 'VA',
      coordinates: { x: -77.1, y: 38.88 },
      geographies: { Counties: [{ GEOID: '51013' }] },
    },
    DEMO_AS_OF,
  );
  assert.equal(incoming.identity.countyFips, '51013');
  assert.deepEqual(incoming.facts, {});
  assert.throws(
    () =>
      normalizeIncoming(
        'census',
        {
          matchedAddress: 'Ambiguous',
          coordinates: {},
          geographies: { Counties: [{ GEOID: '51013' }, { GEOID: '51059' }] },
        },
        DEMO_AS_OF,
      ),
    /ambiguous/,
  );
});

test('repeat ingestion is idempotent, changed equal-age records quarantine, and newer same-source changes leave a version trail', () => {
  const fabric = createFabricState(),
    source = demoSource('dmv'),
    raw = payload().slice(0, 1);
  assert.equal(ingestBatch(fabric, source, 'dmv', raw, explorer, DEMO_AS_OF).inserted, 1);
  assert.equal(ingestBatch(fabric, source, 'dmv', raw, explorer, DEMO_AS_OF).unchanged, 1);
  raw[0].ListPrice = 950000;
  assert.equal(ingestBatch(fabric, source, 'dmv', raw, explorer, DEMO_AS_OF).quarantined, 1);
  const later = { ...source, observedAt: '2026-10-16T12:00:00.000Z' };
  assert.equal(ingestBatch(fabric, later, 'dmv', raw, explorer, later.observedAt).updated, 1);
  assert.equal(fabric.records.length, 1);
  assert.equal(fabric.records[0].versions.length, 2);
  assert.ok(fabric.records[0].versions[1].changedFields.includes('price'));
  assert.equal(fabric.records[0].facts.price, 950000);
});

test('county-qualified parcel matching never merges jurisdiction collisions', () => {
  const fabric = createFabricState(),
    source = demoSource('dmv');
  const records = payload().slice(0, 2);
  Object.assign(records[0], { ParcelNumber: 'REPEATED-ID', CountyFips: '51013', StateOrProvince: 'VA' });
  Object.assign(records[1], {
    ParcelNumber: 'REPEATED-ID',
    CountyFips: '24031',
    StateOrProvince: 'MD',
    City: 'Fictional Maryland',
  });
  assert.equal(ingestBatch(fabric, source, 'dmv', records, explorer, DEMO_AS_OF).inserted, 2);
  assert.notEqual(fabric.records[0].id, fabric.records[1].id);
  const normalized = normalizeIncoming('reso', records[0], DEMO_AS_OF);
  assert.deepEqual(matchCanonical(normalized, fabric.records, 'dmv').candidateIds, [fabric.records[0].id]);
});

test('ambiguous address/parcel candidates and cross-source fact conflicts quarantine rather than overwrite', () => {
  const fabric = createFabricState(),
    source = demoSource('dmv'),
    raw = payload()[0];
  ingestBatch(fabric, source, 'dmv', [raw], explorer, DEMO_AS_OF);
  const duplicate = structuredClone(fabric.records[0]);
  duplicate.id = 'ambiguous-duplicate';
  duplicate.provenance = [];
  fabric.records.push(duplicate);
  const secondSource = { ...source, id: 'another-source', observedAt: '2026-10-16T12:00:00.000Z' };
  const run = ingestBatch(
    fabric,
    secondSource,
    'dmv',
    [{ ...raw, ListingKey: 'independent-key', ListPrice: 1000000 }],
    explorer,
    secondSource.observedAt,
  );
  assert.equal(run.quarantined, 1);
  assert.equal(fabric.records.length, 2);
  assert.ok(fabric.quarantine[0].candidateIds.length === 2);
  fabric.records.pop();
  const conflicting = ingestBatch(
    fabric,
    secondSource,
    'dmv',
    [{ ...raw, ListingKey: 'independent-key', ListPrice: 1000000 }],
    explorer,
    secondSource.observedAt,
  );
  assert.equal(conflicting.quarantined, 1);
  assert.match(fabric.quarantine[0].reason, /Cross-source fact conflict/);
});

test('malformed statuses, coordinates, state/county mismatches and provider payload failure produce explicit runs', () => {
  const fabric = createFabricState(),
    source = demoSource('dmv'),
    raw = payload()[0];
  const run = ingestBatch(
    fabric,
    source,
    'dmv',
    [
      { ...raw, StandardStatus: 'Unknown' },
      { ...raw, Latitude: 100 },
      { ...raw, StateOrProvince: 'MD' },
    ],
    explorer,
    DEMO_AS_OF,
  );
  assert.equal(run.status, 'failed');
  assert.equal(run.quarantined, 3);
  assert.equal(fabric.records.length, 0);
  assert.equal(
    ingestBatch(fabric, source, 'dmv', { error: 'Provider unavailable' }, explorer, DEMO_AS_OF).status,
    'failed',
  );
  assert.ok(
    fabric.quarantine.every(item => !('raw' in item)),
    'Raw customer payloads are not copied to quarantine metadata.',
  );
});

test('freshness is derived from an explicit source refresh policy and future observations are unknown', () => {
  const source = { ...demoSource('dmv'), expectedUpdateHours: 24, observedAt: '2026-10-14T12:00:00.000Z' };
  assert.equal(sourceFreshness(source, DEMO_AS_OF).status, 'fresh');
  assert.equal(sourceFreshness(source, '2026-10-16T12:00:00.000Z').status, 'stale');
  assert.equal(sourceFreshness(source, '2026-10-13T12:00:00.000Z').status, 'unknown');
});

test('bootstrap defaults DMV, preserves existing Austin workflow IDs and isolates region property projections', () => {
  const workspace = createDemoWorkspace(),
    original = structuredClone(workspace);
  const fabric = bootstrapFabric(workspace);
  applyFabricProjection(workspace, explorer);
  assert.equal(fabric.selectedRegionId, 'dmv');
  assert.equal(activePropertyIds(fabric).length, 9);
  assert.equal(activePropertyIds(fabric, 'austin').length, 12);
  assert.deepEqual(workspace.cmas, original.cmas);
  assert.deepEqual(workspace.clients, original.clients);
  assert.deepEqual(workspace.transactions, original.transactions);
  assert.ok(workspace.properties.some(property => property.id === 'property-01'));
  assert.equal(workspace.properties.length, 21);
  const source = fabric.sources[0];
  source.license.retentionDays = 1;
  const coverage = regionCoverage(fabric, explorer, '2026-10-20T12:00:00.000Z').find(
    item => item.regionId === 'austin',
  )!;
  assert.equal(coverage.projectable, 0, 'Expired retention cannot be counted as an available analytical capability.');
});

test('provider transport accepts only explicit HTTPS host configuration and disables redirects', async () => {
  assert.throws(() => validateProviderUrl('http://feed.example.com/data', ['feed.example.com']), /HTTPS/);
  assert.throws(() => validateProviderUrl('https://other.example.com/data', ['feed.example.com']), /allowed/);
  assert.throws(
    () => validateProviderUrl('https://user:secret@feed.example.com/data', ['feed.example.com']),
    /credentials/,
  );
  assert.throws(() => validateProviderUrl('https://127.0.0.1/data', ['127.0.0.1']), /network/);
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://feed.example.com/data');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer explicit-test-token');
    return Response.json({ value: [] });
  };
  assert.deepEqual(
    await fetchProviderPayload('https://feed.example.com/data', ['feed.example.com'], 'explicit-test-token', fakeFetch),
    { value: [] },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    fetchProviderPayload(
      'https://feed.example.com/data',
      ['feed.example.com'],
      undefined,
      async () => new Response('unavailable', { status: 503 }),
    ),
    /HTTP 503/,
  );
});

test('persisted fabric region changes survive reload, preserve audit integrity and deny viewer mutation', async () => {
  const account = await register({
    name: 'Fabric Test',
    email: `${randomUUID()}@example.test`,
    password: 'long test password 12345',
  });
  const initial = await getFabricSnapshot(account.user);
  assert.equal(initial.fabric.selectedRegionId, 'dmv');
  const updated = await executeFabricAction(account.user, { action: 'selectRegion', regionId: 'austin' });
  assert.equal(updated.fabric.selectedRegionId, 'austin');
  const stored = await getWorkspace(account.user.tenantId);
  assert.equal(stored.fabric?.selectedRegionId, 'austin');
  assert.equal(verifyAudit(stored), true);
  await assert.rejects(
    executeFabricAction({ ...account.user, role: 'viewer' }, { action: 'selectRegion', regionId: 'dmv' }),
    /viewing only/,
  );
  const neverFetch: typeof fetch = async () => {
    throw new Error('No access: transport must not be invoked.');
  };
  await assert.rejects(
    executeFabricAction(account.user, { action: 'syncProvider', regionId: 'dmv', providerId: 'unknown' }, neverFetch),
    /configured source/,
  );
});

test('trusted provider grant review is independent of workspace ownership, professional verification and subscription', async () => {
  const account = await register({
    name: 'Grant Test',
    email: `${randomUUID()}@example.test`,
    password: 'long test password 12345',
  });
  const original = process.env.DATA_GRANT_REVIEW_SECRET;
  process.env.DATA_GRANT_REVIEW_SECRET = 'independent-operator-secret-at-least-32-characters';
  try {
    const input = {
      action: 'grant',
      providerId: 'provider-test',
      regionIds: ['dmv'],
      allowedUses: ['research'],
      licenseReference: 'TEST-LICENSE-REFERENCE',
      terms: 'Synthetic test provider grant, not a real license.',
      expiresAt: '2027-12-31T23:59:00.000Z',
      reviewedBy: 'Independent test operator',
    };
    await assert.rejects(reviewProviderGrant(account.user, input, 'wrong-secret'), /operator review/);
    const granted = await reviewProviderGrant(account.user, input, process.env.DATA_GRANT_REVIEW_SECRET);
    const platform = ensurePlatform(granted.workspace);
    assert.equal(platform.providerGrants.length, 1);
    assert.equal(platform.verification.status, 'unsubmitted');
    assert.equal(platform.billing.status, 'free');
    await reviewProviderGrant(
      account.user,
      { action: 'revoke', id: platform.providerGrants[0].id, reviewedBy: 'Independent test operator' },
      process.env.DATA_GRANT_REVIEW_SECRET,
    );
    assert.ok(ensurePlatform(await getWorkspace(account.user.tenantId)).providerGrants[0].revokedAt);
  } finally {
    if (original === undefined) delete process.env.DATA_GRANT_REVIEW_SECRET;
    else process.env.DATA_GRANT_REVIEW_SECRET = original;
  }
});

test('synthetic and authorized records cannot merge even with identical parcel and address identity', () => {
  const fabric = createFabricState(),
    raw = payload().slice(0, 1);
  ingestBatch(fabric, demoSource('dmv'), 'dmv', raw, explorer, DEMO_AS_OF);
  const publicSource: FabricSource = { ...demoSource('dmv'), id: 'public-distinct', kind: 'public' };
  assert.equal(ingestBatch(fabric, publicSource, 'dmv', raw, explorer, DEMO_AS_OF).inserted, 1);
  assert.equal(fabric.records.length, 2);
  assert.notEqual(fabric.records[0].synthetic, fabric.records[1].synthetic);
  fabric.dataMode = 'demo';
  assert.equal(activePropertyIds(fabric).length, 1);
  fabric.dataMode = 'authorized';
  assert.equal(activePropertyIds(fabric).length, 1);
});

function licensedWorkspace() {
  const workspace = createDemoWorkspace(),
    fabric = bootstrapFabric(workspace),
    platform = ensurePlatform(workspace),
    source = restricted();
  platform.verification = {
    status: 'verified',
    reviewedAt: '2026-10-01T00:00:00.000Z',
    reviewedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
    evidence: [{ url: 'https://official.example/license-reference' }],
  };
  platform.providerGrants.push({
    id: 'reviewed-license',
    providerId: source.providerId,
    regionIds: ['dmv'],
    allowedUses: ['research', 'valuation', 'market'],
    licenseReference: 'TEST CONTRACT',
    terms: 'Synthetic test of restrictions, no actual provider rights.',
    issuedAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
    reviewedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  fabric.grants.push({
    id: 'reviewed-license',
    providerId: source.providerId,
    regionIds: ['dmv'],
    allowedUses: ['research', 'valuation', 'market'],
    verifiedAt: '2026-10-01T00:00:00.000Z',
    verifiedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  const raw = payload().map((record, index) => ({
    ...record,
    ListingKey: `licensed-${index}`,
    PublicRemarks: `LICENSED-SENSITIVE-FACT-${index}`,
  }));
  const run = ingestBatch(fabric, source, 'dmv', raw, { credentialVerified: true }, DEMO_AS_OF);
  assert.equal(run.inserted, 9);
  applyFabricProjection(workspace, { credentialVerified: true }, DEMO_AS_OF);
  const licensedProperties = workspace.properties.filter(property => property.sourceId === source.id);
  const cma = calculateCma(licensedProperties[0], licensedProperties, {}, DEMO_AS_OF);
  workspace.cmas.push({
    id: 'licensed-cma',
    propertyId: licensedProperties[0].id,
    name: 'LICENSED-SENSITIVE-CMA',
    createdAt: DEMO_AS_OF,
    result: cma,
  });
  return { workspace, source, licensedProperties };
}

test('read-time revocation removes restricted raw records, all frozen inputs, linked workflows and graph labels without changing storage', () => {
  const { workspace, licensedProperties } = licensedWorkspace();
  assert.equal(
    scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).properties.filter(
      property => property.sourceId === 'licensed-test',
    ).length,
    9,
  );
  const secretId = licensedProperties[0].id;
  workspace.clients[0].savedPropertyIds.push(secretId);
  workspace.clients[0].timeline.push({ date: DEMO_AS_OF, note: 'LICENSED-SENSITIVE-CLIENT-CONTEXT' });
  workspace.offers.push({ ...workspace.offers[0], id: 'restricted-offer', propertyId: secretId });
  workspace.transactions.push({ ...workspace.transactions[0], id: 'restricted-transaction', propertyId: secretId });
  workspace.documents.push({
    id: 'restricted-document',
    transactionId: 'restricted-transaction',
    name: 'LICENSED-SENSITIVE-DOCUMENT',
    mime: 'text/plain',
    size: 10,
    sha256: 'test',
    uploadedAt: DEMO_AS_OF,
    extractedDates: [],
  });
  workspace.platform!.providerGrants[0].revokedAt = DEMO_AS_OF;
  const before = structuredClone(workspace),
    scoped = scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF);
  const encoded = JSON.stringify(scoped);
  assert.equal(scoped.properties.filter(property => property.sourceId === 'licensed-test').length, 0);
  assert.ok(!encoded.includes('LICENSED-SENSITIVE'));
  assert.ok(!scoped.cmas.some(cma => cma.id === 'licensed-cma'));
  assert.ok(!scoped.offers.some(offer => offer.id === 'restricted-offer'));
  assert.ok(!scoped.documents.some(document => document.id === 'restricted-document'));
  assert.deepEqual(workspace, before, 'Durable evidence and audit are not mutated by read scoping.');
});

test('export rights, credential expiry, retention expiry and legacy licensed sources fail closed independently', () => {
  const { workspace, licensedProperties } = licensedWorkspace();
  assert.ok(scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).cmas.some(cma => cma.id === 'licensed-cma'));
  assert.ok(
    !scopeWorkspaceForAccess(workspace, 'export', DEMO_AS_OF).cmas.some(cma => cma.id === 'licensed-cma'),
    'Export is separately prohibited by source policy and provider grant.',
  );
  workspace.platform!.verification.expiresAt = '2026-10-14T00:00:00.000Z';
  assert.ok(
    !scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).properties.some(
      property => property.id === licensedProperties[0].id,
    ),
  );
  workspace.platform!.verification.expiresAt = '2027-01-01T00:00:00.000Z';
  workspace.fabric!.sources.find(source => source.id === 'licensed-test')!.license.retentionDays = 1;
  assert.ok(
    !scopeWorkspaceForAccess(workspace, 'research', '2026-10-18T12:00:00.000Z').properties.some(
      property => property.id === licensedProperties[0].id,
    ),
  );
  workspace.fabric!.sources = workspace.fabric!.sources.filter(source => source.id !== 'licensed-test');
  assert.ok(
    !scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).properties.some(
      property => property.id === licensedProperties[0].id,
    ),
    'Unstructured legacy licensed sources do not self-authorize.',
  );
});

test('one denied excluded snapshot candidate removes the whole frozen CMA rather than leaking raw excluded listing data', () => {
  const { workspace, licensedProperties } = licensedWorkspace();
  const ordinary = workspace.cmas.find(cma => cma.id === 'cma-01')!;
  ordinary.result.inputSnapshot!.candidates.push(licensedProperties[0]);
  workspace.platform!.providerGrants[0].revokedAt = DEMO_AS_OF;
  const scoped = scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF);
  assert.ok(!scoped.cmas.some(cma => cma.id === ordinary.id));
});

test('research permission exposes raw research facts but never saved CMA conclusions after valuation rights are removed', () => {
  const { workspace, licensedProperties } = licensedWorkspace();
  const source = workspace.fabric!.sources.find(item => item.id === 'licensed-test')!;
  source.license.allowedUses = ['research'];
  let scoped = scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF);
  assert.ok(
    scoped.properties.some(property => property.id === licensedProperties[0].id),
    'Raw research facts retain their separate research permission.',
  );
  assert.ok(
    !scoped.cmas.some(cma => cma.id === 'licensed-cma'),
    'Derived valuation is unavailable without source valuation rights.',
  );
  source.license.allowedUses = ['research', 'valuation'];
  workspace.platform!.providerGrants[0].allowedUses = ['research'];
  scoped = scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF);
  assert.ok(scoped.properties.some(property => property.id === licensedProperties[0].id));
  assert.ok(
    !scoped.cmas.some(cma => cma.id === 'licensed-cma'),
    'A source policy cannot replace a missing provider valuation grant.',
  );
  const ordinary = workspace.cmas.find(cma => cma.id === 'cma-01')!;
  ordinary.result.inputSnapshot!.candidates.push(licensedProperties[0]);
  assert.ok(
    !scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).cmas.some(cma => cma.id === ordinary.id),
    'Excluded raw snapshot inputs also require valuation rights.',
  );
});

test('authorized frozen CMA remains available when current subject and comparable records were removed', () => {
  const workspace = createDemoWorkspace(),
    cma = workspace.cmas.find(record => record.id === 'cma-01')!;
  const before = structuredClone(cma);
  workspace.properties = [];
  const scoped = scopeWorkspaceForAccess(workspace, 'export', DEMO_AS_OF);
  assert.deepEqual(
    scoped.cmas.find(record => record.id === cma.id),
    before,
  );
  const nodeIds = new Set(scoped.nodes.map(node => node.id));
  assert.ok(scoped.edges.every(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)));
});

test('regional defaults are declared analyst assumptions and can be overridden using the same engine', () => {
  assert.equal(regionalAssumptions('dmv').sqftRate, 145);
  assert.equal(regionalAssumptions('austin').sqftRate, 110);
  assert.equal(regionalAssumptions('test-california').sqftRate, 110);
  const fabric = createFabricState();
  ingestBatch(fabric, demoSource('dmv'), 'dmv', payload(), explorer, DEMO_AS_OF);
  const properties = fabric.records.map(projectProperty).filter(property => property !== null);
  const result = calculateCma(properties[0], properties, { ...regionalAssumptions('dmv'), sqftRate: 150 }, DEMO_AS_OF);
  assert.equal(result.assumptions.sqftRate, 150);
  assert.ok(result.warnings.some(warning => warning.includes('explicit user assumptions')));
});

test('scheduled sync is off by default, skips fresh observations, and records bounded stale-source failures without losing prior data', async () => {
  const account = await register({
    name: 'Scheduled Fabric',
    email: `${randomUUID()}@example.test`,
    password: 'long test password 12345',
  });
  await getFabricSnapshot(account.user);
  const keys = [
    'FABRIC_SCHEDULED_SYNC',
    'FABRIC_LIVE_ENABLED',
    'FABRIC_SOURCE_JSON',
    'FABRIC_PROVIDER_URL',
    'FABRIC_ALLOWED_HOSTS',
    'FABRIC_PROVIDER_TOKEN',
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let calls = 0;
  const unavailable: typeof fetch = async () => {
    calls++;
    return new Response('Provider unavailable', { status: 503 });
  };
  try {
    delete process.env.FABRIC_SCHEDULED_SYNC;
    assert.equal((await runScheduledFabricSync(account.user, unavailable)).status, 'skipped');
    assert.equal(calls, 0);
    const now = new Date().toISOString();
    const source: FabricSource = {
      ...demoSource('dmv'),
      id: 'public-scheduled',
      kind: 'public',
      observedAt: now,
      expectedUpdateHours: 24,
    };
    Object.assign(process.env, {
      FABRIC_SCHEDULED_SYNC: 'true',
      FABRIC_LIVE_ENABLED: 'true',
      FABRIC_SOURCE_JSON: JSON.stringify(source),
      FABRIC_PROVIDER_URL: 'https://feed.example.com/data',
      FABRIC_ALLOWED_HOSTS: 'feed.example.com',
    });
    await mutateWorkspace(account.user, workspace => {
      workspace.fabric!.sources.push(source);
      return null;
    });
    assert.equal((await runScheduledFabricSync(account.user, unavailable)).status, 'skipped');
    assert.equal(calls, 0);
    await mutateWorkspace(account.user, workspace => {
      workspace.fabric!.sources.find(entry => entry.id === source.id)!.observedAt = '2026-10-01T00:00:00.000Z';
      return null;
    });
    const before = await getWorkspace(account.user.tenantId);
    const result = await runScheduledFabricSync(account.user, unavailable);
    assert.equal(result.status, 'failed');
    assert.equal(calls, 1);
    const after = await getWorkspace(account.user.tenantId);
    assert.equal(after.fabric!.records.length, before.fabric!.records.length);
    assert.equal(after.fabric!.runs[0].status, 'failed');
    assert.match(after.fabric!.runs[0].errors[0], /HTTP 503/);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
