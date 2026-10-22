import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cents,
  compareDecisions,
  emptyFinance,
  evaluateDecision,
  exampleFinance,
  type FinanceInputs,
} from '../src/lib/homeowner-finance';
import {
  FINANCE_SENSITIVITY_VERSION,
  financeBreakEvens,
  financeSensitivity,
  holdingPeriodProfile,
  stepText,
} from '../src/lib/finance-sensitivity';

const net = (inputs: FinanceInputs, kind: Parameters<typeof evaluateDecision>[1]) =>
  evaluateDecision(inputs, kind).netPosition!;
const breakEven = (inputs: FinanceInputs, id: string) => financeBreakEvens(inputs).find(item => item.id === id)!;

test('evaluateDecision is the comparison engine for one choice', () => {
  const inputs = exampleFinance();
  const comparison = compareDecisions(inputs);
  for (const result of comparison.results) assert.deepEqual(evaluateDecision(inputs, result.kind), result);
});

test('each sensitivity effect is the exact one-input re-run of the finance engine', () => {
  const inputs = exampleFinance(),
    frozen = JSON.stringify(inputs);
  const sensitivity = financeSensitivity(inputs);
  assert.equal(sensitivity.version, FINANCE_SENSITIVITY_VERSION);
  const rent = sensitivity.rows.find(row => row.key === 'monthlyRent')!;
  assert.equal(rent.lowerSetting, 3150);
  assert.equal(rent.higherSetting, 3850);
  assert.equal(rent.effects.rent!.lower, cents(net({ ...inputs, monthlyRent: 3150 }, 'rent') - net(inputs, 'rent')));
  assert.equal(rent.effects.rent!.higher, cents(net({ ...inputs, monthlyRent: 3850 }, 'rent') - net(inputs, 'rent')));
  // Selling does not use rent, so the same step leaves it unchanged.
  assert.deepEqual(rent.effects.sell, { lower: 0, higher: 0, swing: 0, unavailable: false });
  const rate = sensitivity.rows.find(row => row.key === 'mortgageRate')!;
  assert.deepEqual([rate.lowerSetting, rate.higherSetting, rate.step], [3, 5, '±1 point']);
  assert.equal(rate.effects.hold!.higher, cents(net({ ...inputs, mortgageRate: 5 }, 'hold') - net(inputs, 'hold')));
  for (const choice of sensitivity.byChoice)
    for (let i = 1; i < choice.drivers.length; i++) assert.ok(choice.drivers[i - 1].swing >= choice.drivers[i].swing);
  assert.equal(JSON.stringify(inputs), frozen);
});

test('unknown inputs are never stepped or filled in, and uncomputable choices are left out', () => {
  const sensitivity = financeSensitivity({ ...exampleFinance(), monthlyRent: null });
  assert.ok(!sensitivity.rows.some(row => row.key === 'monthlyRent'));
  const kinds = sensitivity.byChoice.map(choice => choice.kind);
  assert.ok(!kinds.includes('rent') && !kinds.includes('buy-retain'));
  assert.ok(kinds.includes('sell') && kinds.includes('hold'));
  assert.deepEqual(financeSensitivity(emptyFinance()).byChoice, []);
});

test('a step that makes a choice uncomputable is reported as unavailable, not as no change', () => {
  // A sale three months later falls outside a three-month horizon.
  const sensitivity = financeSensitivity({ ...exampleFinance(), horizonMonths: 3, sellingMonths: 1 });
  const timing = sensitivity.rows.find(row => row.key === 'sellingMonths')!;
  assert.deepEqual([timing.lowerSetting, timing.higherSetting], [0, 4]);
  assert.equal(timing.effects.sell!.higher, null);
  assert.equal(timing.effects.sell!.unavailable, true);
  assert.equal(
    timing.effects.sell!.lower,
    cents(
      net({ ...exampleFinance(), horizonMonths: 3, sellingMonths: 0 }, 'sell') -
        net({ ...exampleFinance(), horizonMonths: 3, sellingMonths: 1 }, 'sell'),
    ),
  );
});

