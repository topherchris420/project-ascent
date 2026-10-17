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
  Database,
  EyeOff,
  FileText,
  Fingerprint,
  Handshake,
  History,
  Layers3,
  LoaderCircle,
  Lock,
  Minus,
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

const comparison: { row: string; ascent: string; typical: string; typicalHas: boolean | 'partial' }[] = [
  {
    row: 'Why this price?',
    ascent: 'Inspect sold values, signed adjustments and weights',
    typical: 'Adjustment rates are analyst assumptions, not fitted coefficients',
    typicalHas: 'partial',
  },
  {
    row: 'What could change it?',
    ascent: 'Exclude sales and test assumptions against frozen evidence',
    typical: 'Alternative calculations do not forecast market outcomes',
    typicalHas: 'partial',
  },
  {
    row: 'How accurate is it?',
    ascent: 'Pre-registered holdout on DC recorded sales, misses published',
    typical: 'Measured for DC single-family homes on the DC-calibrated settings only',
    typicalHas: 'partial',
  },
  {
    row: 'Can a weak price slip through?',
    ascent: 'Named release checks before approval, plus an operator pause switch',
    typical: 'Checks flag what needs review; they do not certify a price',
    typicalHas: 'partial',
  },
  {
    row: 'What changed since last time?',
    ascent: 'Replay snapshots and reconcile comparable contributions',
    typical: 'A changed estimate does not prove a market move',
    typicalHas: 'partial',
  },
  {
    row: 'Can I explain it to my seller?',
    ascent: 'Open a report with selected price, costs and source references',
    typical: 'Drafts require professional review; examples are fictional',
    typicalHas: 'partial',
  },
  {
    row: 'Can I keep the reasoning?',
    ascent: 'Export a decision with frozen inputs and a replay checksum',
    typical: 'Export of real evidence requires current source rights',
    typicalHas: 'partial',
  },
];

