import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderCmaInputs, normalizeProviderProperty } from '../src/lib/providers/normalize-property';
import {
  FixturePropertyProvider,
  fixturePropertyRecords,
  FIXTURE_PROPERTY_ADDRESS,
  FIXTURE_PROPERTY_AS_OF,
} from '../src/lib/providers/fixture-property';
import type { ProviderProperty } from '../src/lib/providers/property-provider';
import { buildDecisionGraph, calculateCma, DEMO_AS_OF } from '../src/lib/analytics';
import { createDemoWorkspace } from '../src/lib/seed';
import { createFabricState, demoSource, scopeWorkspaceForAccess, sourceAccess } from '../src/lib/fabric';
import { ensurePlatform } from '../src/lib/platform';
import type { FabricSource } from '../src/lib/fabric-types';

const options = {
  sourceId: 'fixture-property-source',
  asOf: FIXTURE_PROPERTY_AS_OF,
  omitUnobservedCondition: true as const,
};

test('provider subject normalization preserves unknown condition, listing price/date, DOM and current status', () => {
  const record = fixturePropertyRecords()[0],
    result = normalizeProviderProperty(record, { ...options, role: 'subject' });
  assert.ok(result.value);
  assert.equal(result.value.condition, undefined);
  assert.equal(result.value.price, undefined);
  assert.equal(result.value.status, undefined);
  assert.equal(result.value.listedAt, undefined);
  assert.equal(result.value.dom, undefined);
  assert.equal(result.value.soldPrice, undefined);
  assert.equal(result.value.beds, record.facts.bedrooms);
  assert.equal(result.value.yearBuilt, record.facts.yearBuilt);
  assert.ok(result.warnings.some(warning => warning.includes('Condition is unknown')));
});

test('only a positive priced recorded sale on/before the analysis clock becomes a historical comparable', () => {
  const record = fixturePropertyRecords()[1];
  record.sales = [
    { kind: 'recorded-sale', sourceField: 'lastSale', date: '2024-01-01', price: 500000 },
    { kind: 'recorded-sale', sourceField: 'history', date: '2026-09-10', price: 700000 },
    { kind: 'recorded-sale', sourceField: 'history', date: '2027-01-01', price: 900000 },
    { kind: 'recorded-sale', sourceField: 'history', date: '2026-09-20' },
  ];
  const normalized = normalizeProviderProperty(record, { ...options, role: 'comparable' });
  assert.equal(normalized.value!.soldPrice, 700000);
  assert.equal(normalized.value!.soldAt, '2026-09-10');
  assert.equal(normalized.value!.status, 'sold');
  assert.equal(normalized.value!.listedAt, undefined);
  assert.equal(normalized.value!.dom, undefined);
  assert.equal(normalized.evidence.sale!.sourceField, 'history');
});

test('invalid/future/unpriced sales remain incomplete and never borrow an assessment or listing price', () => {
  const record = fixturePropertyRecords()[1];
  record.sales = [
    { kind: 'recorded-sale', sourceField: 'history', date: '2026-02-30', price: 800000 },
    { kind: 'recorded-sale', sourceField: 'lastSale', date: '2027-01-01', price: 900000 },
    { kind: 'recorded-sale', sourceField: 'history', date: '2026-09-01' },
  ];
  const result = normalizeProviderProperty(record, { ...options, role: 'comparable' });
  assert.equal(result.value, null);
  assert.ok(result.missingFields.some(field => field.includes('recorded sale')));
});

test('missing numeric/identity facts stay missing rather than becoming zero or parsed guesses', () => {
  const record = fixturePropertyRecords()[0];
  record.facts.squareFootage = undefined;
  record.address.city = undefined;
  record.location = undefined;
  const result = normalizeProviderProperty(record, options);
  assert.equal(result.value, null);
  assert.ok(result.missingFields.includes('squareFootage'));
  assert.ok(result.missingFields.includes('city'));
  assert.ok(result.missingFields.includes('latitude'));
  record.facts.squareFootage = 0;
  assert.equal(normalizeProviderProperty(record, options).value, null);
});

test('AVM comparables and sale listings cannot masquerade as recorded-sale property inputs', async () => {
  const provider = new FixturePropertyProvider(),
    avm = await provider.getValuation({ address: FIXTURE_PROPERTY_ADDRESS });
  assert.ok(avm.data.comparables[0].askingPrice);
  const result = normalizeProviderProperty(avm.data.comparables[0] as unknown as ProviderProperty, {
    ...options,
    role: 'comparable',
  });
  assert.equal(result.value, null);
  assert.deepEqual(result.missingFields, ['property-record']);
  assert.ok(result.warnings.some(warning => warning.includes('AVM estimates')));
});

