import test from 'node:test';
import assert from 'node:assert/strict';
import { homeownerAccuracyReference } from '../src/lib/homeowner-validation';
import { defaultDemoState, sampleEvidence } from '../src/lib/demo-studio';
import { dcDefaultState } from '../src/lib/dc-studio';
import { marylandDefaultState } from '../src/lib/maryland-studio';
import { condoDefaultState } from '../src/lib/dc-condo-studio';
test('accuracy references preserve Maryland and condo failures without borrowing DC house validation', () => {
  const md = homeownerAccuracyReference(
    {
      ...sampleEvidence,
      subject: { ...sampleEvidence.subject, state: 'MD', sourceId: 'source-maryland-public-records' },
    },
    marylandDefaultState(),
  )!;
  assert.equal(md.accepted, false);
  assert.equal(md.criteriaMet, 8);
  assert.ok(md.missedCriteria.some(c => c.includes('Price-related differential')));
  const condo = homeownerAccuracyReference(
    {
      ...sampleEvidence,
      subject: {
        ...sampleEvidence.subject,
        state: 'DC',
        sourceId: 'source-dc-condo-public-records',
        propertyType: 'condominium',
      },
    },
    condoDefaultState(),
  )!;
  assert.equal(condo.market, 'dc-condos');
  assert.equal(condo.criteriaMet, 4);
  assert.equal(condo.accepted, false);
  assert.match(condo.boundary, /no calibrated interval/);
});
test('sample records have no measured reference and edited DC settings cannot inherit cohort performance', () => {
  assert.equal(homeownerAccuracyReference(sampleEvidence, defaultDemoState), null);
  const evidence = {
    ...sampleEvidence,
    subject: { ...sampleEvidence.subject, state: 'DC', sourceId: 'source-dc-public-records' },
  };
  const state = dcDefaultState(),
    reference = homeownerAccuracyReference(evidence, state)!;
  assert.equal(reference.criteriaMet, 9);
  assert.equal(reference.matchesStudySettings, true);
  assert.equal(
    homeownerAccuracyReference({ ...evidence, subject: { ...evidence.subject, propertyType: 'condominium' } }, state),
    null,
  );
  assert.equal(homeownerAccuracyReference(evidence, { ...state, subjectCondition: 3 })!.matchesStudySettings, false);
  assert.equal(
    homeownerAccuracyReference(evidence, { ...state, assumptions: { ...state.assumptions, sqftRate: 1 } })!
      .matchesStudySettings,
    false,
  );
});
