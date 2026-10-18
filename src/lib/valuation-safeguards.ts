import { calculateCma, defaultAssumptions, type OutcomeEvaluation } from './analytics';
import type { CmaResult, Source, ValuationProperty } from './types';
import type { ValidationReport } from './valuation-validation';
import kingCountyJson from './valuation-benchmark.json';
import dcJson from './valuation-benchmark-dc.json';

/**
 * Production safeguards around a computed valuation: a release gate run before a CMA can be approved,
 * an operator kill switch, an engine integrity self-test, and outcome drift monitoring. Every check is a
 * named, explainable rule; none of them changes the estimate. They decide whether a professional may
 * rely on it unaided, must review it, or cannot release it.
 */

export const SAFEGUARD_POLICY_VERSION = 'ascent-valuation-safeguards-1';

/** The measured, in-app summary of the committed validation report (written by `npm run validate:valuation`). */
export type ValuationBenchmark = {
  reportDigest: string;
  protocolDigest: string;
  protocolId: string;
  /** The market the holdout measured; its calibration applies only to subjects located there. */
  market: { id: string; label: string; state: string };
  accepted: boolean;
  dataset: { id: string; label: string; license: string; csvSha256: string; screened: number };
  holdout: { from: string; to: string; sales: number };
  windows: Record<'fit' | 'select' | 'calibrate' | 'test', { from: string; to: string }>;
  engine: { version: string; fingerprint: string };
  primary: BenchmarkVariant;
  shipped: BenchmarkVariant;
  baselines: { id: string; label: string; mdape: number; ppe10: number }[];
  paired: { baseline: string; mdapeDelta: number; ci95: [number, number]; winRate: number }[];
  intervals: { target: number; calibratedCoverage: number; calibratedMedianWidth: number; envelopeCoverage: number };
  tiers: {
    id: string;
    maxComps: number | null;
    holdoutSales: number;
    mdape: number | null;
    coverage: number;
    lowerPercent: number;
    upperPercent: number;
    lowerLogRatio: number;
    upperLogRatio: number;
  }[];
  fittedAssumptions: Record<string, number>;
  acceptance: { id: string; label: string; value: number; min?: number; max?: number; passed: boolean }[];
};
type BenchmarkVariant = {
  id: string;
  label: string;
  valuedShare: number;
  mdape: number;
  mdapeCi95: [number, number];
  ppe10Ci95: [number, number];
  ppe5: number;
  ppe10: number;
  ppe20: number;
  medianSignedError: number;
  cod: number;
  prd: number;
};

const markets: Record<string, { market: ValuationBenchmark['market']; dataset: string }> = {
  'ascent-valuation-validation-1': {
    market: { id: 'king-county', label: 'King County, WA', state: 'WA' },
    dataset: 'King County, WA recorded sales',
  },
  'ascent-valuation-validation-dc-1': {
    market: { id: 'dc', label: 'Washington, DC', state: 'DC' },
    dataset: 'District of Columbia recorded sales',
  },
  'ascent-valuation-validation-maryland-1': {
    market: { id: 'maryland', label: 'Montgomery & Prince George’s, MD', state: 'MD' },
    dataset: 'Maryland SDAT/MDP recorded sales in Montgomery and Prince George’s',
  },
};

