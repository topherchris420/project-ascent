'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  FileSignature,
  Gauge,
  Home,
  MessageSquare,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { buildAgenda, countdownLabel, daysUntil, urgencyOf, type AgendaItem } from '@/lib/agenda';
import { reviewListing, monthlyPayment, type ListingReview } from '@/lib/listing-review';
import {
  defaultStrengthWeights,
  rankOffers,
  strengthFactorKeys,
  strengthFactorLabels,
  type StrengthWeights,
} from '@/lib/offer-strength';
import { explainPricing, positionLabel, type PricingPosition } from '@/lib/pricing-narrative';
import { composeListingDescription, type DescriptionTone } from '@/lib/listing-description';
import { inspectFairHousing } from '@/lib/fair-housing';
import {
  clientRoles,
  clientStages,
  type Client,
  type CmaResult,
  type Offer,
  type Property,
  type Workspace,
} from '@/lib/types';
import { compact, date, initials, money, shortDate } from './format';

export function Countdown({ dueAt, now }: { dueAt: string; now: string }) {
  const days = daysUntil(dueAt, now);
  return <span className={`countdown ${urgencyOf(days)}`}>{countdownLabel(days)}</span>;
}

const agendaIcons = {
  milestone: FileSignature,
  'follow-up': Users,
  'offer-expiry': Gauge,
  'check-in': ClipboardList,
} as const;

