import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distanceMiles, replayCma } from '../src/lib/analytics';
import { calculateStudio, studioStateSchema } from '../src/lib/demo-studio';
import { decisionDrivers } from '../src/lib/decision-drivers';
import {
  marylandData,
  marylandValuationInputs,
  searchMarylandAddresses,
} from '../src/lib/providers/maryland-public-records';
import { MD_GRADE_MAX, marylandBenchmark, marylandDefaultState, marylandReportHref } from '../src/lib/maryland-studio';
import { benchmarkFromReport, benchmarkForState } from '../src/lib/valuation-safeguards';
import {
  dcProtocol,
  marylandProtocol,
  protocolDigest,
  verifyValidationReport,
  type ValidationReport,
} from '../src/lib/valuation-validation';
import { GET as searchGet } from '../src/app/api/maryland/search/route';
import { GET as propertyGet } from '../src/app/api/maryland/property/route';
import { GET as reportGet } from '../src/app/api/maryland/report/route';
import { parseCsv } from '../src/lib/providers/dc-public-records';

const bytes = (file: string) => gunzipSync(readFileSync(file));
const sha = (file: string) => createHash('sha256').update(bytes(file)).digest('hex');
const priceable = (county = 'MONT') => {
  return marylandValuationInputs(county === 'MONT' ? '161301059818' : '17020094110')!;
};

test('Maryland uses the exact DC accuracy criteria; absent rooms are declared before fitting', () => {
  assert.deepEqual(marylandProtocol.acceptance, dcProtocol.acceptance);
  assert.equal(
    protocolDigest(marylandProtocol),
    'sha256-1db8867bf3d88493f43cdb9d43ba6807e03d814f7de463a449c42e1ba5e00cea',
  );
  assert.deepEqual(marylandProtocol.selectionGrid, dcProtocol.selectionGrid);
  assert.deepEqual(marylandProtocol.omittedFeatures, ['bedroomValue', 'bathroomValue']);
  assert.equal(marylandBenchmark.fittedAssumptions.bedroomValue, 0);
  assert.equal(marylandBenchmark.fittedAssumptions.bathroomValue, 0);
  const windows = Object.values(marylandProtocol.windows);
  for (let i = 1; i < windows.length; i++) assert.ok(windows[i - 1].to < windows[i].from);
  // Publishing these two counties must not validate an arbitrary Maryland workspace property.
  assert.equal(benchmarkForState('MD'), null);
});

test('Maryland evidence, verdicts, benchmark and bundled snapshots verify against the frozen protocol', () => {
  const report = JSON.parse(readFileSync('evidence/valuation-validation-maryland.json', 'utf8')) as ValidationReport;
  for (const check of verifyValidationReport(
    report,
    bytes('evidence/valuation-validation-maryland-samples.csv.gz').toString('utf8'),
  ))
    assert.equal(check.passed, true, `${check.label}: ${check.detail}`);
  assert.deepEqual(marylandBenchmark, JSON.parse(JSON.stringify(benchmarkFromReport(report))));
  assert.equal(report.protocolDigest, protocolDigest(marylandProtocol));
  assert.equal(sha('src/datasets/maryland/maryland-sales.csv.gz'), marylandProtocol.dataset.csvSha256);
  assert.equal(sha('evidence/datasets/maryland-sales.csv.gz'), marylandProtocol.dataset.csvSha256);
  assert.equal(
    readFileSync('src/datasets/maryland/maryland.provenance.json', 'utf8'),
    readFileSync('evidence/datasets/maryland.provenance.json', 'utf8'),
  );
  const { provenance, parcels, sales } = marylandData();
  assert.equal(parcels.size, provenance.properties);
  assert.equal(sales.length, provenance.rows);
  assert.equal(sha('src/datasets/maryland/maryland-properties.csv.gz'), provenance.propertyCsvSha256);
  assert.deepEqual(new Set([...parcels.values()].map(p => p.county)), new Set(['MONT', 'PRIN']));
});

