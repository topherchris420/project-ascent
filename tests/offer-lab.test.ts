import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeOffer,
  blankOffer,
  compareOfferLab,
  emptyOfferLab,
  offerLabRecord,
  offerLabSchema,
  offerSchema,
  type LabOffer,
  type OfferLab,
} from '../src/lib/offer-lab';
import { mortgagePayment } from '../src/lib/homeowner-finance';
import { saleNetBeforePayoff } from '../src/lib/selling-costs';

const none = { included: false, days: null };
const sellerLab = (): OfferLab => {
  const lab = emptyOfferLab('dc:0800____0842', '2026-10-22', 'seller', {
    commissionPercent: 5,
    closingPercent: 2,
    payoff: 300000,
  });
  lab.settings.monthlyCarryingCost = 3000;
  lab.settings.assumedAcceptance = '2026-10-25';
  const a: LabOffer = {
    ...blankOffer(0, 'seller'),
    id: 'offer-a',
    label: 'Offer A',
    price: 800000,
    sellerCredit: 10000,
    earnestMoney: 20000,
    earnestDueDays: 3,
    financing: 'conventional',
    downPaymentPercent: 20,
    closingDate: '2026-12-06',
    offerExpires: '2026-10-24',
    contingencies: {
      inspection: { included: true, days: 10 },
      appraisal: { included: true, days: 21 },
      financing: { included: true, days: 30 },
      homeSale: none,
    },
  };
  const b: LabOffer = {
    ...blankOffer(1, 'seller'),
    id: 'offer-b',
    label: 'Offer B',
    price: 790000,
    earnestMoney: 50000,
    financing: 'cash',
    closingDate: '2026-11-12',
    escalationCap: 820000,
    contingencies: { inspection: none, appraisal: none, financing: none, homeSale: none },
  };
  lab.offers = [a, b];
  return lab;
};
const figure = (lab: OfferLab, index: number, key: string) =>
  analyzeOffer(lab.offers[index], lab.settings).figures.find(item => item.key === key)?.value;

test('seller proceeds use the brief’s shared sale arithmetic, then the payoff and carrying costs to closing', () => {
  const lab = sellerLab();
  assert.equal(figure(lab, 0, 'commission'), 40000);
  assert.equal(figure(lab, 0, 'closing'), 16000);
  assert.equal(
    figure(lab, 0, 'net'),
    saleNetBeforePayoff(800000, { commissionPercent: 5, closingPercent: 2, concessions: 10000 }),
  );
  assert.equal(figure(lab, 0, 'net'), 734000);
  assert.equal(figure(lab, 0, 'proceeds'), 434000);
  // 45 days from Oct 22 to Dec 6 at $3,000 a month: 3000 × 45 × 12 ÷ 365.
  assert.equal(figure(lab, 0, 'carrying'), 4438.36);
  assert.equal(figure(lab, 0, 'afterCarrying'), 429561.64);
  assert.equal(figure(lab, 1, 'afterCarrying'), 432628.77);
  // The escalation cap is shown as a what-if, never as the price.
  assert.equal(figure(lab, 1, 'atCap'), 820000 * 0.93 - 300000);
  assert.equal(figure(lab, 1, 'price'), 790000);
});

test('a comparison states differences, the price change that would match, and term differences without ranking', () => {
  const comparison = compareOfferLab(sellerLab(), null);
  assert.equal(comparison.referenceOfferId, 'offer-a');
  const [difference] = comparison.differences;
  assert.equal(difference.headlineDifference, 3067.13);
  // Each dollar of price is worth 93 cents of proceeds at 7% percentage costs.
  assert.equal(difference.priceToMatch, Math.round((-3067.13 / 0.93) * 100) / 100);
  assert.equal(difference.closingDaysDifference, -24);
  assert.ok(difference.termDifferences.includes('Home inspection contingency: waived here, included in Offer A.'));
  assert.ok(difference.termDifferences.includes('Financing type: Cash here, Conventional loan in Offer A.'));
  const text = JSON.stringify({ ...comparison, boundaries: [] });
  assert.doesNotMatch(text, /probabilit|likel|reliab|score|rank|best offer|recommend|stronger|weaker|chance/i);
});