const faqs = [
  {
    q: 'Is this a working product or a mockup?',
    a: 'It works. The account-free Pricing Studio calculates, inspects and exports a fictional pricing decision. Where hosted account services are configured, the separate workspace demo adds persistent clients, offers and transaction workflows.',
  },
  {
    q: 'Where does the data come from?',
    a: 'The demo uses fictional records for the Washington, DC area and Austin, labeled as fictional throughout. When an operator configures a licensed provider, research results arrive with their source, date and usage rights. No MLS feed is bundled.',
  },
  {
    q: 'How is the price calculated?',
    a: 'Closed sales are adjusted for living area, bedrooms, bathrooms, condition and time, then weighted by distance, recency and size similarity. The range is the spread of adjusted sales, and every rate and filter can be edited.',
  },
  {
    q: 'How accurate is it?',
    a: `We measured it on the District's own records. On ${valuationBenchmark.holdout.sales.toLocaleString('en-US')} recorded ${valuationBenchmark.market.label} home sales the engine never saw, the median error was ${(valuationBenchmark.primary.mdape * 100).toFixed(1)}%, ${(valuationBenchmark.primary.ppe10 * 100).toFixed(1)}% landed within ±10%, and the calibrated ${valuationBenchmark.intervals.target * 100}% range held ${(valuationBenchmark.intervals.calibratedCoverage * 100).toFixed(1)}% of sales. It met ${valuationBenchmark.acceptance.filter(item => item.passed).length} of ${valuationBenchmark.acceptance.length} pre-registered criteria, some narrowly, as the scorecard notes. These figures use the DC-calibrated settings, which could value ${(valuationBenchmark.primary.valuedShare * 100).toFixed(1)}% of those sales; with Ascent's general default settings the median error was ${(valuationBenchmark.shipped.mdape * 100).toFixed(1)}%. Maryland and Virginia are not yet validated. Anyone can re-run the test.`,
  },
  {
    q: 'Does the AI set prices?',
    a: 'No. Pricing math is deterministic. The assistant explains results with citations and drafts messages for your review. It cannot change records, send messages or approve anything.',
  },
  {
    q: 'Is this an appraisal?',
    a: 'No. Ascent is a pricing and decision aid for real estate professionals. Your professional review comes before anything reaches a client.',
  },
  {
    q: 'Can my team use it?',
    a: 'Yes. Workspaces support owner, agent and viewer roles, one-time team invitations and shared history. Allowances per plan are configurable.',
  },
  {
    q: 'Can I take my data with me?',
    a: 'Yes. Export standard records as CSV or JSON. Imports are previewed, conflicts are shown before you confirm, and unchanged imports can be rolled back.',
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
          <a className="brand lp-brand" href="/" aria-label="Ascent home">
            <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
          </a>
          <nav className="lp-links" aria-label="Sections">
            <a href="#workflow">Workflow</a>
            <a href="#assistant">Ask Ascent</a>
            <a href="#compare">Compare</a>
            <a href="#accuracy">Accuracy</a>
            <a href="#trust">Trust</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <button type="button" className="lp-btn lp-btn-ghost lp-nav-login" onClick={onSignIn}>
              Log in
            </button>
            <Link className="lp-btn lp-btn-primary lp-btn-sm" href="/demo">
              Analyze a property
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
                <span className="lp-pulse" aria-hidden="true" /> Real estate decision workspace
              </span>
              <h1 id="lp-hero-title">
                Price with proof.
                <br />
                <span>Close with confidence.</span>
              </h1>
              <p className="lp-lede">
                Ascent shows exactly which sales support a price, lets you challenge every assumption, and keeps a
                decision record you can reproduce months later, through clients, offers and closing.
              </p>
              <p className="lp-lede lp-lede-strong">
                Inspect a sale. Test a decision. Open your report. No account needed.
              </p>
              {error && (
                <div role="alert" className="lp-error">
                  {error}
                </div>
              )}
              <div className="lp-cta-row">
                <Link className="lp-btn lp-btn-primary lp-btn-lg" href="/demo">
                  Analyze a property <ArrowRight size={17} aria-hidden="true" />
                </Link>
                {workspaceAvailable && (
                  <button type="button" className="lp-btn lp-btn-outline lp-btn-lg" onClick={onDemo} disabled={busy}>
                    {busy ? 'Opening workspace…' : 'Explore the working demo'}
                  </button>
                )}
              </div>
              <p className="lp-fine">
                {workspaceAvailable ? (
                  <>
                    The demo opens a private workspace with fictional properties and clients.{' '}
                    <button type="button" className="lp-link" onClick={onRegister}>
                      Create an account
                    </button>{' '}
                    to start your own.
                  </>
                ) : (
                  'The Pricing Studio uses fictional properties and saves practice changes on this device.'
                )}
              </p>
              {!workspaceAvailable && (
                <div role="status" className="lp-setup">
                  <strong>Workspace setup is in progress.</strong>
                  <p>
                    Hosted account services are not ready. The account-free Pricing Studio and its reports are available
                    now.
                  </p>
                  <Link href="/demo">Open the account-free Pricing Studio</Link>
                </div>
              )}
              <ul className="lp-hero-points" aria-label="Highlights">
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> Deterministic math
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> Every number sourced
                </li>
                <li>
                  <CheckCircle2 size={16} aria-hidden="true" /> You approve what goes out
                </li>
              </ul>
            </div>
            <div className="lp-hero-visual" id="pricing-example">
              <PricingCard />
            </div>
          </div>
        </section>

        <section className="lp-proof" aria-labelledby="lp-proof-title">
          <h2 id="lp-proof-title" className="sr-only">
            Every pricing decision in Ascent can be explained, challenged, reproduced and improved
          </h2>
          <ol className="lp-wrap lp-proof-grid lp-loop">
            {[
              {
                icon: Layers3,
                verb: 'Explain',
                title: 'Every sale in the open',
                body: 'Sold price, signed adjustments and weight for each comparable. Deterministic math, no hidden model.',
                href: '/demo#studio-evidence',
              },
              {
                icon: SlidersHorizontal,
                verb: 'Challenge',
                title: 'See what moves the price',
                body: 'Test each assumption, exclude a sale with a reason or add one you know about.',
                href: '/demo#studio-assumptions',
              },
              {
                icon: Fingerprint,
                verb: 'Reproduce',
                title: 'Decisions that replay',
                body: 'Saved analyses freeze their inputs and recompute to the same checksum later.',
              },
              {
                icon: History,
                verb: 'Improve',
                title: 'Compare then and now',
                body: 'Set a frozen decision beside today’s evidence and see which sales and inputs changed it.',
              },
            ].map((item, index) => (
              <li key={item.verb} className="lp-proof-item">
                <item.icon size={20} aria-hidden="true" />
                <div>
                  <span className="lp-loop-verb">
                    {String(index + 1).padStart(2, '0')} · {item.verb}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  {item.href && (
                    <Link className="lp-loop-link" href={item.href}>
                      Try it on the sample <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="workflow" className="lp-section" aria-labelledby="lp-workflow-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">The connected workspace</span>
              <h2 id="lp-workflow-title">The reasoning travels with the deal.</h2>
              <p>
                A frozen pricing decision carries into clients, offers and deadlines with its sources attached. Nothing
                is retyped, and nothing loses where it came from.
              </p>
            </div>
            <Journey />
          </div>
        </section>

        <section id="assistant" className="lp-section lp-section-tint" aria-labelledby="lp-assistant-title">
          <div className="lp-wrap lp-split">
            <div className="lp-split-copy">
              <span className="lp-eyebrow">Ask Ascent</span>
              <h2 id="lp-assistant-title">Answers that say how they know.</h2>
              <p>
                Ask about the property, client or deal on screen. Every answer separates what the records say, what
                Ascent calculated, which assumptions were chosen, what a model interpreted and what is still unknown.
              </p>
              <ul className="lp-checks">
                <li>
                  <Check size={16} aria-hidden="true" /> Recorded facts, each linked to its source
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Calculations restated exactly, never estimated by a model
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Unknowns named instead of guessed
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Works without any model; optional model use is capped and
                  redacts known client details
                </li>
              </ul>
              <p className="lp-note">
                <Lock size={14} aria-hidden="true" /> It cannot send messages, change records or approve anything.
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

        <section id="compare" className="lp-section" aria-labelledby="lp-compare-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">The difference</span>
              <h2 id="lp-compare-title">The questions your next decision deserves.</h2>
              <p>Built around the questions a seller, a buyer or a broker will actually ask you.</p>
            </div>
            <div
              className="lp-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Questions, working tools and evidence boundaries"
            >
              <table className="lp-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Capability</span>
                    </th>
                    <th scope="col" className="lp-col-ascent">
                      Ascent
                    </th>
                    <th scope="col">Evidence boundary</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map(item => (
                    <tr key={item.row}>
                      <th scope="row">{item.row}</th>
                      <td className="lp-col-ascent" data-label="In Ascent">
                        <span className="lp-yes">
                          <Check size={14} aria-hidden="true" />
                          <span className="sr-only">Yes: </span>
                        </span>
                        {item.ascent}
                      </td>
                      <td data-label="Evidence boundary">
                        <span className={item.typicalHas === 'partial' ? 'lp-partial' : 'lp-no'}>
                          <Minus size={14} aria-hidden="true" />
                          <span className="sr-only">Evidence boundary:</span>
                        </span>
                        {item.typical}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="accuracy" className="lp-section lp-section-tint" aria-labelledby="lp-accuracy-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Measured, not claimed</span>
              <h2 id="lp-accuracy-title">Tested on DC sales it never saw. Published either way.</h2>
              <p>
                Ascent&apos;s engine was scored once on the District of Columbia&apos;s own recorded sales, against
                thresholds fixed in advance, and anyone can re-run the test.
              </p>
            </div>
            <AccuracyScorecard />
          </div>
        </section>

        <section id="trust" className="lp-section lp-section-dark" aria-labelledby="lp-trust-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Data and trust</span>
              <h2 id="lp-trust-title">Clear about what is real, careful with what is private.</h2>
            </div>
            <div className="lp-trust-grid">
              {[
                {
                  icon: Database,
                  title: 'Fictional by default',
                  body: 'The demo runs on invented properties and people, labeled as fictional on every screen.',
                },
                {
                  icon: FileText,
                  title: 'Licensed research when configured',
                  body: 'Provider data enters only with a configured key, request caps and source labels.',
                },
                {
                  icon: Lock,
                  title: 'Private by workspace',
                  body: 'Each workspace has its own data, roles and a hash-linked audit trail.',
                },
                {
                  icon: EyeOff,
                  title: 'Models see less',
                  body: 'Known client names and contact details are redacted before any optional model call.',
                },
              ].map(item => (
                <div key={item.title} className="lp-trust-item">
                  <item.icon size={20} aria-hidden="true" />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
          <div className="lp-wrap lp-faq-grid">
            <div className="lp-section-head lp-faq-head">
              <span className="lp-eyebrow">Questions</span>
              <h2 id="lp-faq-title">Straight answers.</h2>
              <p>Still curious? The demo answers most questions faster than we can.</p>
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
                <h2 id="lp-final-title">See your next listing the way Ascent does.</h2>
                <p>
                  {workspaceAvailable
                    ? 'Open a private workspace in seconds. Price a property, add a client, compare offers.'
                    : 'Inspect the evidence, test a pricing decision and open a report without an account.'}
                </p>
              </div>
              <div className="lp-final-actions">
                <Link className="lp-btn lp-btn-light lp-btn-lg" href="/demo">
                  Analyze a property <ArrowRight size={17} aria-hidden="true" />
                </Link>
                {workspaceAvailable && (
                  <button type="button" className="lp-btn lp-btn-onDark lp-btn-lg" onClick={onRegister}>
                    Create an account <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span className="brand lp-brand lp-brand-sm">
            <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
          </span>
          <p>Ascent · Independent real estate decision workspace</p>
          <p className="lp-footer-fine">
            <ShieldCheck size={13} aria-hidden="true" /> Demo data is fictional. Ascent is a decision aid, not an
            appraisal.
          </p>
        </div>
      </footer>
    </div>
  );
}
