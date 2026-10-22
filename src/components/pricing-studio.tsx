'use client';
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, FileText, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { comparableExclusion, distanceMiles, simulatePricing } from '@/lib/analytics';
import { decisionDrivers } from '@/lib/decision-drivers';
import { assessCmaEvidence } from '@/lib/decision-review';
import {
  calculateStudio,
  practiceEntryIds,
  practiceSaleSchemaFor,
  studioCandidates,
  studioCosts,
  studioSources,
  studioSubject,
  studioUnmodified,
  type StudioEvidence,
  type StudioState,
  studioStateSchema,
} from '@/lib/demo-studio';
import { buildHomeDecisionBrief } from '@/lib/home-decision-brief';
import type { FinanceInputs } from '@/lib/homeowner-finance';
import { positionLabel } from '@/lib/pricing-narrative';
import { assessValuationRelease, benchmarkForState, usesValidatedConfiguration } from '@/lib/valuation-safeguards';
import { ComparableExplorer, DecisionArithmetic } from './comparable-explorer';
import { DecisionDrivers, PriceEvidenceStrip, SellerPlanTable } from './pricing-visuals';
import { PricingQuestions } from './pricing-questions';
import { HomeownerWorkbench } from './homeowner-workbench';
import { HomeDecisionBriefPanel } from './home-decision-brief';
import { money, number } from './format';
import '@/app/pricing-studio.css';

const rateFields = [
  { key: 'sqftRate', label: 'Living area ($ per sq ft)', max: 1000, min: 0, step: 5 },
  { key: 'bedroomValue', label: 'Bedroom adjustment ($)', max: 100000, min: 0, step: 1000 },
  { key: 'bathroomValue', label: 'Bathroom adjustment ($)', max: 100000, min: 0, step: 1000 },
  { key: 'conditionValue', label: 'Condition point ($)', max: 100000, min: 0, step: 1000 },
] as const;
const filterFields = [
  { key: 'maxDistanceMiles', label: 'Search radius (miles)', max: 25, min: 0.05, step: 0.05 },
  { key: 'maxAgeDays', label: 'Sale age limit (days)', max: 1825, min: 1, step: 1 },
  { key: 'maxSizeRatio', label: 'Maximum size ratio', max: 3, min: 1, step: 0.05 },
] as const;
const steps = [
  ['01', 'Review the evidence', '#studio-evidence'],
  ['02', 'Choose a strategy', '#studio-strategy'],
  ['03', 'Challenge the decision', '#studio-assumptions'],
  ['04', 'Open your report', '#studio-report'],
] as const;

export type StudioConfig = {
  evidence: StudioEvidence;
  defaultState: StudioState;
  storageKey: string;
  reportHref: (state: StudioState, format?: 'json') => string;
  conditionMax: number;
  conditionLabels?: Record<number, string>;
  /** Show a validated market's calibrated interval while the analysis is exactly the validated configuration. */
  calibrated?: boolean;
  intro: {
    eyebrow: string;
    titleTop: string;
    titleBottom: string;
    lede: ReactNode;
    badgeTitle: string;
    badgeLines: [string, string];
  };
  subjectEyebrow: string;
  evidenceNote: string;
  passport: { facts: string; assumptions: string; missing: string; footnote: string };
  reportNote: string;
  footerNote: string;
  /** Rendered above the intro, e.g. an address search. */
  before?: ReactNode;
  /** A chosen real home: its address and estimate lead the page and the market introduction follows, compact. */
  resultFirst?: boolean;
};

