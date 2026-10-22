'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Home, LockKeyhole, Save, Trash2 } from 'lucide-react';
import {
  compareDecisions,
  decisionLabels,
  emptyFinance,
  exampleFinance,
  financeLabels,
  financeSchema,
  saleSensitivity,
  type FinanceInputs,
  type FinanceKey,
  type DecisionKind,
} from '@/lib/homeowner-finance';
import {
  compareHomeSnapshots,
  compareFinancialSummaries,
  createHomeSnapshot,
  emptyOwnerNotes,
  evidencePassport,
  HOME_STORAGE_KEY,
  parseProfiles,
  saveHomeSnapshot,
  sourceReview,
  propertyMonitorChanges,
  type HomeProfile,
  type OwnerNotes,
} from '@/lib/homeowner-passport';
import type { StudioEvidence, StudioState } from '@/lib/demo-studio';
import type { StudySession } from '@/lib/study-states';
import { briefAnswers, type BriefQuestion, type HomeDecisionBrief } from '@/lib/home-decision-brief';
import type { CmaResult } from '@/lib/types';
import { HomeownerDecisions } from './homeowner-decisions';
import { downloadJson, openHtmlReport } from '@/lib/browser-export';
import { renderHomeownerReport } from '@/lib/homeowner-report';
import { date, money } from './format';
import '@/app/homeowner.css';

const groups: { title: string; keys: FinanceKey[]; note: string }[] = [
  {
    title: 'Value, debt and selling',
    keys: [
      'propertyValue',
      'salePrice',
      'mortgageBalance',
      'mortgageRate',
      'mortgageMonths',
      'commissionPercent',
      'closingPercent',
      'concessions',
      'sellingMonths',
    ],
    note: 'Value is modeled; price, fees and payoff are assumptions. A lender payoff statement may include additional fees. Commissions are negotiable.',
  },
  {
    title: 'Ongoing ownership costs',
    keys: ['monthlyTax', 'monthlyInsurance', 'monthlyHoa', 'monthlyMaintenance', 'monthlyCapex'],
    note: 'Enter monthly amounts, dividing an annual bill by 12. Property tax and insurance are not inferred from a property value.',
  },
  {
    title: 'Renting',
    keys: ['monthlyRent', 'vacancyPercent', 'managementPercent'],
    note: 'Enter an assumed rent; no rental market observations are connected. Maintenance and capital reserves come from ownership costs.',
  },
  {
    title: 'Renovating before sale',
    keys: ['renovationCost', 'renovatedSalePrice', 'renovationMonths'],
    note: 'The post-renovation price is your assumption, not a measured renovation return. Renovation months are added to the selling timeline.',
  },
  {
    title: 'Refinancing',
    keys: ['refinanceRate', 'refinanceMonths', 'refinanceCosts', 'cashOut'],
    note: 'Enter a fixed-rate loan quote. Costs are paid in cash; cash out increases debt. Payment savings alone do not establish economic savings.',
  },
  {
    title: 'Buying while keeping this home',
    keys: [
      'purchasePrice',
      'downPercent',
      'purchaseRate',
      'purchaseMonths',
      'purchaseClosingCosts',
      'purchaseMonthlyCosts',
    ],
    note: 'This choice rents the current home and buys an owner-occupied next home. Loan qualification and bridge financing are not modeled.',
  },
  {
    title: 'Timeline, reserves and hypothetical changes',
    keys: ['horizonMonths', 'cashReserves', 'appreciationPercent', 'opportunityPercent'],
    note: 'Annual property changes and cash returns are hypothetical. Choose 0 explicitly for a flat scenario; they are never supplied as a forecast.',
  },
];
const valueQuestions: [BriefQuestion, string][] = [
  ['why', 'Why is my home valued this way?'],
  ['top-comp', 'Which sale influences the estimate most?'],
  ['changes', 'What would materially change this?'],
  ['unsupported', 'What is not supported by the evidence?'],
];
const choiceQuestions = [
  ['after-costs', 'What would I receive after selling costs?'],
  ['less', 'What if I sell for $25,000 less?'],
  ['rent', 'How does renting compare with selling?'],
  ['renovate', 'What is the renovation break-even?'],
  ['missing', 'Which missing information matters?'],
  ['saved', 'What changed since my saved decision?'],
] as const;
const valueText = (value: unknown) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value : JSON.stringify(value);

