import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStudio, studioStateSchema } from '../src/lib/demo-studio';
import { condoDefaultState, condoReportHref } from '../src/lib/dc-condo-studio';
import { condoData, condoValuationInputs, searchCondoAddresses } from '../src/lib/providers/dc-condo-public-records';
import { assessValuationRelease, dcBenchmark, validatedAssumptions } from '../src/lib/valuation-safeguards';
import { calculateCma, distanceMiles, replayCma } from '../src/lib/analytics';
import { GET as searchGet } from '../src/app/api/dc-condos/search/route';
import { GET as propertyGet } from '../src/app/api/dc-condos/property/route';
import { GET as reportGet } from '../src/app/api/dc-condos/report/route';

const example = () => condoValuationInputs(searchCondoAddresses('2123 California')[0].parcelId)!;
test('condo snapshot joins unambiguous unit addresses; studios retain observed zero bedrooms', () => {
  const { parcels, sales, salesProvenance } = condoData();
  assert.equal(parcels.size, salesProvenance.properties);
  assert.equal(sales.length, salesProvenance.rows);
  assert.ok(parcels.size > 10000);
  assert.ok([...parcels.values()].some(p => p.beds === 0));
  assert.ok([...parcels.values()].every(p => /Unit \S+/.test(p.address)));
  assert.ok(searchCondoAddresses('2123 California').length > 1);
  assert.deepEqual(searchCondoAddresses('12'), []);
  assert.equal(condoValuationInputs('invalid'), null);
});
test('condos use only other-unit condo sales and never invent condition or inherit single-family calibration', () => {
  const inputs = example();
  assert.equal(inputs.subject.propertyType, 'condominium');
  assert.equal(inputs.subject.condition, undefined);
  assert.equal(inputs.subject.soldPrice, undefined);
  assert.equal(condoDefaultState().assumptions.conditionValue, 0);
  for (const sale of inputs.candidates) {
    assert.ok(!sale.id.includes(inputs.parcel.parcelId));
    assert.equal(sale.propertyType, 'condominium');
    assert.equal(sale.condition, undefined);
    assert.ok(distanceMiles(inputs.subject, sale) <= 3 + 1e-9);
    const age = (Date.parse(inputs.asOf) - Date.parse(sale.soldAt!)) / 86400000;
    assert.ok(age >= 0 && age <= 365);
  }
  const result = calculateStudio(inputs, condoDefaultState());
  assert.equal(replayCma({ result }).reproduced, true);
  assert.equal(assessValuationRelease(result).calibratedInterval, null);
  // Even if an operator supplies a condition and all the DC single-family rates, the type is out of scope.
  const rerated = calculateCma(
    { ...inputs.subject, condition: 3 },
    inputs.candidates.map(p => ({ ...p, condition: 3 })),
    validatedAssumptions(dcBenchmark),
    inputs.asOf,
  );
  assert.equal(assessValuationRelease(rerated).calibratedInterval, null);
});
test('condo report and API preserve unit identity, unknown condition and unmeasured accuracy', async () => {
  const inputs = example(),
    state = condoDefaultState();
  const schema = studioStateSchema(
    inputs.candidates.map(p => p.id),
    6,
    false,
    false,
  );
  assert.equal(schema.safeParse({ ...state, assumptions: { ...state.assumptions, conditionValue: 1 } }).success, false);
  assert.equal((await searchGet(new Request(`http://local/api/dc-condos/search?q=${'x'.repeat(101)}`))).status, 400);
  assert.equal((await propertyGet(new Request('http://local/api/dc-condos/property?parcel=../private'))).status, 404);
  const response = await reportGet(
    new Request(`http://local${condoReportHref(inputs.parcel.parcelId, state, 'json')}`),
  );
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.validation.measured, false);
  assert.equal(json.record.release.calibratedInterval, null);
  assert.equal(json.record.release.reference, null);
  assert.equal(json.record.result.inputSnapshot.subject.condition, undefined);
  assert.equal(replayCma(json.record).reproduced, true);
  const html = await (
    await reportGet(new Request(`http://local${condoReportHref(inputs.parcel.parcelId, state)}`))
  ).text();
  assert.match(html, /Condo accuracy has not been validated/);
  assert.match(html, /CC BY 4.0/);
  assert.doesNotMatch(html, /Calibrated 80% range|condition 3\/|District assessor grade/);
});
