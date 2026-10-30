import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closingTaxes,
  jurisdictionFor,
  montgomeryRecordationTax,
  sellerPercentRoundedUp,
} from '../src/lib/closing-taxes';
import { creditLimitNote, sellerCreditLimit } from '../src/lib/credit-limits';

test('property keys map to the taxing jurisdiction', () => {
  assert.equal(jurisdictionFor('dc:PAR_01660070'), 'dc');
  assert.equal(jurisdictionFor('dc-condos:PAR_1'), 'dc');
  assert.equal(jurisdictionFor('maryland:160700677283'), 'montgomery');
  assert.equal(jurisdictionFor('maryland:170100000000'), 'prince-georges');
  assert.equal(jurisdictionFor('maryland:020100000000'), null);
  assert.equal(jurisdictionFor('demo:sample'), null);
});

test('Montgomery recordation tax matches the county’s worked examples', () => {
  // Montgomery County Finance, "Examples of the Application of the new Recordation Tax Law" (2023), #1 to #10.
  const examples: [number, boolean, number][] = [
    [400_000, true, 2_670],
    [400_000, false, 3_560],
    [575_000, true, 4_572.5],
    [575_000, false, 5_462.5],
    [675_000, true, 6_440],
    [675_000, false, 7_330],
    [775_000, true, 8_509],
    [775_000, false, 9_399],
    [1_075_000, true, 15_062.5],
    [1_075_000, false, 15_952.5],
  ];
  for (const [price, principal, expected] of examples)
    assert.equal(montgomeryRecordationTax(price, principal), expected, `${price} ${principal}`);
  // "For each $500 or fraction of $500": $400,001 is taxed as $400,500.
  assert.equal(montgomeryRecordationTax(400_001, false), 3_564.45);
});

test('DC transfer tax is the seller’s; recordation is left to the contract', () => {
  const low = closingTaxes('dc', 390_000);
  assert.equal(low.lines[0].amount, 4_290);
  const high = closingTaxes('dc', 800_000);
  assert.deepEqual(
    high.lines.map(line => line.amount),
    [11_600, 11_600],
  );
  assert.equal(high.lines[1].sellerShare, null);
  assert.equal(high.sellerTotal, 11_600);
  assert.equal(high.total, 23_200);
  assert.equal(high.sellerPercent.toFixed(2), '1.45');
});

test('Maryland taxes split equally unless the buyer is a first-time Maryland homebuyer', () => {
  const pg = closingTaxes('prince-georges', 500_000, { firstTimeBuyer: false, principalResidence: true });
  // State 0.5% = 2,500; county transfer 1.4% = 7,000; recordation 1,000 × $2.75 = 2,750.
  assert.deepEqual(
    pg.lines.map(line => line.amount),
    [2_500, 7_000, 2_750],
  );
  assert.equal(pg.sellerTotal, 6_125);
  const first = closingTaxes('prince-georges', 500_000, { firstTimeBuyer: true, principalResidence: true });
  assert.equal(first.lines[0].amount, 1_250);
  assert.equal(first.sellerTotal, 1_250 + 7_000 + 2_750);
  const mc = closingTaxes('montgomery', 575_000, { firstTimeBuyer: false, principalResidence: true });
  assert.deepEqual(
    mc.lines.map(line => line.amount),
    [2_875, 5_750, 4_572.5],
  );
});

test('seller-credit limits follow each loan program', () => {
  const offer = { price: 500_000, downPaymentPercent: 5, financing: 'conventional' as const };
  assert.equal(sellerCreditLimit(offer)?.percent, 3);
  assert.equal(sellerCreditLimit({ ...offer, downPaymentPercent: 20 })?.percent, 6);
  assert.equal(sellerCreditLimit({ ...offer, downPaymentPercent: 25 })?.percent, 9);
  assert.equal(sellerCreditLimit({ ...offer, downPaymentPercent: 30 }, 'investment')?.percent, 2);
  assert.equal(sellerCreditLimit({ ...offer, financing: 'fha' })?.limit, 30_000);
  assert.equal(sellerCreditLimit({ ...offer, financing: 'va' })?.limit, 20_000);
  assert.equal(sellerCreditLimit({ ...offer, financing: 'cash' }), null);
  assert.equal(sellerCreditLimit({ ...offer, price: null }), null);
});

