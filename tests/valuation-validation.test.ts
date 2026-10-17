import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  attestationMessage,
  calibrateIntervals,
  createSaleIndex,
  fitAdjustmentRates,
  parseValidationCsv,
  protocolDigest,
  ratioMetrics,
  screenSales,
  validationProtocol,
  valueSale,
  verifyAttestation,
  verifyValidationReport,
  type ValidationReport,
  type ValidationSale,
  type ValuationRow,
} from '../src/lib/valuation-validation';
import { benchmarkFromReport, valuationBenchmark } from '../src/lib/valuation-safeguards';
import { defaultAssumptions } from '../src/lib/analytics';

const report = JSON.parse(readFileSync('evidence/valuation-validation.json', 'utf8')) as ValidationReport;
const samples = gunzipSync(readFileSync('evidence/valuation-validation-samples.csv.gz')).toString('utf8');

const sale = (id: string, overrides: Partial<ValidationSale> = {}): ValidationSale => ({
  saleId: id,
  parcelId: id,
  soldOn: '2014-06-01',
  price: 500000,
  beds: 3,
  baths: 2,
  sqft: 2000,
  condition: 3,
  lat: 47.6,
  lng: -122.3,
  zip: '98101',
  ...overrides,
});

test('committed validation evidence verifies independently of the code that produced it', () => {
  const checks = verifyValidationReport(report, samples);
  for (const check of checks) assert.equal(check.passed, true, `${check.label}: ${check.detail}`);
  assert.ok(checks.some(check => check.label === 'Recomputed locally-calibrated'));
  assert.equal(report.dataset.csvSha256, validationProtocol.dataset.csvSha256);
  assert.equal(report.protocolDigest, protocolDigest());
});

test('the in-app benchmark is derived from the committed report, not typed by hand', () => {
  assert.deepEqual(valuationBenchmark, JSON.parse(JSON.stringify(benchmarkFromReport(report))));
  assert.equal(valuationBenchmark.holdout.sales, report.holdout.screenedSales);
  assert.equal(
    valuationBenchmark.accepted,
    report.acceptance.every(item => item.passed),
  );
});

test('tampering with any published estimate or threshold is detected', () => {
  const lines = samples.split('\n');
  const cells = lines[1].split(',');
  cells[5] = String(Number(cells[5]) + 50000);
  const tampered = [lines[0], cells.join(','), ...lines.slice(2)].join('\n');
  const sampleChecks = verifyValidationReport(report, tampered);
  assert.equal(sampleChecks.find(check => check.label === 'Samples fingerprint')!.passed, false);

  const moved = structuredClone(report);
  (moved.protocol.acceptance[1] as { max: number }).max = 0.5;
  const movedChecks = verifyValidationReport(moved, samples);
  assert.equal(movedChecks.find(check => check.label === 'Report digest')!.passed, false);
  assert.equal(movedChecks.find(check => check.label === 'Protocol digest')!.passed, false);
});

test('acceptance thresholds are fixed before results and every verdict follows from them', () => {
  assert.equal(report.acceptance.length, validationProtocol.acceptance.length);
  for (const item of report.acceptance) {
    const declared = validationProtocol.acceptance.find(criterion => criterion.id === item.id)!;
    assert.equal(item.min, 'min' in declared ? declared.min : undefined);
    assert.equal(item.max, 'max' in declared ? declared.max : undefined);
    assert.equal(
      item.passed,
      (item.min === undefined || item.value >= item.min) && (item.max === undefined || item.value <= item.max),
    );
  }
  assert.equal(
    report.accepted,
    report.acceptance.every(item => item.passed),
  );
});

test('windows are disjoint and ordered: fit, select, calibrate, then the scored holdout', () => {
  const windows = Object.values(validationProtocol.windows);
  for (let i = 1; i < windows.length; i++) assert.ok(windows[i - 1].to < windows[i].from);
  assert.ok(
    samples
      .split('\n')
      .slice(1, -1)
      .every(line => line.split(',')[2] >= validationProtocol.windows.test.from),
  );
});

test('a holdout valuation never sees its own price, a later sale, a same-day sale or its own parcel', () => {
  const subject = sale('subject', { soldOn: '2014-09-10', price: 999999999 });
  const pool = [
    subject,
    sale('earlier', { soldOn: '2014-09-01', price: 510000 }),
    sale('same-day', { soldOn: '2014-09-10', price: 1 }),
    sale('later', { soldOn: '2014-09-20', price: 1 }),
    sale('prior-sale-of-subject', { parcelId: 'subject', soldOn: '2014-08-01', price: 1 }),
  ];
  const variant = { id: 'v', label: 'v', assumptions: { ...defaultAssumptions } };
  const row = valueSale(subject, createSaleIndex(pool), [variant], 'v', new Map([['98101', pool]]));
  assert.equal(row.comps, 1);
  assert.equal(row.estimates.v, 510000);
  assert.equal(row.estimates['baseline-zip-median'], 510000);
  assert.equal(row.actual, 999999999);
});

