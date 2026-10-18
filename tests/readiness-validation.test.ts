import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { benchmarkFromReport } from '../src/lib/valuation-safeguards';
import {
  dcCondoProtocol,
  marylandProtocol,
  marylandV2Protocol,
  protocolDigest,
  screenSales,
  createSaleIndex,
  fitAdjustmentRates,
  verifyValidationReport,
  type ValidationReport,
} from '../src/lib/valuation-validation';
import { hasIndependentAiReview, providerReady } from '../src/lib/inference/config';
import { marylandDefaultState, marylandRevisedBenchmark } from '../src/lib/maryland-studio';
import { condoBenchmark, condoDefaultState } from '../src/lib/dc-condo-studio';

test('new experiments verify independently and never overwrite the failed Maryland experiment', () => {
  for (const [market, protocol] of [
    ['maryland-v2', marylandV2Protocol],
    ['dc-condos', dcCondoProtocol],
  ] as const) {
    const registration = JSON.parse(readFileSync(`evidence/${market}-protocol-registration.json`, 'utf8'));
    assert.equal(registration.protocolDigest, protocolDigest(protocol));
    const report = JSON.parse(readFileSync(`evidence/valuation-validation-${market}.json`, 'utf8')) as ValidationReport;
    assert.ok(
      verifyValidationReport(
        report,
        gunzipSync(readFileSync(`evidence/valuation-validation-${market}-samples.csv.gz`)).toString('utf8'),
      ).every(check => check.passed),
    );
    assert.deepEqual(
      JSON.parse(readFileSync(`src/lib/valuation-benchmark-${market}.json`, 'utf8')),
      JSON.parse(JSON.stringify(benchmarkFromReport(report))),
    );
    assert.deepEqual(report.protocol.acceptance, marylandProtocol.acceptance);
  }
  assert.equal(
    JSON.parse(readFileSync('evidence/valuation-validation-maryland.json', 'utf8')).reportDigest,
    'sha256-483c1495df5e049b49f5a0cb614995ed219b11e4c11452f651d10b5a572f5523',
  );
  assert.ok(marylandV2Protocol.windows.test.from > marylandProtocol.windows.test.to);
  assert.ok(marylandDefaultState().assumptions.conditionValue <= 75000);
  assert.equal(marylandRevisedBenchmark.accepted, false);
  assert.equal(condoBenchmark.accepted, false);
  assert.equal(condoDefaultState().assumptions.conditionValue, 0);
});
test('new consideration screening is input-based and leaves the original protocol unchanged', () => {
  const sale = {
    saleId: 'nominal',
    parcelId: 'p',
    soldOn: '2026-08-01',
    price: 10,
    beds: 0,
    baths: 0,
    sqft: 1200,
    condition: 4,
    lat: 39,
    lng: -77,
    zip: '20000',
  };
  assert.equal(screenSales([sale], marylandProtocol).kept.length, 1);
  assert.equal(screenSales([sale], marylandV2Protocol).removed.recordedConsideration, 1);
  assert.equal(screenSales([{ ...sale, price: 50000 }], marylandV2Protocol).kept.length, 1);
});
test('an excessive fitted quality coefficient is fixed at the declared cap and other rates refit', () => {
  const sales = Array.from({ length: 60 }, (_, i) => ({
    saleId: `fit-${i}`,
    parcelId: `parcel-${i}`,
    soldOn: new Date(Date.UTC(2023, 0, 1 + i * 3)).toISOString().slice(0, 10),
    price: 500000 + (i % 5) * 400000 + ((i * 137) % 800) * 200,
    beds: 0,
    baths: 0,
    sqft: 1000 + ((i * 137) % 800),
    condition: 1 + (i % 5),
    lat: 39,
    lng: -77,
    zip: '00000',
  }));
  const fit = fitAdjustmentRates(
    sales,
    createSaleIndex(sales),
    { from: '2023-01-01', to: '2023-12-31' },
    marylandV2Protocol,
  );
  assert.equal(fit.conditionValue, 75000);
  assert.ok(fit.sqftRate >= 0 && Number.isFinite(fit.monthlyTrend));
  assert.equal(fit.bedroomValue, 0);
});
test('production synthesis cannot run before independent accuracy review; evidence mode remains available', () => {
  assert.equal(hasIndependentAiReview('groq:openai/gpt-oss-20b'), false);
  assert.equal(
    providerReady({ provider: 'evidence', model: '', task: 'deterministic', reason: 'Available' }).reason,
    'Available',
  );
});
