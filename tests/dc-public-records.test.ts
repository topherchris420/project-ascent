import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distanceMiles, replayCma } from '../src/lib/analytics';
import {
  dcData,
  dcValuationInputs,
  normalizeDcAddress,
  parseCsv,
  searchDcAddresses,
  DC_CANDIDATE_MAX_AGE_DAYS,
  DC_CANDIDATE_RADIUS_MILES,
} from '../src/lib/providers/dc-public-records';
import { dcDefaultState, dcReportHref, DC_CONDITION_MAX } from '../src/lib/dc-studio';
import { calculateStudio, studioStateSchema } from '../src/lib/demo-studio';
import { assessValuationRelease, dcBenchmark, usesValidatedConfiguration } from '../src/lib/valuation-safeguards';
import { GET as searchGet } from '../src/app/api/dc/search/route';
import { GET as propertyGet } from '../src/app/api/dc/property/route';
import { GET as reportGet } from '../src/app/api/dc/report/route';

const sha = (path: string) =>
  createHash('sha256')
    .update(gunzipSync(readFileSync(path)))
    .digest('hex');
const firstParcel = () => searchDcAddresses('313 shepherd st nw')[0].parcelId;

test('the runtime DC sales file is byte-identical to the snapshot the published validation scored', () => {
  const runtime = sha('src/datasets/dc/dc-residential-sales.csv.gz');
  assert.equal(runtime, sha('evidence/datasets/dc-residential-sales.csv.gz'));
  assert.equal(runtime, dcBenchmark.dataset.csvSha256);
  assert.equal(
    readFileSync('src/datasets/dc/dc-residential-sales.provenance.json', 'utf8'),
    readFileSync('evidence/datasets/dc-residential-sales.provenance.json', 'utf8'),
  );
  const parcels = JSON.parse(readFileSync('src/datasets/dc/dc-residential-properties.provenance.json', 'utf8'));
  assert.equal(sha('src/datasets/dc/dc-residential-properties.csv.gz'), parcels.csvSha256);
  assert.equal(parcels.license, 'CC-BY-4.0');
  assert.equal(dcData().parcels.size, parcels.rows);
});

test('CSV reader and address normalization handle quoting, abbreviations and city suffixes', () => {
  assert.deepEqual(parseCsv('a,b\n"1, 2","say ""hi"""\n'), [
    ['a', 'b'],
    ['1, 2', 'say "hi"'],
  ]);
  assert.equal(normalizeDcAddress('313 Shepherd St. NW, Washington, DC 20011'), '313 SHEPHERD STREET NW');
  assert.equal(normalizeDcAddress('12 e capitol ave se'), '12 E CAPITOL AVENUE SE');
});

test('search ranks the exact address first, needs three characters and never returns owner data', () => {
  const [top] = searchDcAddresses('313 shepherd st nw');
  assert.equal(top.address, '313 Shepherd Street NW');
  assert.equal(top.zip, '20011');
  assert.deepEqual(searchDcAddresses('31'), []);
  assert.ok(searchDcAddresses('shepherd st nw').length > 1);
  assert.doesNotMatch(JSON.stringify(searchDcAddresses('shepherd')), /owner|mail/i);
});

test('valuation inputs exclude the home’s own sales and stay inside the disclosed radius, age and as-of bounds', () => {
  const inputs = dcValuationInputs(firstParcel())!;
  const asOf = Date.parse(inputs.asOf);
  assert.equal(inputs.subject.state, 'DC');
  assert.equal(inputs.sources[0].kind, 'public');
  assert.match(inputs.sources[0].license, /CC BY 4\.0/);
  assert.ok(inputs.candidates.length > 20);
  for (const sale of inputs.candidates) {
    assert.notEqual(sale.id.split('-').slice(1, -3).join('-'), inputs.parcel.parcelId);
    assert.ok(!sale.id.includes(inputs.parcel.parcelId), 'own parcel sale used as a comparable');
    const age = (asOf - Date.parse(sale.soldAt!)) / 86400000;
    assert.ok(age >= 0 && age <= DC_CANDIDATE_MAX_AGE_DAYS);
    assert.ok(distanceMiles(inputs.subject, sale) <= DC_CANDIDATE_RADIUS_MILES + 1e-9);
    assert.ok(sale.soldPrice! > 0 && sale.status === 'sold');
  }
  assert.ok(
    inputs.candidates.some(sale => !sale.address.startsWith('Dc Parcel')),
    'comparables carry addresses',
  );
  assert.equal(dcValuationInputs('not-a-parcel'), null);
});