export function benchmarkFromReport(report: ValidationReport): ValuationBenchmark {
  const place = markets[report.protocol.id];
  if (!place) throw new Error(`No market label is declared for ${report.protocol.id}.`);
  const variant = (id: string): BenchmarkVariant => {
    const item = report.holdout.perVariant[id];
    const label = report.variants.find(entry => entry.id === id)!.label;
    const { mdape, ppe5, ppe10, ppe20, medianSignedError, cod, prd } = item.metrics;
    return {
      id,
      label,
      valuedShare: item.valuedShare,
      mdape,
      mdapeCi95: item.mdapeCi95,
      ppe10Ci95: item.ppe10Ci95,
      ppe5,
      ppe10,
      ppe20,
      medianSignedError,
      cod,
      prd,
    };
  };
  const primaryId = report.protocol.primaryVariant;
  const primaryAssumptions = report.variants.find(entry => entry.id === primaryId)!.assumptions!;
  return {
    reportDigest: report.reportDigest,
    protocolDigest: report.protocolDigest,
    protocolId: report.protocol.id,
    market: place.market,
    accepted: report.accepted,
    dataset: {
      id: report.protocol.dataset.id,
      label: place.dataset,
      license: report.protocol.dataset.license,
      csvSha256: report.dataset.csvSha256,
      screened: report.dataset.screened,
    },
    holdout: { from: report.holdout.window.from, to: report.holdout.window.to, sales: report.holdout.screenedSales },
    windows: report.protocol.windows,
    engine: report.engine,
    primary: variant(primaryId),
    shipped: variant('shipped-defaults'),
    baselines: ['baseline-median-ppsf', 'baseline-zip-median'].map(id => {
      const item = report.holdout.perVariant[id];
      return {
        id,
        label: report.variants.find(entry => entry.id === id)!.label,
        mdape: item.metrics.mdape,
        ppe10: item.metrics.ppe10,
      };
    }),
    paired: report.holdout.paired
      .filter(item => item.variant === primaryId)
      .map(({ baseline, mdapeDelta, ci95, winRate }) => ({ baseline, mdapeDelta, ci95, winRate })),
    intervals: {
      target: report.calibration.target,
      calibratedCoverage: report.holdout.intervals.calibratedCoverage,
      calibratedMedianWidth: report.holdout.intervals.calibratedMedianWidth,
      envelopeCoverage: report.holdout.intervals.envelopeCoverage,
    },
    tiers: report.calibration.tiers.map(tier => {
      const holdout = report.holdout.intervals.byTier.find(item => item.tier === tier.id)!;
      return {
        id: tier.id,
        maxComps: tier.maxComps,
        holdoutSales: holdout.n,
        mdape: holdout.mdape,
        coverage: holdout.coverage,
        lowerPercent: Number(((Math.exp(tier.lowerLogRatio) - 1) * 100).toFixed(2)),
        upperPercent: Number(((Math.exp(tier.upperLogRatio) - 1) * 100).toFixed(2)),
        lowerLogRatio: tier.lowerLogRatio,
        upperLogRatio: tier.upperLogRatio,
      };
    }),
    fittedAssumptions: { ...primaryAssumptions },
    acceptance: report.acceptance.map(({ id, label, value, min, max, passed }) => ({
      id,
      label,
      value,
      min,
      max,
      passed,
    })),
  };
}

export const dcBenchmark = dcJson as unknown as ValuationBenchmark;
export const kingCountyBenchmark = kingCountyJson as unknown as ValuationBenchmark;
/** Legacy state-based references. The pooled Maryland result stays in its scoped studio and cannot validate a whole state. */
export const valuationBenchmarks: readonly ValuationBenchmark[] = [dcBenchmark, kingCountyBenchmark];
/** Ascent's home market (DC), the default reference for drift and public figures. */
export const valuationBenchmark = dcBenchmark;
export const benchmarkForState = (state?: string) =>
  valuationBenchmarks.find(item => item.market.state === (state ?? '').trim().toUpperCase()) ?? null;

const ASSUMPTION_KEYS = [
  'sqftRate',
  'bedroomValue',
  'bathroomValue',
  'conditionValue',
  'monthlyTrend',
  'maxDistanceMiles',
  'maxAgeDays',
  'maxSizeRatio',
] as const;
/** The calibration describes one exact configuration; any edited assumption makes it inapplicable. */
export const usesValidatedConfiguration = (assumptions: CmaResult['assumptions'], benchmark: ValuationBenchmark) =>
  ASSUMPTION_KEYS.every(key => Math.abs(assumptions[key] - benchmark.fittedAssumptions[key]) < 1e-9);
/** The validated assumptions for a market, ready to load into the pricing studio. */
export const validatedAssumptions = (benchmark: ValuationBenchmark): CmaResult['assumptions'] =>
  Object.fromEntries(ASSUMPTION_KEYS.map(key => [key, benchmark.fittedAssumptions[key]])) as CmaResult['assumptions'];