test('steps are disclosed in words', () => {
  assert.equal(stepText('salePrice'), '±5%');
  assert.equal(stepText('refinanceRate'), '±0.5 points');
  assert.equal(stepText('sellingMonths'), '±3 months');
  assert.equal(stepText('concessions'), '±$5,000');
});

test('break-even thresholds make the two choices equal when fed back into the engine', () => {
  const inputs = exampleFinance();
  const price = breakEven(inputs, 'sale-price-vs-hold');
  assert.equal(price.status, 'found');
  const atPrice = { ...inputs, salePrice: price.value! };
  assert.ok(Math.abs(net(atPrice, 'sell') - net(atPrice, 'hold')) <= 1);

  const growth = breakEven(inputs, 'appreciation-hold-vs-sell');
  assert.equal(growth.status, 'found');
  const atGrowth = { ...inputs, appreciationPercent: growth.value! };
  // Rounded to 0.01 percentage points: within the hold value change of that rounding over the horizon.
  assert.ok(Math.abs(net(atGrowth, 'hold') - net(atGrowth, 'sell')) <= 400);

  const rent = breakEven(inputs, 'rent-vs-sell');
  assert.equal(rent.status, 'found');
  const atRent = { ...inputs, monthlyRent: rent.value! };
  assert.ok(Math.abs(net(atRent, 'rent') - net(atRent, 'sell')) <= 60);

  const vacancy = breakEven(inputs, 'vacancy-zero-cash-flow');
  assert.equal(vacancy.status, 'found');
  assert.ok(Math.abs(evaluateDecision({ ...inputs, vacancyPercent: vacancy.value! }, 'rent').monthlyCashFlow!) <= 5);

  const refinance = breakEven(inputs, 'refinance-rate-vs-keep');
  assert.equal(refinance.status, 'found');
  const atRate = { ...inputs, refinanceRate: refinance.value! };
  assert.ok(Math.abs(net(atRate, 'refinance') - net(atRate, 'hold')) <= 200);
  // Each threshold separates the two outcomes: below it holding wins on net position, above it selling does.
  assert.ok(net({ ...inputs, salePrice: price.value! - 10000 }, 'sell') < net(inputs, 'hold'));
  assert.ok(net({ ...inputs, salePrice: price.value! + 10000 }, 'sell') > net(inputs, 'hold'));
});

test('break-evens abstain without inputs and say when no threshold exists in range', () => {
  assert.ok(financeBreakEvens(emptyFinance()).every(item => item.status === 'needs-inputs' && item.value === null));
  // Rent below the costs at 0% vacancy cannot reach zero cash flow at any vacancy.
  const vacancy = breakEven({ ...exampleFinance(), monthlyRent: 100 }, 'vacancy-zero-cash-flow');
  assert.deepEqual([vacancy.status, vacancy.value], ['outside-range', null]);
});

test('holding-period profile is the same engine at each horizon and drops sales outside a horizon', () => {
  const inputs = { ...exampleFinance(), sellingMonths: 24 };
  const profile = holdingPeriodProfile(inputs);
  assert.deepEqual(
    profile.map(row => row.horizonMonths),
    [12, 36, 60, 120, 240],
  );
  const sixty = profile.find(row => row.horizonMonths === 60)!;
  const comparison = compareDecisions({ ...inputs, horizonMonths: 60 });
  for (const result of sixty.results)
    assert.equal(result.netPosition, comparison.results.find(item => item.kind === result.kind)!.netPosition);
  const twelve = profile.find(row => row.horizonMonths === 12)!;
  assert.equal(twelve.results.find(item => item.kind === 'sell')!.available, false);
  assert.equal(twelve.results.find(item => item.kind === 'hold')!.available, true);
});
