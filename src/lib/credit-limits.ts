/**
 * Seller-credit limits set by loan programs: the most a seller (or another interested party) may contribute toward a
 * buyer's costs before the lender must treat the excess as a price reduction or decline it. Each limit is quoted from
 * the program's own guide. Ascent compares an entered credit with the limit; it cannot see the appraisal, the
 * occupancy the lender records, second loans or which costs the credit pays, so every result says what it assumed.
 */
import type { LabOffer } from './offer-lab';

export const CREDIT_LIMITS_CHECKED_ON = '2026-10-30';
export type Occupancy = 'primary' | 'investment';
export type CreditLimit = {
  program: string;
  /** The loan's name inside a sentence: "a conventional loan". */
  loan: string;
  /** Limit as a percentage of the base. */
  percent: number;
  base: string;
  limit: number;
  source: string;
  url: string;
  caveats: string[];
};

/** Whole dollars, or cents when the amount has them, so "$30,000 is over the $29,999.70 limit" never reads as equal. */
const usd = (value: number) => {
  const cents = !Number.isInteger(Math.round(value * 100) / 100);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
};

/** Fannie Mae Selling Guide B3-4.1-02 and Freddie Mac Guide 5501.6 share these limits. */
export function conventionalLimitPercent(loanToValuePercent: number, occupancy: Occupancy) {
  if (occupancy === 'investment') return 2;
  if (loanToValuePercent > 90) return 3;
  if (loanToValuePercent > 75) return 6;
  return 9;
}

export function sellerCreditLimit(
  offer: Pick<LabOffer, 'financing' | 'downPaymentPercent' | 'price'>,
  occupancy: Occupancy = 'primary',
): CreditLimit | null {
  if (offer.price === null || offer.price <= 0) return null;
  const price = offer.price;
  switch (offer.financing) {
    case 'conventional': {
      if (offer.downPaymentPercent === null) return null;
      const ltv = 100 - offer.downPaymentPercent;
      const percent = conventionalLimitPercent(ltv, occupancy);
      return {
        program: 'Conventional loan (Fannie Mae and Freddie Mac)',
        loan: 'a conventional loan',
        percent,
        base: 'the lower of the price and the appraised value',
        limit: (price * percent) / 100,
        source: `Fannie Mae Selling Guide B3-4.1-02 and Freddie Mac Guide 5501.6: ${percent}% at ${ltv}% loan-to-value for a ${occupancy === 'primary' ? 'primary residence or second home' : 'investment property'}.`,
        url: 'https://selling-guide.fanniemae.com/sel/b3-4.1-02/interested-party-contributions-ipcs',
        caveats: [
          `Assumes ${offer.downPaymentPercent}% down with no second loan; down payment assistance loans raise the combined loan-to-value and can lower the limit.`,
          ...(occupancy === 'primary'
            ? [
                `Assumes the buyer will live in the home or use it as a second home; for an investment property the limit is ${conventionalLimitPercent(ltv, 'investment')}%.`,
              ]
            : []),
          'Assumes the price is at or below the appraised value; a lower appraisal lowers the dollar limit.',
          'Seller-paid costs that are customary for sellers in the area do not count; a seller-paid rate buydown does.',
        ],
      };
    }
    case 'fha':
      return {
        program: 'FHA loan',
        loan: 'an FHA loan',
        percent: 6,
        base: 'the sales price',
        limit: price * 0.06,
        source:
          'HUD Handbook 4000.1, II.A.4.d.iii(G): interested parties may contribute up to 6% of the sales price toward the buyer’s closing costs, prepaid items and discount points.',
        url: 'https://www.hud.gov/hud-partners/single-family-handbook-4000-1',
        caveats: [
          'Seller-paid rate buydowns count toward the 6%; agent commissions the seller customarily pays do not.',
        ],
      };
    case 'va':
      return {
        program: 'VA loan',
        loan: 'a VA loan',
        percent: 4,
        base: 'the reasonable value set by the VA appraisal',
        limit: price * 0.04,
        source:
          'VA Pamphlet 26-7, chapter 8: seller concessions may not exceed 4% of the established reasonable value.',
        url: 'https://www.benefits.va.gov/WARMS/pam26_7.asp',
        caveats: [
          'The 4% counts concessions such as paying the funding fee, prepaid taxes and insurance, or the buyer’s debts. The seller paying the buyer’s normal closing costs and discount points does not count, and Ascent cannot tell which the credit covers. A seller-paid temporary buydown counts.',
          'Assumes the reasonable value equals the price.',
        ],
      };
    case 'usda':
      return {
        program: 'USDA guaranteed loan',
        loan: 'a USDA guaranteed loan',
        percent: 6,
        base: 'the sales price',
        limit: price * 0.06,
        source:
          'USDA Rural Development HB-1-3555, paragraph 6.2: seller and other interested-party contributions are limited to 6% of the sales price.',
        url: 'https://www.rd.usda.gov/sites/default/files/3555-1chapter06.pdf',
        caveats: ['Seller-paid repairs and the buyer’s agent commission do not count toward the 6%.'],
      };
    default:
      return null;
  }
}

/** A plain note when an entered credit exceeds, or nearly reaches, the program's limit. */
export function creditLimitNote(
  offer: Pick<LabOffer, 'financing' | 'downPaymentPercent' | 'price' | 'sellerCredit'>,
): string | null {
  const credit = offer.sellerCredit ?? 0;
  if (credit <= 0) return null;
  const limit = sellerCreditLimit(offer);
  if (!limit) {
    if (offer.financing === 'conventional' && offer.downPaymentPercent === null)
      return 'Conventional loans cap seller credits at 3% to 9% of the price depending on the down payment; enter the down payment to compare this credit.';
    return null;
  }
  const caveats = limit.caveats.join(' ');
  // VA counts only concessions beyond normal closing costs and discount points, which Ascent cannot separate.
  if (credit > limit.limit && offer.financing === 'va')
    return `The ${usd(credit)} credit is above the ${limit.percent}% limit (${usd(limit.limit)}) for ${limit.loan}, measured on ${limit.base}. Only the part that pays for more than the buyer’s normal closing costs and discount points counts toward it, so confirm with the lender how much of this credit counts. ${caveats}`;
  if (credit > limit.limit)
    return `The ${usd(credit)} credit is ${usd(credit - limit.limit)} over the ${limit.percent}% limit (${usd(limit.limit)}) for ${limit.loan}, measured on ${limit.base}. Lenders usually treat the excess as a price reduction or refuse it, so confirm with the lender before relying on this credit. ${caveats}`;
  if (credit >= limit.limit * 0.9)
    return `The ${usd(credit)} credit is close to the ${limit.percent}% limit (${usd(limit.limit)}) for ${limit.loan}. ${caveats}`;
  return null;
}
