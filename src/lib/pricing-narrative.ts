import type { CmaResult, Property } from './types';

export type PricingPosition = 'conservative' | 'moderate' | 'aggressive';
export type PricingNarrative = {
  position: PricingPosition | 'below-range' | 'above-range';
  tone: 'positive' | 'neutral' | 'review';
  headline: string;
  points: string[];
  tradeoffs: Record<PricingPosition, string>;
};

const usd = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : 0;
};

/** Deterministic narration of the computed pricing evidence. Every sentence restates a number already on screen. */
export function explainPricing(
  cma: CmaResult,
  listPrice: number,
  properties: Property[],
  lookup: (id: string) => Property | undefined,
): PricingNarrative {
  const { low, high, estimate, strategies } = cma;
  const nearest = (Object.entries(strategies) as [PricingPosition, number][]).reduce((best, entry) =>
    Math.abs(entry[1] - listPrice) < Math.abs(best[1] - listPrice) ? entry : best,
  )[0];
  const position = listPrice < low ? 'below-range' : listPrice > high ? 'above-range' : nearest;
  const headroom = high - listPrice;
  const headline =
    position === 'above-range'
      ? `Priced ${usd(listPrice - high)} above every adjusted comparable. Buyers and appraisers will need a reason.`
      : position === 'below-range'
        ? `Priced ${usd(low - listPrice)} under the supported range. Expect fast attention, at the cost of value left on the table.`
        : headroom > 0 && listPrice >= estimate
          ? `Inside the supported range and ${usd(headroom)} below its top, leaving room to negotiate.`
          : `Inside the supported range, at or under the estimate. Positioned to draw buyers early.`;
  const points: string[] = [];
  const supporting = cma.comps.filter(comp => comp.adjustedPrice >= listPrice).length;
  points.push(
    `${supporting} of ${cma.comps.length} adjusted comparable${cma.comps.length === 1 ? '' : 's'} support${supporting === 1 ? 's' : ''} this price or higher.`,
  );
  const closest = [...cma.comps].sort(
    (a, b) => Math.abs(a.adjustedPrice - listPrice) - Math.abs(b.adjustedPrice - listPrice),
  )[0];
  if (closest) {
    const record = lookup(closest.propertyId);
    points.push(
      `Closest evidence: ${record?.address ?? 'a comparable sale'} adjusts to ${usd(closest.adjustedPrice)} (${Math.round(closest.weight * 100)}% weight, ${closest.distanceMiles.toFixed(2)} mi).`,
    );
  }
  const spread = estimate ? ((high - low) / estimate) * 100 : 0;
  points.push(
    spread <= 3
      ? `Comparables agree closely: the adjusted range spans ${spread.toFixed(1)}% of the estimate.`
      : spread <= 8
        ? `Moderate agreement: the adjusted range spans ${spread.toFixed(1)}% of the estimate.`
        : `Wide disagreement: the adjusted range spans ${spread.toFixed(1)}% of the estimate. Inspect outliers before advising.`,
  );
  const competing = properties.filter(
    item => item.id !== cma.subjectId && item.status === 'active' && Math.abs(item.price / listPrice - 1) <= 0.05,
  );
  points.push(
    competing.length
      ? `${competing.length} competing active listing${competing.length === 1 ? '' : 's'} within ±5% of this price, median ${median(competing.map(item => item.dom))} days on market.`
      : 'No competing active listings recorded within ±5% of this price.',
  );
  if (cma.comps.length < 3)
    points.push('Fewer than three comparables are in use. Widen the search before relying on this.');
  // Only sold candidates appear in the comparable table; listings are never comparables.
  const excludedSales = cma.excluded.filter(item => lookup(item.propertyId)?.status === 'sold').length;
  if (excludedSales)
    points.push(
      `${excludedSales} closed sale${excludedSales === 1 ? ' was' : 's were'} excluded by your filters; each reason is shown in the table below.`,
    );
  return {
    position,
    tone:
      position === 'above-range' || cma.comps.length < 3 || spread > 8
        ? 'review'
        : position === 'below-range'
          ? 'neutral'
          : 'positive',
    headline,
    points,
    tradeoffs: {
      conservative: `${usd(strategies.conservative)} · near the low end. Widest buyer pool and quickest attention; least negotiating room.`,
      moderate: `${usd(strategies.moderate)} · at the weighted estimate. Defensible with the comparables as they stand.`,
      aggressive: `${usd(strategies.aggressive)} · tests the top of the range. Needs standout condition or timing; expect longer market time.`,
    },
  };
}