/** A small frozen case whose checksum changes whenever any part of the engine's arithmetic changes. */
export function engineFingerprint(): { version: string; fingerprint: string } {
  const base = { address: 'Fingerprint', city: 'Fixture', state: 'WA', zip: '00000', sourceId: 'engine-fingerprint' };
  const subject: ValuationProperty = {
    ...base,
    id: 'fp-subject',
    lat: 47.6,
    lng: -122.3,
    beds: 3,
    baths: 2,
    sqft: 1800,
    condition: 3,
  };
  const sold = (id: string, extra: Partial<ValuationProperty>): ValuationProperty => ({
    ...base,
    id,
    lat: 47.6,
    lng: -122.3,
    beds: 3,
    baths: 2,
    sqft: 1800,
    condition: 3,
    status: 'sold',
    ...extra,
  });
  const comps = [
    sold('fp-a', { lat: 47.605, sqft: 1700, soldAt: '2026-08-01T00:00:00.000Z', soldPrice: 610000 }),
    sold('fp-b', {
      lng: -122.31,
      beds: 4,
      baths: 2.5,
      sqft: 2100,
      condition: 4,
      soldAt: '2026-06-15T00:00:00.000Z',
      soldPrice: 705000,
    }),
    sold('fp-c', {
      lat: 47.59,
      lng: -122.295,
      beds: 2,
      baths: 1,
      sqft: 1500,
      condition: 2,
      soldAt: '2026-09-20T00:00:00.000Z',
      soldPrice: 480000,
    }),
  ];
  const result = calculateCma(
    subject,
    comps,
    { ...defaultAssumptions, monthlyTrend: 0.004 },
    '2026-10-01T00:00:00.000Z',
  );
  return { version: result.version, fingerprint: result.calculationHash };
}
let engineSelfTest: { passed: boolean; fingerprint: string; expected: string } | undefined;
/** Memoized per process: the running engine must be the engine the published benchmark measured. */
export function engineIntegrity() {
  if (!engineSelfTest) {
    let fingerprint = 'error';
    try {
      fingerprint = engineFingerprint().fingerprint;
    } catch {
      // A throwing engine fails the self-test below.
    }
    engineSelfTest = {
      passed: valuationBenchmarks.every(benchmark => benchmark.engine.fingerprint === fingerprint),
      fingerprint,
      expected: valuationBenchmark.engine.fingerprint,
    };
  }
  return engineSelfTest;
}

/** Operator kill switch. `ASCENT_VALUATION_RELEASE=disabled` keeps calculation available but blocks approval. */
export function valuationReleaseSwitch(env: Record<string, string | undefined> = process.env) {
  const value = (env.ASCENT_VALUATION_RELEASE || 'enabled').trim().toLowerCase();
  const enabled = value !== 'disabled';
  return {
    enabled,
    reason: enabled
      ? ''
      : (env.ASCENT_VALUATION_RELEASE_REASON || 'Valuation release is paused by the operator.').slice(0, 240),
  };
}

export type ReleaseCheck = {
  id: string;
  status: 'pass' | 'review' | 'block' | 'context';
  label: string;
  detail: string;
};
export type ReleaseAssessment = {
  policyVersion: string;
  decision: 'release' | 'review' | 'withhold';
  summary: string;
  checks: ReleaseCheck[];
  /**
   * Present only for a subject in a validated market analysed with that market's exact validated
   * configuration: the split-conformal interval measured out of sample for this evidence tier.
   */
  calibratedInterval?: {
    low: number;
    high: number;
    target: number;
    tier: string;
    holdoutCoverage: number;
    market: string;
    reportDigest: string;
  } | null;
  /** Holdout-measured error for sales with the same evidence density, labeled with the market it was measured in. */
  reference: {
    market: string;
    tier: string;
    holdoutSales: number;
    mdape: number | null;
    lowerPercent: number;
    upperPercent: number;
    coverage: number;
    reportDigest: string;
  } | null;
  assessedAt: string;
};
export const SAFEGUARD_THRESHOLDS = {
  minComparables: 3,
  maxDispersion: 0.15,
  maxGrossAdjustment: 0.25,
  maxNewestCompAgeDays: 120,
  maxBaselineDivergence: 0.15,
  outlierRobustZ: 3.5,
} as const;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length ? (sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) : NaN;
};
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/**
 * The release gate. `block` checks withhold the valuation from approval; `review` checks require the
 * professional to acknowledge each named concern; `context` checks are disclosures that never gate.
 */
