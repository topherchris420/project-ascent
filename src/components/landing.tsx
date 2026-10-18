'use client';
import '@/app/landing.css';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  FileText,
  Fingerprint,
  Handshake,
  Layers3,
  Lock,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import { calculateCma, defaultAssumptions, simulatePricing } from '@/lib/analytics';
import { assessCmaEvidence, compareCmaDecisions } from '@/lib/decision-review';
import type { ValuationProperty } from '@/lib/types';
import { valuationBenchmark } from '@/lib/valuation-safeguards';
import { AccuracyScorecard } from './accuracy-scorecard';
import { marylandRevisedBenchmark as marylandBenchmark, marylandVerdict } from '@/lib/maryland-studio';

export type LandingProps = {
  onDemo: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  busy: boolean;
  error?: string;
  workspaceAvailable?: boolean;
};

import {
  SAMPLE_AS_OF,
  sampleSubject as subject,
  sampleCandidates as candidates,
  sampleSources,
} from '@/lib/pricing-sample';
const SOURCE = sampleSources[0].id;
const addressOf = (id: string) => candidates.find(candidate => candidate.id === id)?.address ?? id;

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
const thousands = (n: number) => `$${Math.round(n / 1000).toLocaleString('en-US')}k`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const shortDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function readPosition(price: number, low: number, estimate: number, high: number, supporting: number, total: number) {
  if (price < low)
    return `Below all ${total} adjusted sales, ${money(low - price)} under the lowest. This asking-price assumption does not predict buyer response or a sale outcome.`;
  if (price > high)
    return `Above every adjusted sale by ${money(price - high)}. The evidence does not support this yet, so name the reason before you list here.`;
  if (Math.abs(price - estimate) <= estimate * 0.005)
    return `Near the weighted estimate of ${money(estimate)}. ${supporting} of ${total} adjusted sales sit at or above this price.`;
  if (price < estimate)
    return `Inside the observed range and under the weighted estimate: ${supporting} of ${total} adjusted sales sit at this price or higher.`;
  return `Above the estimate but inside the range. Only ${supporting} of ${total} adjusted sales support it, so be ready to defend the premium.`;
}

