'use client';
import { useMemo } from 'react';
import { decisionDrivers, summarizeDrivers, DRIVER_STEPS, type DecisionDriver } from '@/lib/decision-drivers';
import { sellerPlan, thresholdNote, type SellerCosts } from '@/lib/seller-plan';
import type { CmaResult, ValuationProperty } from '@/lib/types';
import { money, number } from './format';
import '@/app/pricing-studio.css';

const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
const clampPercent = (n: number) => Math.min(100, Math.max(0, n));

/**
 * One axis for the whole decision: every adjusted sale (sized by weight), the weighted estimate and the
 * asking price under discussion. The comparable inspector is this chart's table twin.
 */
export function PriceEvidenceStrip({
  result,
  candidates,
  selectedPrice,
  activeId,
  onInspect,
}: {
  result: CmaResult;
  candidates: ValuationProperty[];
  selectedPrice: number;
  activeId?: string;
  onInspect?: (propertyId: string) => void;
}) {
  const values = [...result.comps.map(c => c.adjustedPrice), result.estimate, selectedPrice];
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, hi * 0.01);
  const min = lo - pad,
    span = hi + pad - min;
  const at = (v: number) => clampPercent(((v - min) / span) * 100);
  const maxWeight = Math.max(...result.comps.map(c => c.weight));
  const atOrAbove = result.comps.filter(c => c.adjustedPrice >= selectedPrice).length;
  const relation =
    selectedPrice === result.estimate
      ? 'at the weighted estimate'
      : `${money(Math.abs(selectedPrice - result.estimate))} ${selectedPrice > result.estimate ? 'above' : 'below'} the weighted estimate`;
  const summary = `${result.comps.length} adjusted sales from ${money(result.low)} to ${money(result.high)}. The ${money(selectedPrice)} asking price is ${relation}; ${atOrAbove} of ${result.comps.length} adjusted sales sit at or above it.`;
  const ticks = useMemo(() => {
    // The smallest round step that keeps at most six labels, so wide real ranges stay legible on a phone.
    const steps = [5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000, 5000000];
    const step = steps.find(candidate => span / candidate <= 5) ?? Math.ceil(span / 5);
    const out: number[] = [];
    for (let t = Math.ceil(min / step) * step; t <= min + span; t += step) out.push(t);
    return out;
  }, [min, span]);
  const tickLabel = (t: number) =>
    t >= 1000000 ? `$${Number((t / 1000000).toFixed(2))}M` : `$${number(Math.round(t / 1000))}k`;
  const name = (id: string) => candidates.find(p => p.id === id)?.address || id;
  return (
    <figure className="evidence-strip" aria-labelledby={`strip-title-${result.calculationHash}`}>
      <figcaption>
        <span className="eyebrow" id={`strip-title-${result.calculationHash}`}>
          WHERE THE EVIDENCE SITS
        </span>
        <p>{summary}</p>
      </figcaption>
      <div className="strip-plot" role="group" aria-label={`Price axis. ${summary}`}>
        <span className="strip-track" aria-hidden="true" />
        <span
          className="strip-band"
          aria-hidden="true"
          style={{ left: `${at(result.low)}%`, width: `${at(result.high) - at(result.low)}%` }}
        />
        <span className="strip-estimate" aria-hidden="true" style={{ left: `${at(result.estimate)}%` }} />
        <span
          className={`strip-ask ${at(selectedPrice) > 78 ? 'flip' : at(selectedPrice) < 22 ? 'start' : ''}`}
          style={{ left: `${at(selectedPrice)}%` }}
        >
          <i aria-hidden="true" />
          <span>Asking {money(selectedPrice)}</span>
        </span>
        {[...result.comps]
          .sort((a, b) => b.weight - a.weight)
          .map(comp => {
            const size = 10 + Math.round(Math.sqrt(comp.weight / maxWeight) * 12);
            const label = `${name(comp.propertyId)}: adjusted ${money(comp.adjustedPrice)}, ${(comp.weight * 100).toFixed(1)}% weight`;
            return (
              <button
                type="button"
                key={comp.propertyId}
                className={`strip-comp ${activeId === comp.propertyId ? 'active' : ''}`}
                style={{ left: `${at(comp.adjustedPrice)}%`, width: size, height: size }}
                aria-label={`${label}. Inspect this sale.`}
                aria-pressed={activeId === comp.propertyId}
                onClick={() => onInspect?.(comp.propertyId)}
              >
                <span className="strip-tip" aria-hidden="true">
                  <strong>{money(comp.adjustedPrice)}</strong>
                  {name(comp.propertyId)} · {(comp.weight * 100).toFixed(1)}% weight
                </span>
              </button>
            );
          })}
      </div>
      <div className="strip-axis" aria-hidden="true">
        {ticks.map(t => (
          <span key={t} style={{ left: `${at(t)}%` }}>
            {tickLabel(t)}
          </span>
        ))}
      </div>
      <ul className="strip-legend">
        <li>
          <i className="key-comp" aria-hidden="true" /> Adjusted sale · larger = more weight
        </li>
        <li>
          <i className="key-estimate" aria-hidden="true" /> Weighted estimate {money(result.estimate)}
        </li>
        <li>
          <i className="key-ask" aria-hidden="true" /> Asking price under discussion
        </li>
        <li>
          <i className="key-band" aria-hidden="true" /> Observed adjusted range, not a confidence interval
        </li>
      </ul>
    </figure>
  );
}

