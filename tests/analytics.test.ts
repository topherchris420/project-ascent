import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisionGraph, calculateCma, compareOffers, defaultAssumptions, DEMO_AS_OF, detectMarketChanges, distanceMiles, evaluateOutcomes, simulatePricing, summarizeMarket } from '../src/lib/analytics';
import { createDemoWorkspace } from '../src/lib/seed';
import type { CmaRecord, Offer, Outcome, Property, ValuationProperty } from '../src/lib/types';

function fixtureProperty(overrides: Partial<Property> = {}): Property {
  return { id: 'subject', address: 'Synthetic test home', city: 'Fictional', state: 'TX', zip: '00000', lat: 30, lng: -97,
    beds: 3, baths: 2, sqft: 2000, lotSqft: 6000, yearBuilt: 2000, condition: 3, status: 'active', price: 360000,
    listedAt: '2026-09-01T12:00:00.000Z', dom: 44, sourceId: 'source-test', description: 'Synthetic unit-test fixture.', history: [], ...overrides };
}
function closed(overrides: Partial<Property> = {}): Property {
  return fixtureProperty({ id: 'comp', status: 'sold', soldAt: '2026-10-01T12:00:00.000Z', soldPrice: 300000, sqft: 1800, beds: 2, baths: 1, condition: 2, ...overrides });
}
const frozen = DEMO_AS_OF;

test('CMA computes subject-minus-comp adjustment signs and a manually reproducible value', () => {
  const result = calculateCma(fixtureProperty(), [closed()], {}, frozen);
  assert.deepEqual(result.comps[0].adjustments.map((item) => item.amount), [22000, 12000, 15000, 14000, 0]);
  assert.equal(result.comps[0].netAdjustment, 63000);
  assert.equal(result.comps[0].grossAdjustment, 63000);
  assert.equal(result.comps[0].adjustedPrice, 363000);
  assert.equal(result.estimate, 363000);
  assert.equal(result.low, 363000);
  assert.equal(result.high, 363000);
  assert.equal(result.comps[0].weight, 1);
  assert.ok(result.warnings.some((warning) => warning.includes('Fewer than three')));
  assert.ok(result.warnings.some((warning) => warning.includes('not a statistical confidence interval')));
});

test('superior comparables receive negative adjustments; gross is absolute, not net', () => {
  const result = calculateCma(fixtureProperty(), [closed({ sqft: 2200, beds: 4, baths: 3, condition: 4, soldPrice: 430000 })], {}, frozen);
  assert.equal(result.comps[0].netAdjustment, -63000);
  assert.equal(result.comps[0].grossAdjustment, 63000);
  assert.equal(result.estimate, 367000);
});

test('comparison weights normalize, estimates remain within the observed envelope, input order does not change the checksum', () => {
  const a = closed({ id: 'a' }), b = closed({ id: 'b', lat: 30.004, sqft: 2200, beds: 4, baths: 3, condition: 4, soldPrice: 430000 });
  const result = calculateCma(fixtureProperty(), [a, b], {}, frozen);
  assert.ok(Math.abs(result.comps.reduce((sum, comp) => sum + comp.weight, 0) - 1) < 1e-12);
  assert.ok(result.estimate >= result.low && result.estimate <= result.high);
  assert.equal(result.calculationHash, calculateCma(fixtureProperty(), [b, a], {}, frozen).calculationHash);
  assert.notEqual(result.calculationHash, calculateCma(fixtureProperty(), [a, b], { sqftRate: 111 }, frozen).calculationHash);
  assert.equal(a.sqft, 1800);
});

