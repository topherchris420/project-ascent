'use client';
import { useState } from 'react';
import {
  decisionLabels,
  financeLabels,
  FINANCE_LIMITS,
  type compareDecisions,
  type DecisionKind,
} from '@/lib/homeowner-finance';
import { money } from './format';

export type FinanceComparison = ReturnType<typeof compareDecisions>;
const display = (value: number | null) => (value === null ? 'Needs inputs' : money(value));
export function HomeownerDecisions({ comparison }: { comparison: FinanceComparison }) {
  const [selected, setSelected] = useState<DecisionKind>('hold');
  const current = comparison.results.find(r => r.kind === selected)!;
  const rows = current.trajectory;
  const values = rows.map(r => r.netPosition),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const points = rows
    .map(
      r =>
        `${55 + (r.month / comparison.inputs.horizonMonths) * 630},${200 - ((r.netPosition - min) / (max - min)) * 155}`,
    )
    .join(' ');
  return (
    <div className="home-decisions">
      <p className="home-explainer">
        Compare {comparison.inputs.horizonMonths} months using the same assumptions. A blank input means unknown; enter
        0 only when you intend zero. These choices provide different housing arrangements.
      </p>
      <p className="home-mobile-hint">Swipe or scroll sideways in the table to compare all amounts.</p>
      <div
        className="home-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Decision comparison, scroll horizontally for all columns"
      >
        <table className="home-table">
          <caption>Deterministic financial comparison · amounts in dollars</caption>
          <thead>
            <tr>
              <th scope="col">Choice</th>
              <th scope="col">At closing</th>
              <th scope="col">Initial monthly cash flow</th>
              <th scope="col">Costs over horizon</th>
              <th scope="col">End equity</th>
              <th scope="col">Net position at horizon</th>
            </tr>
          </thead>
          <tbody>
            {comparison.results.map(r => (
              <tr key={r.kind} aria-selected={selected === r.kind}>
                <th scope="row">
                  <button
                    className="text-button"
                    onClick={() => setSelected(r.kind)}
                    aria-pressed={selected === r.kind}
                  >
                    {decisionLabels[r.kind]}
                  </button>
                </th>
                <td>{r.netProceeds === null ? (r.available ? 'No sale' : 'Needs inputs') : money(r.netProceeds)}</td>
                <td>
                  {r.monthlyCashFlow === null
                    ? r.available
                      ? 'See carrying costs'
                      : 'Needs inputs'
                    : money(r.monthlyCashFlow)}
                </td>
                <td>{display(r.ownershipCosts)}</td>
                <td>{display(r.terminalEquity)}</td>
                <td>
                  <strong>{display(r.netPosition)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="home-selected" aria-live="polite">
        <h3>{decisionLabels[selected]}</h3>
        {!current.available ? (
          <p>
            To calculate this choice, review: {current.missing.map(k => financeLabels[k]).join('; ')}.
            {current.missing.includes('renovationMonths') || current.missing.includes('sellingMonths')
              ? ' The sale must occur within the comparison horizon.'
              : ''}
          </p>
        ) : (
          <>
            <div className="home-metrics">
              <div>
                <span>Cash needed at the start</span>
                <strong>{display(current.upfrontCash)}</strong>
              </div>
              <div>
                <span>Reserve shortfall across timeline</span>
                <strong>
                  {current.reserveShortfall === null ? 'Reserves unknown' : money(current.reserveShortfall)}
                </strong>
              </div>
              <div>
                <span>Cash required across timeline</span>
                <strong>{display(current.cashRequired)}</strong>
              </div>
              <div>
                <span>Change in property equity</span>
                <strong>{display(current.equityChange)}</strong>
                <small>A sale converts equity to cash; this is not a total wealth change.</small>
              </div>
            </div>
            {current.breakEven && (
              <p>
                <strong>
                  Break-even:{' '}
                  {current.breakEven.unit === 'months'
                    ? `${current.breakEven.value} months`
                    : `${money(current.breakEven.value)} ${current.breakEven.unit === 'monthly rent' ? 'gross rent / month' : 'sale price'}`}
                  .
                </strong>{' '}
                {current.breakEven.explanation}
              </p>
            )}
            <p className="fine">
              Cash required covers the largest cumulative cash deficit, including ongoing costs and a negative sale
              payoff, using month-end flows and no investment earnings. It excludes replacement housing, income and
              capital-gains taxes. End equity is before sale costs; net position deducts hypothetical exit costs.
            </p>
            <figure className="home-chart">
              <figcaption>{decisionLabels[selected]} · net position over the chosen horizon</figcaption>
              <p className="home-chart-values">
                Month 0: {money(rows[0].netPosition)} · Month {comparison.inputs.horizonMonths}:{' '}
                {money(rows.at(-1)!.netPosition)}
              </p>
              <svg viewBox="0 0 720 240" role="img" aria-labelledby="home-chart-title home-chart-description">
                <title id="home-chart-title">Scenario net position, not a forecast</title>
                <desc id="home-chart-description">
                  From {money(rows[0].netPosition)} at month 0 to {money(rows.at(-1)!.netPosition)} at month{' '}
                  {comparison.inputs.horizonMonths}. Exact values are in the table below.
                </desc>
                <line x1="55" y1="200" x2="685" y2="200" stroke="currentColor" opacity=".25" />
                <text x="55" y="27">
                  {money(max)}
                </text>
                <text x="55" y="221">
                  Month 0
                </text>
                <text x="600" y="221">
                  Month {comparison.inputs.horizonMonths}
                </text>
                <polyline points={points} fill="none" stroke="#167060" strokeWidth="3" />
                <circle
                  cx="685"
                  cy={200 - ((rows.at(-1)!.netPosition - min) / (max - min)) * 155}
                  r="5"
                  fill="#167060"
                />
              </svg>
            </figure>
            <details>
              <summary>Exact monthly calculations and chart values</summary>
              <div className="home-table-wrap" tabIndex={0} role="region" aria-label="Monthly scenario values">
                <table className="home-table">
                  <caption>Cash flow includes sale proceeds in the closing month</caption>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Equity</th>
                      <th>Cash flow</th>
                      <th>Net position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.month}>
                        <th scope="row">{r.month}</th>
                        <td>{money(r.equity)}</td>
                        <td>{money(r.cashFlow)}</td>
                        <td>{money(r.netPosition)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
      <details>
        <summary>How these numbers are calculated</summary>
        <ul className="studio-findings">
          {FINANCE_LIMITS.map(limit => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p>
          Sale proceeds = price × (1 − commission% − other costs%) − concessions − modeled debt at closing. Monthly
          rental cash flow = gross rent × (1 − vacancy%) × (1 − management%) − debt payment − ownership costs. Equity =
          assumed property value − debt. Cash flows occur at month end; upfront costs occur at month zero.
        </p>
        <p>
          Calculation {comparison.version} · <code>{comparison.calculationHash}</code>. Full inputs and monthly outputs
          are included in the private JSON export.
        </p>
      </details>
    </div>
  );
}
