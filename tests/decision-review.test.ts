import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCmaEvidence, compareCmaDecisions } from '../src/lib/decision-review';
import { calculateCma, defaultAssumptions, DEMO_AS_OF } from '../src/lib/analytics';
import type { Source, ValuationProperty } from '../src/lib/types';

const subject: ValuationProperty = {
  id: 'subject', address: 'Example subject', city: 'Test', state: 'VA', zip: '22201',
  lat: 38.88, lng: -77.1, beds: 3, baths: 2, sqft: 2000, condition: 3,
  status: 'active', sourceId: 'synthetic',
};
const sold = (id: string, overrides: Partial<ValuationProperty> = {}): ValuationProperty => ({
  ...subject, id, address: id, status: 'sold', soldAt: '2026-10-01T12:00:00Z',
  soldPrice: 600000, sqft: 1900, sourceId: 'synthetic', ...overrides,
});
const source: Source = {
  id: 'synthetic', label: 'Invented examples', kind: 'synthetic', observedAt: DEMO_AS_OF,
  license: 'fixture', confidence: 1,
};
test('evidence review refuses to imply that fictional valuations are validated', () => {
  const result = calculateCma(subject, [sold('a')], {}, DEMO_AS_OF);
  const assessment = assessCmaEvidence(result, [source]);
  assert.equal(assessment.status, 'illustrative');
  assert.equal(assessment.comparableCount, 1);
  assert.equal(assessment.effectiveComparableCount, 1);
  assert.ok(assessment.findings.some(item => item.label === 'Sparse sales'));
  assert.ok(assessment.findings.some(item => item.label === 'Uncalibrated range'));
});
test('stronger eligible sample remains reviewable, not claimed accurate', () => {
  const comps = [
    sold('a', { soldPrice: 595000, sqft: 2000 }),
    sold('b', { soldPrice: 600000, sqft: 2000, lat: 38.881 }),
    sold('c', { soldPrice: 605000, sqft: 2000, lat: 38.882 }),
  ];
  const licensedComps = comps.map(c => ({ ...c, sourceId: 'authorized' }));
  const cma = calculateCma({ ...subject, sourceId: 'authorized' }, licensedComps, {}, DEMO_AS_OF);
  const assessment = assessCmaEvidence(cma, [{ ...source, id: 'authorized', kind: 'licensed' }]);
  assert.equal(assessment.status, 'reviewable');
  assert.ok(assessment.findings.some(item => item.label === 'Unmodeled market factors'));
  assert.ok(!assessment.findings.some(item => item.label === 'Demonstration evidence'));
});
test('missing source provenance stays limited; concentration and spread are disclosed', () => {
  const cma = calculateCma(subject, [
    sold('a', { soldPrice: 400000, lat: 38.88001 }),
    sold('b', { soldPrice: 720000, lat: 38.90 }),
  ], {}, DEMO_AS_OF);
  const quality = assessCmaEvidence(cma, []);
  assert.equal(quality.status, 'limited');
  assert.ok(quality.adjustedSpreadPercent > 20);
  assert.ok(quality.findings.some(item => item.label === 'Source identification incomplete'));
  assert.ok(quality.findings.some(item => item.label === 'Wide adjusted range'));
});
test('same decision inputs produce no observed change', () => {
  const a = calculateCma(subject, [sold('a'), sold('b', { lat: 38.881 })], defaultAssumptions, DEMO_AS_OF);
  const diff = compareCmaDecisions(a, structuredClone(a));
  assert.equal(diff.sameCalculation, true);
  assert.equal(diff.estimateChange, 0);
  assert.deepEqual(diff.addedSales, []);
  assert.deepEqual(diff.revisedSharedSales, []);
  assert.equal(diff.subjectFactsChanged, false);
});
test('decision comparison distinguishes changes in sales, assumptions, and subject facts', () => {
  const a = calculateCma(subject, [sold('a')], {}, DEMO_AS_OF);
  const b = calculateCma({ ...subject, sqft: 2050 }, [sold('b')], { sqftRate: 120 }, DEMO_AS_OF);
  const diff = compareCmaDecisions(a, b);
  assert.deepEqual(diff.addedSales, ['b']);
  assert.deepEqual(diff.removedSales, ['a']);
  assert.equal(diff.subjectFactsChanged, true);
  assert.deepEqual(diff.assumptionChanges.map(c => c.label), ['Living-area rate']);
  assert.equal(diff.inputComparisonAvailable, true);
});
test('revised facts and changed calculation time are reported without claiming causation', () => {
  const a = calculateCma(subject, [sold('a')], {}, DEMO_AS_OF);
  const b = calculateCma(subject, [sold('a', { soldPrice: 630000 })], {}, '2026-10-16T12:00:00Z');
  const diff = compareCmaDecisions(a, b);
  assert.deepEqual(diff.revisedSharedSales, ['a']);
  assert.equal(diff.analysisDateChanged, true);
  assert.equal(diff.algorithmChanged, false);
  assert.throws(() => compareCmaDecisions(a, calculateCma({ ...subject, id: 'other' }, [sold('a')], {}, DEMO_AS_OF)), /same subject/);
});
test('older snapshots without archived input disclose the missing comparison', () => {
  const a = calculateCma(subject, [sold('a')], {}, DEMO_AS_OF);
  const legacy = structuredClone(a);
  delete legacy.inputSnapshot;
  const diff = compareCmaDecisions(legacy, a);
  assert.equal(diff.inputComparisonAvailable, false);
  assert.equal(diff.subjectFactsChanged, null);
});