test('CMA excludes non-closed, future, stale, distant, oversized, and incomplete sales with specific evidence', () => {
  const candidates = [
    closed({ id: 'valid' }), closed({ id: 'active', status: 'active' }), closed({ id: 'future', soldAt: '2026-10-16T12:00:00.000Z' }),
    closed({ id: 'stale', soldAt: '2025-01-01T12:00:00.000Z' }), closed({ id: 'far', lat: 35 }),
    closed({ id: 'large', sqft: 4000 }), closed({ id: 'missing-price', soldPrice: undefined }), closed({ id: 'invalid', lat: NaN }),
  ];
  const result = calculateCma(fixtureProperty(), candidates, {}, frozen);
  assert.deepEqual(result.comps.map((comp) => comp.propertyId), ['valid']);
  assert.equal(result.excluded.length, 7);
  assert.match(result.excluded.find((item) => item.propertyId === 'future')!.reason, /look-ahead/);
  assert.match(result.excluded.find((item) => item.propertyId === 'far')!.reason, /radius/);
});

test('CMA fails cleanly when no usable sales exist, invalid assumptions are supplied, or IDs are duplicated', () => {
  assert.throws(() => calculateCma(fixtureProperty(), []), /No eligible closed comparables/);
  assert.throws(() => calculateCma(fixtureProperty(), [closed()], { sqftRate: -1 }), /sqftRate/);
  assert.throws(() => calculateCma(fixtureProperty(), [closed()], { maxSizeRatio: 0.9 }), /maxSizeRatio/);
  assert.throws(() => calculateCma(fixtureProperty(), [closed()], { monthlyTrend: -1 }), /monthlyTrend/);
  assert.throws(() => calculateCma(fixtureProperty({ sqft: 0 }), [closed()]), /greater than zero/);
  assert.throws(() => calculateCma(fixtureProperty(), [closed(), closed()]), /Duplicate comparable ID/);
});

test('time adjustment compounds an explicit monthly assumption from the closing date', () => {
  const comp = closed({ sqft: 2000, beds: 3, baths: 2, condition: 3, soldPrice: 300000, soldAt: '2026-09-15T12:00:00.000Z' });
  const result = calculateCma(fixtureProperty(), [comp], { monthlyTrend: 0.01 }, frozen);
  const expected = Number((300000 * (Math.pow(1.01, 30 / 30.4375) - 1)).toFixed(2));
  assert.equal(result.comps[0].adjustments.find((adjustment) => adjustment.factor === 'Time')!.amount, expected);
  assert.ok(result.warnings.some((warning) => warning.includes('non-zero time trend')));
});

