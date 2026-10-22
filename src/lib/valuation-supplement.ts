import type { CmaResult } from './types';
import { assessValuationRelease, SAFEGUARD_POLICY_VERSION, SAFEGUARD_THRESHOLDS } from './valuation-safeguards';
import { bootstrapIndices, percentileCi, ratioMetrics } from './valuation-validation';
import { evidenceVerdict, VERDICT_POLICY, VERDICT_POLICY_VERSION, type EvidenceVerdict } from './valuation-verdict';

/**
 * Supplementary studies registered with the external Maryland validation, before its data existed. They
 * reuse that run's frozen primary configuration and score only its untouched holdout; the calibration
 * window fits the two candidate corrections. Nothing here changes a production estimate, and a passing
 * candidate would still need its own prospective holdout before any use.
 */
export const supplementPlan = {
  id: 'ascent-valuation-supplement-maryland-external-1',
  baseProtocol: 'ascent-valuation-validation-maryland-external-1',
  population:
    'Every screened holdout sale of the base protocol. Studies of error use the sales its primary configuration valued; no sale is removed for its price, error or verdict.',
  gate: {
    policy: SAFEGUARD_POLICY_VERSION,
    thresholds: SAFEGUARD_THRESHOLDS,
    invocation:
      'Each holdout sale’s primary-configuration engine result is assessed with the release switch enabled, engine integrity compared with the base report’s engine fingerprint, no source records (so no illustrative context) and no benchmark (the measured-accuracy context never changes a decision).',
  },
  abstention: {
    policy: VERDICT_POLICY_VERSION,
    minComparables: VERDICT_POLICY.minComparables,
    rule: 'declined: fewer than the minimum eligible comparables or a withheld release; limited: any release-gate review check; supported: every check passes.',
    minimumGroupSize: 30,
    resamples: 1000,
    hypotheses: [
      {
        id: 'S1a',
        statement: 'Declined sales have a higher median absolute percentage error than sales with a stated value.',
        compare: ['declined', 'stated'],
        seed: 911,
        supportedWhen: 'the 95% two-sample bootstrap interval of MdAPE(declined) − MdAPE(stated) lies above zero',
      },
      {
        id: 'S1b',
        statement: 'Limited sales have a higher median absolute percentage error than supported sales.',
        compare: ['limited', 'supported'],
        seed: 912,
        supportedWhen: 'the 95% two-sample bootstrap interval of MdAPE(limited) − MdAPE(supported) lies above zero',
      },
    ],
    descriptive:
      'Share of holdout sales in each verdict, calibrated-interval coverage per verdict, how often each review check fires, and MdAPE of stated sales with and without each check. No hypothesis test.',
  },
  verticalEquity: {
    measures: [
      'PRD, IAAO range 0.98–1.03',
      'PRB, IAAO range −0.05 to 0.05, with a 95% ordinary-least-squares interval',
      'median ratio by sale-price quartile',
      'median ratio by estimate quartile: ratios that also fall across estimate quartiles indicate systematic compression; flat or rising ratios indicate that regressivity measured against sale prices comes from noise in the individual prices rather than from the estimates',
    ],
    candidates: [
      {
        id: 'forward-log-linear',
        target: 'accuracy',
        fit: 'ordinary least squares of ln(sale price) on ln(estimate), calibration-window sales valued by the primary configuration',
        apply: 'round(exp(α + β·ln(estimate)))',
        expectation:
          'Targets accuracy: removes systematic compression but shrinks toward the mean in proportion to estimation noise, so regressivity measured against sale prices can remain.',
      },
      {
        id: 'reverse-log-linear',
        target: 'vertical equity',
        fit: 'ordinary least squares of ln(estimate) on ln(sale price), the same sales',
        apply: 'round(exp((ln(estimate) − α) / β)); invalid when β ≤ 0',
        expectation:
          'Targets vertical equity: removes compression measured against sale prices, including any that only reflects noise in the prices themselves, possibly at some cost in accuracy.',
      },
    ],
    passWhen: {
      prdMin: 0.98,
      prdMax: 1.03,
      prbMin: -0.05,
      prbMax: 0.05,
      maxMdapeIncrease: 0.005,
      maxCodIncrease: 0.5,
    },
    promotion: 'Never promoted from this study; a passing candidate needs its own prospective holdout.',
  },
  transport: {
    statement:
      'The configuration Ascent ships for Montgomery and Prince George’s (Maryland v2 fitted rates, search filters and calibrated interval), applied unchanged to this holdout. Descriptive; no acceptance decision.',
    reportDigest: 'sha256-1c420bbcfa8218b63bca9d49fad4d892955e224f74c37c346a80780036a721a3',
  },
  cohorts: 'Descriptive slices by county (from each parcel’s jurisdiction code); no county fitting or acceptance.',
} as const;