test('the validated defaults earn the calibrated interval; the release gate uses the published DC tiers', () => {
  const inputs = dcValuationInputs(firstParcel())!;
  const evidence = {
    subject: inputs.subject,
    candidates: inputs.candidates,
    sources: inputs.sources,
    asOf: inputs.asOf,
  };
  const state = dcDefaultState();
  assert.ok(usesValidatedConfiguration(state.assumptions, dcBenchmark));
  const result = calculateStudio(evidence, state);
  const gate = assessValuationRelease(result, { sources: inputs.sources, release: { enabled: true, reason: '' } });
  assert.ok(gate.calibratedInterval);
  assert.ok(gate.calibratedInterval!.low < result.estimate && result.estimate < gate.calibratedInterval!.high);
  const edited = calculateStudio(evidence, {
    ...state,
    assumptions: { ...state.assumptions, sqftRate: state.assumptions.sqftRate + 10 },
  });
  assert.equal(
    assessValuationRelease(edited, { sources: inputs.sources, release: { enabled: true, reason: '' } })
      .calibratedInterval,
    null,
  );
});

test('public routes: bounded search, unknown parcels, server-rebuilt reports and replayable decisions', async () => {
  const parcel = firstParcel();
  assert.equal((await searchGet(new Request(`http://x/api/dc/search?q=${'a'.repeat(101)}`))).status, 400);
  assert.equal((await propertyGet(new Request('http://x/api/dc/property?parcel=..%2F..%2Fsecret'))).status, 404);
  const property = await propertyGet(new Request(`http://x/api/dc/property?parcel=${parcel}`));
  assert.equal(property.status, 200);
  const state = dcDefaultState();
  const html = await (await reportGet(new Request(`http://x${dcReportHref(parcel, state)}`))).text();
  assert.match(html, /Contains District of Columbia open data licensed under CC BY 4\.0/);
  assert.match(html, /Calibrated 80% range/);
  assert.doesNotMatch(html, /FICTIONAL DEMONSTRATION DATA/);
  // Any exclusion leaves the validated analysis, so no calibrated range is printed.
  const inputs = dcValuationInputs(parcel)!;
  const comp = calculateStudio(
    { subject: inputs.subject, candidates: inputs.candidates, sources: inputs.sources, asOf: inputs.asOf },
    state,
  ).comps[0].propertyId;
  const excluded = { ...state, exclusions: [{ id: comp, reason: 'Interior not comparable' }] };
  const excludedHtml = await (await reportGet(new Request(`http://x${dcReportHref(parcel, excluded)}`))).text();
  assert.doesNotMatch(excludedHtml, /Calibrated 80% range/);
  assert.match(excludedHtml, /Interior not comparable/);
  for (const bad of [
    { ...state, exclusions: [{ id: 'sale-from-another-tenant', reason: 'foreign id' }] },
    { ...state, subjectCondition: DC_CONDITION_MAX + 1 },
  ])
    assert.equal((await reportGet(new Request(`http://x${dcReportHref(parcel, bad)}`))).status, 400);
  assert.equal((await reportGet(new Request(`http://x${dcReportHref('missing_parcel', state)}`))).status, 400);
  const json = await (await reportGet(new Request(`http://x${dcReportHref(parcel, state, 'json')}`))).json();
  assert.equal(json.mode, 'dc-public-records');
  assert.equal(replayCma(json.record).reproduced, true);
  assert.equal(json.snapshot.salesSha256, dcBenchmark.dataset.csvSha256);
  assert.ok(
    studioStateSchema(
      inputs.candidates.map(p => p.id),
      DC_CONDITION_MAX,
    ).safeParse(json.scenario).success,
  );
});