test('paired-sales fitting recovers known adjustment rates from earlier sales', () => {
  const sales: ValidationSale[] = [];
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 400; i++) {
    const sqft = 1200 + Math.round(random() * 1600);
    const beds = 2 + Math.floor(random() * 3);
    const baths = 1 + Math.floor(random() * 3);
    const condition = 2 + Math.floor(random() * 3);
    const day = 1 + Math.floor(random() * 90);
    const soldOn = new Date(Date.UTC(2014, 4, 2) + day * 86400000).toISOString().slice(0, 10);
    const price = 150000 + 220 * sqft + 9000 * beds + 14000 * baths + 25000 * condition;
    sales.push(
      sale(`s${i}`, {
        soldOn,
        sqft,
        beds,
        baths,
        condition,
        price,
        lat: 47.6 + random() * 0.01,
        lng: -122.3 + random() * 0.01,
      }),
    );
  }
  sales.sort((a, b) => (a.soldOn < b.soldOn ? -1 : a.soldOn > b.soldOn ? 1 : a.saleId < b.saleId ? -1 : 1));
  const fitted = fitAdjustmentRates(sales, createSaleIndex(sales), validationProtocol.windows.fit);
  assert.ok(fitted.pairs > 500);
  assert.ok(Math.abs(fitted.sqftRate - 220) < 15, `sqft ${fitted.sqftRate}`);
  assert.ok(Math.abs(fitted.conditionValue - 25000) < 4000, `condition ${fitted.conditionValue}`);
  assert.ok(Math.abs(fitted.monthlyTrend) < 0.005, `trend ${fitted.monthlyTrend}`);
  for (const key of ['sqftRate', 'bedroomValue', 'bathroomValue', 'conditionValue'] as const)
    assert.ok(fitted[key] >= 0);
});

test('ratio study metrics follow IAAO definitions', () => {
  const metrics = ratioMetrics([
    { estimate: 90, actual: 100 },
    { estimate: 100, actual: 100 },
    { estimate: 120, actual: 100 },
    { estimate: 200, actual: 200 },
  ]);
  assert.equal(metrics.n, 4);
  assert.equal(metrics.medianRatio, 1);
  assert.equal(metrics.mdape, 0.05);
  assert.equal(metrics.ppe10, 0.75);
  assert.equal(metrics.cod, 7.5);
  // PRD = mean ratio / (sum estimates / sum actuals) = 1.025 / (510 / 500)
  assert.equal(metrics.prd, Number((1.025 / 1.02).toFixed(6)));
});

test('conformal calibration uses finite-sample order statistics and pools sparse tiers', () => {
  const rows: ValuationRow[] = Array.from({ length: 99 }, (_, i) => ({
    saleId: `r${i}`,
    parcelId: `r${i}`,
    soldOn: '2014-11-02',
    actual: 100 * Math.exp((i - 49) / 100),
    comps: 5,
    estimates: { p: 100 },
    envelope: null,
  }));
  const calibration = calibrateIntervals(rows, 'p');
  const moderate = calibration.tiers.find(tier => tier.id === 'moderate')!;
  // n = 99: lower order statistic ⌊100 × 0.1⌋ = 10th, upper ⌈100 × 0.9⌉ = 90th.
  assert.equal(moderate.lowerLogRatio, -0.4);
  assert.equal(moderate.upperLogRatio, 0.4);
  assert.equal(moderate.pooled, false);
  assert.equal(calibration.tiers.find(tier => tier.id === 'sparse')!.pooled, true);
});

test('input screening is about record quality, never about price or error', () => {
  const { kept, removed } = screenSales([
    sale('ok'),
    sale('zero-bed', { beds: 0 }),
    sale('thirty-three-bed', { beds: 33 }),
    sale('no-bath', { baths: 0 }),
    sale('tiny', { sqft: 100 }),
    sale('ok'),
    sale('very-expensive', { price: 7_700_000 }),
  ]);
  assert.deepEqual(
    kept.map(item => item.saleId),
    ['ok', 'very-expensive'],
  );
  assert.deepEqual(removed, { bedrooms: 2, bathrooms: 1, livingArea: 1, duplicateSale: 1 });
  assert.throws(() => parseValidationCsv('bad,header\n'), /header/);
});

test('third-party Ed25519 attestations bind to one exact report digest', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const unsigned = {
    reviewer: 'Example Reviewer',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    reportDigest: report.reportDigest,
    statement: 'Reproduced.',
    signedAt: '2026-10-17T00:00:00.000Z',
  };
  const attestation = {
    ...unsigned,
    signature: sign(null, Buffer.from(attestationMessage(unsigned)), privateKey).toString('base64'),
  };
  assert.equal(verifyAttestation(attestation, report.reportDigest).passed, true);
  assert.equal(verifyAttestation(attestation, 'sha256-other').passed, false);
  assert.equal(verifyAttestation({ ...attestation, statement: 'Edited.' }, report.reportDigest).passed, false);
});