type Pair = { estimate: number; actual: number };
type Interval = { low: number; high: number } | null;
export type StudyRow = {
  saleId: string;
  county: string;
  actual: number;
  /** Primary-configuration estimate; null where the engine abstained. */
  estimate: number | null;
  comps: number;
  verdict: EvidenceVerdict | null;
  /** Release checks that needed review or blocked. */
  review: string[];
  interval: Interval;
};

/** Checks that can make a stated value limited; reported one by one. */
export const STUDY_CHECKS = [
  'engine-integrity',
  'dispersion',
  'gross-adjustment',
  'freshness',
  'independent-cross-check',
  'outliers',
] as const;

const round = (value: number, digits = 6) => Number(value.toFixed(digits));
function medianOf(values: number[]) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const ape = (pair: Pair) => Math.abs(pair.estimate / pair.actual - 1);
const pairsOf = (rows: { estimate: number | null; actual: number }[]): Pair[] =>
  rows.filter(row => row.estimate !== null).map(row => ({ estimate: row.estimate!, actual: row.actual }));
const covered = (row: { actual: number; interval: Interval }) =>
  !!row.interval && row.actual >= row.interval.low && row.actual <= row.interval.high;
const mdapeOf = (pairs: Pair[]) => (pairs.length ? round(medianOf(pairs.map(ape))) : null);

/** The registered gate invocation for one holdout sale's engine result. */
export function studyAssessment(result: CmaResult, engine: { fingerprint: string; expected: string }) {
  const gate = assessValuationRelease(result, {
    release: { enabled: true, reason: '' },
    integrity: {
      passed: engine.fingerprint === engine.expected,
      fingerprint: engine.fingerprint,
      expected: engine.expected,
    },
    sources: [],
    now: result.asOf,
  });
  return {
    verdict: evidenceVerdict(result.comps.length, gate),
    review: gate.checks.filter(check => check.status === 'review' || check.status === 'block').map(check => check.id),
  };
}

/**
 * IAAO price-related bias: the slope of (ratio − median ratio) / median ratio on log2 of the value proxy
 * ½·(estimate / median ratio + sale price). Negative values mean ratios fall as value rises (regressivity).
 */
export function priceRelatedBias(pairs: Pair[]) {
  const n = pairs.length;
  if (n < 3) return { n, prb: NaN, ci95: [NaN, NaN] as [number, number] };
  const median = medianOf(pairs.map(pair => pair.estimate / pair.actual));
  const x = pairs.map(pair => Math.log2(0.5 * (pair.estimate / median + pair.actual)));
  const y = pairs.map(pair => (pair.estimate / pair.actual - median) / median);
  const { slope, intercept, sxx } = leastSquares(x, y);
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (y[i] - intercept - slope * x[i]) ** 2;
  const se = Math.sqrt(ssr / (n - 2) / sxx);
  return { n, prb: round(slope), ci95: [round(slope - 1.96 * se), round(slope + 1.96 * se)] as [number, number] };
}

function leastSquares(x: number[], y: number[]) {
  const n = x.length;
  const meanX = x.reduce((sum, value) => sum + value, 0) / n;
  const meanY = y.reduce((sum, value) => sum + value, 0) / n;
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - meanX) ** 2;
    sxy += (x[i] - meanX) * (y[i] - meanY);
  }
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX, sxx };
}