test('geographic calculation handles identical coordinates and a known angular distance', () => {
  assert.equal(distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  assert.ok(Math.abs(distanceMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 69.0934) < 0.001);
});

test('market calculation separates snapshot inventory from trailing-90-day closings', () => {
  const demo = createDemoWorkspace(), market = summarizeMarket(demo.properties, frozen);
  assert.equal(market.active, 3); assert.equal(market.sold, 5); assert.equal(market.pending, 1); assert.equal(market.withdrawn, 1);
  assert.equal(market.monthsSupply, 1.8); assert.equal(market.absorption, 55.56); assert.equal(market.medianPrice, 749000); assert.equal(market.medianDom, 56);
  assert.equal(market.priceReductions, 4, 'A closing-price discount is not an asking-price reduction.');
  assert.ok(market.warnings.some((warning) => warning.includes('not complete regional')));
  const empty = summarizeMarket([], frozen);
  assert.equal(empty.monthsSupply, null); assert.equal(empty.absorption, null); assert.equal(empty.sampleSize, 0);
});

test('price-reduction count ignores future events and counts affected listings once', () => {
  const property = fixtureProperty({ history: [
    { date: '2026-09-01', event: 'Listed', price: 400000 }, { date: '2026-09-10', event: 'Reduction', price: 390000 },
    { date: '2026-09-20', event: 'Reduction', price: 380000 }, { date: '2026-11-01', event: 'Future reduction', price: 370000 },
  ] });
  assert.equal(summarizeMarket([property], frozen).priceReductions, 1);
  assert.equal(summarizeMarket([closed({ history: [{ date: '2026-09-01', event: 'Listed', price: 320000 }, { date: '2026-10-01T12:00:00.000Z', event: 'Closed sale', price: 300000 }] })], frozen).priceReductions, 0);
});

test('pricing scenario computes net using entered assumptions without invented sale predictions', () => {
  const cma = calculateCma(fixtureProperty(), [closed()], {}, frozen);
  const scenario = simulatePricing(cma, 400000, { commissionPercent: 2, closingPercent: 1, concessions: 5000 });
  assert.equal(scenario.estimatedNet, 383000); assert.equal(scenario.difference, 37000);
  assert.equal(scenario.position, 'Above observed adjusted-comp range');
  assert.ok(scenario.evidenceIds.includes('comp'));
  assert.ok(scenario.warnings.some((warning) => warning.includes('does not predict')));
  assert.throws(() => simulatePricing(cma, -1), /List price/);
  assert.throws(() => simulatePricing(cma, 400000, { commissionPercent: 90, closingPercent: 20 }), /100/);
});

test('offer comparisons show actual contractual arithmetic, expiration, and financing cautions', () => {
  const offers = createDemoWorkspace().offers;
  const comparison = compareOffers(offers, frozen);
  assert.deepEqual(comparison.rows.map((row) => row.netBeforeCosts), [730000, 722000, 734000]);
  assert.equal(comparison.rows[0].daysToClose, 36);
  assert.equal(comparison.rows[1].earnestPercent, 3.05);
  assert.equal(comparison.rows[0].expired, false);
  assert.ok(comparison.rows[1].cautions.some((caution) => caution.includes('proof of funds')));
  const expired: Offer = { ...offers[0], expiresAt: '2026-10-14T12:00:00.000Z' };
  assert.equal(compareOffers([expired], frozen).rows[0].expired, true);
  assert.throws(() => compareOffers([{ ...expired, sellerCredit: 999999 }], frozen), /inconsistent/);
  assert.ok(comparison.warnings.some((warning) => warning.includes('explicit professional approval')));
});

test('graph has provenance, temporal events, all workflow connections, and no dangling edges', () => {
  const workspace = createDemoWorkspace(), graph = buildDecisionGraph(workspace);
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.equal(ids.size, graph.nodes.length);
  for (const edge of graph.edges) { assert.ok(ids.has(edge.from), edge.from); assert.ok(ids.has(edge.to), edge.to); }
  for (const type of ['source', 'property', 'listing-event', 'client', 'interaction', 'valuation', 'offer', 'transaction', 'milestone', 'outcome']) assert.ok(graph.nodes.some((node) => node.type === type), type);
  assert.ok(graph.nodes.find((node) => node.id === 'property-01:event:0')?.validTo);
  assert.ok(graph.edges.some((edge) => edge.relation === 'uses_comparable'));
  assert.ok(graph.nodes.filter((node) => node.type === 'source').every((node) => node.label.includes('demonstration') || node.label.includes('fictional')));
});

test('monitor suppresses within-envelope price noise, explains evidence departures, and deduplicates repeated events', () => {
  const previous = createDemoWorkspace(), current = structuredClone(previous);
  const cma = current.cmas.find((record) => record.id === 'cma-01')!.result;
  current.properties[0].price = cma.estimate;
  assert.equal(detectMarketChanges(previous, current).length, 0);
  current.properties[0].price = cma.high + 10000;
  const alerts = detectMarketChanges(previous, current);
  assert.equal(alerts.length, 1); assert.match(alerts[0].explanation, /not a confidence interval/);
  assert.deepEqual(alerts[0].sourceIds, ['source-synthetic-properties']);
  current.alerts.push(...alerts);
  assert.equal(detectMarketChanges(previous, current).length, 0);
});

test('monitor detects documented status transitions and non-overlapping recomputed evidence ranges', () => {
  const previous = createDemoWorkspace(), current = structuredClone(previous);
  current.properties[8].status = 'withdrawn';
  const prior = current.cmas.find((record) => record.id === 'cma-01')!;
  current.cmas.push({ ...prior, id: 'cma-next', result: { ...prior.result, low: prior.result.high + 10000, high: prior.result.high + 20000, calculationHash: 'changed-inputs' } });
  const alerts = detectMarketChanges(previous, current);
  assert.equal(alerts.length, 2);
  assert.ok(alerts.some((alert) => alert.title.includes('status')));
  assert.ok(alerts.some((alert) => alert.title.includes('no longer overlap')));
});

test('retrospective evaluation reports arithmetic errors and empirical coverage, rejects leakage and duplicate outcomes', () => {
  const base = calculateCma(fixtureProperty(), [closed()], {}, '2026-10-02T12:00:00.000Z');
  const cma: CmaRecord = { id: 'forecast', name: 'Test frozen forecast', propertyId: 'subject', createdAt: '2026-10-02T12:00:00.000Z', result: base };
  const outcome: Outcome = { id: 'observed', propertyId: 'subject', cmaId: 'forecast', forecastAt: cma.createdAt, observedAt: frozen, actualPrice: 360000, notes: 'Synthetic test only.' };
  const result = evaluateOutcomes([cma], [outcome, { ...outcome, id: 'duplicate' }, { ...outcome, id: 'late', forecastAt: '2026-10-16T12:00:00.000Z' }, { ...outcome, id: 'wrong-property', propertyId: 'other' }]);
  assert.equal(result.count, 1); assert.equal(result.meanAbsoluteError, 3000); assert.equal(result.meanSignedError, 3000); assert.equal(result.rootMeanSquaredError, 3000);
  assert.equal(result.meanAbsolutePercentError, 0.8333); assert.equal(result.empiricalRangeCoverage, 0); assert.equal(result.excluded.length, 3);
  assert.ok(result.warnings.some((warning) => warning.includes('selection and survivorship bias')));
  const missing = evaluateOutcomes([], [outcome]);
  assert.equal(missing.meanAbsoluteError, null); assert.equal(missing.count, 0);
});

test('demonstration fixture is deterministic, isolated, coherent and openly synthetic', () => {
  const first = createDemoWorkspace(), second = createDemoWorkspace();
  assert.deepEqual(first, second); assert.equal(first.mode, 'demo'); assert.equal(first.asOf, frozen); assert.equal(first.properties.length, 12);
  assert.ok(first.properties.every((property) => property.description.includes('SYNTHETIC DEMO ONLY')));
  assert.ok(first.sources.every((source) => source.kind === 'synthetic'));
  assert.ok(first.clients.every((client) => client.email.endsWith('@example.com')));
  assert.equal(evaluateOutcomes(first.cmas, first.outcomes).count, 1);
  const current = first.cmas.find((cma) => cma.id === 'cma-01')!.result;
  assert.equal(current.calculationHash, calculateCma(first.properties[0], first.properties, defaultAssumptions, frozen).calculationHash);
  assert.equal(current.comps.length, 7);
});

test('every frozen CMA can be reproduced from its archived inputs after current records change', () => {
  const workspace = createDemoWorkspace();
  workspace.properties[0].sqft += 1000;
  for (const record of workspace.cmas) {
    const snapshot = record.result.inputSnapshot!;
    assert.ok(snapshot, 'Raw input snapshot is retained.');
    const reproduced = calculateCma(snapshot.subject, snapshot.candidates, record.result.assumptions, record.result.asOf);
    assert.deepEqual(reproduced, record.result);
  }
  for (const record of JSON.parse(JSON.stringify(workspace)).cmas as CmaRecord[]) {
    const snapshot = record.result.inputSnapshot!;
    const reproduced = calculateCma(snapshot.subject, snapshot.candidates, record.result.assumptions, record.result.asOf);
    assert.equal(reproduced.calculationHash, record.result.calculationHash, 'JSON persistence preserves checksum reproducibility.');
  }
});

test('counterfactual price sensitivity is monotonic arithmetic and does not mutate frozen evidence', () => {
  const workspace = createDemoWorkspace(), cma = workspace.cmas.find((record) => record.id === 'cma-01')!.result;
  const original = structuredClone(cma);
  const lower = simulatePricing(cma, 725000, { commissionPercent: 2.5, closingPercent: 1 });
  const upper = simulatePricing(cma, 749000, { commissionPercent: 2.5, closingPercent: 1 });
  assert.equal(upper.estimatedNet - lower.estimatedNet, 23160);
  assert.equal(upper.difference - lower.difference, 24000);
  assert.deepEqual(lower.evidenceIds, upper.evidenceIds);
  assert.deepEqual(cma, original);
  assert.equal('saleProbability' in upper, false);
  assert.equal('predictedDaysOnMarket' in upper, false);
});

test('monitor thresholds are the actual evidence envelope boundaries, not arbitrary percentage changes', () => {
  const previous = createDemoWorkspace(), current = structuredClone(previous);
  const cma = current.cmas.find((record) => record.id === 'cma-01')!.result;
  current.properties[0].price = cma.high;
  assert.equal(detectMarketChanges(previous, current).length, 0, 'At the evidence boundary is still within range.');
  current.properties[0].price = cma.high + 1;
  assert.equal(detectMarketChanges(previous, current).length, 1, 'Outside the empirical envelope is reviewable, without predicting a price effect.');
  const record = current.cmas.find((item) => item.id === 'cma-01')!;
  record.result.low = cma.high;
  record.result.high = cma.high + 100;
  current.properties[0].price = previous.properties[0].price;
  assert.equal(detectMarketChanges(previous, current).length, 0, 'Touching intervals still overlap.');
});

test('minimal provider facts require explicit condition omission and never manufacture listing dates, DOM or condition', () => {
  const subject: ValuationProperty = { id: 'minimal-subject', address: 'Synthetic minimal subject', city: 'Fictional', state: 'TX', zip: '00000', lat: 30, lng: -97, beds: 3, baths: 2, sqft: 2000, sourceId: 'synthetic-minimal-source' };
  const comp: ValuationProperty = { ...subject, id: 'recorded-sale', beds: 2, baths: 1, sqft: 1800, status: 'sold', soldPrice: 300000, soldAt: '2026-10-01T12:00:00.000Z' };
  assert.throws(() => calculateCma(subject, [comp], {}, frozen), /condition/);
  const result = calculateCma(subject, [comp], { conditionValue: 0 }, frozen);
  assert.equal(result.version, 'ascent-cma-1.1'); assert.equal(result.estimate, 349000);
  assert.ok(!result.comps[0].adjustments.some((adjustment) => adjustment.factor === 'Condition'));
  assert.ok(result.warnings.some((warning) => warning.includes('explicitly disabled')));
  assert.equal(result.inputSnapshot!.subject.condition, undefined); assert.equal(result.inputSnapshot!.subject.listedAt, undefined); assert.equal(result.inputSnapshot!.subject.dom, undefined);
  assert.equal(result.inputSnapshot!.subject.price, undefined);
  const archived = JSON.parse(JSON.stringify(result)) as typeof result;
  assert.equal(calculateCma(archived.inputSnapshot!.subject, archived.inputSnapshot!.candidates, archived.assumptions, archived.asOf).calculationHash, result.calculationHash);
});

test('minimal CMA does not use active asking prices, AVM-style values or future recorded sales as closings', () => {
  const base = fixtureProperty({ condition: 3 });
  const candidates: ValuationProperty[] = [
    { ...base, id: 'active-ask', status: 'active', price: 500000 },
    { ...base, id: 'avm-not-sale', status: undefined, price: 500000 },
    { ...base, id: 'future-recorded', status: 'sold', soldPrice: 500000, soldAt: '2027-01-01T00:00:00.000Z' },
  ];
  assert.throws(() => calculateCma(base, candidates, { conditionValue: 0 }, frozen), /No eligible closed comparables/);
});
