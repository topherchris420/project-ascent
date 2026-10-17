import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { calculateCma, DEMO_AS_OF } from '../src/lib/analytics';
import {
  assessAccuracyDrift,
  assessValuationRelease,
  engineFingerprint,
  engineIntegrity,
  benchmarkForState,
  dcBenchmark,
  kingCountyBenchmark,
  validatedAssumptions,
  valuationBenchmark,
  valuationBenchmarks,
  valuationReleaseSwitch,
} from '../src/lib/valuation-safeguards';
import { operationalHealth } from '../src/lib/operations';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { executeAction, verifyAudit } from '../src/lib/service';
import type { CmaRecord, Source, ValuationProperty } from '../src/lib/types';

process.env.SQLITE_PATH = resolve('.data', `safeguards-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
delete process.env.ASCENT_VALUATION_RELEASE;
after(async () => closeDatabase());

const subject: ValuationProperty = {
  id: 'subject',
  address: 'Subject',
  city: 'Test',
  state: 'WA',
  zip: '98101',
  lat: 47.6,
  lng: -122.3,
  beds: 3,
  baths: 2,
  sqft: 2000,
  condition: 3,
  sourceId: 'licensed',
};
const sold = (id: string, overrides: Partial<ValuationProperty> = {}): ValuationProperty => ({
  ...subject,
  id,
  address: id,
  status: 'sold',
  soldAt: '2026-10-01T12:00:00Z',
  soldPrice: 600000,
  ...overrides,
});
const licensed: Source = {
  id: 'licensed',
  label: 'Licensed feed',
  kind: 'licensed',
  observedAt: DEMO_AS_OF,
  license: 'test',
  confidence: 1,
};
const steady = [
  sold('a', { soldPrice: 598000 }),
  sold('b', { soldPrice: 600000, lat: 47.601 }),
  sold('c', { soldPrice: 603000, lat: 47.602 }),
  sold('d', { soldPrice: 601000, lng: -122.301 }),
];
const enabled = { enabled: true, reason: '' };

test('engine fingerprint is pinned to the build the published benchmark measured', () => {
  for (const benchmark of valuationBenchmarks)
    assert.equal(engineFingerprint().fingerprint, benchmark.engine.fingerprint);
  assert.equal(engineIntegrity().passed, true);
});

test('well-supported valuations release; the decision never alters the estimate', () => {
  const result = calculateCma(subject, steady, {}, DEMO_AS_OF);
  const before = structuredClone(result);
  const assessment = assessValuationRelease(result, { sources: [licensed], release: enabled });
  assert.equal(assessment.decision, 'release', assessment.summary);
  assert.deepEqual(result, before);
  assert.ok(assessment.checks.some(check => check.id === 'measured-accuracy' && check.status === 'context'));
  // A King County subject is referenced against King County, never against another market's figures.
  assert.equal(assessment.reference?.reportDigest, kingCountyBenchmark.reportDigest);
});

// Recorded-sale shape near Capitol Hill; numbers are invented for the test, the location rule is what matters.
const dcSubject: ValuationProperty = { ...subject, state: 'DC', zip: '20003', lat: 38.886, lng: -76.996, condition: 4 };
const dcComps = [600, 625, 640, 655, 610].map((thousands, i): ValuationProperty => ({
  ...dcSubject,
  id: `dc-${i}`,
  address: `dc-${i}`,
  lat: dcSubject.lat + i * 0.001,
  status: 'sold',
  soldAt: '2026-09-15T12:00:00Z',
  soldPrice: thousands * 1000,
}));

test('DC is the home market: DC subjects on the validated configuration get the calibrated interval', () => {
  assert.equal(valuationBenchmark, dcBenchmark);
  assert.equal(benchmarkForState('dc'), dcBenchmark);
  assert.equal(benchmarkForState('VA'), null);
  const result = calculateCma(dcSubject, dcComps, validatedAssumptions(dcBenchmark), DEMO_AS_OF);
  const assessment = assessValuationRelease(result, { sources: [licensed], release: enabled });
  const interval = assessment.calibratedInterval!;
  const tier = dcBenchmark.tiers.find(item => result.comps.length <= (item.maxComps ?? Infinity))!;
  assert.equal(interval.market, 'Washington, DC');
  assert.equal(interval.tier, tier.id);
  assert.equal(interval.low, Math.round(result.estimate * Math.exp(tier.lowerLogRatio)));
  assert.equal(interval.high, Math.round(result.estimate * Math.exp(tier.upperLogRatio)));
  assert.ok(interval.low < result.estimate && result.estimate < interval.high);
  assert.match(
    assessment.checks.find(check => check.id === 'measured-accuracy')!.detail,
    /exact Washington, DC-validated/,
  );
});

test('editing any validated assumption, or leaving DC, removes the calibrated interval', () => {
  const edited = calculateCma(
    dcSubject,
    dcComps,
    { ...validatedAssumptions(dcBenchmark), sqftRate: dcBenchmark.fittedAssumptions.sqftRate + 1 },
    DEMO_AS_OF,
  );
  const editedAssessment = assessValuationRelease(edited, { release: enabled });
  assert.equal(editedAssessment.calibratedInterval, null);
  assert.match(
    editedAssessment.checks.find(check => check.id === 'measured-accuracy')!.detail,
    /differ from the validated/,
  );

  const virginia = { ...dcSubject, state: 'VA' };
  const outside = calculateCma(virginia, dcComps, validatedAssumptions(dcBenchmark), DEMO_AS_OF);
  const outsideAssessment = assessValuationRelease(outside, { release: enabled });
  assert.equal(outsideAssessment.calibratedInterval, null);
  assert.match(
    outsideAssessment.checks.find(check => check.id === 'measured-accuracy')!.detail,
    /No published validation covers this location/,
  );
});

test('sparse, stale, disagreeing or anomalous evidence is held for named review', () => {
  const sparse = assessValuationRelease(calculateCma(subject, steady.slice(0, 2), {}, DEMO_AS_OF), {
    release: enabled,
  });
  assert.equal(sparse.decision, 'review');
  assert.equal(sparse.checks.find(check => check.id === 'comparable-count')!.status, 'review');

  const stale = assessValuationRelease(
    calculateCma(
      subject,
      steady.map(comp => ({ ...comp, soldAt: '2026-05-01T00:00:00Z' })),
      {},
      DEMO_AS_OF,
    ),
    { release: enabled },
  );
  assert.equal(stale.checks.find(check => check.id === 'freshness')!.status, 'review');

  const outlier = [...steady, sold('e', { soldPrice: 1_400_000, lat: 47.6005 })];
  const anomalous = assessValuationRelease(calculateCma(subject, outlier, {}, DEMO_AS_OF), { release: enabled });
  const flagged = anomalous.checks.find(check => check.id === 'outliers')!;
  assert.equal(flagged.status, 'review');
  assert.match(flagged.detail, /\be\b/);
  assert.equal(anomalous.checks.find(check => check.id === 'dispersion')!.status, 'review');

  // Large assumed adjustments push the estimate away from what the same sales imply per square foot.
  const divergent = assessValuationRelease(
    calculateCma(
      { ...subject, sqft: 2600 },
      steady.map(comp => ({ ...comp, sqft: 2000 })),
      { sqftRate: 600, maxSizeRatio: 1.35 },
      DEMO_AS_OF,
    ),
    { release: enabled },
  );
  assert.equal(divergent.checks.find(check => check.id === 'independent-cross-check')!.status, 'review');
});

test('the operator kill switch withholds release without disabling calculation', () => {
  assert.equal(valuationReleaseSwitch({}).enabled, true);
  const paused = valuationReleaseSwitch({
    ASCENT_VALUATION_RELEASE: 'disabled',
    ASCENT_VALUATION_RELEASE_REASON: 'Feed outage under investigation.',
  });
  assert.deepEqual(paused, { enabled: false, reason: 'Feed outage under investigation.' });
  const assessment = assessValuationRelease(calculateCma(subject, steady, {}, DEMO_AS_OF), { release: paused });
  assert.equal(assessment.decision, 'withhold');
  assert.match(assessment.summary, /operator release switch/);
});

test('an engine that no longer matches the validated build cannot borrow its accuracy claim', () => {
  const assessment = assessValuationRelease(calculateCma(subject, steady, {}, DEMO_AS_OF), {
    release: enabled,
    integrity: { passed: false, fingerprint: 'fnv1a32-00000000', expected: valuationBenchmark.engine.fingerprint },
  });
  assert.equal(assessment.decision, 'review');
  assert.match(assessment.checks.find(check => check.id === 'engine-integrity')!.detail, /do not describe this build/);
});

test('accuracy drift is assessed only with enough outcomes and flags degradation against the benchmark', () => {
  // Alternating signs give an unbiased error of the stated size; `biased` keeps every error positive.
  const samples = (count: number, size: number, biased = false) =>
    Array.from({ length: count }, (_, i) => {
      const error = biased || i % 2 ? size : -size;
      return {
        outcomeId: `o${i}`,
        cmaId: `c${i}`,
        predicted: 100 * (1 + error),
        actual: 100,
        signedError: 100 * error,
        absolutePercentError: Math.abs(error) * 100,
        inRange: true,
        evidenceIds: [],
      };
    });
  assert.equal(assessAccuracyDrift({ count: 10, samples: samples(10, 0.5) }).status, 'insufficient-outcomes');
  assert.equal(
    assessAccuracyDrift({ count: 40, samples: samples(40, valuationBenchmark.primary.mdape * 0.9) }).status,
    'within-benchmark',
  );
  const drifted = assessAccuracyDrift({ count: 40, samples: samples(40, valuationBenchmark.primary.mdape * 2 + 0.06) });
  assert.equal(drifted.status, 'degraded');
  assert.match(drifted.detail, /Re-validate/);
  assert.equal(assessAccuracyDrift({ count: 40, samples: samples(40, 0.06, true) }).status, 'degraded');
});

test('health reports storage failure as unavailable and a paused release as degraded, without leaking errors', async () => {
  const failing = await operationalHealth({
    env: {},
    probeStorage: async () => {
      throw new Error('password=hunter2 host=db.internal');
    },
  });
  assert.equal(failing.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(failing), /hunter2|db\.internal/);
  const hung = await operationalHealth({ env: {}, probeStorage: () => new Promise(() => undefined), deadlineMs: 20 });
  assert.equal(hung.checks.find(check => check.id === 'storage')!.status, 'fail');
  const paused = await operationalHealth({
    env: { ASCENT_VALUATION_RELEASE: 'disabled' },
    probeStorage: async () => 1,
  });
  assert.equal(paused.status, 'degraded');
  assert.equal(paused.checks.find(check => check.id === 'valuation-release')!.status, 'warn');
  const healthy = await operationalHealth({ env: {}, probeStorage: async () => 1 });
  assert.equal(healthy.status, 'ok', 'a published accuracy miss is disclosed, not reported as an outage');
  assert.match(healthy.checks.find(check => check.id === 'validation-evidence')!.detail, /pre-registered criteria/);
  const production = await operationalHealth({ env: { NODE_ENV: 'production' }, probeStorage: async () => 1 });
  assert.equal(production.checks.find(check => check.id === 'origin')!.status, 'fail');
});

test('approval re-runs the gate: review items need explicit acknowledgement and the kill switch blocks', async () => {
  const account = await register({
    seed: 'demo',
    name: 'Gate Owner',
    email: `${randomUUID()}@example.test`,
    password: 'private gate passphrase 1234',
  });
  const saved = (await executeAction(account.user, { type: 'saveCma', propertyId: 'property-01', name: 'Gate check' }))
    .result as CmaRecord;
  assert.ok(saved.release, 'saved analyses carry their release assessment');
  assert.equal(saved.release!.policyVersion, 'ascent-valuation-safeguards-1');

  process.env.ASCENT_VALUATION_RELEASE = 'disabled';
  try {
    await assert.rejects(
      executeAction(account.user, { type: 'approveCma', id: saved.id, acknowledgeReview: true }),
      /Withheld/,
    );
  } finally {
    delete process.env.ASCENT_VALUATION_RELEASE;
  }
  assert.equal(saved.release!.decision, 'release', saved.release!.summary);
  await executeAction(account.user, { type: 'approveCma', id: saved.id });

  // Two comparables: the gate holds the result until the approver acknowledges the named review item.
  const sparse = (
    await executeAction(account.user, {
      type: 'saveCma',
      propertyId: 'property-01',
      name: 'Sparse',
      compIds: ['property-02', 'property-03'],
    })
  ).result as CmaRecord;
  assert.equal(sparse.release!.decision, 'review');
  await assert.rejects(executeAction(account.user, { type: 'approveCma', id: sparse.id }), /Confirm you reviewed/);
  await executeAction(account.user, { type: 'approveCma', id: sparse.id, acknowledgeReview: true });
  const workspace = await getWorkspace(account.user.tenantId);
  const approved = workspace.cmas.find(cma => cma.id === sparse.id)!;
  assert.ok(approved.approvedAt);
  assert.equal(approved.approval!.approvedBy, account.user.id);
  assert.deepEqual(
    approved.approval!.acknowledgedChecks,
    approved.release!.checks.filter(check => check.status === 'review').map(check => check.id),
  );
  assert.match(workspace.audit.at(-1)!.details, /Release gate/);
  assert.deepEqual(approved.approval!.acknowledgedChecks, ['comparable-count']);
  assert.equal(workspace.cmas.find(cma => cma.id === saved.id)!.approval!.decision, 'release');
  await assert.rejects(
    executeAction(account.user, { type: 'approveCma', id: saved.id, acknowledgeReview: true }),
    /already approved/,
  );
  assert.equal(verifyAudit(workspace), true);
});
