import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCma, DEMO_AS_OF } from '../src/lib/analytics';
import { engineFingerprint, SAFEGUARD_POLICY_VERSION, SAFEGUARD_THRESHOLDS } from '../src/lib/valuation-safeguards';
import {
  abstentionStudy,
  countySlices,
  fitLogLinear,
  mdapeDifference,
  priceRelatedBias,
  recalibrate,
  studyAssessment,
  supplementPlan,
  transportStudy,
  verticalEquityStudy,
  type StudyRow,
} from '../src/lib/valuation-supplement';
import {
  createSaleIndex,
  digestOf,
  marylandExternalProtocol,
  marylandV2Protocol,
  PENDING_DATA_LOCK,
  primaryCmaResult,
  protocolDigest,
  registrationTemplate,
  valueSale,
  type ValidationProtocol,
  type ValidationSale,
} from '../src/lib/valuation-validation';
import { VERDICT_POLICY, VERDICT_POLICY_VERSION } from '../src/lib/valuation-verdict';
import { BRIEF_POLICY, BRIEF_POLICY_VERSION } from '../src/lib/home-decision-brief';
import type { ValuationProperty } from '../src/lib/types';

/** Deterministic normal draws (LCG + Box–Muller) so synthetic studies reproduce exactly. */
function normals(seed: number) {
  let state = seed;
  const uniform = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) + 1) / (2 ** 31 + 1);
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

test('the external protocol is Maryland v2’s method and bars in new counties and windows', () => {
  const method = ({ id: _id, dataset: _dataset, windows: _windows, ...rest }: ValidationProtocol) => rest;
  assert.deepEqual(method(marylandExternalProtocol), method(marylandV2Protocol));
  assert.notEqual(marylandExternalProtocol.dataset.id, marylandV2Protocol.dataset.id);
  const { fit, select, calibrate, test: holdout } = marylandExternalProtocol.windows;
  for (const [earlier, later] of [
    [fit, select],
    [select, calibrate],
    [calibrate, holdout],
  ])
    assert.ok(earlier.to < later.from);
  // A full year of outcomes, recorded well before the snapshot can be taken.
  assert.deepEqual(holdout, { from: '2025-07-01', to: '2026-06-30' });
});

test('the registration fixed everything but the dataset fingerprint before download', () => {
  const registration = JSON.parse(readFileSync('evidence/maryland-external-protocol-registration.json', 'utf8'));
  const template = registrationTemplate(marylandExternalProtocol);
  assert.equal(registration.protocol.dataset.csvSha256, PENDING_DATA_LOCK);
  assert.equal(registration.protocolDigest, protocolDigest(template));
  assert.deepEqual(registration.protocol, JSON.parse(JSON.stringify(template)));
  assert.equal(registration.supplementDigest, digestOf(supplementPlan));
  // Filling in the fingerprint later cannot alter anything that was registered.
  const locked = { ...marylandExternalProtocol, dataset: { ...marylandExternalProtocol.dataset, csvSha256: 'x' } };
  assert.equal(protocolDigest(registrationTemplate(locked)), registration.protocolDigest);
});

test('the supplement measures the brief’s own verdict rule and the live gate thresholds', () => {
  assert.equal(BRIEF_POLICY_VERSION, VERDICT_POLICY_VERSION);
  assert.equal(BRIEF_POLICY, VERDICT_POLICY);
  assert.equal(supplementPlan.abstention.policy, VERDICT_POLICY_VERSION);
  assert.equal(supplementPlan.abstention.minComparables, SAFEGUARD_THRESHOLDS.minComparables);
  assert.equal(supplementPlan.gate.policy, SAFEGUARD_POLICY_VERSION);
  assert.deepEqual(supplementPlan.gate.thresholds, SAFEGUARD_THRESHOLDS);
});

