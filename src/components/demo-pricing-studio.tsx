'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, FileText, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { comparableExclusion, simulatePricing } from '@/lib/analytics';
import { assessCmaEvidence } from '@/lib/decision-review';
import {
  calculateDemo,
  defaultDemoState,
  demoCandidates,
  demoCosts,
  demoReportHref,
  demoSources,
  demoStudioSchema,
  demoSubject,
  practiceEntryIds,
  practiceSaleSchema,
  type DemoStudioState,
} from '@/lib/demo-studio';
import { sampleSubject, SAMPLE_AS_OF } from '@/lib/pricing-sample';
import { ComparableExplorer, DecisionArithmetic } from './comparable-explorer';
import { DecisionDrivers, PriceEvidenceStrip, SellerPlanTable } from './pricing-visuals';
import { PricingQuestions } from './pricing-questions';
import { positionLabel } from '@/lib/pricing-narrative';
import { date, money } from './format';
import '@/app/pricing-studio.css';

const storageKey = 'ascent.practice-studio.v1';
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
const blankSale = {
  address: '',
  soldPrice: '',
  soldAt: '2026-09-15',
  beds: '4',
  baths: '3',
  sqft: '2150',
  condition: '4',
  distanceMiles: '0.5',
};

export function DemoPricingStudio() {
  const [state, setState] = useState<DemoStudioState>(defaultDemoState);
  const [ready, setReady] = useState(false),
    [storageStatus, setStorageStatus] = useState('');
  const [exclusionId, setExclusionId] = useState(''),
    [reason, setReason] = useState('');
  const [sale, setSale] = useState(blankSale),
    [saleError, setSaleError] = useState('');
  const [step, setStep] = useState(1),
    [reportOpened, setReportOpened] = useState(false),
    [inspectId, setInspectId] = useState('');
  const baseline = useMemo(() => calculateDemo(defaultDemoState), []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = demoStudioSchema.safeParse(JSON.parse(saved));
        if (parsed.success) {
          setState(parsed.data);
          setStorageStatus('Practice draft restored on this device.');
        } else setStorageStatus('An older practice draft could not be restored. A fresh sample is ready.');
      }
    } catch {
      setStorageStatus('Device storage is unavailable. Keep this tab open or export your decision.');
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      setStorageStatus('Device storage is unavailable. Keep this tab open or export your decision.');
    }
  }, [state, ready]);
  const calculation = useMemo(() => {
    try {
      return { result: calculateDemo(state), error: '' };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'No eligible sales.' };
    }
  }, [state.assumptions, state.exclusions, state.subjectCondition, state.addedSales]);
  const result = calculation.result;
  const candidates = useMemo(() => demoCandidates(state), [state.addedSales]);
  const sources = useMemo(() => demoSources(state), [state.addedSales]);
  const subject = demoSubject(state);
  const price = state.listPrice ?? result?.estimate ?? 0;
  const evidence = result ? assessCmaEvidence(result, sources) : null;
  const patch = (next: Partial<DemoStudioState>) => {
    setState(s => ({ ...s, ...next }));
    setReportOpened(false);
  };
  const reset = () => {
    setState(structuredClone(defaultDemoState));
    setReportOpened(false);
    setStep(1);
    setInspectId('');
    setStorageStatus('Practice draft reset. Original evidence restored.');
  };
  const addSale = () => {
    const id = practiceEntryIds.find(entry => !(state.addedSales ?? []).some(s => s.id === entry));
    if (!id) return setSaleError('Up to three practice sales can be added.');
    const parsed = practiceSaleSchema.safeParse({
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
        'Check the entry: an address of at least 3 characters, a closing price of $10,000 or more, a date, whole bedrooms, baths in half steps, at least 200 sq ft, condition 1–5 and a distance up to 25 miles.',
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
  const changeRate = (key: keyof DemoStudioState['assumptions'], raw: number, min: number, max: number) => {
    const value = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
    patch({ assumptions: { ...state.assumptions, [key]: key === 'maxAgeDays' ? Math.round(value) : value } });
    setStep(3);
  };
  const soldCandidates = candidates.filter(p => p.status === 'sold');
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
        <div className="studio-intro">
          <div>
            <span className="eyebrow">A DECISION YOU CAN TAKE APART</span>
            <h1>
              Find the price.
              <br />
              <span>Understand every part.</span>
            </h1>
            <p>
              One fictional Arlington home. Real pricing calculations.
              <br />
              Inspect a sale, choose a strategy, challenge it, then open your report.
            </p>
          </div>
          <div className="studio-sample-label">
            <ShieldCheck size={20} />
            <strong>Account-free practice</strong>
            <span>
              Fictional property and sales
              <br />
              No live data or model requests
            </span>
          </div>
        </div>
        <nav className="studio-steps" aria-label="Pricing decision progress">
          {steps.map(([n, label, href], i) => (
            <a key={n} href={href} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => setStep(i + 1)}>
              <span>{i === 3 && reportOpened ? <Check size={16} /> : n}</span>
              {label}
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          ))}
        </nav>
        <section className="studio-summary" aria-label="Current pricing decision">
          <div className="studio-subject">
            <span className="eyebrow">SUBJECT · ARLINGTON, VIRGINIA</span>
            <h2>{sampleSubject.address}</h2>
            <p>
              4 beds · 3 baths · 2,180 sq ft · condition {subject.condition}/5
              {state.subjectCondition !== undefined && state.subjectCondition !== sampleSubject.condition
                ? ' (your rating)'
                : ''}
            </p>
            <small>Evidence frozen {date(SAMPLE_AS_OF)} · authored fictional records</small>
          </div>
          <div className="studio-estimate" aria-live="polite">
            <span>Comparable-supported estimate</span>
            <strong data-testid="studio-estimate">{result ? money(result.estimate) : 'No usable sales'}</strong>
            <span>
              {result
                ? `${money(result.low)}–${money(result.high)} · ${result.comps.length} eligible sales`
                : 'Restore a sale or reset assumptions below.'}
            </span>
            <small>Observed adjusted-sale range; not a confidence interval.</small>
          </div>
        </section>
        {calculation.error && (
          <div role="alert" className="error-box">
            {calculation.error}{' '}
            <button className="text-button" onClick={reset}>
              Restore original evidence
            </button>
          </div>
        )}
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
            <p className="studio-muted">
              Choosing an asking price does not change the evidence-supported valuation. Proceeds assume a sale at that
              price; no outcome or timing is predicted.
            </p>
            <div className="studio-strategies">
              {(['conservative', 'moderate', 'aggressive'] as const).map(key => {
                const val = result.strategies[key],
                  net = simulatePricing(result, val, demoCosts(state));
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
                <strong>{money(simulatePricing(result, price, demoCosts(state)).estimatedNet - state.payoff)}</strong>
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
            <SellerPlanTable result={result} selectedPrice={price} costs={demoCosts(state)} payoff={state.payoff} />
          </section>
        )}
        <section id="studio-assumptions" className="panel studio-section-anchor" aria-label="What changes my decision">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WHAT CHANGES MY DECISION?</span>
              <h2>Challenge one assumption. See the difference.</h2>
            </div>
            <button className="button small" onClick={reset}>
              <RotateCcw size={15} /> Reset sample
            </button>
          </div>
          <p className="studio-muted">
            Change a rating or rate, exclude a sale with a reason, or add a sale you know about. The original
            calculation stays frozen for comparison.
          </p>
          {result && <DecisionDrivers result={result} />}
          <h3 className="studio-subhead">Your assumptions</h3>
          <div className="studio-assumption-fields">
            <label>
              Subject condition (1–5)
              <select
                aria-label="Subject condition rating"
                value={subject.condition}
                onChange={e => {
                  patch({ subjectCondition: Number(e.target.value) });
                  setStep(3);
                }}
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>
                    {n}
                    {n === sampleSubject.condition ? ' · sample rating' : ''}
                  </option>
                ))}
              </select>
            </label>
            {rateFields.map(f => (
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
            <label>
              Monthly market trend (% per month)
              <input
                type="number"
                min={-10}
                max={10}
                step={0.1}
                value={Number((state.assumptions.monthlyTrend * 100).toFixed(2))}
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
                  .filter(p => !state.exclusions.some(e => e.id === p.id))
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
              Practice entries are labeled “entered by you, unverified” everywhere, including the report. Location is
              your entered distance only; no map position or real record is implied.
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
                  ['condition', 'Condition (1–5)', 'number'],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    value={sale[key]}
                    step={key === 'baths' ? 0.5 : key === 'distanceMiles' ? 0.05 : undefined}
                    min={type === 'number' ? 0 : undefined}
                    max={type === 'date' ? SAMPLE_AS_OF.slice(0, 10) : undefined}
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
              <Plus size={15} /> Add practice sale
            </button>
          </details>
          <ul className="studio-exclusions">
            {soldCandidates.map(p => {
              const manual = state.exclusions.find(e => e.id === p.id);
              const automatic = comparableExclusion(subject, p, state.assumptions, SAMPLE_AS_OF);
              const entered = state.addedSales?.some(s => s.id === p.id);
              if (!manual && !automatic && !entered) return null;
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
            })}
          </ul>
          {result && <DecisionArithmetic previous={baseline} current={result} />}
        </section>
        {result && <PricingQuestions result={result} previous={baseline} sources={sources} />}
        {evidence && (
          <section className="panel" aria-label="Evidence fitness">
            <span className="eyebrow">EVIDENCE FITNESS</span>
            <h2>{evidence.label}</h2>
            <div className="studio-fitness">
              <div>
                <strong>{evidence.comparableCount}</strong>
                <span>Eligible sales</span>
              </div>
              <div>
                <strong>{evidence.effectiveComparableCount.toFixed(1)}</strong>
                <span>Effective after weighting</span>
              </div>
              <div>
                <strong>{evidence.largestWeightPercent}%</strong>
                <span>Largest weight</span>
              </div>
              <div>
                <strong>{evidence.adjustedSpreadPercent}%</strong>
                <span>Adjusted spread / estimate</span>
              </div>
            </div>
            <ul className="studio-findings">
              {evidence.findings.map(f => (
                <li key={f.label}>
                  <strong>{f.label}:</strong> {f.detail}
                </li>
              ))}
            </ul>
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
                Address, coordinates, living area, beds, baths and recorded closing prices/dates come from the authored
                fictional sample.
                {state.addedSales?.length
                  ? ` ${state.addedSales.length} sale${state.addedSales.length === 1 ? ' was' : 's were'} entered by you and remain unverified.`
                  : ''}
              </p>
            </div>
            <div>
              <strong>Analyst assumptions</strong>
              <p>
                Condition ratings, marginal adjustment rates, the trend and eligibility filters are illustrative inputs.
                They are not inspections or fitted local coefficients.
              </p>
            </div>
            <div>
              <strong>Missing evidence</strong>
              <p>
                No ownership, transfer chain, permits, taxes, verified renovations, concessions, listing history or
                complete market inventory is supplied. No real map is implied by fictional coordinates.
              </p>
            </div>
          </div>
          <p className="fine">
            Real workspace evidence is separately labeled public, licensed or user-provided and requires current source
            permissions. This practice route accepts only the fictional sample and labeled practice entries.
          </p>
        </section>
        <section id="studio-report" className="studio-report studio-section-anchor" aria-label="Create your report">
          <div>
            <span className="eyebrow">PORTABLE DECISION RECORD</span>
            <h2>Your reasoning, ready to review.</h2>
            <p>
              The report preserves this calculation, your selected asking price, cost assumptions, excluded-sale
              reasons, practice entries and source references.
            </p>
            <p className="fine">Draft · fictional demonstration · not reviewed for a real client</p>
          </div>
          <div className="studio-report-actions">
            {result ? (
              <>
                <a
                  className="button primary"
                  href={demoReportHref(state)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setReportOpened(true);
                    setStep(4);
                  }}
                >
                  <FileText size={17} /> Open professional report <ArrowRight size={17} />
                </a>
                <a className="button" href={demoReportHref(state, 'json')}>
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
          {storageStatus || 'Practice changes save on this device. Export a decision to keep an independent copy.'}
        </p>
        <footer className="studio-footer">
          <Link href="/">
            Explore the connected Ascent workspace <ArrowRight size={15} />
          </Link>
          <span>Fictional practice · actual deterministic engine · no account required</span>
        </footer>
      </main>
    </div>
  );
}
