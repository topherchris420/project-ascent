import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCma } from '../src/lib/analytics';
import { decisionDrivers, summarizeDrivers, DRIVER_STEPS } from '../src/lib/decision-drivers';
import { searchThresholds, sellerPlan, thresholdNote } from '../src/lib/seller-plan';
import { calculateDemo, defaultDemoState } from '../src/lib/demo-studio';
import { sampleCandidates, sampleSubject, SAMPLE_AS_OF } from '../src/lib/pricing-sample';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const baseline = () => calculateDemo(structuredClone(defaultDemoState));

test('each driver row is the exact one-input recalculation, holding the frozen evidence fixed', () => {
  const result = baseline(),
    frozen = JSON.stringify(result);
  const drivers = decisionDrivers(result);
  assert.ok(drivers.length >= 8);
  const sqft = drivers.find(d => d.key === 'sqftRate')!;
  const lowerRate = Math.round(result.assumptions.sqftRate * (1 - DRIVER_STEPS.ratePercent / 100));
  const expected = calculateCma(
    sampleSubject,
    result.inputSnapshot!.candidates,
    { ...result.assumptions, sqftRate: lowerRate },
    result.asOf,
  );
  assert.equal(sqft.lower.setting, lowerRate);
  assert.equal(sqft.lower.estimate, expected.estimate);
  assert.equal(sqft.lower.change, expected.estimate - result.estimate);
  const condition = drivers.find(d => d.key === 'subjectCondition')!;
  const better = calculateCma(
    { ...sampleSubject, condition: 5 },
    result.inputSnapshot!.candidates,
    result.assumptions,
    result.asOf,
  );
  assert.equal(condition.higher.estimate, better.estimate);
  assert.equal(condition.swing, Math.max(Math.abs(condition.lower.change!), Math.abs(condition.higher.change!)));
  // Sorted by dependency, largest first among calculable rows.
  const calculable = drivers.filter(d => !d.unavailable);
  for (let i = 1; i < calculable.length; i++) assert.ok(calculable[i - 1].swing >= calculable[i].swing);
  assert.equal(JSON.stringify(result), frozen);
});

test('drivers respect manual exclusions and never invent a condition score when condition is disabled', () => {
  const withoutCondition = calculateCma(
    sampleSubject,
    sampleCandidates.filter(p => p.id !== 'landing-c1'),
    { ...defaultDemoState.assumptions, conditionValue: 0 },
    SAMPLE_AS_OF,
  );
  const drivers = decisionDrivers(withoutCondition);
  assert.ok(!drivers.some(d => d.key === 'conditionValue' || d.key === 'subjectCondition'));
  for (const d of drivers) assert.ok(d.lower.comparables <= 5 && d.higher.comparables <= 6);
  assert.deepEqual(decisionDrivers({ ...withoutCondition, inputSnapshot: undefined }), []);
});

test('a filter that leaves no eligible sale is reported as unavailable rather than a zero change', () => {
  const single = calculateCma(sampleSubject, [sampleCandidates[0]], defaultDemoState.assumptions, SAMPLE_AS_OF);
  const radius = calculateCma(
    sampleSubject,
    sampleCandidates,
    { ...defaultDemoState.assumptions, maxDistanceMiles: 0.2 },
    SAMPLE_AS_OF,
  );
  const drivers = decisionDrivers(radius);
  const narrow = drivers.find(d => d.key === 'maxDistanceMiles')!;
  assert.equal(narrow.lower.estimate, null);
  assert.equal(narrow.unavailable, true);
  assert.equal(drivers[0].unavailable, true);
  const summary = summarizeDrivers(drivers, money);
  assert.match(summary, /leaves no eligible sale/);
  assert.doesNotMatch(summary, /likely|predict|will sell|probability/i);
  assert.ok(decisionDrivers(single).length > 0);
});

test('search thresholds follow the disclosed step bands, including the $1M boundary', () => {
  assert.deepEqual(searchThresholds(963000), {
    below: 950000,
    above: 975000,
    overBelow: 13000,
    underAbove: 12000,
    step: 25000,
  });
  assert.equal(searchThresholds(1000000).below, 975000);
  assert.equal(searchThresholds(1008000).below, 1000000);
  assert.equal(searchThresholds(2050000).step, 100000);
  assert.match(thresholdNote(1004900, money), /above the \$1,000,000 threshold/);
  assert.match(thresholdNote(999000, money), /under the \$1,000,000 threshold/);
  assert.match(thresholdNote(975000, money), /exactly on a common search threshold/);
  assert.equal(thresholdNote(962000, money), '');
});

test('seller plan arithmetic: a credit nets exactly the percentage cost less than an equal reduction', () => {
  const result = baseline();
  const costs = { commissionPercent: 2.5, closingPercent: 1, concessions: 5000 };
  const plan = sellerPlan(result, 989000, costs, 300000);
  const reduction = plan.rows.find(r => r.key === 'reduction')!;
  const credit = plan.rows.find(r => r.key === 'credit')!;
  assert.equal(reduction.price, 975000);
  assert.equal(credit.credit, 14000);
  assert.equal(plan.creditPenalty, Math.round(14000 * 0.035));
  assert.equal(reduction.netBeforePayoff - credit.netBeforePayoff, plan.creditPenalty);
  assert.equal(reduction.netBeforePayoff, Math.round(975000 * 0.965) - 5000);
  assert.equal(reduction.netAfterPayoff, reduction.netBeforePayoff - 300000);
  assert.equal(reduction.sellingCosts, Math.round(975000 * 0.035));
  assert.deepEqual(
    plan.rows.slice(0, 3).map(r => r.price),
    [result.strategies.conservative, result.strategies.moderate, result.strategies.aggressive],
  );
  // A selected price that is not a strategy anchor appears as its own row.
  assert.ok(plan.rows.some(r => r.key === 'selected' && r.price === 989000));
  assert.doesNotMatch(JSON.stringify(plan), /days on market|will sell|probability|likely to/i);
});
