import { compareOffers, DEMO_AS_OF } from './analytics';
import type { Offer } from './types';

export const strengthFactorKeys = ['price', 'financing', 'inspection', 'contingencies', 'earnest', 'closing'] as const;
export type StrengthFactorKey = (typeof strengthFactorKeys)[number];
export type StrengthWeights = Record<StrengthFactorKey, number>;
export type StrengthFactor = {
  key: StrengthFactorKey;
  label: string;
  score: number;
  weight: number;
  rationale: string;
  formula: string;
};
export type OfferStrength = {
  offerId: string;
  score: number;
  band: 'Strong' | 'Competitive' | 'Moderate' | 'Weak';
  factors: StrengthFactor[];
  reference: { kind: 'estimate' | 'best-offer'; value: number };
  notes: string[];
};

/** Seller-side defaults. They are an explicit starting point the professional re-weights to the client's priorities. */
export const defaultStrengthWeights: StrengthWeights = {
  price: 35,
  financing: 15,
  inspection: 10,
  contingencies: 15,
  earnest: 10,
  closing: 15,
};
export const strengthFactorLabels: Record<StrengthFactorKey, string> = {
  price: 'Net price vs. reference',
  financing: 'Financing',
  inspection: 'Inspection terms',
  contingencies: 'Other contingencies',
  earnest: 'Earnest money',
  closing: 'Closing fit',
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
/** Piecewise-linear interpolation through sorted [x, score] points; flat beyond the ends. */
const scale = (x: number, points: [number, number][]) => {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return points.at(-1)![1];
};
const DAYS = /(\d{1,3})\s*(?:calendar\s+|business\s+)?days?/i;
/** Days stated in the first contingency matching `pattern`, null when absent, NaN when present without a stated length. */
export function contingencyDays(contingencies: string[], pattern: RegExp): number | null {
  const entry = contingencies.find(item => pattern.test(item));
  if (!entry) return null;
  const match = entry.match(DAYS);
  return match ? Number(match[1]) : Number.NaN;
}

export function scoreOffer(
  offer: Offer,
  options: {
    estimate?: number;
    competing?: Offer[];
    targetCloseDays?: number;
    weights?: Partial<StrengthWeights>;
    asOf?: string;
  } = {},
): OfferStrength {
  const asOf = options.asOf ?? DEMO_AS_OF;
  const weights = { ...defaultStrengthWeights, ...options.weights };
  const row = compareOffers([offer], asOf).rows[0];
  const net = offer.price - offer.sellerCredit;
  const bestNet = Math.max(net, ...(options.competing ?? []).map(other => other.price - other.sellerCredit));
  const reference =
    options.estimate && options.estimate > 0
      ? { kind: 'estimate' as const, value: options.estimate }
      : { kind: 'best-offer' as const, value: bestNet };
  const ratio = net / reference.value;
  const factors: StrengthFactor[] = [];
  const add = (key: StrengthFactorKey, score: number, rationale: string, formula: string) =>
    factors.push({
      key,
      label: strengthFactorLabels[key],
      score: clamp(score),
      weight: weights[key],
      rationale,
      formula,
    });

  add(
    'price',
    scale(ratio, [
      [0.93, 0],
      [0.97, 45],
      [1, 75],
      [1.03, 100],
    ]),
    `Net of seller credit is ${((ratio - 1) * 100).toFixed(1)}% ${ratio >= 1 ? 'above' : 'below'} the ${reference.kind === 'estimate' ? 'comparable-supported estimate' : 'best net offer received'}.`,
    `(${offer.price} − ${offer.sellerCredit}) / ${Math.round(reference.value)} = ${ratio.toFixed(4)}; 0.93→0, 0.97→45, 1.00→75, 1.03→100`,
  );

  const financingScore =
    offer.financing === 'cash'
      ? 100
      : offer.financing === 'conventional'
        ? scale(offer.downPercent, [
            [3, 62],
            [10, 72],
            [20, 85],
            [30, 90],
          ])
        : offer.financing === 'va'
          ? 66
          : 60;
  add(
    'financing',
    financingScore,
    offer.financing === 'cash'
      ? 'Cash removes lender approval from the path to closing; proof of funds still needs review.'
      : `${offer.financing.toUpperCase()} with ${offer.downPercent}% down. More equity generally means more room if the appraisal comes in low.`,
    offer.financing === 'conventional'
      ? `Conventional: 3%→62, 10%→72, 20%→85, 30%→90 down`
      : 'Cash 100 · Conventional 62–90 by down payment · VA 66 · FHA 60',
  );

  const inspection = contingencyDays(offer.contingencies, /inspect/i);
  add(
    'inspection',
    inspection === null
      ? 100
      : Number.isNaN(inspection)
        ? 55
        : scale(inspection, [
            [3, 92],
            [7, 80],
            [10, 65],
            [21, 40],
          ]),
    inspection === null
      ? 'No inspection contingency was recorded. Confirm against the signed contract before relying on it.'
      : Number.isNaN(inspection)
        ? 'An inspection contingency is recorded without a stated length.'
        : `${inspection}-day inspection period.`,
    'None recorded 100 · unstated length 55 · 3 days→92, 7→80, 10→65, 21→40',
  );

  const appraisal = contingencyDays(offer.contingencies, /apprais/i) !== null;
  const financingDays = contingencyDays(offer.contingencies, /financ|loan/i);
  const saleOfHome = offer.contingencies.some(item => /sale of|existing home|home sale|sell/i.test(item));
  const financingPenalty =
    financingDays === null
      ? 0
      : Number.isNaN(financingDays)
        ? 15
        : scale(financingDays, [
            [10, 6],
            [21, 12],
            [30, 18],
          ]);
  add(
    'contingencies',
    100 - (appraisal ? 15 : 0) - financingPenalty - (saleOfHome ? 40 : 0),
    [
      appraisal && 'appraisal contingency',
      financingDays !== null &&
        (Number.isNaN(financingDays)
          ? 'financing contingency (length unstated)'
          : `${financingDays}-day financing contingency`),
      saleOfHome && 'contingent on the sale of another home',
    ]
      .filter(Boolean)
      .join(', ')
      .replace(/^./, first => first.toUpperCase()) || 'No appraisal, financing or home-sale contingency recorded.',
    '100 − appraisal 15 − financing 6–18 by length (15 if unstated) − home sale 40',
  );

  add(
    'earnest',
    scale(row.earnestPercent, [
      [0.5, 30],
      [1, 55],
      [2, 80],
      [3, 100],
    ]),
    `$${offer.earnestMoney.toLocaleString('en-US')} deposit is ${row.earnestPercent.toFixed(2)}% of price.`,
    'Earnest / price: 0.5%→30, 1%→55, 2%→80, 3%→100',
  );

  const target = options.targetCloseDays;
  const closingScore =
    row.daysToClose < 0
      ? 0
      : target
        ? 100 - Math.abs(row.daysToClose - target) * 3
        : scale(row.daysToClose, [
            [10, 60],
            [21, 88],
            [45, 92],
            [75, 55],
          ]);
  add(
    'closing',
    closingScore,
    row.daysToClose < 0
      ? 'The stated closing date has already passed.'
      : target
        ? `Closes in ${row.daysToClose} days against the seller's ${target}-day target.`
        : `Closes in ${row.daysToClose} days.`,
    target
      ? `100 − 3 × |${row.daysToClose} − ${target}| days from target`
      : 'No seller target: 10 days→60, 21→88, 45→92, 75→55',
  );

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = totalWeight
    ? Math.round(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0) / totalWeight)
    : 0;
  const notes: string[] = [];
  if (row.expired) notes.push('This offer has expired. Get a documented extension before treating it as live.');
  if (reference.kind === 'best-offer')
    notes.push('No saved estimate for this property, so price is scored against the best net offer received.');
  return {
    offerId: offer.id,
    score,
    band: score >= 80 ? 'Strong' : score >= 65 ? 'Competitive' : score >= 50 ? 'Moderate' : 'Weak',
    factors,
    reference,
    notes,
  };
}

export function rankOffers(offers: Offer[], options: Omit<Parameters<typeof scoreOffer>[1], 'competing'> = {}) {
  return offers
    .map(offer => scoreOffer(offer, { ...options, competing: offers.filter(other => other.id !== offer.id) }))
    .sort((a, b) => b.score - a.score);
}