test('both counties can be searched and priced without inventing rooms or using own/future sales', () => {
  for (const county of ['MONT', 'PRIN']) {
    const inputs = priceable(county);
    assert.ok(searchMarylandAddresses(inputs.parcel.address).some(p => p.parcelId === inputs.parcel.parcelId));
    assert.equal(inputs.subject.roomCountsUnavailable, true);
    assert.equal(inputs.subject.ratingKind, 'quality-grade');
    assert.ok(inputs.subject.condition! >= 1 && inputs.subject.condition! <= 9);
    assert.equal(inputs.subject.soldPrice, undefined);
    for (const sale of inputs.candidates) {
      assert.ok(!sale.id.includes(inputs.parcel.parcelId));
      const age = (Date.parse(inputs.asOf) - Date.parse(sale.soldAt!)) / 86400000;
      assert.ok(age >= 0 && age <= 365);
      assert.ok(distanceMiles(inputs.subject, sale) <= 3 + 1e-9);
      assert.ok(sale.roomCountsUnavailable);
    }
    const result = calculateStudio(inputs, marylandDefaultState());
    assert.equal(replayCma({ result }).reproduced, true);
    const drivers = decisionDrivers(result, { conditionMax: 9 });
    assert.ok(!drivers.some(d => d.key === 'bedroomValue' || d.key === 'bathroomValue'));
  }
  assert.deepEqual(searchMarylandAddresses('12'), []);
  assert.equal(marylandValuationInputs('invalid'), null);
});

test('published county slices retain all holdout cases and independently match the per-sale errors', () => {
  const publicText = readFileSync('src/lib/valuation-maryland-counties.json', 'utf8');
  assert.equal(publicText, readFileSync('evidence/valuation-maryland-counties.json', 'utf8'));
  const summary = JSON.parse(publicText);
  assert.equal(summary.reportDigest, marylandBenchmark.reportDigest);
  const [header, ...rows] = parseCsv(bytes('evidence/valuation-validation-maryland-samples.csv.gz').toString('utf8'));
  const at = (row: string[], name: string) => row[header.indexOf(name)];
  const parcels = marylandData().parcels;
  let total = 0;
  for (const county of summary.counties) {
    const selected = rows.filter(row => parcels.get(at(row, 'parcel_id'))!.county === county.code);
    const errors = selected
      .filter(row => at(row, 'estimate:locally-calibrated') !== '')
      .map(row => Math.abs(+at(row, 'estimate:locally-calibrated') / +at(row, 'actual') - 1))
      .sort((a, b) => a - b);
    const middle = Math.floor(errors.length / 2);
    const median = errors.length % 2 ? errors[middle] : (errors[middle - 1] + errors[middle]) / 2;
    assert.equal(county.sales, selected.length);
    assert.equal(county.valued, errors.length);
    assert.ok(Math.abs(county.metrics.mdape - median) <= 1e-6);
    assert.ok(
      Math.abs(county.metrics.ppe10 - errors.filter(error => error <= 0.1 + 1e-12).length / errors.length) <= 1e-6,
    );
    total += selected.length;
  }
  assert.equal(total, marylandBenchmark.holdout.sales);
});

test('Maryland public routes bound input and exports preserve missing fields, quality grade and validation misses', async () => {
  const inputs = priceable();
  const state = marylandDefaultState();
  const schema = studioStateSchema(
    inputs.candidates.map(p => p.id),
    MD_GRADE_MAX,
    true,
  );
  const bad = { ...state, assumptions: { ...state.assumptions, bedroomValue: 1000 } };
  assert.equal(schema.safeParse(bad).success, false);
  assert.throws(() => calculateStudio(inputs, bad), /unavailable/);
  assert.equal((await searchGet(new Request(`http://local/api/maryland/search?q=${'x'.repeat(101)}`))).status, 400);
  assert.equal((await propertyGet(new Request('http://local/api/maryland/property?parcel=../secret'))).status, 404);
  assert.equal(
    (await reportGet(new Request(`http://local${marylandReportHref(inputs.parcel.parcelId, bad)}`))).status,
    400,
  );
  const response = await reportGet(
    new Request(`http://local${marylandReportHref(inputs.parcel.parcelId, state, 'json')}`),
  );
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.deepEqual(json.missingFeatures, ['bedrooms', 'bathrooms']);
  assert.equal(json.validation.accepted, marylandBenchmark.accepted);
  assert.equal(json.validation.reportDigest, marylandBenchmark.reportDigest);
  assert.equal(replayCma(json.record).reproduced, true);
  assert.equal(json.record.release.calibratedInterval, null);
  const html = await (
    await reportGet(new Request(`http://local${marylandReportHref(inputs.parcel.parcelId, state)}`))
  ).text();
  assert.match(html, /Bedrooms and bathrooms unavailable/);
  assert.match(html, /quality grade/i);
  assert.match(html, /of 9 accuracy criteria met/);
  assert.doesNotMatch(html, /0 beds|0 baths|0 bd|District assessor|Calibrated 80% range/);
  assert.match(html, /uncalibrated comparable envelope/);
});
