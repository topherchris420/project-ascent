import { calculationChecksum, defaultAssumptions } from './analytics';
import { decisionDrivers, type DecisionDriver } from './decision-drivers';
import { assessCmaEvidence, assumptionNames } from './decision-review';
import {
  PRACTICE_ENTRY_SOURCE,
  calculateStudio,
  studioCandidates,
  studioSources,
  studioUnmodified,
  type StudioEvidence,
  type StudioState,
} from './demo-studio';
import { condoBenchmark } from './dc-condo-studio';
import { breakEvenText, financeBreakEvens, financeSensitivity, type FinanceBreakEven } from './finance-sensitivity';
import {
  compareDecisions,
  decisionKinds,
  decisionLabels,
  emptyFinance,
  financeLabels,
  financeSchema,
  FINANCE_LIMITS,
  FINANCE_VERSION,
  type DecisionKind,
  type FinanceInputs,
} from './homeowner-finance';
import { marylandRevisedBenchmark } from './maryland-studio';
import { saleNetBeforePayoff } from './selling-costs';
import type { CmaResult, Source } from './types';
import {
  assessValuationRelease,
  dcBenchmark,
  usesValidatedConfiguration,
  validatedAssumptions,
  type ReleaseAssessment,
  type ValuationBenchmark,
} from './valuation-safeguards';
import { evidenceVerdict, VERDICT_POLICY, VERDICT_POLICY_VERSION } from './valuation-verdict';

/**
 * Your Home Decision Brief: one deterministic answer to each of seven homeowner questions, assembled from
 * the existing engines (CMA, release gate, input sensitivity, finance comparison). The brief computes no new
 * value. Every figure carries traces naming the record, assumption or calculation it comes from; missing
 * inputs stay missing, and no choice is recommended or ranked.
 */
export const BRIEF_VERSION = 'ascent-home-decision-brief-1';
/** The rule deciding whether the brief states a value; shared with the pre-registered external study. */
export const BRIEF_POLICY_VERSION = VERDICT_POLICY_VERSION;
export const BRIEF_POLICY = VERDICT_POLICY;
export { evidenceVerdict };

export type BriefMarket = 'dc' | 'maryland' | 'dc-condos' | 'demo' | 'other';
export type BriefMarketInfo = {
  market: BriefMarket;
  label: string;
  benchmark: ValuationBenchmark | null;
  /** A published calibrated range may be shown only for an accepted study in this exact market. */
  calibrationEligible: boolean;
  conditionMax: number;
};
export function briefMarket(evidence: StudioEvidence): BriefMarketInfo {
  const subject = evidence.subject;
  if (subject.sourceId === 'source-dc-public-records' && subject.propertyType !== 'condominium')
    return {
      market: 'dc',
      label: 'Washington, DC houses and rowhomes',
      benchmark: dcBenchmark,
      calibrationEligible: dcBenchmark.accepted,
      conditionMax: 6,
    };
  if (subject.sourceId === 'source-maryland-public-records')
    return {
      market: 'maryland',
      label: 'Montgomery and Prince George’s counties, MD',
      benchmark: marylandRevisedBenchmark,
      calibrationEligible: false,
      conditionMax: 9,
    };
  if (subject.sourceId === 'source-dc-condo-public-records')
    return {
      market: 'dc-condos',
      label: 'Washington, DC condominiums',
      benchmark: condoBenchmark,
      calibrationEligible: false,
      conditionMax: 6,
    };
  if (evidence.sources.some(source => source.kind === 'synthetic'))
    return {
      market: 'demo',
      label: 'Fictional practice example',
      benchmark: null,
      calibrationEligible: false,
      conditionMax: 5,
    };
  return { market: 'other', label: 'Unvalidated market', benchmark: null, calibrationEligible: false, conditionMax: 5 };
}