/** MdAPE(a) − MdAPE(b) with a two-sample percentile bootstrap (each group resampled on its own seed). */
export function mdapeDifference(a: Pair[], b: Pair[], resamples: number, seed: number) {
  const apeA = a.map(ape),
    apeB = b.map(ape);
  const drawsA = bootstrapIndices(apeA.length, resamples, seed);
  const drawsB = bootstrapIndices(apeB.length, resamples, seed + 1000);
  const differences = drawsA.map(
    (draw, i) => medianOf(Array.from(draw, j => apeA[j])) - medianOf(Array.from(drawsB[i], j => apeB[j])),
  );
  return {
    n: [a.length, b.length] as [number, number],
    difference: round(medianOf(apeA) - medianOf(apeB)),
    ci95: percentileCi(differences),
  };
}

export type LogLinearFit = { direction: 'forward' | 'reverse'; n: number; alpha: number; beta: number };
/** Forward: ln(price) on ln(estimate). Reverse: ln(estimate) on ln(price), inverted when applied. */
export function fitLogLinear(pairs: Pair[], direction: LogLinearFit['direction']): LogLinearFit {
  const logEstimate = pairs.map(pair => Math.log(pair.estimate)),
    logPrice = pairs.map(pair => Math.log(pair.actual));
  const { slope, intercept } =
    direction === 'forward' ? leastSquares(logEstimate, logPrice) : leastSquares(logPrice, logEstimate);
  return { direction, n: pairs.length, alpha: round(intercept, 9), beta: round(slope, 9) };
}
export function recalibrate(estimate: number, fit: LogLinearFit) {
  if (fit.direction === 'forward') return Math.round(Math.exp(fit.alpha + fit.beta * Math.log(estimate)));
  return fit.beta > 0 ? Math.round(Math.exp((Math.log(estimate) - fit.alpha) / fit.beta)) : null;
}

/** Median estimate/price ratio within quartiles of `key`; each sale falls in exactly one quartile. */
function ratioByQuartile(pairs: Pair[], key: 'actual' | 'estimate') {
  const sorted = pairs.map(pair => pair[key]).sort((a, b) => a - b);
  const cuts = [0.25, 0.5, 0.75].map(q => sorted[Math.floor((sorted.length - 1) * q)]);
  return [0, 1, 2, 3].map(i => {
    const band = pairs.filter(pair => (i === 0 || pair[key] >= cuts[i - 1]) && (i === 3 || pair[key] < cuts[i]));
    return { band: `Q${i + 1}`, n: band.length, medianRatio: band.length ? ratioMetrics(band).medianRatio : null };
  });
}

function equity(pairs: Pair[]) {
  const metrics = ratioMetrics(pairs);
  return {
    n: metrics.n,
    mdape: metrics.mdape,
    ppe10: metrics.ppe10,
    cod: metrics.cod,
    prd: metrics.prd,
    prb: priceRelatedBias(pairs),
    medianRatioByPriceQuartile: ratioByQuartile(pairs, 'actual'),
    medianRatioByEstimateQuartile: ratioByQuartile(pairs, 'estimate'),
  };
}

/** S1: does the verdict policy separate larger errors from smaller ones on untouched sales? */
export function abstentionStudy(rows: StudyRow[]) {
  const valued = rows.filter(row => row.estimate !== null && row.verdict !== null);
  const groups = {
    declined: valued.filter(row => row.verdict === 'declined'),
    limited: valued.filter(row => row.verdict === 'limited'),
    supported: valued.filter(row => row.verdict === 'supported'),
    stated: valued.filter(row => row.verdict !== 'declined'),
  };
  const plan = supplementPlan.abstention;
  const summary = (members: StudyRow[]) => {
    const pairs = pairsOf(members);
    return {
      n: members.length,
      shareOfValued: round(members.length / (valued.length || 1)),
      mdape: mdapeOf(pairs),
      ppe10: pairs.length ? ratioMetrics(pairs).ppe10 : null,
      medianRatio: pairs.length ? ratioMetrics(pairs).medianRatio : null,
      calibratedCoverage: members.length ? round(members.filter(covered).length / members.length) : null,
    };
  };
  return {
    policy: plan.policy,
    holdoutSales: rows.length,
    valued: valued.length,
    notValued: rows.length - valued.length,
    groups: {
      declined: summary(groups.declined),
      limited: summary(groups.limited),
      supported: summary(groups.supported),
      stated: summary(groups.stated),
    },
    byCheck: STUDY_CHECKS.map(id => {
      const flagged = groups.stated.filter(row => row.review.includes(id));
      const clear = groups.stated.filter(row => !row.review.includes(id));
      return {
        check: id,
        flagged: flagged.length,
        flaggedMdape: mdapeOf(pairsOf(flagged)),
        clearMdape: mdapeOf(pairsOf(clear)),
      };
    }),
    hypotheses: plan.hypotheses.map(hypothesis => {
      const [first, second] = hypothesis.compare;
      const a = pairsOf(groups[first]),
        b = pairsOf(groups[second]);
      if (a.length < plan.minimumGroupSize || b.length < plan.minimumGroupSize)
        return {
          id: hypothesis.id,
          statement: hypothesis.statement,
          outcome: 'insufficient-evidence' as const,
          detail: `Groups of ${a.length} and ${b.length} sales; at least ${plan.minimumGroupSize} each were required.`,
          result: null,
        };
      const result = mdapeDifference(a, b, plan.resamples, hypothesis.seed);
      return {
        id: hypothesis.id,
        statement: hypothesis.statement,
        outcome: result.ci95[0] > 0 ? ('supported' as const) : ('not-supported' as const),
        detail: `MdAPE difference ${result.difference} (95% CI ${result.ci95[0]} to ${result.ci95[1]}).`,
        result,
      };
    }),
  };
}