test('deadlines are entered or counted from the assumed acceptance date, and missing ones say so', () => {
  const lab = sellerLab();
  const deadlines = analyzeOffer(lab.offers[0], lab.settings).deadlines;
  const byKey = Object.fromEntries(deadlines.map(item => [item.key, item]));
  assert.equal(byKey.expires.date, '2026-10-24');
  assert.equal(byKey.expires.basis, 'entered');
  assert.equal(byKey.earnest.date, '2026-10-28');
  assert.equal(byKey.inspection.date, '2026-11-04');
  assert.match(byKey.inspection.note, /acceptance date you assumed/);
  assert.equal(byKey.financing.date, '2026-11-24');
  assert.deepEqual(
    deadlines.map(item => item.date),
    ['2026-10-24', '2026-10-28', '2026-11-04', '2026-11-15', '2026-11-24', '2026-12-06'],
  );
  lab.settings.assumedAcceptance = null;
  const unassumed = analyzeOffer(lab.offers[0], lab.settings).deadlines.find(item => item.key === 'inspection')!;
  assert.equal(unassumed.date, '2026-11-01');
  assert.match(unassumed.note, /no acceptance date was assumed/);
  const b = analyzeOffer(lab.offers[1], lab.settings).deadlines;
  assert.equal(b.find(item => item.key === 'expires')!.basis, 'missing');
});

test('missing terms stay missing: a blank offer has no headline figure and lists what to enter', () => {
  const lab = sellerLab();
  lab.offers.push({ ...blankOffer(2, 'seller'), id: 'offer-c', label: 'Offer C' });
  const comparison = compareOfferLab(lab, null);
  const blank = comparison.analyses[2];
  assert.equal(blank.complete, false);
  assert.equal(blank.headline, null);
  assert.ok(blank.missing.includes('Offered price'));
  assert.ok(blank.missing.includes('Financing type'));
  assert.ok(blank.missing.includes('Whether there is a home inspection contingency'));
  assert.equal(blank.figures.find(item => item.key === 'price')!.text, 'Not entered');
  assert.equal(comparison.differences.find(item => item.offerId === 'offer-c')!.headlineDifference, null);
  assert.match(comparison.explanation[2], /cannot be calculated yet/);
  // No percentage assumptions means no proceeds, not proceeds at zero cost.
  const noCosts = emptyOfferLab('k', '2026-10-22');
  noCosts.offers = [{ ...blankOffer(0, 'seller'), id: 'offer-x', price: 500000 }];
  assert.equal(compareOfferLab(noCosts, null).analyses[0].headline, null);
});

test('a withheld estimate stays withheld: no comparison with it, and it does not enter the calculation hash', () => {
  const lab = sellerLab();
  const declined = compareOfferLab(lab, { verdict: 'declined', estimate: 999_999, label: 'should never appear' });
  assert.equal(declined.estimate.stated, false);
  assert.deepEqual(declined.estimate.rows, []);
  assert.match(declined.estimate.text, /withholds an estimate/);
  assert.doesNotMatch(JSON.stringify(declined), /999,?999|should never appear/);
  assert.equal(declined.calculationHash, compareOfferLab(lab, null).calculationHash);
  const supported = compareOfferLab(lab, { verdict: 'supported', estimate: 810000, label: 'validated range' });
  assert.deepEqual(
    supported.estimate.rows.map(row => row.difference),
    [-10000, -20000],
  );
  assert.notEqual(supported.calculationHash, declined.calculationHash);
});