export type Trace = { kind: 'record' | 'assumption' | 'calculation'; text: string; ref?: string };
/** A traced figure. Ranges carry their upper bound in `upper`; `text` is the formatted display. */
export type BriefFigure = { label: string; value: number; upper?: number; text: string; traces: Trace[] };
export type BriefVerdict = 'supported' | 'limited' | 'declined';
export type BriefCheck = { id: string; label: string; status: 'pass' | 'review' | 'block'; detail: string };
export type BriefChoice = {
  kind: DecisionKind;
  label: string;
  available: boolean;
  missing: string[];
  figures: { label: string; meaning: string; value: number; text: string }[];
};
export type HomeDecisionBrief = {
  version: typeof BRIEF_VERSION;
  policyVersion: typeof BRIEF_POLICY_VERSION;
  property: {
    id: string;
    address: string;
    market: BriefMarket;
    marketLabel: string;
    fictional: boolean;
    asOf: string;
  };
  value: {
    verdict: BriefVerdict;
    label: string;
    answer: string;
    estimate: BriefFigure | null;
    range: BriefFigure | null;
    calibrated: BriefFigure | null;
    reasons: string[];
    study: { text: string; traces: Trace[] } | null;
  };
  comparables: {
    answer: string;
    eligible: number;
    effective: number;
    largestWeightPercent: number;
    leading: {
      id: string;
      address: string;
      weightPercent: number;
      soldPrice: BriefFigure | null;
      adjustedPrice: BriefFigure;
      distanceMiles: number;
      ageDays: number;
      largestAdjustment: string | null;
      entered: boolean;
    }[];
    ruledOut: number;
    excludedByYou: { address: string; reason: string }[];
    enteredByYou: number;
    ownHistory: string | null;
  };
  reliability: {
    answer: string;
    checks: BriefCheck[];
    newestSaleDays: number | null;
    collected: { sales: string | null; parcels: string | null };
    sources: { label: string; kind: Source['kind']; observedAt: string; license: string }[];
    tierReference: string | null;
  };
  missingFacts: { fact: string; why: string; obtain: string }[];
  financial: {
    answer: string;
    horizonMonths: number;
    inputsValid: boolean;
    saleNow: {
      price: BriefFigure;
      costs: { commissionPercent: number; closingPercent: number; concessions: number };
      beforePayoff: BriefFigure;
      afterPayoff: BriefFigure | null;
    } | null;
    choices: BriefChoice[];
    breakEvens: (FinanceBreakEven & { text: string })[];
    exclusions: readonly string[];
    calculationHash: string | null;
  };
  influences: {
    answer: string;
    valuation: { label: string; swing: number; text: string }[];
    fragile: string[];
    financial: { kind: DecisionKind; label: string; drivers: { label: string; swing: number; text: string }[] }[];
    /** Valuation settings that differ from the market's reference: the published study's, or practice defaults. */
    settings: {
      reference: string | null;
      changes: { key: SettingKey; label: string; reference: string; current: string }[];
    };
  };
  nextSteps: { item: string; why: string; affects: ('value' | 'reliability' | 'finances')[]; priority: 1 | 2 | 3 }[];
  limits: string[];
  references: {
    valuationVersion: string | null;
    valuationHash: string | null;
    financeVersion: string;
    financeHash: string | null;
    studyReport: string | null;
    sources: string[];
    snapshot: { salesSha256: string | null; parcelsSha256: string | null };
  };
  checksum: string;
};

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const signedUsd = (value: number) => `${value < 0 ? '−' : '+'}${usd(Math.abs(value))}`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
/** "Monthly gross rent ($)" → "Monthly gross rent" for prose; tables keep the unit. */
const plainLabel = (text: string) => text.replace(/\s*\([^)]*\)$/, '');

type SettingKey = keyof CmaResult['assumptions'];
const settingText = (key: SettingKey, value: number) =>
  key === 'sqftRate'
    ? `${usd(value)} per sq ft`
    : key === 'monthlyTrend'
      ? `${(value * 100).toFixed(2)}% per month`
      : key === 'maxDistanceMiles'
        ? `${value} miles`
        : key === 'maxAgeDays'
          ? `${value} days`
          : key === 'maxSizeRatio'
            ? `${value}×`
            : usd(value);
/** Which settings differ from the configuration the market's evidence was tested with (or practice defaults). */
function settingChanges(state: StudioState, market: BriefMarketInfo): HomeDecisionBrief['influences']['settings'] {
  const reference = market.benchmark
    ? {
        values: validatedAssumptions(market.benchmark),
        label: `the settings fitted in the published ${market.label} study`,
      }
    : market.market === 'demo'
      ? { values: defaultAssumptions, label: 'Ascent’s practice defaults' }
      : null;
  if (!reference) return { reference: null, changes: [] };
  return {
    reference: reference.label,
    changes: (Object.keys(assumptionNames) as SettingKey[])
      .filter(key => Math.abs((state.assumptions[key] ?? NaN) - reference.values[key]) > 1e-9)
      .map(key => ({
        key,
        label: assumptionNames[key],
        reference: settingText(key, reference.values[key]),
        current: settingText(key, state.assumptions[key]),
      })),
  };
}

/** Plain-language names for the release gate's checks; the gate's own detail text stays alongside. */
const plainCheck: Record<string, string> = {
  'release-switch': 'Valuation release is enabled',
  'engine-integrity': 'The calculation engine is the version that was tested',
  arithmetic: 'The arithmetic is internally consistent',
  'comparable-count': 'Enough recorded sales nearby',
  dispersion: 'The adjusted sales agree with each other',
  'gross-adjustment': 'The sales needed only moderate adjustments',
  freshness: 'At least one sale is recent',
  'independent-cross-check': 'A simple price-per-square-foot check agrees',
  outliers: 'No unusual sale is pulling the result',
};

/** How a failed review check reads in the brief; the gate's own measured detail follows each phrase. */
const failedCheck: Record<string, string> = {
  'engine-integrity': 'The calculation engine differs from the version the published study tested.',
  'comparable-count': 'Few recorded sales passed the rules.',
  dispersion: 'The adjusted sales disagree with each other more than Ascent’s review threshold allows.',
  'gross-adjustment': 'The sales needed large adjustments to resemble your home.',
  freshness: 'No comparable sale closed recently.',
  'independent-cross-check': 'A simple price-per-square-foot check disagrees with the estimate.',
  outliers: 'At least one sale looks unusual and may be pulling the result.',
};

