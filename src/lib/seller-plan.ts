import { simulatePricing } from './analytics';
import type { CmaResult, Scenario } from './types';

export type SellerCosts = Scenario['costAssumptions'];
export type SellerPlanRow = {
  key: 'conservative' | 'moderate' | 'aggressive' | 'selected' | 'reduction' | 'credit';
  label: string;
  detail: string;
  price: number;
  credit: number;
  sellingCosts: number;
  netBeforePayoff: number;
  netAfterPayoff: number;
};

/**
 * Round-number price filters used by many listing search tools. This is a disclosed convention, not
 * a measured buyer behavior: $25,000 steps below $1M, $50,000 steps to $2M, then $100,000 steps.
 */
export function searchStep(price: number) {
  return price < 1_000_000 ? 25_000 : price < 2_000_000 ? 50_000 : 100_000;
}

/** The nearest search thresholds at or below and above a price, and how far the price sits from each. */
export function searchThresholds(price: number) {
  const step = searchStep(price);
  let below = Math.floor(price / step) * step;
  // Crossing $1M/$2M changes the step; the threshold just below must use the lower band's step.
  if (below === price && price > 0) below = price - searchStep(price - 1);
  const above = Math.floor(price / step) * step + step;
  return { below, above, overBelow: price - below, underAbove: above - price, step };
}

/** A factual note about filter visibility, or '' when the price is not close to a threshold. */
export function thresholdNote(price: number, money: (n: number) => string) {
  const { below, above, overBelow, underAbove } = searchThresholds(price);
  const exact = price % searchStep(price) === 0;
  if (exact)
    return `${money(price)} is exactly on a common search threshold, so it appears for buyers filtering at ${money(price)} or higher.`;
  if (overBelow <= below * 0.01)
    return `${money(price)} sits ${money(overBelow)} above the ${money(below)} threshold. A buyer whose search maximum is ${money(below)} will not see it.`;
  if (underAbove <= above * 0.01)
    return `${money(price)} sits ${money(underAbove)} under the ${money(above)} threshold, so it also appears for buyers filtering at ${money(above)}.`;
  return '';
}

/**
 * Deterministic seller arithmetic for a pricing conversation. Each row assumes a sale at that price;
 * no row predicts buyer response, timing, appraisal outcome or which move will be needed.
 */
export function sellerPlan(result: CmaResult, selectedPrice: number, costs: SellerCosts, payoff: number) {
  const row = (key: SellerPlanRow['key'], label: string, detail: string, price: number, credit = 0): SellerPlanRow => {
    const scenario = simulatePricing(result, price, { ...costs, concessions: costs.concessions + credit });
    return {
      key,
      label,
      detail,
      price,
      credit,
      sellingCosts: Math.round((price * (costs.commissionPercent + costs.closingPercent)) / 100),
      netBeforePayoff: scenario.estimatedNet,
      netAfterPayoff: scenario.estimatedNet - payoff,
    };
  };
  const rows: SellerPlanRow[] = [
    row('conservative', 'Conservative', 'At the lowest adjusted sale', result.strategies.conservative),
    row('moderate', 'Balanced', 'At the weighted estimate', result.strategies.moderate),
    row('aggressive', 'Aggressive', 'At the highest adjusted sale', result.strategies.aggressive),
  ];
  if (!rows.some(r => r.price === selectedPrice))
    rows.push(row('selected', 'Your selected price', 'Entered asking-price assumption', selectedPrice));
  const { below } = searchThresholds(selectedPrice);
  const reduction = selectedPrice - below;
  if (below > 0 && reduction > 0) {
    rows.push(
      row(
        'reduction',
        `Reduce to ${below.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
        'Next search threshold below your selected price',
        below,
      ),
      row(
        'credit',
        'Same amount as a credit',
        `Hold your selected price and credit ${reduction.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
        selectedPrice,
        reduction,
      ),
    );
  }
  const percent = (costs.commissionPercent + costs.closingPercent) / 100;
  return {
    rows,
    reduction: reduction > 0 ? reduction : 0,
    // A credit leaves percentage costs on the higher price, so it nets this much less than an equal reduction.
    creditPenalty: reduction > 0 ? Math.round(reduction * percent) : 0,
    assumptions: [
      `Percentage costs (${costs.commissionPercent}% negotiable commission and ${costs.closingPercent}% other closing costs) apply to the contract price.`,
      'Every row assumes a sale at its price. Nothing here predicts buyer response, timing or which move will be needed.',
      'Credit limits set by loan programs and appraisals are not modeled. Taxes, liens, repairs and prorations are excluded.',
      'Search thresholds use a disclosed round-number convention, not measured buyer behavior.',
    ],
  };
}