test('credit notes appear only when a credit nears or passes the limit', () => {
  const offer = { price: 500_000, downPaymentPercent: 5, financing: 'conventional' as const };
  assert.equal(creditLimitNote({ ...offer, sellerCredit: 5_000 }), null);
  assert.match(creditLimitNote({ ...offer, sellerCredit: 14_000 }) ?? '', /close to the 3% limit/);
  assert.match(creditLimitNote({ ...offer, sellerCredit: 20_000 }) ?? '', /over the 3% limit \(\$15,000\)/);
  assert.match(
    creditLimitNote({ ...offer, downPaymentPercent: null, sellerCredit: 20_000 }) ?? '',
    /enter the down payment/,
  );
  assert.equal(creditLimitNote({ ...offer, financing: 'cash', sellerCredit: 50_000 }), null);
});

test('DC switches to 1.45% at exactly $400,000', () => {
  assert.equal(closingTaxes('dc', 399_999).lines[0].amount, 4_399.99);
  assert.equal(closingTaxes('dc', 400_000).lines[0].amount, 5_800);
});

test('Montgomery low transfer tiers, the exemption floor and first-time shares', () => {
  const transfer = (price: number) => closingTaxes('montgomery', price).lines[1].amount;
  assert.equal(transfer(39_999), 100);
  assert.equal(transfer(40_000), 200);
  assert.equal(transfer(69_999), 350);
  assert.equal(transfer(70_000), 700);
  assert.equal(montgomeryRecordationTax(80_000, true), 0, 'a price under the $100,000 exemption owes none');
  const first = closingTaxes('montgomery', 575_000, { firstTimeBuyer: true, principalResidence: true });
  assert.equal(first.sellerTotal, first.total);
  assert.equal(first.lines[0].amount, 1_437.5);
});

test('first-time Maryland rates need the buyer to live in the home', () => {
  // Tax-Property §13-203(b) and Real Property §14-104(c): first-time buyers who will occupy the home.
  const investor = closingTaxes('montgomery', 750_000, { firstTimeBuyer: true, principalResidence: false });
  assert.equal(investor.lines[0].amount, 3_750, 'state transfer tax stays at 0.5%');
  assert.equal(investor.sellerTotal, investor.total / 2);
  const pg = closingTaxes('prince-georges', 500_000, { firstTimeBuyer: true, principalResidence: false });
  assert.equal(pg.lines[0].amount, 2_500);
  assert.ok(pg.notes.some(note => /every buyer on the deed/.test(note)));
});

test('the suggested closing percent rounds up without float noise', () => {
  assert.equal(sellerPercentRoundedUp(closingTaxes('dc', 800_000)), 1.45);
  // 6,125 / 500,000 = 1.225% rounds up to 1.23%.
  assert.equal(sellerPercentRoundedUp(closingTaxes('prince-georges', 500_000)), 1.23);
});

test('credit limit boundaries and wording', () => {
  const offer = { price: 500_000, downPaymentPercent: 10, financing: 'conventional' as const };
  assert.equal(sellerCreditLimit(offer)?.percent, 6, '90% loan-to-value is not above 90%');
  assert.equal(sellerCreditLimit({ ...offer, financing: 'usda' })?.limit, 30_000);
  assert.equal(sellerCreditLimit({ ...offer, financing: 'unknown' }), null);
  assert.equal(sellerCreditLimit({ ...offer, price: 0 }), null);
  assert.equal(creditLimitNote({ ...offer, financing: 'fha', price: 0, sellerCredit: 1_000 }), null);
  const atLimit = creditLimitNote({ ...offer, downPaymentPercent: 5, sellerCredit: 15_000 }) ?? '';
  assert.match(atLimit, /close to/);
  assert.doesNotMatch(atLimit, /over/);
  // $999,990 × 3% = $29,999.70, so a $30,000 credit is 30 cents over and the note shows the cents.
  assert.match(
    creditLimitNote({ ...offer, price: 999_990, downPaymentPercent: 5, sellerCredit: 30_000 }) ?? '',
    /\$0\.30 over the 3% limit \(\$29,999\.70\)/,
  );
  const conventional = creditLimitNote({ ...offer, downPaymentPercent: 5, sellerCredit: 20_000 }) ?? '';
  assert.match(conventional, /confirm with the lender/);
  assert.doesNotMatch(conventional, /buyer’s lender/, 'the note reads the same on either side');
  assert.match(conventional, /investment property the limit is 2%/);
  assert.doesNotMatch(creditLimitNote({ ...offer, financing: 'fha', sellerCredit: 29_000 }) ?? '', /appraisal/);
  assert.match(
    creditLimitNote({ ...offer, financing: 'va', sellerCredit: 25_000 }) ?? '',
    /normal closing costs and discount points/,
  );
});