/** Whether, and how firmly, the brief states a value, with every reason in words. */
export function briefValuationVerdict(input: {
  result: CmaResult | null;
  sources: Source[];
  state: StudioState;
  market: BriefMarketInfo;
}): { verdict: BriefVerdict; reasons: string[]; gate: ReleaseAssessment | null } {
  const { result, sources, state, market } = input;
  if (!result)
    return {
      verdict: 'declined',
      reasons: ['No recorded sale passes the current distance, date and size limits.'],
      gate: null,
    };
  const gate = assessValuationRelease(result, {
    sources,
    release: { enabled: true, reason: '' },
    benchmark: market.benchmark ?? undefined,
    now: result.asOf,
  });
  const n = result.comps.length;
  const evidence = evidenceVerdict(n, gate);
  if (evidence === 'declined') {
    const reasons = gate.checks.filter(check => check.status === 'block').map(check => check.detail);
    if (n < BRIEF_POLICY.minComparables)
      reasons.unshift(
        `Only ${n} eligible recorded sale${n === 1 ? '' : 's'}. Ascent states a value only when at least ${BRIEF_POLICY.minComparables} recorded sales pass its rules.`,
      );
    return { verdict: 'declined', reasons, gate };
  }
  const reasons: string[] = [];
  const fictional = sources.some(source => source.kind === 'synthetic');
  if (fictional) reasons.push('These are fictional practice records. The figure shows the method, not a market value.');
  const entered = state.addedSales?.length ?? 0;
  if (entered)
    reasons.push(
      `It includes ${entered} sale${entered === 1 ? '' : 's'} you entered, which ${entered === 1 ? 'is' : 'are'} unverified.`,
    );
  if (state.exclusions.length)
    reasons.push(`You excluded ${state.exclusions.length} recorded sale${state.exclusions.length === 1 ? '' : 's'}.`);
  if (state.subjectCondition !== undefined)
    reasons.push('It uses your own condition rating instead of the recorded one.');
  const benchmark = market.benchmark;
  if (benchmark) {
    if (!benchmark.accepted) {
      const met = benchmark.acceptance.filter(item => item.passed).length;
      const missed = benchmark.acceptance.filter(item => !item.passed).map(item => lowerFirst(item.label));
      reasons.push(
        `In its published study, the method for ${market.label} met ${met} of ${benchmark.acceptance.length} accuracy criteria; it missed ${list(missed)}.`,
      );
    } else if (!usesValidatedConfiguration(result.assumptions, benchmark))
      reasons.push('Your edited adjustment settings differ from the configuration the published study tested.');
  } else if (!fictional) reasons.push('No published accuracy study covers this market.');
  for (const check of gate.checks.filter(item => item.status === 'review'))
    reasons.push(`${failedCheck[check.id] ?? `${check.label}: needs review.`} ${check.detail}`);
  return { verdict: evidence === 'supported' && !reasons.length ? 'supported' : 'limited', reasons, gate };
}

/** Facts the records do not contain, by market. Nothing here is inferred or filled in. */
function missingFacts(evidence: StudioEvidence, state: StudioState, market: BriefMarketInfo) {
  const subject = evidence.subject;
  const facts: HomeDecisionBrief['missingFacts'] = [];
  if (subject.roomCountsUnavailable)
    facts.push({
      fact: 'Bedroom and bathroom counts',
      why: 'These Maryland records have no room counts, so the estimate cannot adjust for them.',
      obtain: 'Compare your rooms with the leading sales, or ask an agent or appraiser to.',
    });
  if (subject.condition === undefined)
    facts.push({
      fact: 'Condition',
      why: 'The condominium records have no condition field, so condition is not adjusted.',
      obtain: 'An inspection or an agent walk-through.',
    });
  else if (subject.ratingKind === 'quality-grade')
    facts.push({
      fact: 'Interior condition and updates',
      why: 'The assessor quality grade describes construction quality, not current condition or renovations.',
      obtain: 'An inspection, contractor or agent walk-through.',
    });
  else if (state.subjectCondition === undefined)
    facts.push({
      fact: 'Current interior condition',
      why: 'The condition rating is the assessor’s grade, not an inspection; it moves the estimate.',
      obtain: 'An inspection, or your own honest rating entered in the condition field.',
    });
  else
    facts.push({
      fact: 'Verification of your condition rating',
      why: 'Your rating changes the estimate but is not verified.',
      obtain: 'An inspection or an agent walk-through.',
    });
  if (market.market === 'dc-condos')
    facts.push({
      fact: 'Floor, view, parking, HOA dues, reserves and special assessments',
      why: 'They often differ between units in one building and are not modeled.',
      obtain: 'The condo resale package and the association’s budget.',
    });
  facts.push(
    {
      fact: 'Seller credits and terms in the comparable sales',
      why: 'Recorded prices do not show concessions or unusual terms.',
      obtain: 'An agent with access to the listing records.',
    },
    {
      fact: 'Sales after the data snapshot, and current competing listings',
      why: `Recorded sales run through ${day(evidence.asOf)}; recording lags closing by weeks, and active listings are not connected.`,
      obtain: 'Recent closed sales and active listings from an agent.',
    },
    {
      fact: 'Lot, permits and location features',
      why: 'Lot size, permits, school boundaries and similar features are not priced by this model.',
      obtain: 'County permit records and a site visit.',
    },
  );
  return facts;
}

const financeFromStudio = (state: StudioState, estimate: number | null): FinanceInputs => ({
  ...emptyFinance(),
  propertyValue: estimate,
  salePrice: state.listPrice ?? estimate,
  commissionPercent: state.commissionPercent,
  closingPercent: state.closingPercent,
  concessions: state.concessions,
  mortgageBalance: state.payoff > 0 ? state.payoff : null,
});

export type BriefInput = {
  evidence: StudioEvidence;
  state: StudioState;
  /** The studio's current calculation; recomputed when omitted. */
  result?: CmaResult | null;
  /** Effective homeowner finance inputs from the workbench; derived from the pricing draft when omitted. */
  finance?: FinanceInputs | null;
  /** Precomputed `decisionDrivers(result)`, so the page runs that sensitivity once. */
  drivers?: DecisionDriver[];
};

