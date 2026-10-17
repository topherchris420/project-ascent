import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCma, replayCma, simulatePricing, calculationChecksum } from '../src/lib/analytics';
import { explainDecisionDelta, comparableSensitivity } from '../src/lib/pricing-exploration';
import { calculateDemo, defaultDemoState, demoCosts, demoReportHref } from '../src/lib/demo-studio';
import { sampleCandidates, sampleSubject, SAMPLE_AS_OF, sampleSources } from '../src/lib/pricing-sample';
import { GET } from '../src/app/api/demo/report/route';
import { assessCmaEvidence } from '../src/lib/decision-review';
import { explainPricing } from '../src/lib/pricing-narrative';

const baseline = () => calculateDemo(structuredClone(defaultDemoState));
test('narration at the high anchor is above the estimate, without ungrounded timing claims or invented DOM', () => {
  const result = baseline();
  const lookup = (id: string) => sampleCandidates.find(p => p.id === id);
  const high = explainPricing(result, result.high, sampleCandidates, lookup);
  assert.match(high.headline, /above the weighted estimate/);
  assert.doesNotMatch(JSON.stringify(high), /NaN|quickest|longer market time|fast attention|draw buyers early/);
  assert.ok(high.points.some(p => p.includes('Days on market are unavailable')));
  const below = explainPricing(result, result.low - 10000, sampleCandidates, lookup);
  assert.match(below.headline, /does not establish buyer response/);
});
const reconcile = (before: ReturnType<typeof baseline>, after: ReturnType<typeof baseline>) => {
  const delta = explainDecisionDelta(before, after);
  assert.ok(
    Math.abs(delta.rows.reduce((sum, r) => sum + r.total, 0) + delta.rounding - (after.estimate - before.estimate)) <
      0.000001,
  );
  return delta;
};
test('arithmetic bridge reconciles sale additions, removals, value revisions and changing weights to the cent', () => {
  const before = baseline();
  const after = calculateCma(
    { ...sampleSubject, sqft: 2250 },
    sampleCandidates
      .filter(p => p.id !== 'landing-c1')
      .map(p => (p.id === 'landing-c2' ? { ...p, soldPrice: 960000 } : p)),
    { ...before.assumptions, maxAgeDays: 365, sqftRate: 150 },
    SAMPLE_AS_OF,
  );
  const delta = reconcile(before, after);
  assert.equal(delta.rows.find(r => r.propertyId === 'landing-c1')?.kind, 'removed');
  assert.equal(delta.rows.find(r => r.propertyId === 'landing-c7')?.kind, 'added');
  assert.ok(delta.rows.some(r => r.adjustedValueEffect !== 0));
  assert.ok(delta.rows.some(r => r.weightAndEligibilityEffect !== 0));
  assert.equal(replayCma({ result: before }).reproduced, true);
});
test('golden attribution: two equally weighted sales, a price revision and a new median anchor', () => {
  const original = baseline();
  const before = {
    ...original,
    estimate: 600000,
    comps: [
      { ...original.comps[0], propertyId: 'a', adjustedPrice: 500000, weight: 0.5 },
      { ...original.comps[0], propertyId: 'b', adjustedPrice: 700000, weight: 0.5 },
    ],
  };
  const after = {
    ...before,
    estimate: 650000,
    comps: [{ ...before.comps[0], adjustedPrice: 600000 }, { ...before.comps[1] }],
  };
  const delta = reconcile(before, after);
  assert.equal(delta.rows[0].adjustedValueEffect, 50000);
  assert.equal(delta.rows[0].weightAndEligibilityEffect, 0);
  assert.equal(delta.rounding, 0);
});
test('identical evidence has zero attribution; comparing different subjects is rejected', () => {
  const a = baseline();
  assert.ok(reconcile(a, structuredClone(a)).rows.every(r => r.total === 0));
  assert.throws(() => explainDecisionDelta(a, { ...a, subjectId: 'another-tenant-property' }), /same subject/);
});
test('sensitivity recomputes the exact leave-one-out calculation without mutating the archived decision', () => {
  const a = baseline(),
    frozen = JSON.stringify(a);
  const rows = comparableSensitivity(a);
  assert.equal(rows.length, 6);
  for (const row of rows) {
    const actual = calculateCma(
      sampleSubject,
      a.inputSnapshot!.candidates.filter(p => p.id !== row.propertyId),
      a.assumptions,
      a.asOf,
    );
    assert.equal(row.estimate, actual.estimate);
    assert.equal(row.difference, actual.estimate - a.estimate);
  }
  assert.equal(JSON.stringify(a), frozen);
  const single = calculateCma(sampleSubject, [sampleCandidates[0]], a.assumptions, a.asOf);
  assert.equal(comparableSensitivity(single)[0].estimate, null);
});
test('public report uses only fictional fixture inputs and carries chosen price, costs and exclusion rationale', async () => {
  const state = {
    ...structuredClone(defaultDemoState),
    listPrice: 990000,
    concessions: 10000,
    payoff: 300000,
    exclusions: [{ id: 'landing-c1', reason: 'Condition needs inspection <script>unsafe()</script>' }],
  };
  const res = await GET(
    new Request(`http://localhost:3040${demoReportHref(state)}`, {
      headers: { cookie: 'ascent_session=unrelated-private-tenant' },
    }),
  );
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /FICTIONAL DEMONSTRATION DATA/);
  assert.match(html, /\$990,000/);
  assert.match(html, /\$645,350/);
  assert.match(html, /Condition needs inspection &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|unrelated-private-tenant/);
  assert.match(res.headers.get('Content-Security-Policy')!, /default-src 'none'/);
});
test('portable practice decision replays exactly and preserves hypothetical assumptions separately', async () => {
  const state = { ...structuredClone(defaultDemoState), listPrice: 989700, payoff: 250000 };
  const res = await GET(new Request(`http://localhost:3040${demoReportHref(state, 'json')}`));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.mode, 'fictional-demonstration');
  assert.equal(json.scenario.listPrice, 989700);
  assert.equal(replayCma(json.record).reproduced, true);
  assert.equal(simulatePricing(json.record.result, 989700, demoCosts(state)).estimatedNet - state.payoff, 705061);
});
test('public endpoint rejects foreign records, arbitrary source bodies, oversize and invalid/no-evidence scenarios', async () => {
  const variants = [
    { ...defaultDemoState, exclusions: [{ id: 'private-provider-record', reason: 'Try foreign ID' }] },
    { ...defaultDemoState, property: sampleSubject },
    { ...defaultDemoState, assumptions: { ...defaultDemoState.assumptions, maxAgeDays: 0 } },
    { ...defaultDemoState, assumptions: { ...defaultDemoState.assumptions, maxAgeDays: 1 } },
  ];
  for (const state of variants) {
    const res = await GET(
      new Request(`http://localhost:3040/api/demo/report?state=${encodeURIComponent(JSON.stringify(state))}`),
    );
    assert.equal(res.status, 400);
    assert.doesNotMatch(await res.text(), /private-provider-record/);
  }
  assert.equal((await GET(new Request(`http://localhost/api/demo/report?state=${'x'.repeat(6001)}`))).status, 400);
});
test('source observations after an analysis and old or missing timestamps are explicit review gaps', () => {
  const a = baseline();
  for (const [observedAt, label] of [
    ['2026-10-17T00:00:00Z', 'Source observed after analysis'],
    ['2025-01-01T00:00:00Z', 'Source observation needs refresh'],
    ['invalid', 'Source timestamp missing'],
  ]) {
    assert.ok(assessCmaEvidence(a, [{ ...sampleSources[0], observedAt }]).findings.some(f => f.label === label));
  }
});

test('replay distinguishes exact, cross-runtime numerical agreement and tampering', () => {
  const archived = baseline();
  archived.comps[0].weight += Number.EPSILON;
  archived.calculationHash = calculationChecksum({ ...archived, calculationHash: '' });
  const numerical = replayCma({ result: archived });
  assert.equal(numerical.reproduced, false);
  assert.equal(numerical.numericallyEquivalent, true);
  assert.match(numerical.verdict, /checksums differ/);
  archived.comps[0].adjustedPrice += 0.01;
  archived.calculationHash = calculationChecksum({ ...archived, calculationHash: '' });
  assert.equal(replayCma({ result: archived }).numericallyEquivalent, false);
  const tampered = baseline();
  tampered.comps[0].weight += Number.EPSILON;
  assert.equal(replayCma({ result: tampered }).numericallyEquivalent, false);
});