test('normalization excludes self, duplicate observations and different property types without changing the source fixtures', () => {
  const records = fixturePropertyRecords(),
    incompatible = structuredClone(records[2]);
  incompatible.id = 'different-type';
  incompatible.facts.propertyType = 'Condo';
  const result = buildProviderCmaInputs(records[0], [records[0], records[1], records[1], incompatible], options);
  assert.equal(result.comparables.length, 1);
  assert.equal(result.incomplete.length, 1);
  assert.ok(result.incomplete[0].missingFields[0].includes('property type'));
  assert.ok(result.warnings.some(warning => warning.includes('duplicate')));
  assert.equal(records[0].sales.length, 1);
});

test('recorded provider fixtures run the existing CMA engine only with explicit unknown-condition omission', () => {
  const records = fixturePropertyRecords(),
    inputs = buildProviderCmaInputs(records[0], records, options);
  assert.ok(inputs.subject);
  assert.equal(inputs.comparables.length, 6);
  assert.equal(inputs.incomplete.length, 0);
  assert.throws(() => calculateCma(inputs.subject!, inputs.comparables, {}, options.asOf), /condition/);
  const cma = calculateCma(inputs.subject!, inputs.comparables, { conditionValue: 0 }, options.asOf);
  assert.equal(cma.comps.length, 6);
  assert.equal(cma.version, 'ascent-cma-1.1');
  assert.ok(Number.isFinite(cma.estimate));
  assert.ok(cma.comps.every(comp => !comp.adjustments.some(adjustment => adjustment.factor === 'Condition')));
  assert.equal(cma.inputSnapshot!.subject.listedAt, undefined);
});

test('an explicit analyst condition assumption is labeled and invalid scores are rejected', () => {
  const record = fixturePropertyRecords()[0];
  const result = normalizeProviderProperty(record, { ...options, conditionAssumption: 3 });
  assert.equal(result.value!.condition, 3);
  assert.ok(result.warnings.some(warning => warning.includes('not an inspected provider fact')));
  assert.throws(() => normalizeProviderProperty(record, { ...options, conditionAssumption: 6 }), /between 0 and 5/);
});

test('frozen minimal provider observations retain graph source/valuation/sale edges without invented listing dates', () => {
  const records = fixturePropertyRecords(),
    inputs = buildProviderCmaInputs(records[0], records, options);
  const result = calculateCma(inputs.subject!, inputs.comparables, { conditionValue: 0 }, options.asOf);
  const workspace = createDemoWorkspace();
  workspace.sources.push({
    id: options.sourceId,
    label: 'Synthetic provider observation source',
    kind: 'synthetic',
    observedAt: options.asOf,
    license: 'Synthetic scope test only.',
    confidence: 1,
  });
  workspace.cmas.push({
    id: 'provider-graph-cma',
    name: 'Synthetic provider graph test',
    propertyId: result.subjectId,
    createdAt: options.asOf,
    result,
  });
  const graph = buildDecisionGraph(workspace),
    ids = new Set(graph.nodes.map(node => node.id));
  assert.ok(
    graph.nodes.some(
      node => node.id === result.subjectId && node.type === 'property-observation' && node.validFrom === options.asOf,
    ),
  );
  assert.ok(
    graph.edges.some(
      edge => edge.from === 'provider-graph-cma' && edge.to === result.subjectId && edge.relation === 'estimates',
    ),
  );
  assert.equal(
    graph.edges.filter(edge => edge.from === 'provider-graph-cma' && edge.relation === 'uses_comparable').length,
    result.comps.length,
  );
  assert.ok(
    graph.edges.some(
      edge => edge.from === result.subjectId && edge.to === options.sourceId && edge.relation === 'supported_by',
    ),
  );
  assert.ok(graph.nodes.some(node => node.type === 'recorded-event' && node.label.includes(records[1].id)));
  assert.ok(graph.edges.every(edge => ids.has(edge.from) && ids.has(edge.to)));
  assert.equal(result.inputSnapshot!.subject.listedAt, undefined);
});

function reviewedSource(): FabricSource {
  return {
    ...demoSource('austin'),
    id: 'rentcast-reviewed-source',
    providerId: 'rentcast',
    adapter: 'rentcast',
    kind: 'licensed',
    regionIds: ['us'],
    license: {
      label: 'Synthetic test of an independently reviewed provider contract, not actual access.',
      allowedUses: ['research', 'valuation'],
      exportAllowed: false,
      retentionDays: 30,
      requiresProfessionalVerification: false,
      contractReview: {
        reviewedBy: 'Independent contract reviewer',
        reviewedAt: '2026-10-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        licenseReference: 'Synthetic fixture contract',
      },
    },
  };
}