export function PricingStudio(config: StudioConfig) {
  const { evidence, conditionMax } = config;
  const SubjectHeading = config.resultFirst ? 'h1' : 'h2';
  const schema = useMemo(
    () =>
      studioStateSchema(
        evidence.candidates.map(p => p.id),
        conditionMax,
        !!evidence.subject.roomCountsUnavailable,
        evidence.subject.condition !== undefined,
      ),
    [evidence.candidates, conditionMax, evidence.subject.roomCountsUnavailable, evidence.subject.condition],
  );
  const blankSale = {
    address: '',
    soldPrice: '',
    soldAt: evidence.asOf.slice(0, 10),
    beds: String(evidence.subject.beds),
    baths: String(evidence.subject.baths),
    sqft: String(evidence.subject.sqft),
    condition: String(Math.min(conditionMax, evidence.subject.condition ?? 3)),
    distanceMiles: '0.5',
  };
  const [state, setState] = useState<StudioState>(config.defaultState);
  const [beforeReset, setBeforeReset] = useState<StudioState | null>(null);
  const [ready, setReady] = useState(false),
    [storageStatus, setStorageStatus] = useState('');
  const [exclusionId, setExclusionId] = useState(''),
    [reason, setReason] = useState('');
  const [sale, setSale] = useState(blankSale),
    [saleError, setSaleError] = useState('');
  const [step, setStep] = useState(1),
    [reportOpened, setReportOpened] = useState(false),
    [inspectId, setInspectId] = useState('');
  const [finance, setFinance] = useState<FinanceInputs | null>(null);
  const baseline = useMemo(() => {
    try {
      return calculateStudio(evidence, config.defaultState);
    } catch {
      return null;
    }
  }, [evidence, config.defaultState]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(config.storageKey);
      if (saved) {
        const parsed = schema.safeParse(JSON.parse(saved));
        if (parsed.success) {
          setState(parsed.data);
          setStorageStatus('Draft restored on this device.');
        } else setStorageStatus('An older draft could not be restored. The original analysis is ready.');
      }
    } catch {
      setStorageStatus('Device storage is unavailable. Keep this tab open or export your decision.');
    }
    setReady(true);
  }, [config.storageKey, schema]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(config.storageKey, JSON.stringify(state));
    } catch {
      setStorageStatus('Device storage is unavailable. Keep this tab open or export your decision.');
    }
  }, [state, ready, config.storageKey]);
  const calculation = useMemo(() => {
    try {
      return { result: calculateStudio(evidence, state), error: '' };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'No eligible sales.' };
    }
  }, [evidence, state.assumptions, state.exclusions, state.subjectCondition, state.addedSales]);
  const result = calculation.result;
  const candidates = useMemo(() => studioCandidates(evidence, state), [evidence, state.addedSales]);
  const sources = useMemo(() => studioSources(evidence, state), [evidence, state.addedSales]);
  const subject = studioSubject(evidence, state);
  const price = state.listPrice ?? result?.estimate ?? 0;
  const evidenceReview = result ? assessCmaEvidence(result, sources) : null;
  const market = config.calibrated ? benchmarkForState(evidence.subject.state) : null;
  const validated =
    !!result && !!market && studioUnmodified(state) && usesValidatedConfiguration(state.assumptions, market);
  const gate = useMemo(
    () =>
      result && market ? assessValuationRelease(result, { sources, release: { enabled: true, reason: '' } }) : null,
    [result, market, sources],
  );
  const drivers = useMemo(() => (result ? decisionDrivers(result, { conditionMax }) : []), [result, conditionMax]);
  // Typing a financial input re-runs the brief's sensitivity sweep; deferring it keeps the form responsive.
  const briefFinance = useDeferredValue(finance);
  const brief = useMemo(
    () => buildHomeDecisionBrief({ evidence, state, result, finance: briefFinance, drivers }),
    [evidence, state, result, briefFinance, drivers],
  );
  const declined = brief.value.verdict === 'declined';
  const conditionText = (value?: number) =>
    value === undefined
      ? 'condition unknown'
      : `${evidence.subject.ratingKind === 'quality-grade' ? 'quality grade' : 'condition'} ${value}/${conditionMax}${config.conditionLabels?.[value] ? ` (${config.conditionLabels[value]})` : ''}`;
  const patch = (next: Partial<StudioState>) => {
    setBeforeReset(null);
    setStorageStatus('');
    setState(s => ({ ...s, ...next }));
    setReportOpened(false);
  };
  const reset = () => {
    setBeforeReset(state);
    setState(structuredClone(config.defaultState));
    setReportOpened(false);
    setStep(1);
    setInspectId('');
    setStorageStatus('Original evidence restored. You can undo this reset until your next edit.');
  };
  const addSale = () => {
    const id = practiceEntryIds.find(entry => !(state.addedSales ?? []).some(s => s.id === entry));
    if (!id) return setSaleError('Up to three unverified sales can be added.');
    const parsed = practiceSaleSchemaFor(conditionMax).safeParse({
      id,
      address: sale.address,
      soldPrice: Math.round(Number(sale.soldPrice)),
      soldAt: sale.soldAt,
      beds: Number(sale.beds),
      baths: Number(sale.baths),
      sqft: Math.round(Number(sale.sqft)),
      condition: Number(sale.condition),
      distanceMiles: Number(sale.distanceMiles),
    });
    if (!parsed.success)
      return setSaleError(
        `Check the entry: an address of at least 3 characters, a closing price of $10,000 or more, a date, whole bedrooms, baths in half steps, at least 200 sq ft, condition 1–${conditionMax} and a distance up to 25 miles.`,
      );
    setSaleError('');
    setSale(blankSale);
    patch({ addedSales: [...(state.addedSales ?? []), parsed.data] });
    setStep(3);
  };
  const removeSale = (id: string) =>
    patch({
      addedSales: (state.addedSales ?? []).filter(s => s.id !== id),
      exclusions: state.exclusions.filter(e => e.id !== id),
    });
  const changeRate = (key: keyof StudioState['assumptions'], raw: number, min: number, max: number) => {
    const value = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
    patch({ assumptions: { ...state.assumptions, [key]: key === 'maxAgeDays' ? Math.round(value) : value } });
    setStep(3);
  };
  const soldCandidates = candidates.filter(p => p.status === 'sold');
  const inCalculation = new Set(result?.comps.map(c => c.propertyId) ?? []);
  const manualOrEntered = soldCandidates.filter(
    p => state.exclusions.some(e => e.id === p.id) || state.addedSales?.some(s => s.id === p.id),
  );
  const engineExclusions = new Map(result?.excluded.map(entry => [entry.propertyId, entry.reason]));
  const ruledOut = soldCandidates
    .filter(p => !manualOrEntered.includes(p))
    .map(p => ({
      p,
      reason: engineExclusions.get(p.id) ?? comparableExclusion(subject, p, state.assumptions, evidence.asOf),
    }))
    .filter(item => item.reason)
    .sort((a, b) => distanceMiles(subject, a.p) - distanceMiles(subject, b.p));
  const exclusionRow = (p: (typeof soldCandidates)[number], automatic?: string) => {
    const manual = state.exclusions.find(e => e.id === p.id);
    const entered = state.addedSales?.some(s => s.id === p.id);
    return (
      <li key={p.id}>
        <div>
          <strong>
            {p.address}
            {entered ? ' · entered by you' : ''}
          </strong>
          <span>
            {manual
              ? `Analyst decision: ${manual.reason}`
              : automatic
                ? `Eligibility rule: ${automatic}`
                : 'Included in the calculation as unverified user evidence.'}
          </span>
        </div>
        {manual && (
          <button
            className="button small"
            onClick={() => patch({ exclusions: state.exclusions.filter(e => e.id !== p.id) })}
          >
            Restore sale
          </button>
        )}
        {entered && !manual && (
          <button className="button small" onClick={() => removeSale(p.id)}>
            Remove entry
          </button>
        )}
      </li>
    );
  };
  const badge = (
    <div className="studio-sample-label">
      <ShieldCheck size={20} />
      <strong>{config.intro.badgeTitle}</strong>
      <span>
        {config.intro.badgeLines[0]}
        <br />
        {config.intro.badgeLines[1]}
      </span>
    </div>
  );
  const introBlock = (
    <div className="studio-intro">
      <div>
        <span className="eyebrow">{config.intro.eyebrow}</span>
        <h1>
          {config.intro.titleTop}
          <br />
          <span>{config.intro.titleBottom}</span>
        </h1>
        <p>{config.intro.lede}</p>
      </div>
      {badge}
    </div>
  );
  const compactIntroBlock = (
    <div className="studio-intro compact">
      <div>
        <span className="eyebrow">{config.intro.eyebrow}</span>
        <p>{config.intro.lede}</p>
      </div>
      {badge}
    </div>
  );
  const stepNav = (
    <nav className="studio-steps" aria-label="Pricing decision progress">
      {steps.map(([n, label, href], i) => (
        <a key={n} href={href} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => setStep(i + 1)}>
          <span>{i === 3 && reportOpened ? <Check size={16} /> : n}</span>
          {label}
          <ArrowRight size={15} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
  const summaryBlock = (
    <section className="studio-summary" aria-label="Current pricing decision">
      <div className="studio-subject">
        <span className="eyebrow">{config.subjectEyebrow}</span>
        <SubjectHeading>{evidence.subject.address}</SubjectHeading>
        <p>
          {evidence.subject.roomCountsUnavailable
            ? 'Bedrooms and bathrooms unavailable'
            : `${evidence.subject.beds} beds · ${evidence.subject.baths} baths`}{' '}
          · {number(evidence.subject.sqft)} sq ft · {conditionText(subject.condition)}
          {state.subjectCondition !== undefined && state.subjectCondition !== evidence.subject.condition
            ? ' (your rating)'
            : ''}
        </p>
        <small>{config.evidenceNote}</small>
      </div>
      <div className="studio-estimate" aria-live="polite">
        <span>Comparable-supported estimate</span>
        <strong data-testid="studio-estimate">
          {!result ? 'No usable sales' : declined ? 'Not stated' : money(result.estimate)}
        </strong>
        <span>
          {!result
            ? 'Restore a sale or reset assumptions below.'
            : declined
              ? brief.value.reasons[0]
              : `${money(result.low)}–${money(result.high)} · ${result.comps.length} eligible sale${result.comps.length === 1 ? '' : 's'}`}
        </span>
        {result && declined ? (
          <small>The sales and arithmetic stay open below for review; Ascent does not turn them into a value.</small>
        ) : validated && gate?.calibratedInterval ? (
          <small data-testid="calibrated-interval">
            Calibrated {Math.round(gate.calibratedInterval.target * 100)}% range {money(gate.calibratedInterval.low)}–
            {money(gate.calibratedInterval.high)}: in the published {gate.calibratedInterval.market} holdout it held{' '}
            {(gate.calibratedInterval.holdoutCoverage * 100).toFixed(1)}% of sales with {gate.calibratedInterval.tier}{' '}
            evidence like this.
          </small>
        ) : (
          <small>
            Observed adjusted-sale range; not a confidence interval.
            {market && result
              ? ` The calibrated ${market.market.label} range applies only to the unmodified validated analysis.`
              : ''}
          </small>
        )}
      </div>
    </section>
  );
  return (
    <div className="studio-page">
      <a className="skip-link" href="#studio-main">
        Skip to Pricing Studio
      </a>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">PRICING STUDIO</span>
        <Link href="/" className="button small">
          <ArrowLeft size={15} /> All of Ascent
        </Link>
      </header>
      <main id="studio-main" className="studio-main">
        {config.before}
        {config.resultFirst ? (
          <>
            {summaryBlock}
            <HomeDecisionBriefPanel brief={brief} />
            {stepNav}
            {compactIntroBlock}
          </>
        ) : (
          <>
            {introBlock}
            {summaryBlock}
            <HomeDecisionBriefPanel brief={brief} />
            {stepNav}
          </>
        )}
        {calculation.error && (
          <div role="alert" className="error-box">
            {calculation.error}{' '}
            <button className="text-button" onClick={reset}>
              Restore original evidence
            </button>
          </div>
        )}
        <HomeownerWorkbench
          evidence={evidence}
          state={state}
          result={result}
          valueStated={!declined}
          brief={brief}
          onFinanceChange={setFinance}
          onStudioChange={patch}
          missingEvidence={config.passport.missing}
        />
        <div id="studio-evidence" className="studio-section-anchor">
          {result && (
            <>
              <PriceEvidenceStrip
                result={result}
                candidates={candidates}
                selectedPrice={price}
                activeId={inspectId}
                onInspect={id => {
                  setInspectId(id);
                  setStep(1);
                }}
              />
              <ComparableExplorer
                result={result}
                candidates={candidates}
                sources={sources}
                selectedId={inspectId || undefined}
                onSelect={setInspectId}
              />
            </>
          )}
        </div>
        {result && (
          <section id="studio-strategy" className="panel studio-section-anchor" aria-label="Pricing strategy simulator">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PRICING STRATEGY SIMULATOR</span>
                <h2>Three positions. Explicit tradeoffs.</h2>
              </div>
            </div>
            {declined && (
              <p className="studio-warning">
                Ascent is not stating a value for this home. These positions come straight from the arithmetic of{' '}
                {result.comps.length} sale{result.comps.length === 1 ? '' : 's'}: working figures for a professional to
                review, not supported prices.
              </p>
            )}
            <p className="studio-muted">
              Choosing an asking price does not change the evidence-supported valuation. Proceeds assume a sale at that
              price; no outcome or timing is predicted.
            </p>
            <div className="studio-strategies">
              {(['conservative', 'moderate', 'aggressive'] as const).map(key => {
                const val = result.strategies[key],
                  net = simulatePricing(result, val, studioCosts(state));
                return (
                  <button
                    key={key}
                    className={price === val ? 'selected' : ''}
                    aria-pressed={price === val}
                    onClick={() => {
                      patch({ listPrice: val });
                      setStep(2);
                    }}
                  >
                    <span>{positionLabel[key]}</span>
                    <strong>{money(val)}</strong>
                    <p>
                      {key === 'conservative'
                        ? 'At the lowest adjusted sale.'
                        : key === 'moderate'
                          ? 'At the weighted estimate.'
                          : 'At the highest adjusted sale.'}
                    </p>
                    <small>Illustrative net after payoff</small>
                    <b>{money(net.estimatedNet - state.payoff)}</b>
                  </button>
                );
              })}
            </div>
            <div className="decision-bridge" aria-live="polite">
              <span>
                Selected asking price<strong>{money(price)}</strong>
              </span>
              <span>
                Illustrative net after payoff
                <strong>{money(simulatePricing(result, price, studioCosts(state)).estimatedNet - state.payoff)}</strong>
              </span>
            </div>
            <p className="fine">
              Once you select an asking price, changing evidence keeps that price until you choose a new position. The
              report uses this selection.
            </p>
            <div className="studio-costs">
              {[
                ['commissionPercent', 'Negotiable commission (%)', 25, 0.1],
                ['closingPercent', 'Other closing costs (%)', 25, 0.1],
                ['concessions', 'Seller concessions ($)', 100000000, 1000],
                ['payoff', 'Mortgage payoff ($)', 1000000000, 1000],
              ].map(([key, label, max, increment]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step={increment}
                    value={state[key as 'payoff']}
                    onChange={e => patch({ [key]: Math.min(Number(max), Math.max(0, Number(e.target.value) || 0)) })}
                  />
                </label>
              ))}
            </div>
            <SellerPlanTable result={result} selectedPrice={price} costs={studioCosts(state)} payoff={state.payoff} />
          </section>
        )}
        <section id="studio-assumptions" className="panel studio-section-anchor" aria-label="What changes my decision">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WHAT CHANGES MY DECISION?</span>
              <h2>Challenge one assumption. See the difference.</h2>
            </div>
            <div className="studio-reset-actions">
              {beforeReset ? (
                <button
                  className="button small"
                  onClick={() => {
                    setState(beforeReset);
                    setBeforeReset(null);
                    setReportOpened(false);
                    setStorageStatus('Reset undone. Your previous draft is restored.');
                  }}
                >
                  Undo reset
                </button>
              ) : (
                <button className="button small" onClick={reset} disabled={!ready}>
                  <RotateCcw size={15} /> Reset to original
                </button>
              )}
            </div>
          </div>
          <p className="studio-muted">
            Change a rating or rate, exclude a sale with a reason, or add a sale you know about. The original
            calculation stays frozen for comparison.
          </p>
          {result && <DecisionDrivers result={result} conditionMax={conditionMax} precomputed={drivers} />}
          <h3 className="studio-subhead">Your assumptions</h3>
          <div className="studio-assumption-fields">
            {evidence.subject.condition !== undefined && (
              <label>
                Subject {evidence.subject.ratingKind === 'quality-grade' ? 'quality grade' : 'condition'} (1–
                {conditionMax})
                <select
                  aria-label={
                    evidence.subject.ratingKind === 'quality-grade'
                      ? 'Subject quality grade'
                      : 'Subject condition rating'
                  }
                  value={subject.condition}
                  onChange={e => {
                    patch({ subjectCondition: Number(e.target.value) });
                    setStep(3);
                  }}
                >
                  {Array.from({ length: conditionMax }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>
                      {n}
                      {config.conditionLabels?.[n] ? ` · ${config.conditionLabels[n]}` : ''}
                      {n === evidence.subject.condition ? ' · recorded rating' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {rateFields
              .filter(f => evidence.subject.condition !== undefined || f.key !== 'conditionValue')
              .filter(
                f => !evidence.subject.roomCountsUnavailable || (f.key !== 'bedroomValue' && f.key !== 'bathroomValue'),
              )
              .map(f => (
                <label key={f.key}>
                  {f.key === 'conditionValue' && evidence.subject.ratingKind === 'quality-grade'
                    ? 'Quality grade point ($)'
                    : f.label}
                  <input
                    type="number"
                    min={f.min}
                    max={
                      f.key === 'conditionValue' && evidence.subject.ratingKind === 'quality-grade' ? 1000000 : f.max
                    }
                    step={f.step}
                    value={state.assumptions[f.key]}
                    onChange={e =>
                      changeRate(
                        f.key,
                        Number(e.target.value),
                        f.min,
                        f.key === 'conditionValue' && evidence.subject.ratingKind === 'quality-grade' ? 1000000 : f.max,
                      )
                    }
                  />
                </label>
              ))}
            <label>
              Monthly market trend (% per month)
              <input
                type="number"
                min={-10}
                max={10}
                step={0.1}
                value={Number((state.assumptions.monthlyTrend * 100).toFixed(3))}
                onChange={e => changeRate('monthlyTrend', Number(e.target.value) / 100, -0.1, 0.1)}
              />
            </label>
          </div>
          <details className="studio-disclosure studio-filters">
            <summary>Eligibility filters: radius, sale age and size similarity</summary>
            <div className="studio-assumption-fields">
              {filterFields.map(f => (
                <label key={f.key}>
                  {f.label}
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={state.assumptions[f.key]}
                    onChange={e => changeRate(f.key, Number(e.target.value), f.min, f.max)}
                  />
                </label>
              ))}
            </div>
          </details>
          <h3 className="studio-subhead">Exclude a sale</h3>
          <div className="studio-exclusion-form">
            <label>
              Sale to exclude
              <select aria-label="Sale to exclude" value={exclusionId} onChange={e => setExclusionId(e.target.value)}>
                <option value="">Choose a sale</option>
                {soldCandidates
                  .filter(p => inCalculation.has(p.id) && !state.exclusions.some(e => e.id === p.id))
                  .map(p => (
                    <option value={p.id} key={p.id}>
                      {p.address}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Your reason
              <input
                aria-label="Reason for excluding sale"
                maxLength={300}
                placeholder="e.g. Condition requires verification"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </label>
            <button
              className="button"
              disabled={!exclusionId || reason.trim().length < 3}
              onClick={() => {
                patch({ exclusions: [...state.exclusions, { id: exclusionId, reason: reason.trim() }] });
                setExclusionId('');
                setReason('');
                setStep(3);
              }}
            >
              Exclude sale
            </button>
          </div>
          <details className="studio-disclosure studio-add-sale" open={!!state.addedSales?.length || undefined}>
            <summary>Add a sale you know about</summary>
            <p>
              Added sales are labeled “entered by you, unverified” everywhere, including the report. Location is your
              entered distance only; no map position or real record is implied.
            </p>
            <div className="studio-assumption-fields">
              {(
                [
                  ['address', 'Address or label', 'text'],
                  ['soldPrice', 'Closing price ($)', 'number'],
                  ['soldAt', 'Closing date', 'date'],
                  ['distanceMiles', 'Distance from subject (miles)', 'number'],
                  ['beds', 'Bedrooms', 'number'],
                  ['baths', 'Bathrooms', 'number'],
                  ['sqft', 'Living area (sq ft)', 'number'],
                  ['condition', `Condition (1–${conditionMax})`, 'number'],
                ] as const
              )
                .filter(([key]) => evidence.subject.condition !== undefined || key !== 'condition')
                .filter(([key]) => !evidence.subject.roomCountsUnavailable || (key !== 'beds' && key !== 'baths'))
                .map(([key, label, type]) => (
                  <label key={key}>
                    {key === 'condition' && evidence.subject.ratingKind === 'quality-grade'
                      ? `Quality grade (1–${conditionMax})`
                      : label}
                    <input
                      type={type}
                      value={sale[key]}
                      step={key === 'baths' ? 0.5 : key === 'distanceMiles' ? 0.05 : undefined}
                      min={type === 'number' ? 0 : undefined}
                      max={type === 'date' ? evidence.asOf.slice(0, 10) : undefined}
                      maxLength={key === 'address' ? 80 : undefined}
                      onChange={e => setSale(s => ({ ...s, [key]: e.target.value }))}
                    />
                  </label>
                ))}
            </div>
            {saleError && (
              <p role="alert" className="studio-warning">
                {saleError}
              </p>
            )}
            <button
              className="button"
              disabled={(state.addedSales?.length ?? 0) >= practiceEntryIds.length}
              onClick={addSale}
            >
              <Plus size={15} /> Add unverified sale
            </button>
          </details>
          <ul className="studio-exclusions">
            {manualOrEntered.map(p => exclusionRow(p))}
            {ruledOut.length <= 10 && ruledOut.map(item => exclusionRow(item.p, item.reason))}
          </ul>
          {ruledOut.length > 10 && (
            <details className="studio-disclosure">
              <summary>
                {ruledOut.length} nearby recorded sales sit outside the current radius, age or size filters
              </summary>
              <ul className="studio-exclusions">
                {ruledOut.slice(0, 25).map(item => exclusionRow(item.p, item.reason))}
              </ul>
              {ruledOut.length > 25 && <p className="fine">The 25 nearest are listed.</p>}
            </details>
          )}
          {result && baseline && <DecisionArithmetic previous={baseline} current={result} />}
        </section>
        {result && <PricingQuestions result={result} previous={baseline ?? undefined} sources={sources} />}
        {evidenceReview && (
          <section className="panel" aria-label="Evidence fitness">
            <span className="eyebrow">EVIDENCE FITNESS</span>
            <h2>{evidenceReview.label}</h2>
            <div className="studio-fitness">
              <div>
                <strong>{evidenceReview.comparableCount}</strong>
                <span>Eligible sales</span>
              </div>
              <div>
                <strong>{evidenceReview.effectiveComparableCount.toFixed(1)}</strong>
                <span>Effective after weighting</span>
              </div>
              <div>
                <strong>{evidenceReview.largestWeightPercent}%</strong>
                <span>Largest weight</span>
              </div>
              <div>
                <strong>{evidenceReview.adjustedSpreadPercent}%</strong>
                <span>Adjusted spread / estimate</span>
              </div>
            </div>
            <ul className="studio-findings">
              {evidenceReview.findings.map(f => (
                <li key={f.label}>
                  <strong>{f.label}:</strong> {f.detail}
                </li>
              ))}
            </ul>
            {gate && (
              <details className="studio-disclosure">
                <summary>Release checks · {gate.summary}</summary>
                <ul className="studio-findings">
                  {gate.checks.map(check => (
                    <li key={check.id}>
                      <strong>
                        {check.status === 'pass'
                          ? 'Pass'
                          : check.status === 'review'
                            ? 'Review'
                            : check.status === 'block'
                              ? 'Blocked'
                              : 'Note'}{' '}
                        · {check.label}:
                      </strong>{' '}
                      {check.detail}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="fine">
              Review heuristics, not calibrated accuracy, a market coverage score or source-use authorization.
            </p>
          </section>
        )}
        <section className="panel studio-passport" aria-label="Property Evidence Passport">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PROPERTY EVIDENCE PASSPORT</span>
              <h2>Known, assumed, still missing.</h2>
            </div>
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
          <div className="passport-grid">
            <div>
              <strong>Source facts</strong>
              <p>
                {config.passport.facts}
                {state.addedSales?.length
                  ? ` ${state.addedSales.length} sale${state.addedSales.length === 1 ? ' was' : 's were'} entered by you and remain unverified.`
                  : ''}
              </p>
            </div>
            <div>
              <strong>Analyst assumptions</strong>
              <p>{config.passport.assumptions}</p>
            </div>
            <div>
              <strong>Missing evidence</strong>
              <p>{config.passport.missing}</p>
            </div>
          </div>
          <p className="fine">{config.passport.footnote}</p>
        </section>
        <section id="studio-report" className="studio-report studio-section-anchor" aria-label="Create your report">
          <div>
            <span className="eyebrow">PORTABLE DECISION RECORD</span>
            <h2>Your reasoning, ready to review.</h2>
            <p>
              The report preserves this calculation, your selected asking price, cost assumptions, excluded-sale
              reasons, added sales and source references.
            </p>
            <p className="fine">{config.reportNote}</p>
          </div>
          <div className="studio-report-actions">
            {result ? (
              <>
                <a
                  className="button primary"
                  href={config.reportHref(state)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setReportOpened(true);
                    setStep(4);
                  }}
                >
                  <FileText size={17} /> Open professional report <ArrowRight size={17} />
                </a>
                <a className="button" href={config.reportHref(state, 'json')}>
                  Export reproducible decision (JSON)
                </a>
                <span role="status">
                  {reportOpened
                    ? 'Report opened in a new tab. Use browser Print to save a PDF.'
                    : `Ready · ${result.comps.length} sales calculated from frozen inputs`}
                </span>
              </>
            ) : (
              <p>Restore eligible evidence before creating a report.</p>
            )}
          </div>
        </section>
        <p className="studio-device-note" role="status">
          {storageStatus ||
            'Draft changes save in this browser on this device. Export a decision to keep an independent copy.'}
        </p>
        <footer className="studio-footer">
          <Link href="/">
            Explore the connected Ascent workspace <ArrowRight size={15} />
          </Link>
          <span>{config.footerNote}</span>
        </footer>
      </main>
    </div>
  );
}