const subject: ValuationProperty = {
  id: 'subject',
  address: 'Subject',
  city: 'Test',
  state: 'NA',
  zip: '21044',
  lat: 39.2,
  lng: -76.86,
  beds: 0,
  baths: 0,
  sqft: 2000,
  condition: 4,
  sourceId: 'source-maryland-public-records',
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
const steady = [
  sold('a', { soldPrice: 598000 }),
  sold('b', { soldPrice: 600000, lat: 39.201 }),
  sold('c', { soldPrice: 603000, lat: 39.202 }),
  sold('d', { soldPrice: 601000, lng: -76.861 }),
];
const engine = { fingerprint: engineFingerprint().fingerprint, expected: engineFingerprint().fingerprint };

test('the registered gate invocation yields the brief’s three verdicts', () => {
  assert.deepEqual(studyAssessment(calculateCma(subject, steady, {}, DEMO_AS_OF), engine), {
    verdict: 'supported',
    review: [],
  });
  const sparse = studyAssessment(calculateCma(subject, steady.slice(0, 2), {}, DEMO_AS_OF), engine);
  assert.equal(sparse.verdict, 'declined');
  assert.ok(sparse.review.includes('comparable-count'));
  const outlier = [...steady, sold('e', { soldPrice: 1500000, lat: 39.203 })];
  const flagged = studyAssessment(calculateCma(subject, outlier, {}, DEMO_AS_OF), engine);
  assert.equal(flagged.verdict, 'limited');
  assert.ok(flagged.review.includes('outliers'));
  const drifted = studyAssessment(calculateCma(subject, steady, {}, DEMO_AS_OF), { ...engine, expected: 'other' });
  assert.deepEqual(drifted, { verdict: 'limited', review: ['engine-integrity'] });
});

test('the study’s engine result reproduces the validation estimate for every sale, including abstentions', () => {
  const random = normals(3);
  const sales: ValidationSale[] = Array.from({ length: 80 }, (_, i) => {
    const sqft = 1400 + Math.round(Math.abs(random()) * 900);
    return {
      saleId: `s${i}`,
      parcelId: `p${i % 70}`,
      soldOn: new Date(Date.UTC(2025, 0, 1) + i * 4 * 86400000).toISOString().slice(0, 10),
      price: Math.round(150 * sqft * Math.exp(0.1 * random())),
      beds: 0,
      baths: 0,
      sqft,
      condition: 3 + (i % 3),
      lat: 39.2 + (i % 9) * 0.002,
      lng: -76.86 + (i % 7) * 0.002,
      zip: '21044',
    };
  });
  const index = createSaleIndex(sales);
  const full = {
    ...marylandExternalProtocol.selectionGrid[0],
    sqftRate: 140,
    bedroomValue: 0,
    bathroomValue: 0,
    conditionValue: 20000,
    monthlyTrend: 0,
  };
  const variant = { id: 'v', label: 'v', assumptions: full };
  let valued = 0,
    abstained = 0;
  for (const sale of sales) {
    const row = valueSale(sale, index, [variant], 'v', new Map(), marylandExternalProtocol);
    const result = primaryCmaResult(sale, index, full, marylandExternalProtocol);
    assert.equal(result?.estimate ?? null, row.estimates.v);
    assert.equal(result?.comps.length ?? 0, row.comps);
    if (result) valued++;
    else abstained++;
  }
  assert.ok(valued > 20 && abstained > 0, `${valued} valued, ${abstained} abstained`);
});

test('price-related bias is zero for proportional estimates and negative for regressive ones', () => {
  const prices = Array.from({ length: 200 }, (_, i) => 200000 + i * 5000);
  assert.ok(Math.abs(priceRelatedBias(prices.map(actual => ({ estimate: actual * 1.02, actual }))).prb) < 1e-9);
  const regressive = priceRelatedBias(prices.map(actual => ({ estimate: 600000 * (actual / 600000) ** 0.7, actual })));
  assert.ok(regressive.prb < -0.05 && regressive.ci95[1] < 0, JSON.stringify(regressive));
});

test('the MdAPE difference and its bootstrap interval follow the data', () => {
  const pairs = (error: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({ estimate: 100 * (1 + (i % 2 ? error : -error)), actual: 100 }));
  const result = mdapeDifference(pairs(0.2, 60), pairs(0.05, 80), 200, 1);
  assert.equal(result.difference, 0.15);
  assert.ok(result.ci95[0] > 0);
  // Identical groups: the interval is zero up to floating-point noise (normalize −0).
  assert.deepEqual(
    mdapeDifference(pairs(0.1, 40), pairs(0.1, 40), 200, 2).ci95.map(value => value + 0),
    [0, 0],
  );
});

test('log-linear fits recover known relations; an invalid reverse fit refuses to correct', () => {
  const pairs = [200000, 350000, 500000, 900000].map(estimate => ({
    estimate,
    actual: Math.exp(0.4 + 0.97 * Math.log(estimate)),
  }));
  const forward = fitLogLinear(pairs, 'forward');
  assert.ok(Math.abs(forward.alpha - 0.4) < 1e-6 && Math.abs(forward.beta - 0.97) < 1e-6);
  const reverse = fitLogLinear(pairs, 'reverse');
  assert.ok(Math.abs(recalibrate(500000, reverse)! - pairs[2].actual) <= 1);
  assert.equal(recalibrate(500000, { direction: 'reverse', n: 2, alpha: 1, beta: -0.2 }), null);
});

const row = (id: number, overrides: Partial<StudyRow>): StudyRow => ({
  saleId: `s${id}`,
  county: 'HOWA',
  actual: 500000,
  estimate: 500000,
  comps: 5,
  verdict: 'supported',
  review: [],
  interval: { low: 450000, high: 550000 },
  ...overrides,
});

test('the abstention study tests each hypothesis only with enough sales in both groups', () => {
  const few = [
    ...Array.from({ length: 10 }, (_, i) => row(i, { verdict: 'declined', estimate: 650000, comps: 2 })),
    ...Array.from({ length: 50 }, (_, i) => row(100 + i, { estimate: 510000 })),
    row(999, { estimate: null, verdict: null, interval: null, comps: 0 }),
  ];
  const sparse = abstentionStudy(few);
  assert.equal(sparse.notValued, 1);
  assert.equal(sparse.hypotheses[0].outcome, 'insufficient-evidence');
  assert.equal(sparse.groups.declined.n, 10);
  assert.equal(sparse.groups.stated.calibratedCoverage, 1);

  const many = [
    ...Array.from({ length: 40 }, (_, i) =>
      row(i, { verdict: 'declined', estimate: i % 2 ? 600000 : 400000, comps: 1, interval: null }),
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      row(100 + i, { verdict: 'limited', estimate: i % 2 ? 540000 : 460000, review: ['dispersion'] }),
    ),
    ...Array.from({ length: 40 }, (_, i) => row(200 + i, { estimate: i % 2 ? 510000 : 490000 })),
  ];
  const study = abstentionStudy(many);
  assert.deepEqual(
    study.hypotheses.map(item => item.outcome),
    ['supported', 'supported'],
  );
  assert.equal(study.groups.declined.mdape, 0.2);
  assert.equal(study.groups.stated.n, 80);
  assert.deepEqual(
    study.byCheck.find(item => item.check === 'dispersion'),
    {
      check: 'dispersion',
      flagged: 40,
      flaggedMdape: 0.08,
      clearMdape: 0.02,
    },
  );
});

const draw = (seed: number, compression: number, noise: number) => {
  const random = normals(seed);
  return Array.from({ length: 600 }, () => {
    const actual = Math.round(450000 * Math.exp(0.45 * random()));
    const estimate = Math.round(450000 * (actual / 450000) ** compression * Math.exp(noise * random()));
    return { estimate, actual };
  });
};
const quartileSlope = (bands: { medianRatio: number | null }[]) => bands[3].medianRatio! - bands[0].medianRatio!;

test('vertical equity: both fits remove systematic compression, and estimate quartiles reveal it', () => {
  const study = verticalEquityStudy(draw(11, 0.8, 0.04), draw(12, 0.8, 0.04));
  assert.ok(study.primary.prd > 1.03 && study.primary.prb.ci95[1] < -0.05, JSON.stringify(study.primary.prb));
  assert.ok(quartileSlope(study.primary.medianRatioByPriceQuartile) < 0);
  assert.ok(quartileSlope(study.primary.medianRatioByEstimateQuartile) < 0);
  const [forward, reverse] = study.candidates;
  assert.deepEqual([forward.id, reverse.id], ['forward-log-linear', 'reverse-log-linear']);
  assert.ok(Math.abs(reverse.fit.beta - 0.8) < 0.03, `reverse beta ${reverse.fit.beta}`);
  assert.ok(forward.fit.beta > 1.15, `forward beta ${forward.fit.beta}`);
  for (const candidate of study.candidates) {
    assert.ok(candidate.corrected!.prd >= 0.98 && candidate.corrected!.prd <= 1.03, `PRD ${candidate.corrected!.prd}`);
    assert.equal(
      candidate.passed,
      candidate.criteria.every(item => item.passed),
    );
  }
});

test('vertical equity: regressivity from noisy sale prices shows as rising estimate quartiles', () => {
  // Market value V; each sale price and each estimate deviate from it independently.
  const sample = (seed: number) => {
    const random = normals(seed);
    return Array.from({ length: 800 }, () => {
      const value = 450000 * Math.exp(0.45 * random());
      return {
        actual: Math.round(value * Math.exp(0.12 * random())),
        estimate: Math.round(value * Math.exp(0.05 * random())),
      };
    });
  };
  const study = verticalEquityStudy(sample(21), sample(22));
  assert.ok(study.primary.prd > 1.01, `primary PRD ${study.primary.prd}`);
  assert.ok(quartileSlope(study.primary.medianRatioByPriceQuartile) < 0);
  assert.ok(quartileSlope(study.primary.medianRatioByEstimateQuartile) > 0);
  const [forward, reverse] = study.candidates;
  // Nothing systematic to undo: forward barely moves; reverse expands toward the noisy prices and loses accuracy.
  assert.ok(Math.abs(forward.fit.beta - 1) < 0.03, `forward beta ${forward.fit.beta}`);
  assert.ok(reverse.fit.beta < 0.97, `reverse beta ${reverse.fit.beta}`);
  assert.ok(reverse.corrected!.prd < study.primary.prd);
  assert.ok(reverse.corrected!.mdape > study.primary.mdape);
  assert.equal(
    study.primary.medianRatioByEstimateQuartile.reduce((sum, item) => sum + item.n, 0),
    study.primary.n,
  );
});

test('county slices and transport summaries count every sale', () => {
  const rows = [
    row(1, {}),
    row(2, { county: 'FRED', estimate: 600000, interval: { low: 560000, high: 640000 } }),
    row(3, { county: 'FRED', estimate: null, verdict: null, interval: null }),
  ];
  const slices = countySlices(rows);
  assert.deepEqual(
    slices.map(item => [item.county, item.sales, item.valuedShare, item.calibratedCoverage]),
    [
      ['FRED', 2, 0.5, 0],
      ['HOWA', 1, 1, 1],
    ],
  );
  const moved = transportStudy(rows);
  assert.equal(moved.sales, 3);
  assert.equal(moved.valuedShare, 0.666667);
  assert.equal(moved.calibratedCoverage, 0.5);
});