const settingText = (driver: DecisionDriver, value: number, conditionMax = 5) => {
  switch (driver.unit) {
    case 'usd-per-sqft':
      return `$${number(value)}/sq ft`;
    case 'usd':
      return money(value);
    case 'percent-per-month':
      return `${value < 0 ? '−' : ''}${Math.abs(value * 100).toFixed(1)}%/mo`;
    case 'miles':
      return `${number(value)} mi`;
    case 'days':
      return `${number(value)} days`;
    case 'ratio':
      return `${value}×`;
    case 'points':
      return `${value}/${conditionMax}`;
  }
};

/** "What changes my decision?" — the tested arithmetic dependency of the estimate on each input. */
export function DecisionDrivers({
  result,
  conditionMax = 5,
  precomputed,
}: {
  result: CmaResult;
  conditionMax?: number;
  /** The same `decisionDrivers(result)` output when the page has already computed it. */
  precomputed?: DecisionDriver[];
}) {
  const drivers = useMemo(
    () => precomputed ?? decisionDrivers(result, { conditionMax }),
    [precomputed, result, conditionMax],
  );
  if (!drivers.length) return null;
  const scale = Math.max(1, ...drivers.map(d => d.swing));
  const bar = (outcome: DecisionDriver['lower'], driver: DecisionDriver, side: 'lower' | 'higher') => {
    if (outcome.change === null || outcome.change === 0) return null;
    const width = (Math.abs(outcome.change) / scale) * 50;
    const negative = outcome.change < 0;
    return (
      <span
        key={side}
        className={`driver-bar ${negative ? 'down' : 'up'}`}
        style={negative ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }}
        title={`At ${settingText(driver, outcome.setting, conditionMax)}: ${money(outcome.estimate!)} (${signed(outcome.change)})`}
      />
    );
  };
  return (
    <section className="decision-drivers" aria-labelledby={`drivers-title-${result.calculationHash}`}>
      <div className="drivers-head">
        <h3 id={`drivers-title-${result.calculationHash}`}>Which input moves this price most?</h3>
        <p className="studio-muted">{summarizeDrivers(drivers, money)}</p>
      </div>
      <div className="drivers-scale" aria-hidden="true">
        <span>Lowers the estimate</span>
        <span>Raises the estimate</span>
      </div>
      <ol className="drivers-list">
        {drivers.map(driver => (
          <li key={driver.key} className={driver.unavailable ? 'unavailable' : ''}>
            <div className="driver-label">
              <strong>{driver.label}</strong>
              <span>
                Now {settingText(driver, driver.current, conditionMax)} · tested{' '}
                {settingText(driver, driver.lower.setting, conditionMax)} and{' '}
                {settingText(driver, driver.higher.setting, conditionMax)}
              </span>
            </div>
            <div className="driver-track" aria-hidden="true">
              <span className="driver-zero" />
              {bar(driver.lower, driver, 'lower')}
              {bar(driver.higher, driver, 'higher')}
            </div>
            <div className="driver-values">
              {[driver.lower, driver.higher].map((outcome, i) => (
                <span key={i}>
                  {settingText(driver, outcome.setting, conditionMax)}:{' '}
                  <strong>
                    {outcome.change === null
                      ? 'no eligible sale'
                      : outcome.change === 0
                        ? 'no change'
                        : signed(outcome.change)}
                  </strong>
                  {outcome.change !== null && outcome.comparables !== result.comps.length && (
                    <small> · {outcome.comparables} sales</small>
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p className="fine">
        Each row recalculates the same frozen sales with one input changed: adjustment rates ±{DRIVER_STEPS.ratePercent}
        %, trend ±{DRIVER_STEPS.trendPoints * 100} points per month, subject{' '}
        {result.inputSnapshot?.subject.ratingKind === 'quality-grade' ? 'quality grade' : 'condition'} ±
        {DRIVER_STEPS.conditionPoints} point, eligibility filters halved and doubled. These are review steps, not a
        statement of how uncertain the market is, and they do not say which setting is right.
      </p>
    </section>
  );
}

/** Strategy and fallback arithmetic for a seller conversation, with no timing or outcome forecasts. */
export function SellerPlanTable({
  result,
  selectedPrice,
  costs,
  payoff,
}: {
  result: CmaResult;
  selectedPrice: number;
  costs: SellerCosts;
  payoff: number;
}) {
  const plan = sellerPlan(result, selectedPrice, costs, payoff);
  const note = thresholdNote(selectedPrice, money);
  return (
    <div className="seller-plan">
      <h3>What each move nets the seller</h3>
      <div className="studio-table-scroll" tabIndex={0} role="region" aria-label="Seller proceeds by pricing move">
        <table className="studio-table seller-plan-table">
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col">Contract price</th>
              <th scope="col">Credit</th>
              <th scope="col">Commission + closing</th>
              <th scope="col">Net before payoff</th>
              {payoff > 0 && <th scope="col">Net after payoff</th>}
            </tr>
          </thead>
          <tbody>
            {plan.rows.map(row => [
              row.key === 'reduction' && (
                <tr key="group" className="group">
                  <th scope="rowgroup" colSpan={payoff > 0 ? 6 : 5}>
                    A later price adjustment or the same amount as a credit, compared
                  </th>
                </tr>
              ),
              <tr
                key={row.key}
                className={`${row.price === selectedPrice && row.credit === 0 ? 'selected' : ''} ${row.key === 'reduction' || row.key === 'credit' ? 'fallback' : ''}`}
              >
                <th scope="row">
                  {row.label}
                  <small>{row.detail}</small>
                </th>
                <td data-label="Contract price">{money(row.price)}</td>
                <td data-label="Credit">{row.credit ? `−${money(row.credit)}` : '—'}</td>
                <td data-label="Commission + closing">−{money(row.sellingCosts)}</td>
                <td data-label="Net before payoff">
                  <strong>{money(row.netBeforePayoff)}</strong>
                </td>
                {payoff > 0 && <td data-label="Net after payoff">{money(row.netAfterPayoff)}</td>}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
      {plan.reduction > 0 && (
        <p className="seller-plan-insight">
          A {money(plan.reduction)} credit nets the seller {money(plan.creditPenalty)} less than an equal price
          reduction, because commission and closing percentages still apply to the higher contract price.
        </p>
      )}
      {note && <p className="seller-plan-insight">{note}</p>}
      <ul className="fine seller-plan-limits">
        {plan.assumptions.map(a => (
          <li key={a}>{a}</li>
        ))}
        {costs.concessions > 0 && <li>Entered seller concessions of {money(costs.concessions)} apply to every row.</li>}
      </ul>
    </div>
  );
}
