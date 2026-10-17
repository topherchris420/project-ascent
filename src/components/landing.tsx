'use client';
import '@/app/landing.css';
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
  Layers3,
  LoaderCircle,
  Lock,
  Minus,
  Scale,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react';
import { calculateCma, defaultAssumptions, simulatePricing } from '@/lib/analytics';
import type { ValuationProperty } from '@/lib/types';

export type LandingProps = {
  onDemo: () => void;
  onSignIn: () => void;
  onRegister: () => void;
  busy: boolean;
  error?: string;
  workspaceAvailable?: boolean;
};

// Invented records for the hero sample. They run through the same engine as the workspace.
const SAMPLE_AS_OF = '2026-10-15T12:00:00.000Z';
const SOURCE = 'source-synthetic-landing';
const place = { city: 'Arlington', state: 'VA', zip: '22205', sourceId: SOURCE };
const subject: ValuationProperty = {
  ...place,
  id: 'landing-subject',
  address: '1200 Example Linden Court',
  lat: 38.8816,
  lng: -77.1145,
  beds: 4,
  baths: 3,
  sqft: 2180,
  condition: 4,
  status: 'active',
};
const sold = (
  id: string,
  address: string,
  lat: number,
  lng: number,
  beds: number,
  baths: number,
  sqft: number,
  condition: number,
  soldAt: string,
  soldPrice: number,
): ValuationProperty => ({
  ...place,
  id,
  address,
  lat,
  lng,
  beds,
  baths,
  sqft,
  condition,
  status: 'sold',
  soldAt: `${soldAt}T12:00:00.000Z`,
  soldPrice,
});
const candidates: ValuationProperty[] = [
  sold('landing-c1', '1186 Example Linden Court', 38.8829, -77.1131, 4, 3, 2120, 4, '2026-09-02', 952000),
  sold('landing-c2', '1231 Example Linden Court', 38.8801, -77.1162, 4, 2.5, 2240, 3, '2026-08-14', 938000),
  sold('landing-c3', '905 Example Aspen Street', 38.8862, -77.1098, 3, 3, 2010, 4, '2026-07-21', 905000),
  sold('landing-c4', '1414 Example Cedar Lane', 38.8774, -77.1201, 4, 3, 2310, 5, '2026-09-26', 1018000),
  sold('landing-c5', '702 Example Birch Way', 38.8893, -77.1187, 5, 3, 2400, 3, '2026-06-30', 969000),
  sold('landing-c6', '1320 Example Maple Row', 38.8838, -77.1076, 4, 3.5, 2195, 4, '2026-10-03', 981000),
  sold('landing-c7', '1098 Example Walnut Place', 38.8808, -77.1119, 4, 3, 2150, 4, '2026-03-11', 890000),
  {
    ...place,
    id: 'landing-a1',
    address: '1250 Example Linden Court',
    lat: 38.8812,
    lng: -77.1151,
    beds: 4,
    baths: 3,
    sqft: 2205,
    condition: 4,
    status: 'active',
    price: 989000,
  },
];
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
    return `Below all ${total} adjusted sales, ${money(low - price)} under the lowest. That leaves value the evidence supports unclaimed, unless speed matters most.`;
  if (price > high)
    return `Above every adjusted sale by ${money(price - high)}. The evidence does not support this yet, so name the reason before you list here.`;
  if (Math.abs(price - estimate) <= estimate * 0.005)
    return `At the weighted estimate. ${supporting} of ${total} adjusted sales sit at or above this price.`;
  if (price < estimate)
    return `Inside the evidence and under the weighted estimate: ${supporting} of ${total} adjusted sales support this price or higher, leaving room to negotiate.`;
  return `Above the estimate but inside the range. Only ${supporting} of ${total} adjusted sales support it, so be ready to defend the premium.`;
}