export function assessValuationRelease(
  result: CmaResult,
  context: {
    sources?: Source[];
    now?: string;
    release?: { enabled: boolean; reason: string };
    integrity?: { passed: boolean; fingerprint: string; expected: string };
    benchmark?: ValuationBenchmark;
  } = {},
): ReleaseAssessment {
  const located =
    result.inputSnapshot?.subject.propertyType === 'condominium'
      ? null
      : benchmarkForState(result.inputSnapshot?.subject.state);
  const benchmark = context.benchmark ?? located ?? valuationBenchmark;
  const inMarket = result.inputSnapshot?.subject.propertyType !== 'condominium' && (!!context.benchmark || !!located);
  const release = context.release ?? valuationReleaseSwitch();
  const integrity = context.integrity ?? engineIntegrity();
  const t = SAFEGUARD_THRESHOLDS;
  const checks: ReleaseCheck[] = [];
  const add = (id: string, status: ReleaseCheck['status'], label: string, detail: string) =>
    checks.push({ id, status, label, detail });

  add(
    'release-switch',
    release.enabled ? 'pass' : 'block',
    'Operator release switch',
    release.enabled ? 'Valuation release is enabled.' : release.reason,
  );
  add(
    'engine-integrity',
    integrity.passed ? 'pass' : 'review',
    'Engine matches validated build',
    integrity.passed
      ? `Engine fingerprint ${integrity.fingerprint} is the one measured in validation report ${benchmark.reportDigest.slice(0, 19)}.`
      : `Engine fingerprint ${integrity.fingerprint} differs from the validated ${integrity.expected}; published accuracy figures do not describe this build until validation is re-run.`,
  );
  const comps = result.comps;
  const n = comps.length;
  const finite =
    [result.estimate, result.low, result.high].every(value => Number.isFinite(value) && value > 0) &&
    result.low <= result.estimate &&
    result.estimate <= result.high;
  add(
    'arithmetic',
    finite && n > 0 ? 'pass' : 'block',
    'Result is internally consistent',
    finite && n > 0
      ? 'Estimate is positive and inside the adjusted comparable range.'
      : 'Estimate, range or comparable set is invalid; the result cannot be released.',
  );
  add(
    'comparable-count',
    n >= t.minComparables ? 'pass' : 'review',
    'Enough comparable sales',
    n >= t.minComparables
      ? `${n} eligible closed sales.`
      : `Only ${n} eligible closed sale${n === 1 ? '' : 's'}; holdout error is materially higher with sparse evidence.`,
  );

  if (n >= 2) {
    const mean = comps.reduce((sum, comp) => sum + comp.adjustedPrice * comp.weight, 0);
    const deviation = Math.sqrt(comps.reduce((sum, comp) => sum + comp.weight * (comp.adjustedPrice - mean) ** 2, 0));
    const dispersion = mean > 0 ? deviation / mean : Infinity;
    add(
      'dispersion',
      dispersion <= t.maxDispersion ? 'pass' : 'review',
      'Adjusted sales agree',
      `Weighted coefficient of variation of adjusted prices is ${percent(dispersion)} (review above ${percent(t.maxDispersion)}).`,
    );
  }
  const snapshot = result.inputSnapshot;
  const sale = new Map(snapshot?.candidates.map(candidate => [candidate.id, candidate]));
  const grossShare = n
    ? comps.reduce(
        (sum, comp) =>
          sum +
          comp.weight *
            (comp.grossAdjustment /
              Math.max(1, sale.get(comp.propertyId)?.soldPrice ?? comp.adjustedPrice - comp.netAdjustment)),
        0,
      )
    : 0;
  add(
    'gross-adjustment',
    grossShare <= t.maxGrossAdjustment ? 'pass' : 'review',
    'Adjustments stay proportionate',
    `Weighted gross adjustment is ${percent(grossShare)} of sale price (review above ${percent(t.maxGrossAdjustment)}).`,
  );
  const newest = n ? Math.min(...comps.map(comp => comp.ageDays)) : Infinity;
  add(
    'freshness',
    newest <= t.maxNewestCompAgeDays ? 'pass' : 'review',
    'Recent evidence',
    Number.isFinite(newest)
      ? `Newest comparable closed ${Math.round(newest)} days before the analysis date (review above ${t.maxNewestCompAgeDays}).`
      : 'No dated comparable sales.',
  );

  const perSqft = comps
    .map(comp => ({
      id: comp.propertyId,
      value: (sale.get(comp.propertyId)?.soldPrice ?? NaN) / (sale.get(comp.propertyId)?.sqft ?? NaN),
    }))
    .filter(item => Number.isFinite(item.value) && item.value > 0);
  if (snapshot && perSqft.length) {
    const baseline = median(perSqft.map(item => item.value)) * snapshot.subject.sqft;
    const divergence = Math.abs(result.estimate / baseline - 1);
    add(
      'independent-cross-check',
      divergence <= t.maxBaselineDivergence ? 'pass' : 'review',
      'Agrees with a simple independent check',
      `Median $/sqft of the same sales implies ${Math.round(baseline).toLocaleString('en-US')}; the adjusted estimate differs by ${percent(divergence)} (review above ${percent(t.maxBaselineDivergence)}).`,
    );
    if (perSqft.length >= 4) {
      const center = median(perSqft.map(item => item.value));
      const mad = median(perSqft.map(item => Math.abs(item.value - center))) * 1.4826;
      const outliers = mad > 0 ? perSqft.filter(item => Math.abs(item.value - center) / mad > t.outlierRobustZ) : [];
      add(
        'outliers',
        outliers.length ? 'review' : 'pass',
        'No anomalous sales',
        outliers.length
          ? `${outliers.map(item => item.id).join(', ')} ${outliers.length === 1 ? 'is' : 'are'} more than ${t.outlierRobustZ} robust deviations from the median $/sqft; confirm arm's-length terms and record accuracy.`
          : 'No comparable is a robust $/sqft outlier.',
      );
    }
  } else
    add(
      'independent-cross-check',
      'review',
      'Agrees with a simple independent check',
      'Archived comparable inputs are unavailable, so the independent cross-check cannot run.',
    );

  const tier = benchmark.tiers.find(item => n <= (item.maxComps ?? Infinity));
  const sources = context.sources ?? [];
  if (result.sourceIds.some(id => sources.find(source => source.id === id)?.kind === 'synthetic'))
    add(
      'illustrative',
      'context',
      'Illustrative evidence',
      'Inputs include fictional records; this result demonstrates the method, not a market value.',
    );
  const validated = inMarket && usesValidatedConfiguration(result.assumptions, benchmark);
  const calibratedInterval =
    validated && tier && n > 0
      ? {
          low: Math.round(result.estimate * Math.exp(tier.lowerLogRatio)),
          high: Math.round(result.estimate * Math.exp(tier.upperLogRatio)),
          target: benchmark.intervals.target,
          tier: tier.id,
          holdoutCoverage: tier.coverage,
          market: benchmark.market.label,
          reportDigest: benchmark.reportDigest,
        }
      : null;
  const record = `${benchmark.acceptance.filter(item => item.passed).length} of ${benchmark.acceptance.length} pre-registered criteria`;
  const measured = `In the published ${benchmark.dataset.label} holdout (${benchmark.holdout.sales.toLocaleString('en-US')} sales), the validated configuration's median error was ${percent(benchmark.primary.mdape)}${tier?.mdape != null ? ` overall and ${percent(tier.mdape)} for sales with ${tier.id} evidence like this one` : ''}; it met ${record}.`;
  add(
    'measured-accuracy',
    'context',
    'Measured accuracy reference',
    calibratedInterval
      ? `${measured} This analysis uses the exact ${benchmark.market.label}-validated configuration, so its calibrated ${percent(calibratedInterval.target)} interval is ${calibratedInterval.low.toLocaleString('en-US')}–${calibratedInterval.high.toLocaleString('en-US')} (it held ${percent(tier!.coverage)} of comparable holdout sales).`
      : inMarket
        ? `${measured} These assumptions differ from the validated ${benchmark.market.label} configuration, so no calibrated interval applies; load the validated assumptions to get one.`
        : `No published validation covers this location (validated: ${valuationBenchmarks.map(item => item.market.label).join(', ')}). For scale only: ${measured} This range stays an uncalibrated comparable envelope.`,
  );
  const blocking = checks.filter(check => check.status === 'block');
  const reviews = checks.filter(check => check.status === 'review');
  const decision = blocking.length ? 'withhold' : reviews.length ? 'review' : 'release';
  return {
    policyVersion: SAFEGUARD_POLICY_VERSION,
    decision,
    summary:
      decision === 'withhold'
        ? `Withheld: ${blocking.map(check => check.label.toLowerCase()).join('; ')}.`
        : decision === 'review'
          ? `Approval requires acknowledging ${reviews.length} review item${reviews.length === 1 ? '' : 's'}: ${reviews.map(check => check.label.toLowerCase()).join('; ')}.`
          : 'All release checks passed. Professional judgment is still required.',
    checks,
    calibratedInterval,
    reference: tier
      ? {
          market: benchmark.dataset.label,
          tier: tier.id,
          holdoutSales: tier.holdoutSales,
          mdape: tier.mdape,
          lowerPercent: tier.lowerPercent,
          upperPercent: tier.upperPercent,
          coverage: tier.coverage,
          reportDigest: benchmark.reportDigest,
        }
      : null,
    assessedAt: context.now ?? new Date().toISOString(),
  };
}