export function buildHomeDecisionBrief(input: BriefInput): HomeDecisionBrief {
  const { evidence, state } = input;
  let result = input.result;
  if (result === undefined) {
    try {
      result = calculateStudio(evidence, state);
    } catch {
      result = null;
    }
  }
  const market = briefMarket(evidence);
  const sources = studioSources(evidence, state);
  const candidates = studioCandidates(evidence, state);
  const fictional = sources.some(source => source.kind === 'synthetic');
  const { verdict, reasons, gate } = briefValuationVerdict({ result, sources, state, market });
  const stated = verdict !== 'declined' && !!result;
  const estimate = stated ? result!.estimate : null;
  const benchmark = market.benchmark;
  const validatedSettings = !!result && !!benchmark && usesValidatedConfiguration(result.assumptions, benchmark);
  const settingsTrace: Trace = fictional
    ? { kind: 'assumption', text: 'Practice adjustment rates and search limits' }
    : validatedSettings
      ? {
          kind: 'assumption',
          text: `Adjustment rates and search limits fitted in the published ${market.label} study`,
          ref: benchmark!.reportDigest,
        }
      : { kind: 'assumption', text: 'Adjustment rates and search limits as you set them' };
  const valuationTrace: Trace | null = result
    ? {
        kind: 'calculation',
        text: `Weighted average of ${result.comps.length} adjusted recorded sale${result.comps.length === 1 ? '' : 's'} (${result.version})`,
        ref: result.calculationHash,
      }
    : null;

  // 1. Value.
  const label =
    verdict === 'declined'
      ? 'Value not stated'
      : fictional
        ? 'Practice estimate · fictional data'
        : verdict === 'supported'
          ? 'Supported by the evidence'
          : 'Estimate with stated limits';
  const calibrated =
    stated && market.calibrationEligible && studioUnmodified(state) && validatedSettings && gate?.calibratedInterval
      ? gate.calibratedInterval
      : null;
  const study = benchmark
    ? {
        text: `Published ${market.label} study: ${benchmark.holdout.sales.toLocaleString('en-US')} held-out sales from ${day(benchmark.holdout.from)} to ${day(benchmark.holdout.to)}; median error ${pct(benchmark.primary.mdape, 2)}; ${benchmark.acceptance.filter(item => item.passed).length} of ${benchmark.acceptance.length} accuracy criteria met${benchmark.accepted ? '' : ', so it did not pass'}. A study of many past sales, not a guarantee for this home.`,
        traces: [
          {
            kind: 'calculation' as const,
            text: 'Published validation report, reproducible from its per-sale samples',
            ref: benchmark.reportDigest,
          },
        ],
      }
    : null;
  const valueAnswer =
    verdict === 'declined'
      ? `Ascent is not stating a value for this home. ${reasons[0]} You can still inspect the sales and arithmetic in the professional workspace below.`
      : `The recorded sales point to about ${usd(estimate!)}${
          calibrated
            ? `, and the published ${market.label} study supports a calibrated 80% range of ${usd(calibrated.low)} to ${usd(calibrated.high)} for evidence like this`
            : `; the adjusted sales span ${usd(result!.low)} to ${usd(result!.high)}, which is not a confidence interval`
        }.${verdict === 'limited' ? ` Treat it with care: ${lowerFirst(reasons[0] ?? '')}` : ''}`;

  // 2. Comparables.
  const review = result ? assessCmaEvidence(result, sources) : null;
  const leading = result
    ? [...result.comps]
        .sort((a, b) => b.weight - a.weight || a.propertyId.localeCompare(b.propertyId))
        .slice(0, 3)
        .map(comp => {
          const sale = candidates.find(candidate => candidate.id === comp.propertyId);
          const source = sources.find(item => item.id === sale?.sourceId);
          const largest = [...comp.adjustments].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
          const entered = sale?.sourceId === PRACTICE_ENTRY_SOURCE;
          return {
            id: comp.propertyId,
            address: sale?.address ?? comp.propertyId,
            weightPercent: Number((comp.weight * 100).toFixed(1)),
            soldPrice:
              sale?.soldPrice && sale.soldAt
                ? {
                    label: 'Recorded sale price',
                    value: sale.soldPrice,
                    text: `${usd(sale.soldPrice)} on ${day(sale.soldAt)}`,
                    traces: [
                      {
                        kind: entered ? ('assumption' as const) : ('record' as const),
                        text: entered ? 'Entered by you, unverified' : (source?.label ?? 'Recorded sale'),
                        ref: sale.sourceId,
                      },
                    ],
                  }
                : null,
            adjustedPrice: {
              label: 'Adjusted to your home',
              value: comp.adjustedPrice,
              text: usd(comp.adjustedPrice),
              traces: [
                {
                  kind: 'calculation' as const,
                  text: `Sale price ${signedUsd(comp.netAdjustment)} in adjustments`,
                  ref: result!.calculationHash,
                },
                settingsTrace,
              ],
            },
            distanceMiles: Number(comp.distanceMiles.toFixed(2)),
            ageDays: Math.round(comp.ageDays),
            largestAdjustment:
              largest && largest.amount !== 0 ? `${largest.factor} ${signedUsd(largest.amount)}` : null,
            entered,
          };
        })
    : [];
  const ruledOut = result?.excluded.length ?? 0;
  const excludedByYou = state.exclusions.map(item => ({
    address: candidates.find(candidate => candidate.id === item.id)?.address ?? item.id,
    reason: item.reason,
  }));
  const ownSale = evidence.subject.history?.find(entry => entry.price !== undefined);
  const comparablesAnswer = result
    ? `${result.comps.length} recorded sale${result.comps.length === 1 ? '' : 's'} passed the rules (${review!.effectiveComparableCount.toFixed(1)} effective after weighting). ${
        leading[0]
          ? `${leading[0].address} carries the most weight, ${leading[0].weightPercent}%, adjusting to ${usd(leading[0].adjustedPrice.value)}.`
          : ''
      } ${ruledOut} nearby sale${ruledOut === 1 ? '' : 's'} fell outside the distance, date or size limits${excludedByYou.length ? `, and you excluded ${excludedByYou.length}` : ''}.`
    : 'No recorded sale currently passes the rules. Widen a limit or restore an excluded sale in the professional workspace.';

  // 3. Reliability and currency.
  const checks: BriefCheck[] = (gate?.checks ?? [])
    .filter(check => check.status !== 'context' && check.id !== 'release-switch')
    .map(check => ({
      id: check.id,
      label: plainCheck[check.id] ?? check.label,
      status: check.status as BriefCheck['status'],
      detail: check.detail,
    }));
  const newestSaleDays = result?.comps.length ? Math.round(Math.min(...result.comps.map(comp => comp.ageDays))) : null;
  const tierReference =
    gate?.reference && benchmark && market.market !== 'demo'
      ? `For held-out sales with ${gate.reference.tier} evidence like this (${gate.reference.holdoutSales.toLocaleString('en-US')} sales), the study’s median error was ${gate.reference.mdape === null ? 'not measured' : pct(gate.reference.mdape)}.`
      : null;
  const passing = checks.filter(check => check.status === 'pass').length;
  const reliabilityAnswer = result
    ? `${passing} of ${checks.length} evidence checks pass.${newestSaleDays === null ? '' : ` The newest sale closed ${newestSaleDays} days before the data date, ${day(evidence.asOf)}.`}${
        evidence.snapshot
          ? ` Sales were collected ${day(evidence.snapshot.salesFetchedAt)}; this is a snapshot, not a live feed.`
          : ''
      }${study ? ` ${benchmark!.accepted ? 'The method passed its published study for this market.' : 'The method did not pass its published study for this market.'}` : fictional ? ' Fictional records have no accuracy study.' : ''}`
    : 'Reliability cannot be assessed without eligible sales.';

  // 5. Finances.
  const rawFinance = input.finance ?? financeFromStudio(state, estimate);
  const parsedFinance = financeSchema.safeParse(rawFinance);
  const comparison = parsedFinance.success ? compareDecisions(parsedFinance.data) : null;
  const finance = parsedFinance.success ? parsedFinance.data : null;
  const costs = {
    commissionPercent: state.commissionPercent,
    closingPercent: state.closingPercent,
    concessions: state.concessions,
  };
  const salePrice = state.listPrice ?? estimate;
  const payoff = finance?.mortgageBalance ?? (state.payoff > 0 ? state.payoff : null);
  const feeTrace: Trace = {
    kind: 'assumption',
    text: `Commission ${costs.commissionPercent}%, other selling costs ${costs.closingPercent}%, concessions ${usd(costs.concessions)}; editable, not quotes`,
  };
  const beforePayoff = salePrice === null ? null : Math.round(saleNetBeforePayoff(salePrice, costs));
  const saleNow =
    salePrice === null || beforePayoff === null
      ? null
      : {
          costs,
          price: {
            label: 'Sale price used',
            value: salePrice,
            text: usd(salePrice),
            traces: [
              state.listPrice !== null
                ? ({ kind: 'assumption', text: 'Your selected asking price' } as Trace)
                : ({ ...valuationTrace!, text: 'The evidence-supported estimate, used as the sale price' } as Trace),
            ],
          },
          beforePayoff: {
            label: 'Proceeds before mortgage payoff',
            value: beforePayoff,
            text: usd(beforePayoff),
            traces: [feeTrace, { kind: 'calculation', text: 'Price × (1 − percentage costs) − concessions' } as Trace],
          },
          afterPayoff:
            payoff === null
              ? null
              : {
                  label: 'After your mortgage payoff',
                  value: beforePayoff - payoff,
                  text: usd(beforePayoff - payoff),
                  traces: [
                    {
                      kind: 'assumption',
                      text: 'Your mortgage balance, unverified; a lender payoff statement may differ',
                    } as Trace,
                    { kind: 'calculation', text: 'Proceeds before payoff − mortgage balance' } as Trace,
                  ],
                },
        };
  const choices: BriefChoice[] = decisionKinds.map(kind => {
    const item = comparison?.results.find(entry => entry.kind === kind);
    const figures: BriefChoice['figures'] = [];
    if (item?.available) {
      if (item.netProceeds !== null)
        figures.push({
          label: 'Net proceeds at closing',
          meaning: 'Cash after selling costs and the modeled payoff',
          value: item.netProceeds,
          text: usd(item.netProceeds),
        });
      if (item.monthlyCashFlow !== null)
        figures.push({
          label: 'Initial monthly cash flow',
          meaning: 'Money in or out each month at the start',
          value: item.monthlyCashFlow,
          text: usd(item.monthlyCashFlow),
        });
      if (item.cashRequired !== null)
        figures.push({
          label: 'Cash required',
          meaning: 'The largest cash shortfall you would need to cover along the way',
          value: item.cashRequired,
          text: usd(item.cashRequired),
        });
      if (item.terminalEquity !== null)
        figures.push({
          label: 'End equity',
          meaning: 'Property value minus debt at the horizon, before selling costs',
          value: item.terminalEquity,
          text: usd(item.terminalEquity),
        });
      if (item.netPosition !== null)
        figures.push({
          label: 'Net position at horizon',
          meaning: 'Cash flows plus equity, less hypothetical exit costs',
          value: item.netPosition,
          text: usd(item.netPosition),
        });
    }
    return {
      kind,
      label: decisionLabels[kind],
      available: !!item?.available,
      missing: item ? item.missing.map(key => financeLabels[key]) : [],
      figures,
    };
  });
  const computed = choices.filter(choice => choice.available);
  const sell = comparison?.results.find(entry => entry.kind === 'sell');
  const horizon = finance?.horizonMonths ?? 60;
  const financialAnswer = !finance
    ? 'Some financial entries need correcting before the choices can be compared.'
    : computed.length
      ? `${computed.length} of 6 choices can be computed from your inputs over ${horizon} months.${
          sell?.available && sell.netProceeds !== null
            ? ` ${finance.sellingMonths ? `Selling after ${finance.sellingMonths} month${finance.sellingMonths === 1 ? '' : 's'}` : 'Selling now'} would leave about ${usd(sell.netProceeds)} after selling costs and the modeled payoff.`
            : ''
        } Each is a scenario under your assumptions, not a prediction, and Ascent does not rank them.`
      : `No choice can be fully computed yet.${
          saleNow
            ? ` If sold at ${saleNow.price.text}, proceeds before your mortgage payoff would be about ${saleNow.beforePayoff.text} under the assumed selling costs.`
            : ''
        } Add your mortgage balance and ownership costs to compare selling, holding, renting, renovating and refinancing.`;
  const breakEvens = finance
    ? financeBreakEvens(finance)
        .filter(item => item.status !== 'needs-inputs')
        .map(item => ({ ...item, text: breakEvenText(item) }))
    : [];

  // 6. What moves the outcomes.
  const drivers = input.drivers ?? (result ? decisionDrivers(result, { conditionMax: market.conditionMax }) : []);
  const valuationDrivers = drivers
    .filter(driver => !driver.unavailable && driver.swing > 0)
    .slice(0, 3)
    .map(driver => ({
      label: driver.label,
      swing: driver.swing,
      text: `${driver.label}: the tested settings move the estimate by up to ${usd(driver.swing)}.`,
    }));
  const fragile = drivers
    .filter(driver => driver.unavailable)
    .map(driver => `Narrowing the ${driver.label.toLowerCase()} leaves no eligible sale.`);
  const sensitivity = finance && computed.length ? financeSensitivity(finance) : null;
  const financialDrivers = (sensitivity?.byChoice ?? []).map(choice => ({
    kind: choice.kind,
    label: choice.label,
    drivers: choice.drivers
      .filter(driver => driver.swing > 0)
      .slice(0, 2)
      .map(driver => ({
        label: plainLabel(driver.label),
        swing: driver.swing,
        text: `${plainLabel(driver.label)} ${driver.step}: horizon net position moves by up to ${usd(driver.swing)}.`,
      })),
  }));
  const firstFinancial = financialDrivers.find(choice => choice.drivers.length);
  const influencesAnswer = `${
    valuationDrivers[0]
      ? `The estimate depends most on the ${valuationDrivers[0].label.toLowerCase()} (up to ${usd(valuationDrivers[0].swing)} across the tested settings).`
      : result
        ? 'No tested valuation input moves the estimate.'
        : 'Valuation inputs cannot be tested without eligible sales.'
  }${fragile.length ? ` ${fragile[0]}` : ''}${
    firstFinancial
      ? ` For “${firstFinancial.label}”, the ${lowerFirst(plainLabel(firstFinancial.drivers[0].label))} matters most.`
      : ' Financial drivers appear once a choice can be computed.'
  }`;

  // 7. What to obtain before deciding.
  const nextSteps: HomeDecisionBrief['nextSteps'] = [];
  if (verdict === 'declined')
    nextSteps.push({
      item: 'A licensed appraisal or an agent’s comparative market analysis',
      why: 'Ascent could not state a value from the recorded sales.',
      affects: ['value'],
      priority: 1,
    });
  else if (benchmark && !benchmark.accepted)
    nextSteps.push({
      item: 'A professional review of the leading sales',
      why: 'The method did not pass its published accuracy study for this market.',
      affects: ['value', 'reliability'],
      priority: 1,
    });
  if (payoff === null)
    nextSteps.push({
      item: 'A payoff statement from your lender',
      why: 'Net proceeds, equity and every choice except a cash comparison need your mortgage balance.',
      affects: ['finances'],
      priority: 1,
    });
  if (market.market === 'dc-condos')
    nextSteps.push({
      item: 'The condo resale package: budget, reserves, fees and any special assessments',
      why: 'Association costs and building risks are not in the records and can change both value and monthly costs.',
      affects: ['value', 'finances'],
      priority: 1,
    });
  nextSteps.push({
    item: 'An inspection or walk-through of the home’s condition',
    why: 'Condition is the most common unmodeled difference between your home and the sales.',
    affects: ['value'],
    priority: 2,
  });
  if (finance && (finance.monthlyTax === null || finance.monthlyInsurance === null))
    nextSteps.push({
      item: 'Your latest property-tax bill and a current insurance quote',
      why: 'Holding, renting and refinancing cannot be computed without ownership costs.',
      affects: ['finances'],
      priority: 2,
    });
  nextSteps.push({
    item: `Closed sales since ${day(evidence.asOf)} and current competing listings`,
    why: 'The records are a snapshot and recording lags closing.',
    affects: ['value', 'reliability'],
    priority: 2,
  });
  if (finance && finance.monthlyRent === null)
    nextSteps.push({
      item: 'Rents for similar homes and a property-management fee quote',
      why: 'Renting and buying while keeping this home need a rent you can support.',
      affects: ['finances'],
      priority: 3,
    });
  if (finance && (finance.renovationCost === null || finance.renovatedSalePrice === null))
    nextSteps.push({
      item: 'Written contractor bids and a timeline, if you are considering renovating',
      why: 'The renovation scenario needs a budget, a timeline and your own post-renovation price assumption.',
      affects: ['finances'],
      priority: 3,
    });
  if (finance && finance.refinanceRate === null)
    nextSteps.push({
      item: 'A written loan estimate, if you are considering refinancing',
      why: 'Refinancing needs a quoted rate, term and cash costs.',
      affects: ['finances'],
      priority: 3,
    });
  nextSteps.push({
    item: 'Tax advice on sale gains or rental income',
    why: 'Every financial scenario here is before income and capital-gains taxes.',
    affects: ['finances'],
    priority: 3,
  });

  const limits = [
    'This brief is not an appraisal, broker price opinion or offer, and it makes no recommendation.',
    `Recorded sales are a snapshot through ${day(evidence.asOf)}; no live listings or real-time data are used.`,
    'Financial scenarios are pre-tax arithmetic under your assumptions. Replacement housing, taxes and loan qualification are not modeled.',
    'A published study describes past sales in aggregate; it is not a guarantee for this home.',
    ...(fictional ? ['Fictional practice data: do not use these figures for a real home.'] : []),
  ];

  const brief: Omit<HomeDecisionBrief, 'checksum'> = {
    version: BRIEF_VERSION,
    policyVersion: BRIEF_POLICY_VERSION,
    property: {
      id: evidence.subject.id,
      address: evidence.subject.address,
      market: market.market,
      marketLabel: market.label,
      fictional,
      asOf: evidence.asOf,
    },
    value: {
      verdict,
      label,
      answer: valueAnswer,
      estimate:
        stated && valuationTrace
          ? {
              label: 'Evidence-supported estimate',
              value: result!.estimate,
              text: usd(result!.estimate),
              traces: [
                valuationTrace,
                settingsTrace,
                ...(state.subjectCondition !== undefined
                  ? [{ kind: 'assumption' as const, text: `Your condition rating, ${state.subjectCondition}` }]
                  : []),
              ],
            }
          : null,
      range:
        stated && result
          ? {
              label: 'Range of the adjusted sales',
              value: result.low,
              upper: result.high,
              text: `${usd(result.low)} to ${usd(result.high)}`,
              traces: [
                {
                  kind: 'calculation',
                  text: 'Lowest and highest adjusted sale; not a confidence interval',
                  ref: result.calculationHash,
                },
              ],
            }
          : null,
      calibrated: calibrated
        ? {
            label: `Calibrated ${Math.round(calibrated.target * 100)}% range`,
            value: calibrated.low,
            upper: calibrated.high,
            text: `${usd(calibrated.low)} to ${usd(calibrated.high)}`,
            traces: [
              {
                kind: 'calculation',
                text: `Held ${pct(calibrated.holdoutCoverage)} of held-out sales with ${calibrated.tier} evidence in the published study`,
                ref: calibrated.reportDigest,
              },
            ],
          }
        : null,
      reasons,
      study,
    },
    comparables: {
      answer: comparablesAnswer.replace(/\s+/g, ' ').trim(),
      eligible: result?.comps.length ?? 0,
      effective: review?.effectiveComparableCount ?? 0,
      largestWeightPercent: review?.largestWeightPercent ?? 0,
      leading,
      ruledOut,
      excludedByYou,
      enteredByYou: state.addedSales?.length ?? 0,
      ownHistory: ownSale
        ? `This home’s latest recorded transfer in the snapshot: ${usd(ownSale.price!)} on ${day(ownSale.date)}. Its own sales are never used as comparables.`
        : null,
    },
    reliability: {
      answer: reliabilityAnswer,
      checks,
      newestSaleDays,
      collected: {
        sales: evidence.snapshot?.salesFetchedAt ?? null,
        parcels: evidence.snapshot?.parcelsFetchedAt ?? null,
      },
      sources: sources.map(source => ({
        label: source.label,
        kind: source.kind,
        observedAt: source.observedAt,
        license: source.license,
      })),
      tierReference,
    },
    missingFacts: missingFacts(evidence, state, market),
    financial: {
      answer: financialAnswer,
      horizonMonths: horizon,
      inputsValid: !!finance,
      saleNow,
      choices,
      breakEvens,
      exclusions: FINANCE_LIMITS,
      calculationHash: comparison?.calculationHash ?? null,
    },
    influences: {
      answer: influencesAnswer,
      valuation: valuationDrivers,
      fragile,
      financial: financialDrivers,
      settings: settingChanges(state, market),
    },
    nextSteps: nextSteps.sort((a, b) => a.priority - b.priority).slice(0, 8),
    limits,
    references: {
      valuationVersion: result?.version ?? null,
      valuationHash: result?.calculationHash ?? null,
      financeVersion: FINANCE_VERSION,
      financeHash: comparison?.calculationHash ?? null,
      studyReport: benchmark?.reportDigest ?? null,
      sources: sources.map(source => source.id),
      snapshot: {
        salesSha256: evidence.snapshot?.salesSha256 ?? null,
        parcelsSha256: evidence.snapshot?.parcelsSha256 ?? null,
      },
    },
  };
  return { ...brief, checksum: calculationChecksum(brief) };
}