test('licensed national Explorer exception requires an independently reviewed contract AND grant, never a public relabel', () => {
  const fabric = createFabricState(),
    source = reviewedSource();
  assert.equal(source.kind, 'licensed');
  assert.equal(
    sourceAccess(source, fabric, { credentialVerified: false }, 'us', 'research', DEMO_AS_OF).allowed,
    false,
  );
  fabric.grants.push({
    id: 'national-grant',
    providerId: 'rentcast',
    regionIds: ['us'],
    allowedUses: ['research', 'valuation'],
    verifiedAt: '2026-10-01T00:00:00.000Z',
    verifiedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(sourceAccess(source, fabric, { credentialVerified: false }, 'us', 'research', DEMO_AS_OF).allowed, true);
  source.license.contractReview = undefined;
  assert.equal(
    sourceAccess(source, fabric, { credentialVerified: false }, 'us', 'research', DEMO_AS_OF).allowed,
    false,
  );
});

test('a different current grant cannot reauthorize a bundle whose bound grant was revoked', () => {
  const source = reviewedSource(),
    fabric = createFabricState();
  source.license.providerGrantIds = ['bound-grant'];
  const grant = {
    id: 'bound-grant',
    providerId: 'rentcast',
    regionIds: ['us'],
    allowedUses: ['research' as const, 'valuation' as const],
    verifiedAt: '2026-10-01T00:00:00.000Z',
    verifiedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  fabric.grants.push(grant, { ...grant, id: 'unrelated-current-grant' });
  assert.equal(
    sourceAccess(source, fabric, { credentialVerified: false }, 'us', 'valuation', DEMO_AS_OF).allowed,
    true,
  );
  fabric.grants = fabric.grants.filter(item => item.id !== 'bound-grant');
  const denied = sourceAccess(source, fabric, { credentialVerified: false }, 'us', 'valuation', DEMO_AS_OF);
  assert.equal(denied.allowed, false);
  assert.ok(denied.reasons.some(reason => reason.includes('bound to this archived evidence bundle')));
});

test('provider cache read scope removes revoked/expired/policy-mismatched licensed payloads while preserving permitted fixture data', () => {
  const workspace = createDemoWorkspace(),
    platform = ensurePlatform(workspace);
  platform.providerGrants.push({
    id: 'national-grant',
    providerId: 'rentcast',
    regionIds: ['us'],
    allowedUses: ['research'],
    licenseReference: 'Fixture only',
    terms: 'Synthetic reviewed-contract test.',
    issuedAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
    reviewedBy: 'Independent reviewer',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  workspace.providerData = {
    version: 1,
    policy: {
      providerId: 'rentcast',
      version: 'test-v1',
      reviewedBy: 'Independent operator',
      reviewedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      licenseReference: 'Synthetic fixture contract',
      termsUrl: 'https://www.rentcast.io/terms',
      allowedUses: ['research'],
      retentionHours: 24,
      cacheTtlMinutes: 60,
      requiresProfessionalVerification: false,
    },
    cache: [
      {
        id: 'live-entry',
        key: 'hashed-query',
        action: 'getProperty',
        fixture: false,
        observedAt: DEMO_AS_OF,
        expiresAt: '2026-10-16T00:00:00.000Z',
        policyVersion: 'test-v1',
        grantId: 'national-grant',
        data: { marker: 'RESTRICTED-PROVIDER-CACHE' },
      },
      {
        id: 'fixture-entry',
        key: 'fixture-query',
        action: 'getProperty',
        fixture: true,
        observedAt: DEMO_AS_OF,
        expiresAt: '2026-10-16T00:00:00.000Z',
        policyVersion: 'fixture',
        data: { marker: 'SYNTHETIC-FIXTURE' },
      },
    ],
    reservations: [],
    usage: { period: '2026-10', requests: 0, reservedCostUsd: 0, perUser: {} },
    usageHistory: [],
  };
  assert.equal(scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).providerData!.cache.length, 2);
  assert.equal(scopeWorkspaceForAccess(workspace, 'export', DEMO_AS_OF).providerData!.cache.length, 1);
  platform.providerGrants[0].revokedAt = DEMO_AS_OF;
  const scoped = scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF);
  assert.equal(scoped.providerData!.cache.length, 1);
  assert.ok(!JSON.stringify(scoped).includes('RESTRICTED-PROVIDER-CACHE'));
  assert.equal(workspace.providerData.cache.length, 2, 'Read scope does not alter durable provider history.');
});
