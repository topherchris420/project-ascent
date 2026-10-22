'use client';
import { useMemo } from 'react';
import {
  breakEvenText,
  financeBreakEvens,
  financeSensitivity,
  HOLDING_PERIODS,
  holdingPeriodProfile,
} from '@/lib/finance-sensitivity';
import { decisionLabels, type DecisionKind } from '@/lib/homeowner-finance';
import type { FinanceComparison } from './homeowner-decisions';
import { money } from './format';

const signed = (value: number | null) =>
  value === null ? 'Not computable' : value === 0 ? 'No change' : `${value > 0 ? '+' : '−'}${money(Math.abs(value))}`;
const period = (months: number) => (months % 12 ? `${months} months` : `${months / 12} yr`);

/** Exact re-runs of the unchanged finance engine: one input at a time, other holding periods, break-evens. */
export function FinanceWhatIf({ comparison, selected }: { comparison: FinanceComparison; selected: DecisionKind }) {
  const sensitivity = useMemo(() => financeSensitivity(comparison.inputs), [comparison]);
  const profile = useMemo(() => holdingPeriodProfile(comparison.inputs), [comparison]);
  const breakEvens = useMemo(() => financeBreakEvens(comparison.inputs), [comparison]);
  const horizon = comparison.inputs.horizonMonths;
  const choice = sensitivity.byChoice.find(item => item.kind === selected);
  const drivers = choice?.drivers.slice(0, 6) ?? [];
  const computable = comparison.results.filter(result => result.available).map(result => result.kind);
  return (
    <section className="home-whatif" aria-labelledby="home-whatif-title">
      <h3 id="home-whatif-title">What would change these results</h3>
      <p className="fine">
        Each figure re-runs the same calculation with one thing changed and every other input as you entered it. These
        are arithmetic sensitivities, not forecasts, and they do not rank the choices.
      </p>
      <h4>{decisionLabels[selected]}: the inputs that move it most</h4>
      {!choice ? (
        <p>Enter the inputs this choice needs to see what moves it.</p>
      ) : drivers.length ? (
        <div
          className="home-table-wrap home-table-wrap-compact"
          tabIndex={0}
          role="region"
          aria-label="Inputs that move this choice"
        >
          <table className="home-table home-table-compact">
            <caption>
              Change in net position at month {horizon} · {decisionLabels[selected]}
            </caption>
            <thead>
              <tr>
                <th scope="col">Your input and the step tested</th>
                <th scope="col">Lower</th>
                <th scope="col">Higher</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(driver => (
                <tr key={driver.key}>
                  <th scope="row">
                    {driver.label}
                    <span className="home-step">Moved {driver.step}</span>
                  </th>
                  <td>{signed(driver.lower)}</td>
                  <td>{signed(driver.higher)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>None of the inputs you entered changes this choice’s net position.</p>
      )}
      <h4>If the comparison ended at a different time</h4>
      {computable.length ? (
        <div
          className="home-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Net position by holding period, scroll horizontally for all columns"
        >
          <table className="home-table">
            <caption>Net position at each holding period · same inputs, not a forecast</caption>
            <thead>
              <tr>
                <th scope="col">Choice</th>
                {HOLDING_PERIODS.map(months => (
                  <th scope="col" key={months} aria-current={months === horizon ? 'true' : undefined}>
                    {period(months)}
                    {months === horizon ? ' (yours)' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computable.map(kind => (
                <tr key={kind}>
                  <th scope="row">{decisionLabels[kind]}</th>
                  {profile.map(point => {
                    const result = point.results.find(item => item.kind === kind)!;
                    return (
                      <td key={point.horizonMonths}>
                        {result.available && result.netPosition !== null ? money(result.netPosition) : 'Not computable'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No choice can be computed yet.</p>
      )}
      <p className="fine">
        “Not computable” means a dated step, such as a sale or renovation, falls after that holding period.
      </p>
      <h4>Break-even thresholds</h4>
      <dl className="home-breakevens">
        {breakEvens.map(item => (
          <div key={item.id} data-status={item.status}>
            <dt>{item.label}</dt>
            <dd>{breakEvenText(item)}</dd>
          </div>
        ))}
      </dl>
      <p className="fine">
        {sensitivity.version} · solved by re-running {comparison.version}; thresholds are arithmetic under your inputs,
        not predictions.
      </p>
    </section>
  );
}