export type BriefQuestion = 'why' | 'top-comp' | 'after-costs' | 'lower' | 'changes' | 'unsupported';
/** `refs` name what an answer used, labeled: "record …", "valuation …", "finance …" or "study …". */
export type BriefAnswer = { label: string; text: string; refs: string[] };
/**
 * Deterministic answers to homeowner questions, written only from the brief's own figures. Each answer names
 * the records, assumptions and calculations it uses; none adds a value, forecast or recommendation.
 */
export function briefAnswers(brief: HomeDecisionBrief): Record<BriefQuestion, BriefAnswer> {
  const { value, comparables, financial, influences, references } = brief;
  const lead = comparables.leading[0];
  const stated = value.verdict !== 'declined' && value.estimate;
  const refs = (...items: [label: string, id: string | null | undefined][]) =>
    items.filter(([, id]) => !!id).map(([label, id]) => `${label} ${id}`);
  const valuation = ['valuation', references.valuationHash] as [string, string | null];
  const finance = ['finance', references.financeHash] as [string, string | null];
  const studyRef = ['study', references.studyReport] as [string, string | null];
  const record = ['record', lead?.id] as [string, string | undefined];
  const settings = value.estimate?.traces.find(trace => trace.kind === 'assumption')?.text.toLowerCase();
  const leadSentence = lead
    ? `${lead.address} carries the most weight, ${lead.weightPercent}%: it ${lead.soldPrice ? `sold for ${lead.soldPrice.text}` : 'has no recorded price'} and adjusts to ${lead.adjustedPrice.text}${lead.largestAdjustment ? `, mostly through ${lead.largestAdjustment.replace(/ ([+−])/, ' at $1')}` : ''}.`
    : '';
  const costs = financial.saleNow?.costs;
  const fees = costs
    ? `commission ${costs.commissionPercent}%, other selling costs ${costs.closingPercent}% and concessions of ${usd(costs.concessions)}, all editable assumptions`
    : '';
  const keepShare = costs ? 1 - (costs.commissionPercent + costs.closingPercent) / 100 : null;
  const salePrice = financial.saleNow?.price.value ?? null;
  const position =
    salePrice === null || !value.range || !stated
      ? ''
      : salePrice < value.range.value
        ? ' Your price is below every adjusted sale.'
        : salePrice > (value.range.upper ?? Infinity)
          ? ' Your price is above every adjusted sale.'
          : ' Your price is inside the range of the adjusted sales.';
  return {
    why: {
      label: 'Why is my home valued this way?',
      text: stated
        ? `The estimate, ${value.estimate!.text}, is the weighted average of ${comparables.eligible} recorded sales after each is adjusted to your home’s size, rooms, condition and sale date using ${settings ?? 'the stated settings'}. ${leadSentence} ${value.label}: ${value.reasons[0] ? lowerFirst(value.reasons[0]) : 'every evidence check passes and the method passed its published study for this market.'}`
        : `${value.answer} ${comparables.answer}`,
      refs: refs(valuation, studyRef, record),
    },
    'top-comp': {
      label: 'Which sale influences the estimate most?',
      text: lead
        ? `${leadSentence} It is ${lead.distanceMiles} miles away and closed ${lead.ageDays} days before the data date. Weight comes from distance, sale age and size similarity; it shows influence on the arithmetic, not verified sale quality.${lead.entered ? ' You entered this sale; it is unverified.' : ''}`
        : 'No recorded sale is in the calculation yet.',
      refs: refs(record, valuation),
    },
    'after-costs': {
      label: 'What would I receive after selling costs?',
      text: financial.saleNow
        ? `At ${financial.saleNow.price.text} (${financial.saleNow.price.traces[0].text.toLowerCase()}), proceeds before your mortgage payoff are ${financial.saleNow.beforePayoff.text}, using ${fees}. ${financial.saleNow.afterPayoff ? `After your entered mortgage balance you would keep about ${financial.saleNow.afterPayoff.text}; a lender payoff statement may differ.` : 'Add your mortgage balance to see what you would keep.'} This is before income and capital-gains taxes and any moving or replacement-housing costs.`
        : 'There is no sale price to use yet. Ascent did not state a value, so choose your own asking price in the professional workspace to see the arithmetic.',
      refs: refs(valuation, finance),
    },
    lower: {
      label: 'What if I lower my asking price?',
      text:
        financial.saleNow && keepShare !== null
          ? `A lower asking price does not change the evidence-supported estimate; it changes what you would keep. Each $10,000 off the price lowers proceeds by about ${usd(10000 * keepShare)} after percentage costs.${position} Ascent does not predict how buyers or timing respond to a price change.`
          : 'Choose an asking price in the professional workspace first. Ascent does not predict how buyers respond to a price change.',
      refs: refs(valuation),
    },
    changes: {
      label: 'What would materially change this?',
      text: `${influences.answer} New facts could also move the estimate: ${list(brief.missingFacts.slice(0, 3).map(item => lowerFirst(item.fact)))}. Ascent cannot say in which direction until they are known.`,
      refs: refs(valuation, finance),
    },
    unsupported: {
      label: 'What is not supported by the evidence?',
      text: `${value.reasons.length ? `Limits on this estimate: ${value.reasons.map(lowerFirst).join(' ')} ` : ''}The evidence does not support a forecast of the sale price or timing, a rent level, the home’s current condition, or a judgment about which choice is best for your household. Financial results are scenarios built from your own assumptions.`,
      refs: refs(valuation, studyRef),
    },
  };
}
