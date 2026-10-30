'use client';
import { useState } from 'react';
import {
  CLOSING_TAX_BOUNDARIES,
  closingTaxes,
  sellerPercentRoundedUp,
  type TaxJurisdiction,
  type TaxOptions,
} from '@/lib/closing-taxes';

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/**
 * The published transfer and recordation taxes at one price, beside the seller's closing-cost setting. It only
 * suggests raising the setting when the setting is below the taxes alone; it never lowers it, because settlement and
 * title fees come on top.
 */
export function ClosingTaxPanel({
  jurisdiction,
  price,
  priceSource,
  closingPercent,
  onUsePercent,
}: {
  jurisdiction: TaxJurisdiction;
  price: number | null;
  priceSource: string;
  closingPercent: number | null;
  onUsePercent: (percent: number) => void;
}) {
  const [options, setOptions] = useState<TaxOptions>({ firstTimeBuyer: false, principalResidence: true });
  const maryland = jurisdiction !== 'dc';
  if (price === null || price <= 0)
    return (
      <section className="os-tax" aria-labelledby="os-tax-title">
        <h3 id="os-tax-title">Transfer and recordation taxes</h3>
        <p>Enter an offer price to see the published taxes on this sale.</p>
      </section>
    );
  const taxes = closingTaxes(jurisdiction, price, options);
  const percent = sellerPercentRoundedUp(taxes);
  return (
    <section className="os-tax" aria-labelledby="os-tax-title">
      <h3 id="os-tax-title">Transfer and recordation taxes</h3>
      <p>
        Published {taxes.label} rates at {usd(price)} ({priceSource}). Your share where the law sets it:{' '}
        <strong>
          {usd(taxes.sellerTotal)} ({percent.toFixed(2)}% of the price)
        </strong>
        .
      </p>
      {maryland && (
        <div className="os-tax-options">
          <label className="os-check-row">
            <input
              type="checkbox"
              checked={options.principalResidence}
              onChange={event => setOptions({ ...options, principalResidence: event.target.checked })}
            />
            <span>The buyer will live in the home</span>
          </label>
          <label className="os-check-row">
            <input
              type="checkbox"
              checked={options.firstTimeBuyer && options.principalResidence}
              disabled={!options.principalResidence}
              onChange={event => setOptions({ ...options, firstTimeBuyer: event.target.checked })}
            />
            <span>
              Every buyer is a first-time Maryland homebuyer
              {!options.principalResidence && (
                <span className="os-check-detail">Applies only when the buyer will live in the home.</span>
              )}
            </span>
          </label>
        </div>
      )}
      <div className="table-wrap os-tax-table" role="region" aria-label="Taxes on this sale" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Tax</th>
              <th scope="col">Rate</th>
              <th scope="col">Amount</th>
              <th scope="col">Who pays</th>
              <th scope="col">Your share</th>
            </tr>
          </thead>
          <tbody>
            {taxes.lines.map(line => (
              <tr key={line.name}>
                <th scope="row">{line.name}</th>
                <td data-label="Rate">{line.rate}</td>
                <td data-label="Amount">{usd(line.amount)}</td>
                <td data-label="Who pays">{line.payer}</td>
                <td data-label="Your share">{line.sellerShare === null ? 'Per contract' : usd(line.sellerShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {closingPercent === null || closingPercent < percent ? (
        <p className="os-tax-warning">
          {closingPercent === null
            ? 'Your closing-cost setting is blank.'
            : `Your closing-cost setting (${closingPercent}%) is below these taxes alone (${percent.toFixed(2)}%).`}{' '}
          <button type="button" className="button small" onClick={() => onUsePercent(percent)}>
            Raise it to {percent.toFixed(2)}%
          </button>{' '}
          Settlement, title and other fees come on top.
        </p>
      ) : (
        <p className="os-hint">
          Your closing-cost setting ({closingPercent}%) covers these taxes with {(closingPercent - percent).toFixed(2)}%
          left for settlement, title and other fees.
        </p>
      )}
      <details>
        <summary>Sources and limits</summary>
        <ul>
          {taxes.notes.map(note => (
            <li key={note}>{note}</li>
          ))}
          {taxes.lines
            .filter((line, index, lines) => lines.findIndex(other => other.source === line.source) === index)
            .map(line => (
              <li key={line.source}>
                <a href={line.url}>{line.source}</a>
              </li>
            ))}
          {CLOSING_TAX_BOUNDARIES.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
