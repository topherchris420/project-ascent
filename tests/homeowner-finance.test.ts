import test from 'node:test';
import assert from 'node:assert/strict';
import {
  amortize,
  compareDecisions,
  emptyFinance,
  exampleFinance,
  mortgagePayment,
  saleSensitivity,
} from '../src/lib/homeowner-finance';
import { calculateDemo, defaultDemoState } from '../src/lib/demo-studio';
import { simulatePricing } from '../src/lib/analytics';

const close = (actual: number, expected: number, tolerance = 0.02) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const result = (kind: string, patch: Partial<ReturnType<typeof exampleFinance>> = {}) =>
  compareDecisions({ ...exampleFinance(), ...patch }).results.find(r => r.kind === kind)!;
test('fixed-rate mortgage golden payment, zero interest, payoff and principal/interest reconciliation', () => {
  close(mortgagePayment(300000, 6, 360), 1798.651575, 1e-6);
  const a = amortize(1200, 0, 12, 24);
  assert.equal(a.balance, 0);
  assert.equal(a.paid, 1200);
  assert.equal(a.interest, 0);
  assert.equal(a.rows[12].payment, 0);
  const b = amortize(300000, 6, 360, 360);
  close(b.balance, 0);
  close(b.paid - b.interest, 300000, 0.0001);
  assert.throws(() => mortgagePayment(1, NaN, 360));
  assert.throws(() => amortize(1, 0, 360, 361));
});
test('unknown debt and expenses abstain; explicit debt-free zero needs no rate or term', () => {
  assert.ok(compareDecisions(emptyFinance()).results.every(r => !r.available && r.netPosition === null));
  assert.ok(result('hold', { monthlyTax: null }).missing.includes('monthlyTax'));
  assert.ok(result('sell', { mortgageBalance: null }).missing.includes('mortgageBalance'));
  assert.equal(result('sell', { mortgageBalance: 0, mortgageRate: null, mortgageMonths: null }).available, true);
  assert.equal(result('hold', { mortgageBalance: 0, mortgageRate: null, mortgageMonths: null }).available, true);
});
test('sale agrees with existing seller arithmetic; payoff, concessions, loss and sensitivity remain distinct', () => {
  const a = exampleFinance();
  const old = simulatePricing(
    calculateDemo(defaultDemoState),
    a.salePrice!,
    a as { commissionPercent: number; closingPercent: number; concessions: number },
  );
  const sell = result('sell');
  assert.equal(sell.netProceeds, old.estimatedNet - a.mortgageBalance!);
  assert.equal(sell.netPosition, 276000);
  assert.equal(sell.ownershipCosts, 24000);
  assert.equal(saleSensitivity(a)?.netDifference, -24000);
  assert.equal(result('sell', { mortgageBalance: 700000 }).netProceeds, -124000);
  assert.equal(result('sell', { concessions: 10000 }).netProceeds, 266000);
});
test('zero-change hold conserves cash and equity: principal is a transfer, interest is a cost', () => {
  const a = exampleFinance(),
    hold = result('hold');
  const loan = amortize(300000, 4, 240, 60);
  close(hold.terminalEquity!, 600000 - loan.balance);
  close(hold.ownershipCosts!, 60000 + loan.interest);
  close(hold.netPosition!, 276000 - hold.ownershipCosts!);
  close(hold.equityChange!, 300000 - loan.balance);
  assert.equal(hold.trajectory.length, 61);
});
test('rental break-even applies vacancy and management to rent; total vacancy has no finite break-even', () => {
  const rent = result('rent');
  close(rent.monthlyCashFlow!, 3500 * 0.95 * 0.92 - 1000 - mortgagePayment(300000, 4, 240));
  const threshold = rent.breakEven!.value;
  close(result('rent', { monthlyRent: threshold }).monthlyCashFlow!, 0);
  assert.equal(result('rent', { vacancyPercent: 100 }).breakEven, null);
});
test('delayed sale pays carrying costs, amortizes debt and compounds proceeds only after closing', () => {
  const a = result('sell', { sellingMonths: 3, opportunityPercent: 12 });
  const loan = amortize(300000, 4, 240, 3),
    rm = 1.12 ** (1 / 12) - 1;
  const net = 576000 - loan.balance;
  const expected =
    net * (1 + rm) ** 57 - loan.rows.reduce((sum, r, i) => sum + (r.payment + 1000) * (1 + rm) ** (59 - i), 0);
  close(a.netProceeds!, net);
  close(a.netPosition!, expected);
  assert.equal(result('sell', { sellingMonths: 6, horizonMonths: 3 }).available, false);
});
test('renovation break-even matches sell after fees, carry, amortization and time value', () => {
  for (const patch of [{}, { sellingMonths: 2, renovationMonths: 5, opportunityPercent: 8 }, { renovationMonths: 0 }]) {
    const renovate = result('renovate', patch);
    assert.equal(renovate.available, true);
    const atBreak = result('renovate', { ...patch, renovatedSalePrice: renovate.breakEven!.value });
    close(atBreak.netPosition!, result('sell', patch).netPosition!, 0.02);
  }
});
test('refinance accounts for fees, cash out and changed debt without inventing savings', () => {
  const a = result('refinance', { refinanceRate: 4, refinanceMonths: 240, refinanceCosts: 0 });
  assert.equal(a.netPosition, result('hold').netPosition);
  const cash = result('refinance', { cashOut: 50000, refinanceRate: 0, mortgageRate: 0, refinanceCosts: 0 });
  close(cash.netPosition!, result('hold', { mortgageRate: 0 }).netPosition!);
  assert.equal(result('refinance', { refinanceRate: 8 }).breakEven, null);
  assert.ok(result('refinance', { refinanceRate: 3 }).breakEven!.value > 0);
});
test('next home down payment is an equity transfer, not an ownership expense; reserve gap disclosed', () => {
  const patch = {
    mortgageRate: 0,
    purchaseRate: 0,
    commissionPercent: 0,
    closingPercent: 0,
    purchaseClosingCosts: 0,
    purchaseMonthlyCosts: 0,
    monthlyTax: 0,
    monthlyInsurance: 0,
    monthlyMaintenance: 0,
    monthlyCapex: 0,
    monthlyRent: 0,
  };
  close(result('buy-retain', patch).netPosition!, result('hold', patch).netPosition!);
  assert.equal(
    result('buy-retain', { ...patch, downPercent: 100, purchaseRate: null, purchaseMonths: null }).available,
    true,
  );
  assert.equal(result('buy-retain', { cashReserves: 50000, monthlyRent: 8000 }).reserveShortfall, 60000);
  assert.equal(result('buy-retain', { cashReserves: null }).reserveShortfall, null);
});
test('cash reserve requirement includes ongoing deficits and underwater sale payoffs', () => {
  const hold = result('hold', { mortgageBalance: 0, mortgageRate: null, mortgageMonths: null, cashReserves: 50000 });
  assert.equal(hold.cashRequired, 60000);
  assert.equal(hold.reserveShortfall, 10000);
  assert.equal(result('sell', { mortgageBalance: 700000 }).cashRequired, 124000);
  assert.equal(result('sell', { opportunityPercent: null }).netProceeds, 276000);
  assert.equal(result('sell', { opportunityPercent: null }).netPosition, null);
  assert.equal(saleSensitivity(exampleFinance(), -1), null);
});
test('invalid financial inputs fail closed and repeated comparisons reproduce without mutation', () => {
  const a = exampleFinance(),
    frozen = JSON.stringify(a);
  for (const patch of [
    { monthlyRent: -1 },
    { appreciationPercent: Infinity },
    { mortgageMonths: 1.5 },
    { horizonMonths: 0 },
    { vacancyPercent: 101 },
  ])
    assert.throws(() => compareDecisions({ ...a, ...patch }));
  assert.deepEqual(compareDecisions(a), compareDecisions(a));
  assert.equal(JSON.stringify(a), frozen);
  const extreme = compareDecisions({ ...a, appreciationPercent: -50, opportunityPercent: -50, horizonMonths: 360 });
  assert.doesNotMatch(JSON.stringify(extreme), /NaN|Infinity/);
});
