import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNarrativeFacts } from '../src/lib/inference/grounding';
import { createDemoWorkspace } from '../src/lib/seed';
const workspace = createDemoWorkspace();
const currentCma = workspace.cmas.find(cma => cma.id === 'cma-01')!;
const check = (text: string, citationIds = ['cma-01']) =>
  checkNarrativeFacts([{ text, citationIds }], workspace.cmas, workspace.properties);

test('known live count regression is withheld for numeric and spelled-out counts linked through comp IDs', () => {
  assert.equal(currentCma.result.comps.length, 7);
  assert.equal(
    check(
      'The eight comparable property records provide the weights.',
      currentCma.result.comps.map(comp => comp.propertyId),
    ),
    'comparable-count',
  );
  assert.equal(check('The CMA uses 8 comparable sales.'), 'comparable-count');
  assert.equal(check('Using seven selected comparables supports this calculation.'), undefined);
});
test('hypothetical counts and minimum-practice discussion are not treated as observed inventory', () => {
  assert.equal(check('If the eight comparables were independently verified, review the range.'), undefined);
  assert.equal(check('A minimum of three comparables is a practice assumption.'), undefined);
});
test('a CMA weighted mean cannot be relabeled as a computed median, while a negated median is allowed', () => {
  assert.equal(check('The CMA yields a median price of $727,321.'), 'valuation-method');
  assert.equal(check('This is not a median of $727,321; it is a weighted mean.'), undefined);
  assert.equal(check('The weighted mean is $727,321, not a median.'), undefined);
});
test('known floor/lot confusion is withheld without fabricating missing lot data', () => {
  assert.equal(check('The home has a lot size of 2,480 sq ft.', ['property-01']), 'property-area');
  assert.equal(check('A 2,480-sq-ft lot is recorded.', ['property-01']), 'property-area');
  assert.equal(check('Interior floor area is 2,480 sq ft; lot area is 7,200 square feet.', ['property-01']), undefined);
  const property = { ...workspace.properties[0], lotSqft: undefined };
  assert.equal(
    checkNarrativeFacts([{ text: 'Lot area is 7,200 sq ft.', citationIds: [property.id] }], [], [property]),
    'property-area',
  );
});
test('ambiguous multi-property and multi-CMA statements are not silently assigned a fact context', () => {
  assert.equal(check('Lot area is 2,480 sq ft.', ['property-01', 'property-02']), undefined);
  const second = { ...workspace.cmas[0], id: 'second-cma' };
  assert.equal(
    checkNarrativeFacts(
      [{ text: 'The eight comparables span both analyses.', citationIds: ['cma-01', 'second-cma'] }],
      [...workspace.cmas, second],
      workspace.properties,
    ),
    undefined,
  );
});