export function WeekAgenda({
  workspace,
  now,
  onOpen,
}: {
  workspace: Workspace;
  now: string;
  onOpen: (item: AgendaItem) => void;
}) {
  const items = useMemo(() => buildAgenda(workspace, now), [workspace, now]);
  const overdue = items.filter(item => item.urgency === 'overdue').length;
  return (
    <section className="panel agenda-panel" aria-labelledby="agenda-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">THE NEXT SEVEN DAYS</span>
          <h2 id="agenda-title">This week</h2>
        </div>
        <span className={`badge ${overdue ? 'peach' : 'green'}`}>
          {overdue ? `${overdue} overdue` : `${items.length} due`}
        </span>
      </div>
      {items.length ? (
        <ul className="agenda-list">
          {items.slice(0, 6).map(item => {
            const Icon = agendaIcons[item.kind];
            return (
              <li key={item.id}>
                <button className="agenda-item" onClick={() => onOpen(item)}>
                  <span className={`agenda-icon ${item.urgency}`}>
                    <Icon size={16} />
                  </span>
                  <span className="agenda-text">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <Countdown dueAt={item.dueAt} now={now} />
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="agenda-empty">
          <CheckCircle2 size={22} />
          <p>Nothing due in the next seven days.</p>
        </div>
      )}
      {items.length > 6 && <p className="agenda-more">+{items.length - 6} more on the calendar</p>}
    </section>
  );
}

export function PricingIntelligence({
  cma,
  listPrice,
  properties,
  onSelect,
}: {
  cma: CmaResult;
  listPrice: number;
  properties: Property[];
  onSelect: (price: number) => void;
}) {
  const narrative = explainPricing(cma, listPrice, properties, id => properties.find(item => item.id === id));
  return (
    <section className={`panel pricing-intelligence tone-${narrative.tone}`} aria-labelledby="pricing-intelligence">
      <div className="pricing-intelligence-main">
        <span className="eyebrow">
          <Sparkles size={13} /> PRICING INTELLIGENCE
        </span>
        <h2 id="pricing-intelligence">{narrative.headline}</h2>
        <ul>
          {narrative.points.map(point => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="fine">Narrated from the calculation on this page. No model writes these sentences.</p>
      </div>
      <div className="position-list" role="group" aria-label="Pricing positions">
        {(Object.keys(narrative.tradeoffs) as PricingPosition[]).map(key => (
          <button
            key={key}
            className={narrative.position === key ? 'selected' : ''}
            aria-pressed={narrative.position === key}
            onClick={() => onSelect(cma.strategies[key])}
          >
            <span>{positionLabel[key]}</span>
            <small>{narrative.tradeoffs[key]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function OfferStrengthBoard({ offers, estimate, now }: { offers: Offer[]; estimate?: number; now: string }) {
  const [weights, setWeights] = useState<StrengthWeights>({ ...defaultStrengthWeights });
  const [targetDays, setTargetDays] = useState('');
  const ranked = useMemo(
    () =>
      rankOffers(offers, {
        estimate,
        weights,
        asOf: now,
        targetCloseDays: Number(targetDays) > 0 ? Number(targetDays) : undefined,
      }),
    [offers, estimate, weights, now, targetDays],
  );
  if (!offers.length) return null;
  const changed = strengthFactorKeys.some(key => weights[key] !== defaultStrengthWeights[key]) || targetDays;
  return (
    <section className="panel strength-board" aria-labelledby="strength-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TERM STRENGTH, SHOWN WORKING</span>
          <h2 id="strength-title">How these offers compare</h2>
          <p>Every score is the weighted average of the factors below. Re-weight them to your client's priorities.</p>
        </div>
        {changed && (
          <button
            className="text-button"
            onClick={() => {
              setWeights({ ...defaultStrengthWeights });
              setTargetDays('');
            }}
          >
            <RotateCcw size={13} /> Reset priorities
          </button>
        )}
      </div>
      <div className="strength-layout">
        <fieldset className="strength-weights">
          <legend>Client priorities</legend>
          {strengthFactorKeys.map(key => (
            <label key={key}>
              <span>
                {strengthFactorLabels[key]}
                <output>{weights[key]}</output>
              </span>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={weights[key]}
                aria-label={`${strengthFactorLabels[key]} weight`}
                onChange={e => setWeights(current => ({ ...current, [key]: Number(e.target.value) }))}
              />
            </label>
          ))}
          <label className="strength-target">
            Seller's target days to close
            <input
              type="number"
              min="1"
              max="365"
              placeholder="Optional"
              value={targetDays}
              onChange={e => setTargetDays(e.target.value)}
            />
          </label>
        </fieldset>
        <ol className="strength-list">
          {ranked.map((strength, index) => {
            const offer = offers.find(item => item.id === strength.offerId)!;
            return (
              <li key={strength.offerId} className="strength-row">
                <div className="strength-head">
                  <span className="strength-rank">{index + 1}</span>
                  <div>
                    <strong>{offer.buyer}</strong>
                    <small>
                      {money(offer.price)} · {offer.financing} · closes {shortDate(offer.closeDate)}
                    </small>
                  </div>
                  <div className={`strength-score band-${strength.band.toLowerCase()}`}>
                    <strong>{strength.score}</strong>
                    <span>{strength.band}</span>
                  </div>
                </div>
                <div className="factor-bars">
                  {strength.factors.map(factor => (
                    <div key={factor.key} className="factor-bar" title={factor.rationale}>
                      <span>{factor.label}</span>
                      <div aria-hidden="true">
                        <i style={{ width: `${factor.score}%` }} />
                      </div>
                      <b>{factor.score}</b>
                    </div>
                  ))}
                </div>
                <details>
                  <summary>Show the math</summary>
                  <table className="math-table">
                    <thead>
                      <tr>
                        <th scope="col">Factor</th>
                        <th scope="col">Why</th>
                        <th scope="col">Score × weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strength.factors.map(factor => (
                        <tr key={factor.key}>
                          <th scope="row">{factor.label}</th>
                          <td>
                            {factor.rationale}
                            <code>{factor.formula}</code>
                          </td>
                          <td>
                            {factor.score} × {factor.weight}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {strength.notes.map(note => (
                    <p key={note} className="fine">
                      {note}
                    </p>
                  ))}
                </details>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="method-note">
        A ranking of entered terms, not a probability of closing. Verify proof of funds, lender approval and the signed
        contract before advising.
      </p>
    </section>
  );
}

const signalIcon = { positive: CheckCircle2, neutral: TrendingUp, review: AlertTriangle } as const;

export function ListingReviewPanel({
  workspace,
  listings,
  selectedId,
  rate,
  now,
  readonly,
  busy,
  rangeFor,
  onSelect,
  onRecord,
}: {
  workspace: Workspace;
  listings: Property[];
  selectedId?: string;
  rate: number;
  now: string;
  readonly: boolean;
  busy: boolean;
  rangeFor: (property: Property) => { low: number; moderate: number; high: number } | undefined;
  onSelect: (id: string) => void;
  onRecord: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const checkIns = workspace.listingCheckIns ?? [];
  const reviews = useMemo(
    () =>
      new Map<string, ListingReview>(
        listings.map(listing => [
          listing.id,
          reviewListing(listing, checkIns, { asOf: now, competingActive: listings, range: rangeFor(listing), rate }),
        ]),
      ),
    [listings, checkIns, now, rate, rangeFor],
  );
  const selected = listings.find(item => item.id === selectedId) ?? listings[0];
  if (!selected)
    return (
      <section className="panel listing-review">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">WEEKLY LISTING REVIEW</span>
            <h2>No active listings in this region</h2>
          </div>
        </div>
      </section>
    );
  const review = reviews.get(selected.id)!;
  const weeks = checkIns
    .filter(item => item.propertyId === selected.id)
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
    .slice(-8);
  const peak = Math.max(1, ...weeks.map(item => item.showings));
  const recommended = review.options.find(option => option.recommended);
  return (
    <section className="panel listing-review" aria-labelledby="listing-review-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WEEKLY LISTING REVIEW</span>
          <h2 id="listing-review-title">How buyers are responding</h2>
          <p>Record each week's showings and feedback. Ascent reads the pattern; you decide the move.</p>
        </div>
      </div>
      <div className="listing-review-layout">
        <ul className="listing-picker" aria-label="Active listings">
          {listings.map(listing => {
            const item = reviews.get(listing.id)!;
            const tone = item.signals.some(signal => signal.tone === 'review')
              ? 'review'
              : item.weeks
                ? 'positive'
                : 'neutral';
            return (
              <li key={listing.id}>
                <button
                  className={listing.id === selected.id ? 'selected' : ''}
                  aria-pressed={listing.id === selected.id}
                  onClick={() => onSelect(listing.id)}
                >
                  <span className={`tone-dot ${tone}`} aria-hidden="true" />
                  <span>
                    <strong>{listing.address}</strong>
                    <small>
                      {compact(listing.price)} · {item.daysOnMarket} days · {item.weeks} check-in
                      {item.weeks === 1 ? '' : 's'}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="listing-detail">
          <div className="listing-stats">
            <div>
              <span>Days on market</span>
              <strong>{review.daysOnMarket}</strong>
              <small className={`phase ${review.phase}`}>{review.phase}</small>
            </div>
            <div>
              <span>Showings / week</span>
              <strong>{review.recent.showingsPerWeek}</strong>
              <small>last {Math.min(2, review.weeks) || 0} weeks</small>
            </div>
            <div>
              <span>Return rate</span>
              <strong>
                {review.recent.secondShowingRate === null
                  ? '—'
                  : `${Math.round(review.recent.secondShowingRate * 100)}%`}
              </strong>
              <small>second showings</small>
            </div>
            <div>
              <span>Offers</span>
              <strong>{review.totals.offers}</strong>
              <small>{review.totals.showings} total showings</small>
            </div>
          </div>
          {weeks.length > 0 && (
            <figure className="week-chart">
              <figcaption className="sr-only">
                Weekly showings, second showings and offers for {selected.address}
              </figcaption>
              <div className="week-bars">
                {weeks.map(item => (
                  <div key={item.id} className="week-col">
                    <div className="week-stack" aria-hidden="true">
                      <i className="showings" style={{ height: `${(item.showings / peak) * 100}%` }} />
                      <i className="second" style={{ height: `${(item.secondShowings / peak) * 100}%` }} />
                    </div>
                    <span className="week-label">{shortDate(item.weekOf)}</span>
                    <span className="sr-only">
                      {item.showings} showings, {item.secondShowings} second showings, {item.offers} offers
                    </span>
                    {item.offers > 0 && (
                      <span className="week-offers">
                        {item.offers} offer{item.offers === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="week-legend" aria-hidden="true">
                <span>
                  <i className="showings" /> Showings
                </span>
                <span>
                  <i className="second" /> Second showings
                </span>
              </div>
            </figure>
          )}
          <ul className="signal-list">
            {review.signals.map(signal => {
              const Icon = signalIcon[signal.tone];
              return (
                <li key={signal.title} className={signal.tone}>
                  <Icon size={16} />
                  <div>
                    <strong>{signal.title}</strong>
                    <p>{signal.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {review.themes.length > 0 && (
            <div className="theme-chips" aria-label="Feedback themes">
              <span>Feedback mentions</span>
              {review.themes.map(theme => (
                <span key={theme.theme} className="badge">
                  {theme.theme} × {theme.mentions}
                </span>
              ))}
            </div>
          )}
          <h3 className="options-title">Options for the seller conversation</h3>
          <div className="option-grid">
            {review.options.map(option => (
              <div key={option.action} className={`option-card ${option.recommended ? 'recommended' : ''}`}>
                {option.recommended && <span className="badge green">Suggested</span>}
                <strong>{option.title}</strong>
                <p>{option.rationale}</p>
                <small>Tradeoff: {option.tradeoff}</small>
              </div>
            ))}
          </div>
          <details className="incentive-math">
            <summary>Credit vs. price cut: the payment math</summary>
            <table className="math-table">
              <tbody>
                <tr>
                  <th scope="row">Buyer payment at list ({review.incentive.rate}%)</th>
                  <td>{money(review.incentive.paymentAtList)}/mo</td>
                </tr>
                <tr>
                  <th scope="row">{money(review.incentive.amount)} off the price</th>
                  <td>
                    {money(review.incentive.paymentAfterReduction)}/mo (saves{' '}
                    {money(review.incentive.monthlySavingFromReduction)})
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    {money(review.incentive.amount)} rate buydown → {review.incentive.buydownRate}%
                  </th>
                  <td>
                    {money(review.incentive.paymentWithBuydown)}/mo (saves{' '}
                    {money(review.incentive.monthlySavingFromBuydown)})
                  </td>
                </tr>
              </tbody>
            </table>
          </details>
          <form
            className="checkin-form"
            key={`${selected.id}-${review.nextCheckInDue}`}
            onSubmit={async e => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const saved = await onRecord({
                propertyId: selected.id,
                weekOf: `${f.get('weekOf')}T12:00:00.000Z`,
                showings: Number(f.get('showings')),
                secondShowings: Number(f.get('secondShowings')),
                offers: Number(f.get('offers')),
                feedback: String(f.get('feedback') || ''),
              });
              if (saved) form.reset();
            }}
          >
            <h3>
              <MessageSquare size={15} /> Record a check-in
              <small>Next due {date(review.nextCheckInDue)}</small>
            </h3>
            <div className="checkin-grid">
              <label>
                Week of
                <input name="weekOf" type="date" required defaultValue={review.nextCheckInDue} />
              </label>
              <label>
                Showings
                <input name="showings" type="number" min="0" max="500" required defaultValue={0} />
              </label>
              <label>
                Second showings
                <input name="secondShowings" type="number" min="0" max="500" required defaultValue={0} />
              </label>
              <label>
                Offers
                <input name="offers" type="number" min="0" max="100" required defaultValue={0} />
              </label>
            </div>
            <label>
              Buyer feedback
              <textarea name="feedback" rows={2} maxLength={2000} placeholder="What buyers and agents said this week" />
            </label>
            <button className="button primary" disabled={readonly || busy}>
              Save check-in
            </button>
          </form>
          <ul className="basis-list">
            {review.basis.map(item => (
              <li key={item}>{item}</li>
            ))}
            {recommended && (
              <li>Suggested option: {recommended.title.toLowerCase()}. The decision stays with you and your seller.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function RateSensitivity({
  price,
  rate,
  onRate,
}: {
  price: number;
  rate: number;
  onRate: (rate: number) => void;
}) {
  const loan = price * 0.8;
  const rows = [-0.5, -0.25, 0, 0.25, 0.5].map(delta => ({
    rate: Number((rate + delta).toFixed(2)),
    payment: Math.round(monthlyPayment(loan, Math.max(0, rate + delta))),
  }));
  const base = rows[2].payment;
  return (
    <section className="panel rate-panel" aria-labelledby="rate-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AFFORDABILITY CONTEXT</span>
          <h2 id="rate-title">What rates do to buyer payments</h2>
        </div>
        <Home size={19} />
      </div>
      <div className="rate-body">
        <label className="rate-input">
          Mortgage rate you are quoting (%)
          <input
            type="number"
            min="0"
            max="20"
            step="0.125"
            value={rate}
            onChange={e => onRate(Math.min(20, Math.max(0, Number(e.target.value) || 0)))}
          />
        </label>
        <p className="fine">
          Payment on the median active price of {money(price)}, 20% down, 30-year fixed, principal and interest. Enter
          today's quote; Ascent does not invent a live rate.
        </p>
        <table className="rate-table">
          <thead>
            <tr>
              <th scope="col">Rate</th>
              <th scope="col">Monthly payment</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.rate} className={row.payment === base ? 'current' : ''}>
                <td>{row.rate.toFixed(2)}%</td>
                <td>{money(row.payment)}</td>
                <td>
                  {row.payment === base
                    ? '—'
                    : `${row.payment > base ? '+' : '−'}${money(Math.abs(row.payment - base))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const stageLabels: Record<Client['stage'], string> = {
  lead: 'Lead',
  active: 'Active',
  'under-contract': 'Under contract',
  closed: 'Closed',
  lost: 'Lost',
};
const roleLabels: Record<NonNullable<Client['role']>, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  'buyer-seller': 'Buyer & seller',
  investor: 'Investor',
  renter: 'Renter',
  lender: 'Lender',
  other: 'Other',
};
export const clientStageLabel = (stage: Client['stage']) => stageLabels[stage];
export const clientRoleLabel = (role?: Client['role']) => (role ? roleLabels[role] : 'Role not set');

export function ClientPipeline({
  clients,
  now,
  selectedId,
  onSelect,
}: {
  clients: Client[];
  now: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [view, setView] = useState<'board' | 'list'>('board');
  const [groupBy, setGroupBy] = useState<'stage' | 'role'>('stage');
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setView('list');
  }, []);
  const columns =
    groupBy === 'stage'
      ? clientStages.map(stage => ({
          key: stage,
          label: stageLabels[stage],
          items: clients.filter(c => c.stage === stage),
        }))
      : [...clientRoles, undefined]
          .map(role => ({
            key: role ?? 'unset',
            label: role ? roleLabels[role] : 'Role not set',
            items: clients.filter(c => c.role === role),
          }))
          .filter(column => column.items.length);
  const due = clients.flatMap(c => (c.followUps ?? []).filter(task => task.status === 'pending'));
  const overdue = due.filter(task => daysUntil(task.dueAt, now) < 0).length;
  const card = (client: Client, detail: string) => {
    const next = (client.followUps ?? [])
      .filter(task => task.status === 'pending')
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    return (
      <button
        key={client.id}
        className={`pipeline-card ${client.id === selectedId ? 'selected' : ''}`}
        aria-pressed={client.id === selectedId}
        onClick={() => onSelect(client.id)}
      >
        <span className="initials">{initials(client.name)}</span>
        <span className="pipeline-card-body">
          <strong>{client.name}</strong>
          <small>
            {detail}
            {client.budget ? ` · ${compact(client.budget)}` : ''}
          </small>
          {next && (
            <span className="pipeline-next">
              <CalendarClock size={12} /> <Countdown dueAt={next.dueAt} now={now} />
            </span>
          )}
        </span>
      </button>
    );
  };
  return (
    <section className="panel pipeline" aria-labelledby="pipeline-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PIPELINE</span>
          <h2 id="pipeline-title">Every relationship, by where it stands</h2>
          <p>
            {clients.length} client{clients.length === 1 ? '' : 's'} · {due.length} open follow-up
            {due.length === 1 ? '' : 's'}
            {overdue ? ` · ${overdue} overdue` : ''}
          </p>
        </div>
        <div className="pipeline-controls">
          {view === 'board' && (
            <div className="segmented" role="group" aria-label="Group clients by">
              {(['stage', 'role'] as const).map(option => (
                <button key={option} aria-pressed={groupBy === option} onClick={() => setGroupBy(option)}>
                  {option === 'stage' ? 'Stage' : 'Role'}
                </button>
              ))}
            </div>
          )}
          <div className="segmented" role="group" aria-label="Client view">
            {(['board', 'list'] as const).map(option => (
              <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>
                {option === 'board' ? 'Board' : 'List'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {view === 'board' ? (
        <div className="pipeline-columns">
          {columns.map(column => (
            <div key={column.key} className="pipeline-column">
              <h3>
                {column.label}
                <span>{column.items.length}</span>
              </h3>
              {column.items.map(client =>
                card(client, groupBy === 'stage' ? clientRoleLabel(client.role) : stageLabels[client.stage]),
              )}
              {!column.items.length && <p className="pipeline-empty">None</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="pipeline-list">
          {[...clients]
            .sort((a, b) => clientStages.indexOf(a.stage) - clientStages.indexOf(b.stage))
            .map(client => card(client, `${stageLabels[client.stage]} · ${clientRoleLabel(client.role)}`))}
        </div>
      )}
      {!clients.length && <p className="pipeline-empty pipeline-none">No clients yet. Add your first relationship.</p>}
    </section>
  );
}

export function ListingDescriptionStudio({
  property,
  readonly,
  busy,
  onSave,
}: {
  property: Property;
  readonly: boolean;
  busy: boolean;
  onSave: (text: string) => Promise<unknown>;
}) {
  const [highlights, setHighlights] = useState('');
  const [tone, setTone] = useState<DescriptionTone>('warm');
  const [text, setText] = useState('');
  const draft = text || composeListingDescription(property, highlights.split(','), tone);
  const check = inspectFairHousing(draft, { surface: 'advertising' });
  return (
    <details className="description-studio">
      <summary>
        <PenLine size={15} /> Write a listing description
      </summary>
      <div className="description-body">
        <div className="description-controls">
          <label>
            Highlights (comma separated)
            <input
              value={highlights}
              maxLength={600}
              placeholder="renovated kitchen, fenced yard, two-car garage"
              onChange={e => {
                setHighlights(e.target.value);
                setText('');
              }}
            />
          </label>
          <label>
            Tone
            <select
              value={tone}
              onChange={e => {
                setTone(e.target.value as DescriptionTone);
                setText('');
              }}
            >
              <option value="warm">Warm</option>
              <option value="concise">Concise</option>
              <option value="refined">Refined</option>
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea rows={5} maxLength={5000} value={draft} onChange={e => setText(e.target.value)} />
        </label>
        <div className={`fh-check ${check.decision}`} role="status">
          {check.decision === 'allow' ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}
          <div>
            <strong>
              {check.decision === 'allow'
                ? 'Fair-housing check passed'
                : check.decision === 'block'
                  ? 'Fair-housing check: remove flagged language'
                  : 'Fair-housing check: review flagged language'}
            </strong>
            {check.findings.map(finding => (
              <p key={finding.code}>{finding.reason}</p>
            ))}
            {check.decision === 'allow' && <p>Describes the property, not who should live there.</p>}
          </div>
        </div>
        <div className="description-actions">
          <button
            type="button"
            className="button small"
            onClick={() => void navigator.clipboard?.writeText(draft).catch(() => {})}
          >
            <Copy size={14} /> Copy
          </button>
          <button
            type="button"
            className="button small primary"
            disabled={readonly || busy || check.decision === 'block'}
            onClick={() => void onSave(draft)}
          >
            Save draft for approval
          </button>
        </div>
      </div>
    </details>
  );
}