function PricingCard() {
  const cma = useMemo(() => calculateCma(subject, candidates, defaultAssumptions, SAMPLE_AS_OF), []);
  const positions = useMemo(
    () =>
      [
        // Round to whole-thousand list prices without leaving the adjusted-comp range.
        { key: 'conservative', label: 'Conservative', price: Math.ceil(cma.strategies.conservative / 1000) * 1000 },
        { key: 'moderate', label: 'Moderate', price: roundTo(cma.strategies.moderate, 1000) },
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

const journey = [
  {
    id: 'price',
    step: 'Price',
    icon: SlidersHorizontal,
    title: 'Three list positions, one evidence trail.',
    body: 'Select comparables, inspect every signed adjustment and set the assumptions yourself. Ascent gives you conservative, moderate and aggressive positions with the tradeoff for each.',
    points: [
      'Adjusted comps with distance, recency and size weighting',
      'Seller net sheet with commission, closing costs and payoff',
      'Frozen snapshots with a checksum you can reproduce later',
    ],
  },
  {
    id: 'analyze',
    step: 'Analyze',
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
    step: 'Advise',
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
    step: 'Negotiate',
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
    step: 'Close',
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
          ['Conservative', '$936k', 'Fast, inside the evidence'],
          ['Moderate', '$963k', 'Balanced, at the estimate'],
          ['Aggressive', '$989k', 'Top of the range'],
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
    row: 'Try the full workflow first',
    ascent: 'Instant private demo workspace',
    typical: 'Waitlist, application or sales call',
    typicalHas: false,
  },
  {
    row: 'See every adjustment',
    ascent: 'Signed amounts with the formula behind each',
    typical: 'One adjusted figure per comp',
    typicalHas: 'partial',
  },
  {
    row: 'Reproduce a saved analysis',
    ascent: 'Frozen inputs plus a checksum',
    typical: 'Regenerated from current data',
    typicalHas: false,
  },
  {
    row: 'Change the assumptions',
    ascent: 'Every rate, radius and time window',
    typical: 'Fixed model settings',
    typicalHas: false,
  },
  {
    row: 'Keep AI out of the math',
    ascent: 'Deterministic engine; AI explains and drafts',
    typical: 'Model output blended into values',
    typicalHas: 'partial',
  },
  {
    row: 'Understand an offer score',
    ascent: 'Factor weights shown and adjustable',
    typical: 'A single opaque number',
    typicalHas: false,
  },
  {
    row: 'Take your data with you',
    ascent: 'CSV and JSON export, previewed imports with rollback',
    typical: 'Limited or on request',
    typicalHas: 'partial',
  },
];

const faqs = [
  {
    q: 'Is this a working product or a mockup?',
    a: 'It works. The demo creates your own private, persistent workspace. Calculations, saved snapshots, client records, offers, drafts and approvals all run and are stored.',
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
  const startDemo = () => {
    if (workspaceAvailable) onDemo();
    else document.getElementById('pricing-example')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const demoLabel = (
    <>
      {busy ? (
        <LoaderCircle className="spin" size={18} aria-hidden="true" />
      ) : (
        <Sparkles size={18} aria-hidden="true" />
      )}
      <span>{workspaceAvailable ? 'Explore the working demo' : 'Try the interactive pricing demo'}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </>
  );
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
            <a href="#trust">Trust</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-actions">
            <button type="button" className="lp-btn lp-btn-ghost lp-nav-login" onClick={onSignIn}>
              Log in
            </button>
            <button type="button" className="lp-btn lp-btn-primary lp-btn-sm" onClick={startDemo} disabled={busy}>
              {workspaceAvailable ? 'Try the demo' : 'Try pricing'}
            </button>
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
                Ascent turns closed sales into three list positions you can defend line by line, then carries that
                evidence through clients, offers and closing.
              </p>
              <p className="lp-lede lp-lede-strong">No application. No waitlist. Try the pricing example below.</p>
              {!workspaceAvailable && (
                <div role="status" className="lp-setup">
                  <strong>Workspace setup is in progress.</strong>
                  <p>
                    Hosted account services are not ready. You can explore the interactive pricing example while the
                    full workspace is configured.
                  </p>
                  <a href="#pricing-example">Try the pricing example</a>
                </div>
              )}
              {error && (
                <div role="alert" className="lp-error">
                  {error}
                </div>
              )}
              <div className="lp-cta-row">
                <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={startDemo} disabled={busy}>
                  {demoLabel}
                </button>
                <button type="button" className="lp-btn lp-btn-outline lp-btn-lg" onClick={onSignIn}>
                  Sign in
                </button>
              </div>
              <p className="lp-fine">
                {workspaceAvailable
                  ? 'The demo opens a private workspace with fictional properties and clients. '
                  : 'The interactive example uses fictional properties. A full account requires workspace setup. '}
                <button type="button" className="lp-link" onClick={onRegister}>
                  Create an account
                </button>{' '}
                to start your own.
              </p>
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
            What Ascent guarantees
          </h2>
          <div className="lp-wrap lp-proof-grid">
            {[
              {
                icon: Layers3,
                title: 'Math you can audit',
                body: 'The same inputs always give the same price. No hidden model.',
              },
              {
                icon: Fingerprint,
                title: 'Snapshots that stay put',
                body: 'Saved CMAs freeze their inputs, so reports survive later data changes.',
              },
              {
                icon: FileText,
                title: 'Sources on every figure',
                body: 'Each record carries its source, date and usage rights.',
              },
              {
                icon: ShieldCheck,
                title: 'Nothing sent without you',
                body: 'Drafts wait for approval. Ascent never contacts clients.',
              },
            ].map(item => (
              <div key={item.title} className="lp-proof-item">
                <item.icon size={20} aria-hidden="true" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="lp-section" aria-labelledby="lp-workflow-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">One workspace, start to finish</span>
              <h2 id="lp-workflow-title">From the first comp to the final signature.</h2>
              <p>Each step builds on the evidence from the last. Nothing is retyped and nothing loses its source.</p>
            </div>
            <Journey />
          </div>
        </section>

        <section id="assistant" className="lp-section lp-section-tint" aria-labelledby="lp-assistant-title">
          <div className="lp-wrap lp-split">
            <div className="lp-split-copy">
              <span className="lp-eyebrow">Ask Ascent</span>
              <h2 id="lp-assistant-title">An assistant that cites its work and waits for you.</h2>
              <p>
                Ask about the property, client or deal on screen. Answers come from your workspace evidence, with
                citations to the exact records behind them.
              </p>
              <ul className="lp-checks">
                <li>
                  <Check size={16} aria-hidden="true" /> Summarizes a CMA for a seller meeting
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Drafts client emails and texts with placeholders
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Lists what is due this week
                </li>
                <li>
                  <Check size={16} aria-hidden="true" /> Works without any model, and redacts known client details when
                  one is used
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
              <div className="lp-chat-q">Summarize the Linden Court CMA for tomorrow&apos;s seller meeting.</div>
              <div className="lp-chat-a">
                <span className="lp-chat-who">
                  <Sparkles size={13} /> Ask Ascent · from workspace evidence
                </span>
                <p>
                  The moderate position of <b>$963,000</b> sits at the weighted estimate. Two of six adjusted sales are
                  at or above it, and the conservative $936,000 matches the lowest adjusted sale.
                </p>
                <div className="lp-cites">
                  <span>CMA snapshot · Oct 15</span>
                  <span>1186 Example Linden Ct · sold Sep 2</span>
                  <span>Adjustment model</span>
                </div>
              </div>
              <div className="lp-draft">
                <div className="lp-draft-head">
                  <span>
                    <Send size={13} /> Draft text
                  </span>
                  <em>Not sent · needs your review</em>
                </div>
                <p>
                  Hi <mark>{'{client_first_name}'}</mark>, the pricing review for <mark>{'{property_address}'}</mark> is
                  ready. Can we walk through the three list positions tomorrow at <mark>{'{meeting_time}'}</mark>?
                </p>
              </div>
            </figure>
          </div>
        </section>

        <section id="compare" className="lp-section" aria-labelledby="lp-compare-title">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">The difference</span>
              <h2 id="lp-compare-title">Why Ascent over a typical CMA tool.</h2>
              <p>Built around the questions a seller, a buyer or a broker will actually ask you.</p>
            </div>
            <div
              className="lp-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Ascent compared with typical CMA tools"
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
                    <th scope="col">Typical CMA tools</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map(item => (
                    <tr key={item.row}>
                      <th scope="row">{item.row}</th>
                      <td className="lp-col-ascent" data-label="Ascent">
                        <span className="lp-yes">
                          <Check size={14} aria-hidden="true" />
                          <span className="sr-only">Yes: </span>
                        </span>
                        {item.ascent}
                      </td>
                      <td data-label="Typical CMA tools">
                        <span className={item.typicalHas === 'partial' ? 'lp-partial' : 'lp-no'}>
                          <Minus size={14} aria-hidden="true" />
                          <span className="sr-only">
                            {item.typicalHas === 'partial' ? 'Sometimes: ' : 'Usually not: '}
                          </span>
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
                    : 'Explore the transparent pricing example while account setup is completed.'}
                </p>
              </div>
              <div className="lp-final-actions">
                <button type="button" className="lp-btn lp-btn-light lp-btn-lg" onClick={startDemo} disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={18} aria-hidden="true" />
                  ) : (
                    <Handshake size={18} aria-hidden="true" />
                  )}
                  {workspaceAvailable ? 'Open a demo workspace' : 'Try the pricing example'}
                </button>
                <button type="button" className="lp-btn lp-btn-onDark lp-btn-lg" onClick={onRegister}>
                  Create an account <ArrowUpRight size={16} aria-hidden="true" />
                </button>
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
