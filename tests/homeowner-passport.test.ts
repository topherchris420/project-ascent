import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHomeSnapshot,
  saveHomeSnapshot,
  parseProfiles,
  evidencePassport,
  compareHomeSnapshots,
  sourceReview,
  emptyOwnerNotes,
  propertyHref,
  propertyMonitorChanges,
} from '../src/lib/homeowner-passport';
import { calculateDemo, defaultDemoState, sampleEvidence } from '../src/lib/demo-studio';
import { exampleFinance, compareDecisions } from '../src/lib/homeowner-finance';
import { recordedHistory } from '../src/lib/providers/recorded-history';
import { renderHomeownerReport } from '../src/lib/homeowner-report';
import { dcValuationInputs } from '../src/lib/providers/dc-public-records';
const at = '2026-10-18T16:00:00.000Z';
const snapshot = () => createHomeSnapshot(sampleEvidence, defaultDemoState, exampleFinance(), emptyOwnerNotes(), at);

test('private passport freezes calculations, preserves replay inputs, round-trips storage and detects tampering', () => {
  const snap = snapshot(),
    frozen = JSON.stringify(snap);
  const profiles = saveHomeSnapshot([], snap);
  assert.deepEqual(parseProfiles(JSON.stringify({ version: 1, profiles })), profiles);
  const passport = evidencePassport(snap, true);
  assert.equal(passport.valuation?.replay.reproduced, true);
  assert.equal(passport.financeReplayMatches, true);
  assert.equal(passport.finance!.calculationHash, compareDecisions(snap.finance).calculationHash);
  assert.equal(snap.calculation.valuationHash, calculateDemo(defaultDemoState).calculationHash);
  assert.equal(JSON.stringify(snap), frozen);
  const changed = structuredClone(profiles);
  changed[0].snapshots[0].finance.mortgageBalance = 42;
  assert.throws(() => parseProfiles(JSON.stringify({ version: 1, profiles: changed })), /checksum/);
});
test('sharing defaults exclude debt, finances, improvements and disputed notes, including historical calculation metadata', () => {
  const snap = createHomeSnapshot(
    sampleEvidence,
    { ...defaultDemoState, payoff: 313337 },
    { ...exampleFinance(), mortgageBalance: 313337 },
    {
      improvements: [{ year: 2020, description: 'PRIVATE renovation', cost: 121337 }],
      disputedEvidence: 'PRIVATE dispute',
      monitor: true,
    },
    at,
  );
  const share = evidencePassport(snap),
    encoded = JSON.stringify(share);
  for (const token of [
    '313337',
    '121337',
    'PRIVATE',
    'mortgageBalance',
    'studioChoices',
    'savedCalculation',
    'financeHash',
  ])
    assert.ok(!encoded.includes(token), token);
  assert.ok(share.valuation?.result.inputSnapshot);
  assert.ok(share.records.every(r => r.collectedAt && r.provenanceReferences.length));
  assert.match(share.sharing, /cannot revoke/);
  assert.match(JSON.stringify(evidencePassport(snap, true)), /PRIVATE renovation/);
});
test('sharing withholds user-entered comparable and condition valuation outputs; unknown/ licensed sources fail closed', () => {
  const snap = createHomeSnapshot(
    sampleEvidence,
    { ...defaultDemoState, subjectCondition: 3 },
    exampleFinance(),
    emptyOwnerNotes(),
    at,
  );
  assert.equal(evidencePassport(snap).valuation, null);
  assert.ok(evidencePassport(snap, true).valuation);
  for (const kind of ['licensed', 'public'] as const) {
    const evidence = structuredClone(sampleEvidence);
    evidence.sources[0].id = 'restricted';
    evidence.sources[0].kind = kind;
    assert.throws(
      () => createHomeSnapshot(evidence, defaultDemoState, exampleFinance(), emptyOwnerNotes(), at),
      /bundled public/,
    );
  }
  const duplicated = structuredClone(sampleEvidence);
  duplicated.candidates.push(duplicated.candidates[0]);
  assert.throws(
    () => createHomeSnapshot(duplicated, defaultDemoState, exampleFinance(), emptyOwnerNotes(), at),
    /Duplicate/,
  );
});
test('history distinguishes source corrections, homeowner edits and unchanged evidence; different homes refused', () => {
  const before = snapshot(),
    after = structuredClone(before);
  after.savedAt = '2026-10-19T16:00:00Z';
  assert.equal(compareHomeSnapshots(before, after).changes.length, 0, 'saving time alone creates no change');
  after.finance.monthlyRent = 4000;
  after.evidence.candidates[0].soldPrice! += 1000;
  after.evidence.sources[0].observedAt = '2026-10-19T00:00:00Z';
  const diff = compareHomeSnapshots(before, after);
  assert.ok(diff.changes.some(c => c.path === 'assumptions.monthlyRent'));
  assert.ok(diff.changes.some(c => c.path === 'sales.landing-c1.soldPrice'));
  assert.ok(diff.changes.some(c => c.path === 'sources.source-synthetic-landing.observedAt'));
  assert.equal(diff.valuation, null, 'changed inputs do not inherit the prior frozen calculation');
  after.evidence.subject.id = 'another-home';
  assert.throws(() => compareHomeSnapshots(before, after), /same home/);
});
test('a changed calculation version cannot claim exact historical reproduction', () => {
  const snap = snapshot();
  snap.calculation.valuationHash = 'changed-engine';
  snap.calculation.financeHash = 'changed-engine';
  const exported = evidencePassport(snap, true);
  assert.equal(exported.valuation?.replay.reproduced, false);
  assert.equal(exported.financeReplayMatches, false);
  assert.equal(compareHomeSnapshots(snapshot(), snap).valuation, null);
});
test('bounded profiles never silently discard old history or accept foreign links', () => {
  let profiles = saveHomeSnapshot([], snapshot());
  for (let i = 1; i < 10; i++)
    profiles = saveHomeSnapshot(
      profiles,
      createHomeSnapshot(
        sampleEvidence,
        defaultDemoState,
        { ...exampleFinance(), monthlyRent: 3500 + i },
        emptyOwnerNotes(),
        at,
      ),
    );
  assert.equal(profiles[0].snapshots.length, 10);
  assert.throws(() => saveHomeSnapshot(profiles, snapshot()), /Ten versions/);
  const bad = structuredClone(profiles);
  bad[0].href = 'https://example.invalid';
  assert.throws(() => parseProfiles(JSON.stringify({ version: 1, profiles: bad })), /identity/);
});
test('freshness uses the review date rather than frozen analysis time and never promises live monitoring', () => {
  const rows = sourceReview(sampleEvidence.sources, '2026-12-18T00:00:00Z');
  assert.equal(rows[0].status, 'review');
  assert.match(rows[0].explanation, /static snapshot/);
  assert.equal(sourceReview(sampleEvidence.sources, '2020-01-01T00:00:00Z')[0].status, 'unknown');
});
test('source refresh alone does not manufacture a property alert', () => {
  const before = snapshot(),
    after = structuredClone(before);
  after.evidence.asOf = '2026-10-19T00:00:00Z';
  after.evidence.sources[0].observedAt = after.evidence.asOf;
  assert.equal(propertyMonitorChanges(before, after).length, 0);
  after.evidence.candidates[0].soldPrice! += 1;
  assert.equal(propertyMonitorChanges(before, after).length, 1);
});
test('qualified transfer history rejects future and duplicate records without changing the source', () => {
  const sales = [
    { saleId: 'a', parcelId: 'p', soldOn: '2026-01-01', price: 500000 },
    { saleId: 'a', parcelId: 'p', soldOn: '2026-01-01', price: 500000 },
    { saleId: 'b', parcelId: 'p', soldOn: '2027-01-01', price: 600000 },
    { saleId: 'c', parcelId: 'q', soldOn: '2025-01-01', price: 2 },
  ];
  assert.deepEqual(recordedHistory('p', sales, at), [
    { date: '2026-01-01T00:00:00.000Z', event: 'Qualified recorded transfer', price: 500000 },
  ]);
  assert.equal(sales.length, 4);
});
test('real public-record home passport keeps record provenance, history and correct public return links', () => {
  const input = dcValuationInputs('3313____0047')!;
  const state = { ...defaultDemoState, assumptions: input.assumptions };
  const snap = createHomeSnapshot(input, state, exampleFinance(), emptyOwnerNotes(), at);
  const exported = evidencePassport(snap);
  assert.equal(exported.valuation?.replay.reproduced, true);
  assert.equal(propertyHref(input.subject), '/dc?parcel=3313____0047');
  assert.match(
    propertyHref({
      ...input.subject,
      id: 'dc-condo-parcel-123',
      propertyType: 'condominium',
      sourceId: 'source-dc-condo-public-records',
    }),
    /^\/dc\/condos\?parcel=123$/,
  );
  assert.ok(exported.records.every(r => r.sourceId === 'source-dc-public-records'));
  assert.equal(exported.records[0].collectedAt, input.snapshot.parcelsFetchedAt);
  assert.equal(exported.records[1].collectedAt, input.snapshot.salesFetchedAt);
  assert.equal(exported.records[0].datasetSha256, input.snapshot.parcelsSha256);
  assert.ok(exported.records.every(r => r.license.includes('CC BY 4.0')));
});
test('readable reports use the same privacy filter, escape notes and remain self-contained for printing', () => {
  const snap = createHomeSnapshot(
    sampleEvidence,
    defaultDemoState,
    { ...exampleFinance(), mortgageBalance: 313337 },
    {
      improvements: [{ year: 2026, description: '<script>PRIVATE()</script>', cost: 31337 }],
      disputedEvidence: 'PRIVATE <img onerror="run()">',
      monitor: false,
    },
    at,
  );
  const sharing = renderHomeownerReport(snap);
  assert.match(sharing, /FICTIONAL PRACTICE RECORDS/);
  assert.doesNotMatch(sharing, /313337|313,337|PRIVATE|Your financial choices/);
  const privateReport = renderHomeownerReport(snap, true);
  assert.match(privateReport, /Your financial choices/);
  assert.match(privateReport, /313337/);
  assert.match(privateReport, /&lt;script&gt;PRIVATE\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(privateReport, /<script|<img|<iframe|src="https?:/);
  assert.match(privateReport, /default-src 'none'/);
  assert.match(privateReport, /@media print/);
  assert.match(privateReport, /cannot revoke copies/);
});
