import type { CmaResult, Source, ValuationProperty } from './types';

/**
 * Transparent review heuristics, NOT a probability of valuation accuracy, appraisal grade,
 * market coverage score, or source-use authorization. Callers must supply only authorized records.
 */
export type EvidenceFinding = {
  severity: 'review' | 'context';
  label: string;
  detail: string;
};
export type EvidenceAssessment = {
  status: 'illustrative' | 'limited' | 'reviewable';
  label: string;
  comparableCount: number;
  effectiveComparableCount: number;
  largestWeightPercent: number;
  adjustedSpreadPercent: number;
  findings: EvidenceFinding[];
};

export function assessCmaEvidence(result: CmaResult, sources: Source[]): EvidenceAssessment {
  const findings: EvidenceFinding[] = [];
  const review = (label: string, detail: string) => findings.push({ severity: 'review', label, detail });
  const context = (label: string, detail: string) => findings.push({ severity: 'context', label, detail });
  const n = result.comps.length;
  const effective = n ? 1 / result.comps.reduce((sum, comp) => sum + comp.weight ** 2, 0) : 0;
  const largest = n ? Math.max(...result.comps.map(comp => comp.weight)) * 100 : 0;
  const spread = result.estimate > 0 ? ((result.high - result.low) / result.estimate) * 100 : 0;
  const referenced = result.sourceIds.map(id => sources.find(source => source.id === id));
  const illustrative = referenced.some(source => source?.kind === 'synthetic');
  if (illustrative)
    context('Demonstration evidence', 'One or more inputs are fictional. This is not a live-market valuation.');
  if (referenced.some(source => !source))
    review(
      'Source identification incomplete',
      'At least one referenced source lacks visible provenance metadata. Verify origin and permitted use.',
    );
  const analysisTime = Date.parse(result.asOf);
  for (const source of referenced.filter((s): s is Source => !!s)) {
    const observed = Date.parse(source.observedAt);
    if (!Number.isFinite(observed))
      review('Source timestamp missing', `${source.label}: no valid observation date is available.`);
    else if (observed > analysisTime)
      review(
        'Source observed after analysis',
        `${source.label} was observed after the calculation date. Verify the historical evidence available at that time; no backdating is implied.`,
      );
    else if ((analysisTime - observed) / 86400000 > 30)
      review(
        'Source observation needs refresh',
        `${source.label} was observed ${Math.floor((analysisTime - observed) / 86400000)} days before analysis. The 30-day review trigger is an analyst heuristic, not the provider's refresh agreement.`,
      );
  }
  if (!n) review('No comparable sales', 'A supported valuation needs eligible recorded sales.');
  else if (n < 3)
    review(
      'Sparse sales',
      `Only ${n} eligible closed sale${n === 1 ? '' : 's'}; expand documented criteria or obtain more evidence.`,
    );
  if (n >= 2 && effective < 2)
    review(
      'Concentrated weights',
      `Effective comparable count is ${effective.toFixed(1)} despite ${n} sales. One or two sales dominate the result.`,
    );
  if (n >= 2 && largest > 60)
    review(
      'Dominant sale',
      `The largest comparable carries ${largest.toFixed(1)}% of the weight; inspect its location, condition and timing.`,
    );
  if (n >= 2 && spread > 20)
    review(
      'Wide adjusted range',
      `The observed adjusted-sale spread is ${spread.toFixed(1)}% of the estimate, using a 20% review heuristic rather than a calibrated threshold.`,
    );
  const snapshot = result.inputSnapshot;
  if (!snapshot)
    review(
      'Archived inputs unavailable',
      'The raw subject and candidate records are missing; full feature-quality review and replay may be unavailable.',
    );
  const candidates = new Map(snapshot?.candidates.map(candidate => [candidate.id, candidate]));
  const highAdjustments = result.comps.filter(comp => {
    const sale = candidates.get(comp.propertyId)?.soldPrice;
    return (
      (sale && sale > 0 && comp.grossAdjustment / sale > 0.25) ||
      comp.warnings.some(warning => /gross adjustments exceed 25%/i.test(warning))
    );
  });
  if (highAdjustments.length)
    review(
      'Large feature adjustments',
      `${highAdjustments.length} sale${highAdjustments.length === 1 ? '' : 's'} exceed the 25% gross-adjustment review heuristic. Adjustments may double-count related features.`,
    );
  if (snapshot?.subject.condition === undefined || result.assumptions.conditionValue === 0)
    review(
      'Unverified condition',
      'Condition is missing or its adjustment has been deliberately disabled. Physical differences remain unmodeled.',
    );
  if (snapshot?.subject.roomCountsUnavailable)
    review(
      'Room counts unavailable',
      'This source has no bedroom or bathroom counts, so the model cannot adjust for room-count differences.',
    );
  if (snapshot?.subject.ratingKind === 'quality-grade')
    review(
      'Interior condition unmeasured',
      'The modeled rating is assessor construction quality grade. It does not measure interior condition or renovations.',
    );
  if (result.assumptions.monthlyTrend !== 0)
    context('Assumed price trend', 'The monthly trend is analyst-entered, not fitted to these sales.');
  context(
    'Unmodeled market factors',
    'Concessions, permits, lot features, school boundaries and off-market changes are not priced by this model.',
  );
  context(
    'Uncalibrated range',
    'The adjusted-comp envelope is not a statistical confidence interval, sale-probability forecast or appraisal.',
  );
  const status = illustrative ? 'illustrative' : findings.some(f => f.severity === 'review') ? 'limited' : 'reviewable';
  return {
    status,
    label:
      status === 'illustrative'
        ? 'Fictional practice evidence'
        : status === 'limited'
          ? 'Review gaps before relying'
          : 'Ready for professional review, not validated',
    comparableCount: n,
    effectiveComparableCount: Number(effective.toFixed(2)),
    largestWeightPercent: Number(largest.toFixed(1)),
    adjustedSpreadPercent: Number(spread.toFixed(1)),
    findings,
  };
}