/** S2: vertical equity of the primary estimates, and the two registered corrections. */
export function verticalEquityStudy(test: Pair[], calibration: Pair[]) {
  const primary = equity(test);
  const bar = supplementPlan.verticalEquity.passWhen;
  const candidates = supplementPlan.verticalEquity.candidates.map(candidate => {
    const fit = fitLogLinear(calibration, candidate.id === 'forward-log-linear' ? 'forward' : 'reverse');
    const adjusted = test.map(pair => ({ estimate: recalibrate(pair.estimate, fit), actual: pair.actual }));
    if (adjusted.some(pair => pair.estimate === null || !(pair.estimate > 0)))
      return { id: candidate.id, fit, corrected: null, criteria: [], passed: false };
    const corrected = equity(adjusted as Pair[]);
    const criteria = [
      { id: 'prd', value: corrected.prd, passed: corrected.prd >= bar.prdMin && corrected.prd <= bar.prdMax },
      {
        id: 'prb',
        value: corrected.prb.prb,
        passed: corrected.prb.prb >= bar.prbMin && corrected.prb.prb <= bar.prbMax,
      },
      {
        id: 'mdape-increase',
        value: round(corrected.mdape - primary.mdape),
        passed: corrected.mdape <= primary.mdape + bar.maxMdapeIncrease + 1e-12,
      },
      {
        id: 'cod-increase',
        value: round(corrected.cod - primary.cod, 4),
        passed: corrected.cod <= primary.cod + bar.maxCodIncrease + 1e-12,
      },
    ];
    return { id: candidate.id, fit, corrected, criteria, passed: criteria.every(item => item.passed) };
  });
  return { primary, candidates, promotion: supplementPlan.verticalEquity.promotion };
}

/** S3: descriptive county slices of the pooled holdout. */
export function countySlices(rows: StudyRow[]) {
  return [...new Set(rows.map(row => row.county))].sort().map(county => {
    const members = rows.filter(row => row.county === county);
    const pairs = pairsOf(members);
    const valued = members.filter(row => row.estimate !== null);
    return {
      county,
      sales: members.length,
      valuedShare: round(valued.length / (members.length || 1)),
      metrics: pairs.length ? ratioMetrics(pairs) : null,
      calibratedCoverage: valued.length ? round(valued.filter(covered).length / valued.length) : null,
    };
  });
}

/** S4: the shipped Montgomery/Prince George's configuration on this holdout. */
export function transportStudy(rows: { estimate: number | null; actual: number; interval: Interval }[]) {
  const valued = rows.filter(row => row.estimate !== null);
  const pairs = pairsOf(valued);
  return {
    sales: rows.length,
    valuedShare: round(valued.length / (rows.length || 1)),
    metrics: pairs.length ? ratioMetrics(pairs) : null,
    prb: priceRelatedBias(pairs),
    calibratedCoverage: valued.length ? round(valued.filter(covered).length / valued.length) : null,
  };
}