export function HomeownerWorkbench({
  evidence,
  state,
  result,
  valueStated = true,
  brief,
  onFinanceChange,
  onStudioChange,
  missingEvidence,
  session,
}: {
  evidence: StudioEvidence;
  state: StudioState;
  result: CmaResult | null;
  /** False when the evidence does not support a stated value; the estimate then never fills a financial input. */
  valueStated?: boolean;
  /** The page's Home Decision Brief, which answers the evidence questions in Ask Ascent. */
  brief?: HomeDecisionBrief;
  /** Receives each distinct set of effective financial inputs, valid or not. */
  onFinanceChange?: (finance: FinanceInputs) => void;
  onStudioChange: (patch: Partial<StudioState>) => void;
  missingEvidence: string;
  /** A prepared study state: saved homes are not restored, and it may open with the illustrative inputs. */
  session?: StudySession;
}) {
  const [inputs, setInputs] = useState<FinanceInputs>(emptyFinance);
  const [notes, setNotes] = useState<OwnerNotes>(emptyOwnerNotes);
  const [followValue, setFollowValue] = useState(true);
  const [profiles, setProfiles] = useState<HomeProfile[]>([]),
    [ready, setReady] = useState(false);
  const [status, setStatus] = useState(''),
    [inputError, setInputError] = useState('');
  const [inputErrorKey, setInputErrorKey] = useState<FinanceKey | null>(null);
  const [decisionChoice, setDecisionChoice] = useState<DecisionKind>('hold');
  const [focusInput, setFocusInput] = useState<FinanceKey | null>(null);
  const assumptions = useRef<HTMLDetailsElement>(null);
  const financeFields = useRef<Partial<Record<FinanceKey, HTMLInputElement>>>({});
  const [panel, setPanel] = useState<string>(session?.panel ?? 'overview'),
    [selectedVersion, setSelectedVersion] = useState('');
  const [targetVersion, setTargetVersion] = useState('current');
  const [question, setQuestion] = useState<string>(brief ? 'why' : 'less'),
    [draft, setDraft] = useState<string | null>(null);
  const [includePrivate, setIncludePrivate] = useState(false);
  const [improvement, setImprovement] = useState({ year: '', description: '', cost: '' });
  const loadIllustrative = () => {
    const a = exampleFinance();
    setInputs(a);
    setInputError('');
    setInputErrorKey(null);
    setFollowValue(false);
    onStudioChange({
      listPrice: a.salePrice,
      commissionPercent: a.commissionPercent!,
      closingPercent: a.closingPercent!,
      concessions: a.concessions!,
      payoff: a.mortgageBalance!,
    });
    setStatus(
      'Illustrative financial assumptions loaded for the fictional sample. They are not property records or market forecasts.',
    );
  };
  useEffect(() => {
    if (!focusInput || !assumptions.current) return;
    assumptions.current.open = true;
    financeFields.current[focusInput]?.focus();
    setFocusInput(null);
  }, [focusInput, panel]);
  const reviewInput = (key: FinanceKey) => {
    if (panel !== 'overview' && panel !== 'compare') setPanel('compare');
    setFocusInput(key);
  };
  useEffect(() => {
    if (session) {
      if (session.illustrativeFinance) loadIllustrative();
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(HOME_STORAGE_KEY);
      const saved = raw ? parseProfiles(raw) : [];
      setProfiles(saved);
      const latest = saved.find(p => p.propertyId === evidence.subject.id)?.snapshots.at(-1);
      if (latest) {
        setInputs(latest.finance);
        setNotes(latest.notes);
        setFollowValue(false);
        setSelectedVersion(latest.id);
        onStudioChange({
          listPrice: latest.finance.salePrice,
          commissionPercent: latest.finance.commissionPercent ?? state.commissionPercent,
          closingPercent: latest.finance.closingPercent ?? state.closingPercent,
          concessions: latest.finance.concessions ?? state.concessions,
          payoff: latest.finance.mortgageBalance ?? 0,
        });
        setStatus(
          'Saved homeowner inputs restored. Property value uses your saved assumption until you choose the current estimate.',
        );
      }
    } catch {
      setStatus(
        'Saved profiles could not be read. Your draft still works; export it before leaving. Existing storage has been kept.',
      );
    }
    setReady(true);
    // The studio remounts for each property. Restore once without reacting to edits in its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence.subject.id]);
  const modeled = valueStated ? (result?.estimate ?? null) : null;
  const effective: FinanceInputs = {
    ...inputs,
    propertyValue: followValue ? modeled : inputs.propertyValue,
    salePrice: state.listPrice ?? modeled,
    commissionPercent: state.commissionPercent,
    closingPercent: state.closingPercent,
    concessions: state.concessions,
    mortgageBalance: inputs.mortgageBalance !== null || state.payoff > 0 ? state.payoff : null,
  };
  const effectiveKey = JSON.stringify(effective);
  const parsed = financeSchema.safeParse(effective);
  const fieldErrors: Partial<Record<FinanceKey, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as FinanceKey;
      if (key in financeLabels) fieldErrors[key] = issue.message;
    }
  }
  if (inputError && inputErrorKey) fieldErrors[inputErrorKey] = inputError;
  const comparison = useMemo(() => (parsed.success ? compareDecisions(parsed.data) : null), [effectiveKey]);
  useEffect(() => {
    onFinanceChange?.(effective);
    // Report each distinct set of inputs once; the parent re-renders on every report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);
  const sensitivity = parsed.success ? saleSensitivity(parsed.data) : null;
  const savedProfile = profiles.find(p => p.propertyId === evidence.subject.id);
  const selected = savedProfile?.snapshots.find(s => s.id === selectedVersion) ?? savedProfile?.snapshots.at(-1);
  const snapshot = () => createHomeSnapshot(evidence, state, effective, notes, new Date().toISOString());
  let changes: ReturnType<typeof compareHomeSnapshots> | null = null;
  try {
    if (selected && parsed.success && (panel === 'passport' || notes.monitor))
      changes = compareHomeSnapshots(
        selected,
        targetVersion === 'current'
          ? snapshot()
          : (savedProfile?.snapshots.find(s => s.id === targetVersion) ?? snapshot()),
      );
  } catch {
    /* Display input errors below; no invented comparison. */
  }
  let evidenceChanges: ReturnType<typeof compareHomeSnapshots>['changes'] = [];
  if (selected && notes.monitor && parsed.success) {
    try {
      evidenceChanges = propertyMonitorChanges(selected, snapshot());
    } catch {
      /* Invalid drafts are reported separately. */
    }
  }
  const currentSourceReview = sourceReview(evidence.sources, new Date().toISOString());
  const changeInput = (key: FinanceKey, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    if (['salePrice', 'mortgageBalance', 'commissionPercent', 'closingPercent', 'concessions'].includes(key)) {
      const max = key === 'commissionPercent' || key === 'closingPercent' ? 25 : 100000000;
      if (
        (value === null && key !== 'mortgageBalance') ||
        (value !== null && (value < (key === 'salePrice' ? 1 : 0) || value > max))
      ) {
        setInputError(
          `Enter ${key === 'salePrice' ? 'a positive sale price' : `a value from 0 to ${max}`} for ${financeLabels[key]}. These controls share the pricing draft.`,
        );
        setInputErrorKey(key);
        return;
      }
    }
    if (key === 'propertyValue') setFollowValue(false);
    const next = { ...effective, [key]: value };
    if (value !== null && !Number.isFinite(value)) {
      setInputError('Enter a finite number or leave the field blank.');
      setInputErrorKey(key);
      return;
    }
    // Keep invalid draft values visible. Calculations and save/export stop until they are corrected.
    setInputs(next);
    setInputError('');
    setInputErrorKey(null);
    setStatus('Draft changed. Save a new decision snapshot to keep it.');
    setDraft(null);
    if (key === 'salePrice') onStudioChange({ listPrice: value });
    if (key === 'mortgageBalance') onStudioChange({ payoff: value ?? 0 });
    if (key === 'commissionPercent' || key === 'closingPercent' || key === 'concessions') {
      if (value !== null) onStudioChange({ [key]: value });
    }
  };
  const persist = (next: HomeProfile[]) => {
    localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify({ version: 1, profiles: next }));
    setProfiles(next);
  };
  const save = () => {
    // A prepared study state starts the same for every participant, so it keeps nothing on the device.
    if (session) return;
    try {
      const snap = snapshot();
      // Read latest storage so a second tab's saved homes are not overwritten by a stale render.
      const raw = localStorage.getItem(HOME_STORAGE_KEY),
        latest = raw ? parseProfiles(raw) : [];
      persist(saveHomeSnapshot(latest, snap));
      setSelectedVersion(snap.id);
      setStatus('Home and decision snapshot saved on this device. Financial inputs are not sent to Ascent.');
    } catch (e) {
      setStatus(e instanceof Error ? `Could not save: ${e.message}` : 'Could not save. Export this draft to keep it.');
    }
  };
  const remove = (all = false) => {
    try {
      const raw = localStorage.getItem(HOME_STORAGE_KEY),
        latest = raw ? parseProfiles(raw) : [];
      const next = latest
        .map(p =>
          p.propertyId === evidence.subject.id
            ? { ...p, snapshots: p.snapshots.filter(s => s.id !== selected?.id) }
            : p,
        )
        .filter(p => (all ? p.propertyId !== evidence.subject.id : p.snapshots.length > 0));
      persist(next);
      setSelectedVersion('');
      if (all) {
        setInputs(emptyFinance());
        setNotes(emptyOwnerNotes());
        setFollowValue(true);
        onStudioChange({ payoff: 0 });
      }
      setStatus(
        all
          ? 'Saved home and all homeowner snapshots removed from this device. Downloaded copies remain with their recipients.'
          : 'Selected snapshot removed from this device.',
      );
    } catch {
      setStatus('Device storage could not be updated. Nothing was reported as removed.');
    }
  };
  const exportPassport = () => {
    try {
      downloadJson(
        evidencePassport(snapshot(), includePrivate),
        includePrivate ? 'ascent-private-passport.json' : 'ascent-sharing-passport.json',
      );
      setStatus(
        includePrivate
          ? 'Private passport downloaded, including financial inputs and homeowner notes.'
          : 'Sharing passport downloaded. Mortgage, financial inputs and homeowner notes are omitted.',
      );
    } catch {
      setStatus('Correct the financial inputs before exporting this passport.');
    }
  };
  const briefReplies = brief ? briefAnswers(brief) : null;
  const questionAnswers = {
    saved: (() => {
      if (!selected || !comparison)
        return 'Save a decision snapshot and complete its financial inputs before comparing saved outcomes.';
      const deltas = compareFinancialSummaries(selected.calculation.scenarios, comparison.results).filter(
        r => r.netPositionChange !== null,
      );
      return deltas.length
        ? `Against the selected saved decision: ${deltas.map(r => `${decisionLabels[r.kind]} changes from ${money(r.before!.netPosition!)} to ${money(r.after!.netPosition!)} (${money(r.netPositionChange!)} difference)`).join('; ')}. These amounts use each decision’s chosen horizon and calculation version. Inspect changed assumptions in Reports & History; this is not proof of a market move.`
        : 'The saved and current decisions do not yet have a complete financial choice in common. Missing inputs remain unknown.';
    })(),
    less: sensitivity
      ? `Selling for $25,000 less changes the sell scenario’s horizon net position by ${money(sensitivity.netDifference)} under the current fees, payoff, timeline and hypothetical cash return. This is arithmetic, not a sale-price forecast.${briefReplies ? ` ${briefReplies.lower.text}` : ''}`
      : `${briefReplies ? `${briefReplies.lower.text} ` : ''}Enter a sale price of at least $25,000, mortgage payoff, fees and hypothetical cash return to calculate the full sell-scenario comparison.`,
    'after-costs':
      briefReplies?.['after-costs'].text ??
      'Choose a sale price and selling costs in the pricing strategy section to see proceeds after selling costs.',
    rent: (() => {
      const rent = comparison?.results.find(r => r.kind === 'rent'),
        sell = comparison?.results.find(r => r.kind === 'sell');
      return rent?.available && sell?.available
        ? `Renting produces ${money(rent.monthlyCashFlow!)} initial monthly cash flow. Its horizon net position is ${money(rent.netPosition!)}, compared with ${money(sell.netPosition!)} for selling, a difference of ${money(rent.netPosition! - sell.netPosition!)}. Replacement housing, income and capital-gains taxes are excluded; this does not establish which choice is better for your household.`
        : 'Complete the ownership, rental, debt and hypothetical-change inputs to compare rent and sell. Missing values are listed for each choice.';
    })(),
    renovate: (() => {
      const ren = comparison?.results.find(r => r.kind === 'renovate');
      return ren?.breakEven
        ? `A renovated sale price of ${money(ren.breakEven.value)} would match the sell scenario’s horizon net position under your entered budget and timing. This is a break-even threshold, not an estimate of renovation value.`
        : 'Enter renovation budget, assumed sale price, time, ownership costs and mortgage terms to calculate the renovation break-even.';
    })(),
    missing: `${missingEvidence} Financial gaps: ${
      comparison?.results
        .find(r => r.kind === 'hold')
        ?.missing.map(k => financeLabels[k])
        .join('; ') || 'The hold scenario has its required inputs, but they remain unverified assumptions.'
    } Verify the lender payoff statement, tax bill, insurance quote and renovation bids before deciding.`,
  };
  const briefReply =
    briefReplies && valueQuestions.some(([id]) => id === question) ? briefReplies[question as BriefQuestion] : null;
  const answer = briefReply?.text ?? questionAnswers[question as keyof typeof questionAnswers] ?? '';
  const references = briefReply
    ? briefReply.refs.join(' · ')
    : `finance ${comparison?.calculationHash ?? 'awaiting inputs'} · valuation ${result?.calculationHash ?? 'unavailable'}`;
  const monthlyCosts = ['monthlyTax', 'monthlyInsurance', 'monthlyHoa', 'monthlyMaintenance', 'monthlyCapex'] as const;
  const monthlyKnown = monthlyCosts.every(k => effective[k] !== null);
  return (
    <section
      id="homeowner-workbench"
      className="panel homeowner-workbench"
      aria-label="Homeowner intelligence dashboard"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR HOME · YOUR DECISIONS</span>
          <h2>What does this mean for you?</h2>
        </div>
        <Home size={22} aria-hidden="true" />
      </div>
      <p className="home-privacy">
        <LockKeyhole size={15} aria-hidden="true" /> Pricing drafts automatically save price, selling fees and payoff on
        this device. Save the home to keep additional ownership inputs. Shared browsers can expose saved information.{' '}
        <Link href="/home">My saved homes</Link>
      </p>
      <nav className="home-nav" aria-label="Homeowner tools">
        {[
          ['overview', 'My Home'],
          ['compare', 'Compare Decisions'],
          ['ask', 'Ask Ascent'],
          ['passport', 'Reports & History'],
        ].map(([id, label]) => (
          <button key={id} className="button small" aria-pressed={panel === id} onClick={() => setPanel(id)}>
            {label}
          </button>
        ))}
        <a href="#studio-evidence">Understand the Evidence</a>
      </nav>
      {panel === 'overview' && (
        <div>
          <div className="home-metrics">
            <div>
              <span>Property value assumption</span>
              <strong>
                {effective.propertyValue !== null
                  ? money(effective.propertyValue)
                  : followValue && result && !valueStated
                    ? 'Not stated'
                    : 'Unavailable'}
              </strong>
              <small>
                {!followValue
                  ? 'Homeowner-entered or saved assumption'
                  : valueStated
                    ? 'Linked to modeled estimate; see evidence limits'
                    : 'The evidence does not support a value; enter your own assumption'}
              </small>
            </div>
            <div>
              <span>Mortgage balance</span>
              <strong>{effective.mortgageBalance === null ? 'Not provided' : money(effective.mortgageBalance)}</strong>
              <small>Homeowner input · unverified</small>
            </div>
            <div>
              <span>Estimated equity</span>
              <strong>
                {effective.propertyValue === null || effective.mortgageBalance === null
                  ? 'Needs mortgage input'
                  : money(effective.propertyValue - effective.mortgageBalance)}
              </strong>
              <small>Calculated value minus entered debt · before sale costs</small>
            </div>
            <div>
              <span>Monthly ownership budget</span>
              <strong>
                {monthlyKnown ? money(monthlyCosts.reduce((sum, k) => sum + effective[k]!, 0)) : 'Costs not provided'}
              </strong>
              <small>Entered taxes, insurance, HOA, upkeep and capital reserve · excludes mortgage</small>
            </div>
          </div>
          <div className="home-evidence-summary">
            <div>
              <h3>Recorded evidence</h3>
              <p>
                {evidence.subject.sqft.toLocaleString('en-US')} sq ft
                {evidence.subject.yearBuilt ? ` · built ${evidence.subject.yearBuilt}` : ''}.{' '}
                {evidence.subject.roomCountsUnavailable
                  ? 'Room counts unavailable.'
                  : `${evidence.subject.beds} recorded beds · ${evidence.subject.baths} recorded baths.`}{' '}
                These records are not an inspection.
              </p>
              {evidence.subject.history?.length ? (
                <details>
                  <summary>Recorded property history ({evidence.subject.history.length})</summary>
                  <ul>
                    {evidence.subject.history.map((h, i) => (
                      <li key={i}>
                        {date(h.date)} · {h.event}
                        {h.price !== undefined ? ` · ${money(h.price)}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="fine">
                    Qualified transfers in the bundled snapshot only; not a complete title history.
                  </p>
                </details>
              ) : (
                <p className="fine">
                  No subject transfer is available in the qualified sales snapshot. This does not mean the property has
                  never sold.
                </p>
              )}
            </div>
            <div>
              <h3>What still needs you</h3>
              <p>
                Tax bill, mortgage payoff, insurance, HOA obligations and renovation history are unavailable unless you
                enter them. Permits, hazards and current rental observations are not connected.
              </p>
              <p className="fine">{missingEvidence}</p>
            </div>
          </div>
          <details>
            <summary>Sources and freshness</summary>
            {evidence.snapshot && (
              <p className="fine">
                Property characteristics collected {date(evidence.snapshot.parcelsFetchedAt)}; sales collected{' '}
                {date(evidence.snapshot.salesFetchedAt)}. Collection time is separate from the date of a recorded sale.
              </p>
            )}
            {currentSourceReview.map(s => (
              <div key={s.sourceId}>
                <strong>
                  {s.label} · {s.status === 'review' ? 'Refresh review needed' : 'Snapshot'}
                </strong>
                <p>
                  Collected {date(s.collectedAt)}. {s.explanation}
                </p>
                <p className="fine">{evidence.sources.find(x => x.id === s.sourceId)?.license}</p>
              </div>
            ))}
          </details>
          <details>
            <summary>Your renovation history and disputed evidence</summary>
            <p>These notes are homeowner supplied and do not automatically change the valuation.</p>
            <div className="home-input-grid">
              <label>
                Improvement year
                <input
                  type="number"
                  min="1800"
                  max="2200"
                  value={improvement.year}
                  onChange={e => setImprovement({ ...improvement, year: e.target.value })}
                />
              </label>
              <label>
                Improvement description
                <input
                  maxLength={500}
                  value={improvement.description}
                  onChange={e => setImprovement({ ...improvement, description: e.target.value })}
                />
              </label>
              <label>
                Improvement cost ($, optional)
                <input
                  type="number"
                  min="0"
                  value={improvement.cost}
                  onChange={e => setImprovement({ ...improvement, cost: e.target.value })}
                />
              </label>
            </div>
            <button
              className="button small"
              onClick={() => {
                const next = {
                  ...notes,
                  improvements: [
                    ...notes.improvements,
                    {
                      year: Number(improvement.year),
                      description: improvement.description,
                      cost: improvement.cost === '' ? null : Number(improvement.cost),
                    },
                  ],
                };
                if (
                  !improvement.description.trim() ||
                  !Number.isInteger(Number(improvement.year)) ||
                  Number(improvement.year) < 1800 ||
                  Number(improvement.year) > 2200 ||
                  Number(improvement.cost) < 0 ||
                  notes.improvements.length >= 30
                ) {
                  setStatus(
                    'Enter a description, a valid year and a nonnegative cost. Up to 30 improvements are supported.',
                  );
                  return;
                }
                setNotes(next);
                setImprovement({ year: '', description: '', cost: '' });
                setStatus('Improvement added to the draft. Save the home to retain it.');
              }}
            >
              Add improvement
            </button>
            <ul>
              {notes.improvements.map((n, i) => (
                <li key={i}>
                  {n.year} · {n.description} · {n.cost === null ? 'Cost unknown' : money(n.cost)}{' '}
                  <button
                    className="text-button"
                    onClick={() => setNotes({ ...notes, improvements: notes.improvements.filter((_, j) => i !== j) })}
                    aria-label={`Remove improvement ${i + 1}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <label className="home-wide-label">
              Missing or disputed evidence
              <textarea
                maxLength={2000}
                value={notes.disputedEvidence}
                onChange={e => setNotes({ ...notes, disputedEvidence: e.target.value })}
              />
            </label>
          </details>
        </div>
      )}
      {panel === 'compare' && evidence.sources.every(s => s.kind === 'synthetic') && (
        <button className="button small" onClick={loadIllustrative}>
          Try illustrative financial inputs
        </button>
      )}
      {panel === 'compare' && comparison && (
        <HomeownerDecisions
          comparison={comparison}
          selected={decisionChoice}
          onSelect={setDecisionChoice}
          onReviewInput={reviewInput}
        />
      )}
      {(panel === 'overview' || panel === 'compare') && (
        <details className="home-assumptions" ref={assumptions}>
          <summary>Edit financial assumptions</summary>
          <p className="fine">
            The existing studio’s selected price, selling fees and payoff use these same controls. Default fees are
            editable assumptions, not quotes. Blank ownership inputs remain unknown.
          </p>
          <button className="text-button" disabled={!result || !valueStated} onClick={() => setFollowValue(true)}>
            Use current modeled estimate for property value
          </button>
          {groups.map((group, groupIndex) => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              <p className="fine" id={`home-finance-group-${groupIndex}`}>
                {group.note}
              </p>
              <div className="home-input-grid">
                {group.keys.map(key => (
                  <div className="home-finance-field" key={key}>
                    <label htmlFor={`home-finance-${key}`}>{financeLabels[key]}</label>
                    <input
                      id={`home-finance-${key}`}
                      ref={element => {
                        if (element) financeFields.current[key] = element;
                        else delete financeFields.current[key];
                      }}
                      type="number"
                      inputMode="decimal"
                      step={key.endsWith('Months') ? '1' : 'any'}
                      value={effective[key] ?? ''}
                      placeholder="Unknown"
                      aria-invalid={!!fieldErrors[key]}
                      aria-describedby={`home-finance-group-${groupIndex}${fieldErrors[key] ? ` home-finance-${key}-error` : ''}`}
                      onChange={e => changeInput(key, e.target.value)}
                    />
                    {fieldErrors[key] && (
                      <p className="home-field-error" id={`home-finance-${key}-error`}>
                        {fieldErrors[key]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {panel === 'compare' && comparison && (
            <a className="button small" href="#home-decision-setup-title">
              Return to your comparison
            </a>
          )}
        </details>
      )}
      {(inputError || !parsed.success) && (
        <div role="alert" className="error-box home-finance-errors">
          <p>
            <strong>Review your financial inputs.</strong> Choose a field below to correct it.
          </p>
          <ul>
            {Object.entries(fieldErrors).map(([key, message]) => (
              <li key={key}>
                <button className="text-button" onClick={() => reviewInput(key as FinanceKey)}>
                  {financeLabels[key as FinanceKey]}
                </button>
                : {message}
              </li>
            ))}
          </ul>
          {!parsed.success &&
            parsed.error.issues.filter(issue => !issue.path.length).map((issue, i) => <p key={i}>{issue.message}</p>)}
        </div>
      )}
      {panel === 'ask' && (
        <div className="home-ask">
          <h3>Ask about the decision on screen</h3>
          <p className="fine">Deterministic evidence mode · no external model request</p>
          {brief && (
            <>
              <h4 className="home-ask-group">About the value and the evidence</h4>
              <div className="home-nav" role="group" aria-label="Questions about the value and evidence">
                {valueQuestions.map(([id, label]) => (
                  <button
                    key={id}
                    className="button small"
                    aria-pressed={question === id}
                    onClick={() => {
                      setQuestion(id);
                      setDraft(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h4 className="home-ask-group">About your choices</h4>
            </>
          )}
          <div className="home-nav" role="group" aria-label="Homeowner decision questions">
            {choiceQuestions
              .filter(([id]) => brief || id !== 'after-costs')
              .map(([id, label]) => (
                <button
                  key={id}
                  className="button small"
                  aria-pressed={question === id}
                  onClick={() => {
                    setQuestion(id);
                    setDraft(null);
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
          <p aria-live="polite">{answer}</p>
          <p className="fine">
            References: {references} · {evidence.sources.map(s => s.label).join('; ')}
          </p>
          <label className="home-wide-label">
            Editable explanation for your report
            <textarea value={draft ?? answer} onChange={e => setDraft(e.target.value)} />
          </label>
          <button
            className="button small"
            onClick={() =>
              downloadJson(
                {
                  format: 'ascent-homeowner-explanation-1',
                  question,
                  text: draft ?? answer,
                  edited: draft !== null,
                  finance: comparison?.calculationHash,
                  valuation: result?.calculationHash,
                  brief: brief ? { version: brief.version, checksum: brief.checksum } : undefined,
                  sources: evidence.sources,
                },
                'ascent-explanation.json',
              )
            }
          >
            Export this explanation
          </button>
        </div>
      )}
      {panel === 'passport' && (
        <div className="home-history">
          <h3>Property Evidence Passport & Decision Time Machine</h3>
          <p>
            Freeze the evidence, assumptions, calculation versions and homeowner notes together. Up to ten homes and ten
            versions per home are supported, subject to browser storage limits.
          </p>
          {savedProfile?.snapshots.length ? (
            <>
              <label htmlFor="home-earlier-version">Earlier version</label>
              <select
                id="home-earlier-version"
                value={selected?.id ?? ''}
                onChange={e => setSelectedVersion(e.target.value)}
              >
                {savedProfile.snapshots.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    Version {i + 1} · {new Date(s.savedAt).toLocaleString()}
                  </option>
                ))}
              </select>
              <label htmlFor="home-target-version">Compare with</label>
              <select id="home-target-version" value={targetVersion} onChange={e => setTargetVersion(e.target.value)}>
                <option value="current">Current draft</option>
                {savedProfile.snapshots.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    Saved version {i + 1} · {new Date(s.savedAt).toLocaleString()}
                  </option>
                ))}
              </select>
              {changes && (
                <>
                  <p>
                    {changes.savedEstimateChange !== null
                      ? `Saved estimate difference: ${money(changes.savedEstimateChange)}. `
                      : 'No comparable valuation delta is available. '}
                    {!changes.valuation &&
                      'Valuation inputs abstain or no longer reproduce the saved engine hash; no current-engine attribution is claimed. '}
                    {changes.changes.length} changed evidence or assumption fields. Saving time alone is not a change.
                  </p>
                  <details>
                    <summary>Inspect exact changes ({changes.changes.length})</summary>
                    <div
                      className="home-table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label="Exact decision history changes"
                    >
                      <table className="home-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Saved</th>
                            <th>Current</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.changes.map(c => (
                            <tr key={c.path}>
                              <th scope="row">{c.path}</th>
                              <td>{valueText(c.before)}</td>
                              <td>{valueText(c.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <details>
                    <summary>Compare saved financial results</summary>
                    <p className="fine">
                      Frozen saved outputs compared with the chosen target.{' '}
                      {changes.sameFinancialHorizon
                        ? 'The horizons match.'
                        : 'The horizons differ; amounts refer to each decision’s own horizon.'}{' '}
                      {changes.sameFinancialVersion
                        ? 'Calculation versions match.'
                        : 'Calculation versions differ; these differences do not isolate an assumption’s effect.'}
                    </p>
                    <div
                      className="home-table-wrap"
                      tabIndex={0}
                      role="region"
                      aria-label="Saved financial result differences"
                    >
                      <table className="home-table">
                        <thead>
                          <tr>
                            <th>Choice</th>
                            <th>Earlier net position</th>
                            <th>Target net position</th>
                            <th>Difference</th>
                            <th>Monthly cash flow change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.financial.map(r => (
                            <tr key={r.kind}>
                              <th scope="row">{decisionLabels[r.kind]}</th>
                              <td>
                                {r.before?.available && r.before.netPosition !== null
                                  ? money(r.before.netPosition)
                                  : 'Unavailable'}
                              </td>
                              <td>
                                {r.after?.available && r.after.netPosition !== null
                                  ? money(r.after.netPosition)
                                  : 'Unavailable'}
                              </td>
                              <td>{r.netPositionChange === null ? 'Unavailable' : money(r.netPositionChange)}</td>
                              <td>
                                {r.monthlyCashFlowChange === null ? 'Unavailable' : money(r.monthlyCashFlowChange)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
              <button className="button small" onClick={() => remove()}>
                Remove selected version
              </button>{' '}
              <button className="button small" onClick={() => remove(true)}>
                <Trash2 size={14} aria-hidden="true" />
                Remove saved home and private inputs
              </button>
            </>
          ) : (
            <p>No versions saved yet. Save this home to start its decision history.</p>
          )}
          <div className="home-monitor">
            <h3>Property opportunity monitor</h3>
            <label className="home-check">
              <input
                type="checkbox"
                checked={notes.monitor}
                onChange={e => setNotes({ ...notes, monitor: e.target.checked })}
              />
              Show evidence changes when I return to this home
            </label>
            <p>
              On-demand comparison of bundled snapshots when this page is opened. No background refresh, email or
              real-time feed. Save the home to retain this preference.
            </p>
            {notes.monitor && (
              <p role="status">
                {!selected
                  ? 'Save a baseline to compare future evidence.'
                  : evidenceChanges.length
                    ? `${evidenceChanges.length} recorded evidence differences since the selected version. Inspect exact changes above; corrections do not establish a price effect.`
                    : 'No recorded evidence changes since the selected version. No new market alert is generated.'}
              </p>
            )}
          </div>
          <fieldset>
            <legend>Export and sharing</legend>
            <label className="home-check">
              <input type="checkbox" checked={includePrivate} onChange={e => setIncludePrivate(e.target.checked)} />
              Include private finances, renovation history and disputed-evidence notes
            </label>
            <p className="fine">
              Default sharing export includes public evidence and its valuation only. Private exports add financial
              inputs, scenario results and notes. User-entered comparable sales or condition ratings require a private
              export. Downloaded copies cannot be revoked. No public sharing link is created.
            </p>
            <button className="button small" disabled={!parsed.success} onClick={exportPassport}>
              <Download size={15} aria-hidden="true" />
              {includePrivate ? 'Export private passport (JSON)' : 'Export sharing passport (JSON)'}
            </button>
            <button
              className="button small"
              disabled={!parsed.success}
              onClick={() => {
                try {
                  openHtmlReport(renderHomeownerReport(snapshot(), includePrivate));
                  setStatus(
                    'Readable passport opened. Its privacy setting matches this export. Use browser Print to save a PDF.',
                  );
                } catch {
                  setStatus('Correct the financial inputs before opening this report.');
                }
              }}
            >
              Open readable passport
            </button>
            <p className="fine">
              The report opens locally in a new tab using the same privacy filter as JSON. Use browser Print in that tab
              to save a PDF. Keep the JSON for complete reproducible inputs and monthly values.
            </p>
          </fieldset>
        </div>
      )}
      <div className="home-save">
        <button className="button primary" disabled={!ready || !parsed.success || !!session} onClick={save}>
          <Save size={16} aria-hidden="true" />
          Save home & decision snapshot
        </button>
        <span className="fine">
          {session
            ? 'Saving is off on this study page, so every session starts the same.'
            : 'Browser only · no account needed · no automatic synchronization'}
        </span>
      </div>
      <p className="home-storage-status" role="status">
        {status}
      </p>
    </section>
  );
}