export const assumptionNames: Record<keyof CmaResult['assumptions'], string> = {
  sqftRate: 'Living-area rate',
  bedroomValue: 'Bedroom adjustment',
  bathroomValue: 'Bathroom adjustment',
  conditionValue: 'Condition adjustment',
  monthlyTrend: 'Time-trend assumption',
  maxDistanceMiles: 'Search radius',
  maxAgeDays: 'Maximum sale age',
  maxSizeRatio: 'Maximum size ratio',
};
const valuationFacts = (p: ValuationProperty) =>
  JSON.stringify([
    p.sourceId,
    p.id,
    p.lat,
    p.lng,
    p.beds,
    p.baths,
    p.sqft,
    p.condition,
    p.status,
    p.soldAt,
    p.soldPrice,
  ]);

/** Observed differences, never an assertion that a market move caused a price change. */
export type DecisionComparison = {
  previousEstimate: number;
  currentEstimate: number;
  estimateChange: number;
  estimateChangePercent: number;
  lowChange: number;
  highChange: number;
  addedSales: string[];
  removedSales: string[];
  revisedSharedSales: string[];
  subjectFactsChanged: boolean | null;
  assumptionChanges: { label: string; before: number; after: number }[];
  analysisDateChanged: boolean;
  algorithmChanged: boolean;
  inputComparisonAvailable: boolean;
  sameCalculation: boolean;
};
export function compareCmaDecisions(previous: CmaResult, current: CmaResult): DecisionComparison {
  if (previous.subjectId !== current.subjectId)
    throw new Error('Decision comparison requires the same subject property.');
  const beforeIds = new Set(previous.comps.map(comp => comp.propertyId));
  const nowIds = new Set(current.comps.map(comp => comp.propertyId));
  const available = Boolean(previous.inputSnapshot && current.inputSnapshot);
  const beforeInputs = new Map(previous.inputSnapshot?.candidates.map(p => [p.id, p]));
  const currentInputs = new Map(current.inputSnapshot?.candidates.map(p => [p.id, p]));
  const revisedSharedSales = available
    ? [...beforeIds]
        .filter(
          id =>
            nowIds.has(id) &&
            beforeInputs.has(id) &&
            currentInputs.has(id) &&
            valuationFacts(beforeInputs.get(id)!) !== valuationFacts(currentInputs.get(id)!),
        )
        .sort()
    : [];
  const assumptionChanges = (Object.keys(assumptionNames) as (keyof CmaResult['assumptions'])[])
    .filter(key => previous.assumptions[key] !== current.assumptions[key])
    .map(key => ({ label: assumptionNames[key], before: previous.assumptions[key], after: current.assumptions[key] }));
  return {
    previousEstimate: previous.estimate,
    currentEstimate: current.estimate,
    estimateChange: current.estimate - previous.estimate,
    estimateChangePercent:
      previous.estimate > 0 ? (100 * (current.estimate - previous.estimate)) / previous.estimate : 0,
    lowChange: current.low - previous.low,
    highChange: current.high - previous.high,
    addedSales: [...nowIds].filter(id => !beforeIds.has(id)).sort(),
    removedSales: [...beforeIds].filter(id => !nowIds.has(id)).sort(),
    revisedSharedSales,
    subjectFactsChanged: available
      ? valuationFacts(previous.inputSnapshot!.subject) !== valuationFacts(current.inputSnapshot!.subject)
      : null,
    assumptionChanges,
    analysisDateChanged: previous.asOf !== current.asOf,
    algorithmChanged: previous.version !== current.version,
    inputComparisonAvailable: available,
    sameCalculation: previous.calculationHash === current.calculationHash,
  };
}