function PricingCard() {
  const cma = useMemo(() => calculateCma(subject, candidates, defaultAssumptions, SAMPLE_AS_OF), []);
  const evidenceAssessment = useMemo(
    () =>
      assessCmaEvidence(cma, [
        {
          id: SOURCE,
          label: 'Clearly fictional Arlington sample',
          kind: 'synthetic',
          observedAt: SAMPLE_AS_OF,
          license: 'Practice-only fictional evidence',
          confidence: 1,
        },
      ]),
    [cma],
  );
  // Demonstrate a revision to an input record, not a purported historical market price movement.
  const earlierSample = useMemo(
    () =>
      calculateCma(
        subject,
        candidates.map(candidate =>
          candidate.id === 'landing-c2' ? { ...candidate, soldPrice: candidate.soldPrice! - 15000 } : candidate,
        ),
        defaultAssumptions,
        SAMPLE_AS_OF,
      ),
    [],
  );
  const recordedRevision = useMemo(() => compareCmaDecisions(earlierSample, cma), [earlierSample, cma]);
  const positions = useMemo(
    () =>
      [
        // Round to whole-thousand list prices without leaving the adjusted-comp range.
        { key: 'conservative', label: 'Conservative', price: Math.ceil(cma.strategies.conservative / 1000) * 1000 },
        { key: 'moderate', label: 'Balanced', price: roundTo(cma.strategies.moderate, 1000) },
        { key: 'aggressive', label: 'Aggressive', price: Math.floor(cma.strategies.aggressive / 1000) * 1000 },
      ] as const,
    [cma],
  );
  const [price, setPrice] = useState<number>(positions[1].price);
  const min = Math.floor((cma.low * 0.94) / 1000) * 1000;
  const max = Math.ceil((cma.high * 1.06) / 1000) * 1000;
  const scenario = simulatePricing(cma, price);
  const supporting = cma.comps.filter(comp => comp.adjustedPrice >= price).length;
  const at = (value: number) => `${Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))}%`;
  const insight = readPosition(price, cma.low, cma.estimate, cma.high, supporting, cma.comps.length);
  const a = cma.assumptions;
  return (
    <div className="lp-card" role="group" aria-labelledby="lp-card-title">
      <div className="lp-card-head">
        <div>
          <span className="lp-card-kicker">Subject · Arlington, VA</span>
          <h2 id="lp-card-title" className="lp-card-title">
            {subject.address}
          </h2>
          <span className="lp-card-meta">4 bd · 3 ba · 2,180 sq ft · condition 4/5</span>
        </div>
        <span className="lp-chip">Fictional sample · real calculation engine</span>
      </div>

      <div className="lp-estimate">
        <span>Comparable-supported estimate</span>
        <strong>{money(cma.estimate)}</strong>
        <small>
          Adjusted-comp range {money(cma.low)} – {money(cma.high)} · {cma.comps.length} closed sales
        </small>
      </div>

      <div className="lp-track" aria-hidden="true">
        <div className="lp-track-band" style={{ left: at(cma.low), width: `calc(${at(cma.high)} - ${at(cma.low)})` }} />
        {cma.comps.map(comp => (
          <i key={comp.propertyId} className="lp-track-comp" style={{ left: at(comp.adjustedPrice) }} />
        ))}
        <b className="lp-track-estimate" style={{ left: at(cma.estimate) }} />
        <span className="lp-track-ask" style={{ left: at(price) }}>
          <em>{thousands(price)}</em>
        </span>
      </div>
      <div className="lp-track-legend" aria-hidden="true">
        <span>
          <i className="lp-dot comp" /> Adjusted sale
        </span>
        <span>
          <i className="lp-dot estimate" /> Weighted estimate
        </span>
        <span>
          <i className="lp-dot ask" /> Your asking price
        </span>
      </div>

      <div className="lp-positions" role="group" aria-label="List position">
        {positions.map(position => (
          <button
            key={position.key}
            type="button"
            className="lp-position"
            aria-pressed={price === position.price}
            onClick={() => setPrice(position.price)}
          >
            <span>{position.label}</span>
            <strong>{money(position.price)}</strong>
          </button>
        ))}
      </div>

      <div className="lp-slider">
        <div className="lp-slider-row">
          <label htmlFor="lp-asking">Sample asking price</label>
          <output htmlFor="lp-asking">{money(price)}</output>
        </div>
        <input
          id="lp-asking"
          type="range"
          aria-label="Sample asking price"
          aria-valuetext={`${money(price)}, ${scenario.position.toLowerCase()}`}
          min={min}
          max={max}
          step={1000}
          value={price}
          onChange={e => setPrice(Number(e.target.value))}
        />
      </div>

      <div className="lp-insight" aria-live="polite">
        <span>
          <Sparkles size={14} aria-hidden="true" /> How the evidence reads this price
        </span>
        <p>{insight}</p>
      </div>

      <dl className="lp-facts">
        <div>
          <dt>Versus estimate</dt>
          <dd>
            {Math.abs(scenario.differencePercent) < 0.05 ? (
              'At estimate'
            ) : (
              <>
                {signed(scenario.difference)} <small>({scenario.differencePercent.toFixed(1)}%)</small>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Illustrative net</dt>
          <dd>{money(scenario.estimatedNet)}</dd>
        </div>
        <div>
          <dt>Sales at or above</dt>
          <dd>
            {supporting} of {cma.comps.length}
          </dd>
        </div>
      </dl>

      <details className="lp-math">
        <summary>
          <ShieldCheck size={14} aria-hidden="true" /> Inspect evidence fitness and a sample revision
        </summary>
        <div className="lp-math-body">
          <p>
            <strong>{evidenceAssessment.label}.</strong> {evidenceAssessment.comparableCount} eligible fictional sales,{' '}
            {evidenceAssessment.effectiveComparableCount.toFixed(1)} effective after weighting, largest weight{' '}
            {evidenceAssessment.largestWeightPercent.toFixed(1)}%, and adjusted spread{' '}
            {evidenceAssessment.adjustedSpreadPercent.toFixed(1)}% of the estimate.
          </p>
          <ul className="lp-comps">
            {evidenceAssessment.findings.map(finding => (
              <li key={finding.label}>
                <strong>{finding.label}:</strong> {finding.detail}
              </li>
            ))}
          </ul>
          <p>
            <strong>Decision Time Machine, miniature example.</strong> Compare this fictional calculation with a
            deliberately altered practice snapshot in which one fictional sale was entered $15,000 lower. Neither
            snapshot represents an actual market change.
          </p>
          <dl className="lp-facts">
            <div>
              <dt>Earlier practice estimate</dt>
              <dd>{money(recordedRevision.previousEstimate)}</dd>
            </div>
            <div>
              <dt>Current practice estimate</dt>
              <dd>{money(recordedRevision.currentEstimate)}</dd>
            </div>
            <div>
              <dt>Revised sale facts</dt>
              <dd>{recordedRevision.revisedSharedSales.length}</dd>
            </div>
          </dl>
          <p className="lp-math-assumptions">
            Observed estimate difference: {signed(recordedRevision.estimateChange)}. A changed calculation is not proof
            that any real home gained or lost value. Saved workspace analyses can be replayed against their archived
            input evidence.
          </p>
        </div>
      </details>

      <details className="lp-math">
        <summary>
          <SlidersHorizontal size={14} aria-hidden="true" /> Show the math
        </summary>
        <div className="lp-math-body" tabIndex={0} role="region" aria-label="Calculation detail">
          <p className="lp-math-assumptions">
            Assumptions: ${a.sqftRate}/sq ft · {money(a.bedroomValue)}/bedroom · {money(a.bathroomValue)}/bath ·{' '}
            {money(a.conditionValue)}/condition point · {a.monthlyTrend * 100}% monthly trend · {a.maxDistanceMiles} mi
            · {a.maxAgeDays} days. Weights favor nearer, newer, similar-size sales.
          </p>
          <ul className="lp-comps">
            {cma.comps.map(comp => {
              const source = candidates.find(candidate => candidate.id === comp.propertyId)!;
              return (
                <li key={comp.propertyId}>
                  <div className="lp-comp-head">
                    <span>
                      <strong>{source.address}</strong>
                      <small>
                        Sold {money(source.soldPrice!)} · {shortDate(source.soldAt!)} · {comp.distanceMiles.toFixed(2)}{' '}
                        mi · weight {(comp.weight * 100).toFixed(1)}%
                      </small>
                    </span>
                    <strong className="lp-comp-adjusted">{money(comp.adjustedPrice)}</strong>
                  </div>
                  <ul className="lp-adjustments">
                    {comp.adjustments
                      .filter(adjustment => Math.round(adjustment.amount) !== 0)
                      .map(adjustment => (
                        <li key={adjustment.factor}>
                          <span>{adjustment.factor}</span>
                          <span className={adjustment.amount < 0 ? 'neg' : 'pos'}>{signed(adjustment.amount)}</span>
                        </li>
                      ))}
                    {comp.adjustments.every(adjustment => Math.round(adjustment.amount) === 0) && (
                      <li>
                        <span>No adjustments needed</span>
                        <span>{money(0)}</span>
                      </li>
                    )}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="lp-excluded">
            <strong>Considered and excluded</strong>
            <ul>
              {cma.excluded.map(item => (
                <li key={item.propertyId}>
                  <span>{addressOf(item.propertyId)}</span>
                  <small>{item.reason}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className="lp-card-foot">
        <span>
          <Fingerprint size={13} aria-hidden="true" /> Checksum {cma.calculationHash}
        </span>
        <span>Net assumes 2.5% commission and 1% closing costs, before payoff.</span>
      </div>
    </div>
  );
}

/** The example answer is computed from the sample with the real engine, so its figures cannot drift. */
function AssistantExample() {
  const cma = useMemo(() => calculateCma(subject, candidates, defaultAssumptions, SAMPLE_AS_OF), []);
  const top = [...cma.comps].sort((a, b) => b.weight - a.weight)[0];
  const sale = candidates.find(candidate => candidate.id === top.propertyId)!;
  return (
    <>
      <div className="lp-chat-q">Why is {sale.address} carrying the most weight?</div>
      <div className="lp-chat-a">
        <span className="lp-chat-who">
          <Sparkles size={13} /> Ask Ascent · evidence mode, no model
        </span>
        <dl className="lp-anatomy">
          <div className="calc">
            <dt>Calculation</dt>
            <dd>
              It carries {(top.weight * 100).toFixed(1)}% of the {money(cma.estimate)} weighted estimate:{' '}
              {top.distanceMiles.toFixed(2)} mi away, sold {Math.round(top.ageDays)} days before the analysis,{' '}
              {sale.sqft.toLocaleString('en-US')} sq ft against the subject&apos;s{' '}
              {subject.sqft.toLocaleString('en-US')}.
            </dd>
          </div>
          <div className="fact">
            <dt>Recorded fact</dt>
            <dd>
              Sold {shortDate(sale.soldAt!)} for {money(sale.soldPrice!)} · authored fictional record
            </dd>
          </div>
          <div className="assumption">
            <dt>Assumption</dt>
            <dd>
              Weights favor nearer, newer, similar-size sales. Bathrooms adjust at{' '}
              {money(cma.assumptions.bathroomValue)} each.
            </dd>
          </div>
          <div className="unknown">
            <dt>Unknown</dt>
            <dd>Condition ratings are analyst inputs, not inspections. Concessions are not recorded.</dd>
          </div>
        </dl>
        <div className="lp-cites">
          <span>CMA snapshot · {shortDate(SAMPLE_AS_OF)}</span>
          <span>{sale.address}</span>
          <span>Weight formula</span>
        </div>
      </div>
    </>
  );
}

const journey = [
  {
    id: 'price',
    step: 'Pricing Studio',
    icon: SlidersHorizontal,
    title: 'Inspect it, challenge it, freeze it.',
    body: 'Open any sale to see its signed adjustments and weight, test which input moves the estimate most, and compare what each strategy or later move nets the seller.',
    points: [
      'Range chart and sale-by-sale inspector on the same evidence',
      'Input sensitivity and reduction-versus-credit arithmetic',
      'Frozen snapshots that replay to the same checksum later',
    ],
  },
  {
    id: 'analyze',
    step: 'Market pulse',
    icon: Activity,
    title: 'Know when the picture changes.',
    body: 'Market pulse tracks supply, absorption and days on market for your listings. Weekly check-ins record showings, second showings, offers and feedback.',
    points: [
      'Competing price cuts and withdrawals flagged with their source',
      'Check-in guidance from rules you can read, thresholds included',
      'No price changes and no client contact without you',
    ],
  },
  {
    id: 'advise',
    step: 'Clients',
    icon: Users,
    title: 'Relationships with continuity.',
    body: 'Keep every client in a pipeline by stage and role, with preferences, notes and the next follow-up in one place.',
    points: [
      'Saved searches with beds, baths, size, ZIP and status criteria',
      'Matches explained criterion by criterion, near misses included',
      'Follow-ups grouped by due, overdue and done',
    ],
  },
  {
    id: 'negotiate',
    step: 'Offer room',
    icon: Scale,
    title: 'Compare terms, not just price.',
    body: 'Line offers up by net, credits, financing, earnest money, contingencies and timing. The term-strength breakdown shows its weights, and you can change them.',
    points: [
      'Every factor scored in the open',
      'Seller and buyer perspectives on the same terms',
      'Counteroffer drafts held until you approve them',
    ],
  },
  {
    id: 'close',
    step: 'Transactions',
    icon: CalendarClock,
    title: 'From accepted to all set.',
    body: 'Track each deadline with a countdown that turns amber inside a week and red inside three days. Upload the contract and review the dates Ascent finds.',
    points: [
      'Explicit contract dates proposed for your approval',
      'Private, encrypted document vault per transaction',
      'A single view of everything due this week',
    ],
  },
] as const;

function JourneyVisual({ id }: { id: (typeof journey)[number]['id'] }) {
  if (id === 'price')
    return (
      <div className="lp-mini lp-mini-price" aria-hidden="true">
        {[
          ['Conservative', '$936k', 'Lowest adjusted sale'],
          ['Balanced', '$963k', 'Weighted estimate'],
          ['Aggressive', '$989k', 'Highest adjusted sale'],
        ].map(([label, value, note], index) => (
          <div key={label} className={index === 1 ? 'on' : ''}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
    );
  if (id === 'analyze')
    return (
      <div className="lp-mini lp-mini-analyze" aria-hidden="true">
        <div className="lp-mini-title">Weekly check-ins · showings</div>
        <div className="lp-bars">
          {[9, 7, 4, 3].map((value, index) => (
            <div key={index}>
              <i style={{ height: `${value * 10}%` }} />
              <small>Wk {index + 1}</small>
            </div>
          ))}
        </div>
        <div className="lp-mini-flag">
          <Activity size={13} /> Showings fell for two weeks while competing supply rose. Review position.
        </div>
      </div>
    );
  if (id === 'advise')
    return (
      <div className="lp-mini lp-mini-advise" aria-hidden="true">
        {[
          ['Lead', ['Taylor · buyer']],
          ['Active', ['Morgan · buyer', 'Avery · seller']],
          ['Under contract', ['Jordan · buyer']],
        ].map(([stage, people]) => (
          <div key={stage as string}>
            <span>{stage as string}</span>
            {(people as string[]).map(person => (
              <i key={person}>{person}</i>
            ))}
          </div>
        ))}
      </div>
    );
  if (id === 'negotiate')
    return (
      <div className="lp-mini lp-mini-negotiate" aria-hidden="true">
        <div className="lp-mini-title">Term strength · seller view</div>
        {[
          ['Net price', 88],
          ['Financing', 72],
          ['Contingencies', 54],
          ['Closing timing', 90],
          ['Earnest money', 66],
        ].map(([label, value]) => (
          <div key={label as string} className="lp-term">
            <span>{label as string}</span>
            <i>
              <b style={{ width: `${value}%` }} />
            </i>
            <small>{value as number}</small>
          </div>
        ))}
      </div>
    );
  return (
    <div className="lp-mini lp-mini-close" aria-hidden="true">
      {[
        ['Inspection', '2 days', 'urgent'],
        ['Appraisal', '6 days', 'soon'],
        ['Financing', '14 days', ''],
        ['Settlement', '29 days', ''],
      ].map(([label, due, tone]) => (
        <div key={label} className={tone}>
          <CalendarClock size={14} />
          <span>{label}</span>
          <strong>{due}</strong>
        </div>
      ))}
    </div>
  );
}

function Journey() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (next: number) => {
    const index = (next + journey.length) % journey.length;
    setActive(index);
    tabs.current[index]?.focus();
  };
  const current = journey[active];
  return (
    <div className="lp-journey">
      <div
        className="lp-tabs"
        role="tablist"
        aria-label="Workflow steps"
        onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(active + 1);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(active - 1);
          } else if (e.key === 'Home') {
            e.preventDefault();
            move(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            move(journey.length - 1);
          }
        }}
      >
        {journey.map((item, index) => (
          <button
            key={item.id}
            ref={element => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`lp-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls={`lp-panel-${item.id}`}
            tabIndex={index === active ? 0 : -1}
            className="lp-tab"
            onClick={() => setActive(index)}
          >
            <span className="lp-tab-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="lp-tab-label">{item.step}</span>
          </button>
        ))}
      </div>
      <div
        className="lp-panel"
        role="tabpanel"
        id={`lp-panel-${current.id}`}
        aria-labelledby={`lp-tab-${current.id}`}
        tabIndex={0}
      >
        <div className="lp-panel-copy">
          <span className="lp-panel-icon">
            <current.icon size={20} aria-hidden="true" />
          </span>
          <h3>{current.title}</h3>
          <p>{current.body}</p>
          <ul>
            {current.points.map(point => (
              <li key={point}>
                <Check size={15} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <JourneyVisual id={current.id} />
      </div>
    </div>
  );
}

const faqs = [
  {
    q: 'Do I need a license or account?',
    a: 'No. Anyone can use public pricing studios without signing in. Professional verification and source permissions still control access to restricted licensed data.',
  },
  {
    q: 'Can I use my own address?',
    a: 'Yes, for covered single-family homes in DC and in Montgomery and Prince George’s counties, Maryland. Maryland uses size, quality grade, location and sale timing only; bedroom and bathroom data are unavailable. Both markets publish their accuracy results. DC condos have a separate unvalidated studio; their ranges are uncalibrated. Virginia awaits written permission. Multi-unit buildings are excluded.',
  },
  {
    q: 'Are these live MLS listings?',
    a: 'No. Public pricing uses bounded public-record snapshots, not real-time listings. Recorded sales can lag, and current competition, concessions and interior condition may be missing.',
  },
  {
    q: 'Can Ascent predict renovation returns or future prices?',
    a: 'Not today. You can test assumptions and illustrative costs, but those scenarios are not forecasts of buyer response, renovation return or a sale price in six months.',
  },
  {
    q: 'Where does the price come from?',
    a: 'Recorded closed sales, adjusted for property differences and weighted by distance, recency and size. You can inspect every adjustment and change the assumptions. AI does not set the price.',
  },
  {
    q: 'What can I keep?',
    a: 'Open a printable pricing report or download the decision as JSON. Studio drafts stay in this browser on this device. A configured private workspace adds saved analyses, clients, offers and transaction records.',
  },
  {
    q: 'Is this an appraisal?',
    a: 'No. This is a decision aid. Public records can lag and omit interior condition, concessions and listing history. Review the evidence before using a draft with a client. No sale price or outcome is guaranteed.',
  },
  {
    q: 'What does the workspace add?',
    a: 'Keep clients, pricing snapshots, offer comparisons and deadlines together. Ask Ascent explains the records and drafts text for review. It cannot send messages, accept offers or sign contracts. New accounts start empty; the workspace demo is fictional.',
  },
];

export function Landing({ onDemo, onSignIn, onRegister, busy, error, workspaceAvailable = true }: LandingProps) {
  return (
    <div className="landing">
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link className="brand lp-brand" href="/" aria-label="Ascent home">
            <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
          </Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#homeowners">Start here</a>
            <a href="#workflow">More tools</a>
            <a href="#accuracy">Accuracy</a>
            <a href="#faq">Questions</a>
          </nav>
          <div className="lp-nav-actions">
            <button type="button" className="lp-btn lp-btn-ghost lp-nav-login" onClick={onSignIn}>
              Log in
            </button>
            <Link className="lp-btn lp-btn-primary lp-btn-sm" href="/dc">
              Analyze a DC home
            </Link>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero-bg" aria-hidden="true" />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">
                <span className="lp-pulse" aria-hidden="true" /> Real estate intelligence for everyone.
              </span>
              <h1 id="lp-hero-title">
                Real estate intelligence
                <br />
                <span>belongs to homeowners.</span>
              </h1>
              <p className="lp-lede">
                You should never have to accept a number you cannot understand. Explore comparable sales,
                inspect the calculations, test your assumptions, and keep the evidence behind your decision.
              </p>
              <div className="lp-cta-row">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/dc">
                  Explore a DC home <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className="lp-btn lp-btn-outline lp-btn-lg" href="/demo">
                  Try the sample
                </Link>
              </div>
              <p className="lp-fine">
                  Free, no license or account required for public studios. Public records are not live MLS listings.
                  Also explore <Link href="/maryland">Maryland</Link> or <Link href="/dc/condos">DC condos</Link>.
                </p>
              <ul className="lp-hero-points" aria-label="Highlights">
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> Inspect every sale
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> Adjust the assumptions
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> Keep the reasoning
                </li>
              </ul>
              <div className="lp-workspace-entry">
                <span className="lp-eyebrow">Need a place to keep the work?</span>
                <p>Optional private workspaces collect pricing, contacts, offers and deadlines. Public studios need no sign-in.</p>
                {workspaceAvailable ? (
                  <div className="lp-workspace-links">
                    <button type="button" className="lp-link" onClick={onDemo} disabled={busy}>
                      {busy ? 'Opening workspace…' : 'Explore the working demo'}{' '}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className="lp-link" onClick={onRegister}>
                      Create an account
                    </button>
                  </div>
                ) : (
                  <p className="lp-fine">Workspaces are being set up. Both pricing studios are ready to use.</p>
                )}
                <p className="lp-fine">Demo: fictional records. Your account: your own evidence.</p>
                {error && (
                  <div role="alert" className="lp-error">
                    {error} <Link href="/demo">Continue with the sample</Link>
                  </div>
                )}
              </div>
            </div>
            <div className="lp-hero-visual" id="pricing-example">
              <p className="lp-interaction-hint">
                <SlidersHorizontal size={15} aria-hidden="true" /> Move the price. Watch the reasoning change.
              </p>
              <PricingCard />
              <Link className="lp-card-open" href="/demo">
                Take this decision apart in the studio <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section id="homeowners" className="lp-section lp-homeowners" aria-labelledby="lp-homeowners-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Start with your question</span>
              <h2 id="lp-homeowners-title">Your next home decision deserves an explanation.</h2>
              <p>
                You do not need to be an agent to examine pricing evidence. Choose a covered market, or learn
                with a fictional example before exploring a real address.
              </p>
            </div>
            <div className="lp-homeowner-grid">
              {[
                {
                  question: 'What is my DC home worth?',
                  detail: 'Search eligible DC houses and rowhomes. Inspect recorded sales, adjustments and the validated settings behind the estimate.',
                  scope: 'DC houses · Public-record snapshot',
                  href: '/dc',
                  action: 'Explore DC homes',
                },
                {
                  question: 'What about my Maryland home?',
                  detail: 'Explore homes in Montgomery or Prince George’s County, with transparent limitations on property fields and accuracy.',
                  scope: 'Two MD counties · Limited property fields',
                  href: '/maryland',
                  action: 'Explore Maryland',
                },
                {
                  question: 'How does my DC condo compare?',
                  detail: 'Inspect unit-level recorded sales. Condo testing missed acceptance criteria, so this studio does not offer a calibrated range.',
                  scope: 'DC condos · Experimental estimates',
                  href: '/dc/condos',
                  action: 'Explore DC condos',
                },
                {
                  question: 'What if I change the asking price?',
                  detail: 'Practice with a clearly fictional Arlington home. Compare prices and illustrative proceeds, then inspect the math.',
                  scope: 'Fictional example · No sign-in',
                  href: '/demo',
                  action: 'Try the interactive sample',
                },
              ].map(item => (
                <Link className="lp-homeowner-card" key={item.href} href={item.href}>
                  <span className="lp-homeowner-scope">{item.scope}</span>
                  <h3>{item.question}</h3>
                  <p>{item.detail}</p>
                  <span className="lp-homeowner-action">
                    {item.action} <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
            <p className="lp-homeowner-note">
              Ascent is a decision aid, not an appraisal or live listing service. Future sale prices and renovation
              returns are not predicted. <Link href="/accuracy">Read the published accuracy results and failures.</Link>
            </p>
          </div>
        </section>

        <section className="lp-proof" aria-label="From evidence to a decision">
          <ol className="lp-wrap lp-proof-grid lp-loop">
            {[
              {
                icon: Layers3,
                title: 'See the evidence',
                body: 'Inspect the sales and adjustments behind the estimate.',
                href: '/demo#studio-evidence',
                action: 'Inspect a sale',
              },
              {
                icon: SlidersHorizontal,
                title: 'Test the decision',
                body: 'Change an assumption. See what moves the price.',
                href: '/demo#studio-assumptions',
                action: 'Test an assumption',
              },
              {
                icon: FileText,
                title: 'Tell the whole story',
                body: 'Keep the price, sources and assumptions in one report.',
                href: '/demo#studio-report',
                action: 'Build a report',
              },
            ].map((item, index) => (
              <li key={item.title} className="lp-proof-item">
                <item.icon size={20} aria-hidden="true" />
                <div>
                  <span className="lp-loop-verb">0{index + 1}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <Link className="lp-loop-link" href={item.href}>
                    {item.action} <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="workflow" className="lp-section" aria-labelledby="lp-workflow-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Optional workspace tools</span>
              <h2 id="lp-workflow-title">Keep the reasoning as your plans change.</h2>
              <p>
                Public pricing works without an account. Configured private workspaces can connect saved analyses,
                contacts, offers and deadlines. Some market features require authorized provider data.
              </p>
            </div>
            <Journey />
          </div>
        </section>

        <section id="assistant" className="lp-section lp-section-tint" aria-labelledby="lp-assistant-title">
          <div className="lp-wrap lp-split">
            <div className="lp-split-copy">
              <span className="lp-eyebrow">Ask Ascent</span>
              <h2 id="lp-assistant-title">
                Ask why.
                <br />
                Get the working.
              </h2>
              <p>
                Ask about the record on screen. See the facts, calculations, assumptions and unknowns behind the answer.
              </p>
              <p className="lp-note">
                <Lock size={14} aria-hidden="true" /> You review the draft. You make the decision.
              </p>
            </div>
            <figure className="lp-chat" aria-labelledby="lp-chat-caption">
              <figcaption id="lp-chat-caption" className="sr-only">
                Example conversation with Ask Ascent using the fictional sample
              </figcaption>
              <AssistantExample />
            </figure>
          </div>
        </section>

        <section id="accuracy" className="lp-section" aria-labelledby="lp-accuracy-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">The published test</span>
              <h2 id="lp-accuracy-title">Useful evidence. Visible limits.</h2>
              <p>DC-validated settings, tested on recorded sales held out from development.</p>
            </div>
            <div className="lp-evidence-stats">
              <div>
                <strong>{valuationBenchmark.holdout.sales.toLocaleString('en-US')}</strong>
                <span>DC sales in the test</span>
              </div>
              <div>
                <strong>{(valuationBenchmark.primary.mdape * 100).toFixed(1)}%</strong>
                <span>median pricing error</span>
              </div>
              <div>
                <strong>{(valuationBenchmark.primary.ppe10 * 100).toFixed(1)}%</strong>
                <span>within ±10% of the sale price</span>
              </div>
            </div>
            <p className="lp-fine">
              Results apply to this market, period and configuration. They do not guarantee the price of your home. Some
              acceptance thresholds were met narrowly.
            </p>
            <p className="lp-fine">
              <Link href="/maryland">Maryland is available: Montgomery and Prince George’s counties</Link>.{' '}
              {marylandVerdict()} Size, quality grade, location and sale timing only; bedrooms and bathrooms are
              unavailable. Virginia awaits permission.
            </p>
            <p className="lp-fine">
              <Link href="/dc/condos">DC condo pricing is available</Link> with a separate unit-level snapshot. Condo
              accuracy was tested separately and failed. <Link href="/accuracy">See all published experiments</Link>.
            </p>
            <details className="lp-methodology">
              <summary>Maryland accuracy: results and missed criteria</summary>
              <AccuracyScorecard benchmark={marylandBenchmark} />
            </details>
            <details className="lp-methodology">
              <summary>Read the full accuracy report and limitations</summary>
              <AccuracyScorecard />
            </details>
          </div>
        </section>

        <section id="faq" className="lp-section lp-section-tint" aria-labelledby="lp-faq-title">
          <div className="lp-wrap lp-faq-grid">
            <div className="lp-section-head lp-faq-head">
              <span className="lp-eyebrow">Before you start</span>
              <h2 id="lp-faq-title">Straight answers.</h2>
              <p>What you can do, where the data comes from, and what stays yours.</p>
            </div>
            <div className="lp-faq">
              {faqs.map(item => (
                <details key={item.q}>
                  <summary>
                    <span>{item.q}</span>
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="lp-final-title">
          <div className="lp-wrap">
            <div className="lp-final-inner">
              <div>
                <h2 id="lp-final-title">Never accept a number you cannot understand.</h2>
                <p>Start with comparable evidence. Keep a report you can question, share and explain.</p>
              </div>
              <div className="lp-cta-row">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/dc">
                  Explore a DC home <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <Link className="lp-btn lp-btn-outline lp-btn-lg" href="/demo">
                  Try the sample
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Link className="brand lp-brand" href="/" aria-label="Ascent home">
            <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
          </Link>
          <p>Free, open-source real estate intelligence for homeowners.</p>
          <p>Decision aid, not an appraisal. Sample data is fictional.</p>
        </div>
      </footer>
    </div>
  );
}