test('the calculation hash is reproducible and changes with any term', () => {
  const lab = sellerLab();
  assert.equal(compareOfferLab(lab, null).calculationHash, compareOfferLab(structuredClone(lab), null).calculationHash);
  const changed = sellerLab();
  changed.offers[1].price = 790001;
  assert.notEqual(compareOfferLab(changed, null).calculationHash, compareOfferLab(lab, null).calculationHash);
});

test('sensitivity shows how renegotiation, credits, commission and a later closing move each figure', () => {
  const { sensitivity } = compareOfferLab(sellerLab(), null);
  const change = (start: string) => sensitivity[0].rows.find(row => row.scenario.startsWith(start))?.change;
  assert.equal(change('Price renegotiated 1% lower'), -7440);
  assert.equal(change('Credit to the buyer $5,000 higher'), -5000);
  assert.equal(change('Commission half a percentage point lower'), 4000);
  assert.equal(change('Closing 30 days later'), -2958.9);
});

test('buyer mode: cash to close, a credit capped at closing costs, and the workbench’s mortgage formula', () => {
  const lab = emptyOfferLab('dc:0800____0842', '2026-10-22', 'buyer');
  lab.settings.buyerClosingPercent = 3;
  lab.settings.cashAvailable = 140000;
  lab.settings.monthlyTax = 500;
  lab.settings.monthlyInsurance = 120;
  lab.offers = [
    {
      ...blankOffer(0, 'buyer'),
      id: 'offer-mine',
      price: 500000,
      financing: 'conventional',
      downPaymentPercent: 20,
      interestRate: 6.5,
      loanTermMonths: 360,
      sellerCredit: 20000,
      earnestMoney: 10000,
      closingDate: '2026-12-01',
      contingencies: { inspection: { included: true, days: 7 }, appraisal: none, financing: none, homeSale: none },
    },
  ];
  const analysis = compareOfferLab(lab, null).analyses[0];
  const value = (key: string) => analysis.figures.find(item => item.key === key)!;
  assert.equal(value('down').value, 100000);
  assert.equal(value('loan').value, 400000);
  assert.equal(value('closing').value, 15000);
  assert.equal(value('credit').value, 15000);
  assert.match(value('credit').formula, /limited to your closing costs/);
  assert.equal(value('cashToClose').value, 100000);
  assert.equal(value('remaining').value, 40000);
  assert.equal(value('payment').value, Math.round(mortgagePayment(400000, 6.5, 360) * 100) / 100);
  assert.equal(value('payment').value, 2528.27);
  assert.equal(value('housing').value, 3148.27);
  assert.ok(analysis.notes.some(note => /appraisal contingency is waived on a financed offer/.test(note)));
});

test('the schema rejects inconsistent terms and duplicate offers', () => {
  const base = blankOffer(0, 'seller');
  assert.throws(() => offerSchema.parse({ ...base, price: 500000, escalationCap: 400000 }), /escalation cap/);
  assert.throws(() => offerSchema.parse({ ...base, price: 500000, earnestMoney: 600000 }), /Earnest money/);
  assert.throws(() => offerSchema.parse({ ...base, financing: 'cash', downPaymentPercent: 20 }), /cash offer/);
  assert.throws(() => offerSchema.parse({ ...base, closingDate: '2026-02-31x' }));
  assert.throws(() => offerSchema.parse({ ...base, unexpected: true }));
  const lab = sellerLab();
  lab.offers[1].id = 'offer-a';
  assert.throws(() => offerLabSchema.parse(lab), /unique/);
});

test('the private record carries every term, the comparison and a privacy notice', () => {
  const lab = sellerLab();
  const record = offerLabRecord(lab, compareOfferLab(lab, null), '1 Example St NW');
  assert.equal(record.format, 'ascent-offer-comparison-record-1');
  assert.match(record.privacy, /Private/);
  assert.equal(record.lab.offers.length, 2);
  assert.equal(record.comparison.analyses.length, 2);
});