export type DriftStatus = {
  status: 'insufficient-outcomes' | 'within-benchmark' | 'degraded';
  outcomes: number;
  mdape: number | null;
  medianSignedError: number | null;
  benchmarkMdape: number;
  detail: string;
};
/**
 * Production accuracy monitoring: compare the workspace's own frozen-forecast outcomes with the
 * published holdout. Degradation is flagged when the median error is both more than double and at
 * least five points above the benchmark, or when systematic bias exceeds ±5%.
 */
export function assessAccuracyDrift(
  evaluation: Pick<OutcomeEvaluation, 'count' | 'samples'>,
  benchmark: ValuationBenchmark = valuationBenchmark,
): DriftStatus {
  const base = { outcomes: evaluation.count, benchmarkMdape: benchmark.primary.mdape };
  if (evaluation.count < 30)
    return {
      ...base,
      status: 'insufficient-outcomes',
      mdape: null,
      medianSignedError: null,
      detail: `${evaluation.count} of 30 frozen-forecast outcomes recorded; drift is not assessed on fewer.`,
    };
  const mdape = median(evaluation.samples.map(sample => sample.absolutePercentError / 100));
  const bias = median(evaluation.samples.map(sample => sample.signedError / sample.actual));
  const degraded =
    (mdape > benchmark.primary.mdape * 2 && mdape - benchmark.primary.mdape >= 0.05) || Math.abs(bias) > 0.05;
  return {
    ...base,
    status: degraded ? 'degraded' : 'within-benchmark',
    mdape: Number(mdape.toFixed(6)),
    medianSignedError: Number(bias.toFixed(6)),
    detail: degraded
      ? `Recorded outcomes show ${percent(mdape)} median error and ${percent(bias)} median bias against a ${percent(benchmark.primary.mdape)} benchmark. Re-validate assumptions for this market before relying on new valuations.`
      : `Recorded outcomes show ${percent(mdape)} median error and ${percent(bias)} median bias, consistent with the ${percent(benchmark.primary.mdape)} benchmark.`,
  };
}
