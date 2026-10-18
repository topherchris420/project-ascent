'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck } from 'lucide-react';
import { comparableSensitivity, explainDecisionDelta } from '@/lib/pricing-exploration';
import type { CmaResult, Source, ValuationProperty } from '@/lib/types';
import { date, money, number } from './format';
import '@/app/pricing-studio.css';

const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
const signedExact = (n: number) =>
  `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ComparableExplorer({
  result,
  candidates,
  sources,
  selectedId: controlledId,
  onSelect,
}: {
  result: CmaResult;
  candidates: ValuationProperty[];
  sources: Source[];
  /** Optional shared selection, so another view (the range chart) can open a sale here. */
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [localId, setLocalId] = useState('');
  const selectedId = controlledId ?? localId;
  const chosenHere = useRef('');
  const setSelectedId = (id: string) => {
    chosenHere.current = id;
    setLocalId(id);
    onSelect?.(id);
  };
  const inspector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    // A choice made in another view always brings the inspector into view; one made here only on narrow screens.
    const external = selectedId !== chosenHere.current;
    if (!external && !window.matchMedia('(max-width: 720px)').matches) return;
    chosenHere.current = selectedId;
    inspector.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: external ? 'nearest' : 'start',
    });
    inspector.current?.focus({ preventScroll: true });
  }, [selectedId]);
  const selected =
    result.comps.find(comp => comp.propertyId === selectedId) ||
    [...result.comps].sort((a, b) => b.weight - a.weight)[0];
  const record = candidates.find(p => p.id === selected?.propertyId);
  const source = sources.find(s => s.id === record?.sourceId);
  const sensitivity = useMemo(() => comparableSensitivity(result), [result]);
  const values = result.comps.flatMap(c => [
    c.adjustedPrice,
    candidates.find(p => p.id === c.propertyId)?.soldPrice ?? c.adjustedPrice,
  ]);
  const low = Math.min(...values) * 0.98,
    span = Math.max(1, Math.max(...values) * 1.02 - low);
  const x = (v: number) => 8 + ((v - low) / span) * 84;
  return (
    <section
      className="panel comp-explorer"
      id={`pricing-evidence-${result.calculationHash}`}
      aria-label="Interactive comparable intelligence"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">FOLLOW THE EVIDENCE</span>
          <h2>Why does this sale support the price?</h2>
        </div>
        <Search size={20} aria-hidden="true" />
      </div>
      <p className="studio-muted">
        Choose a sale to inspect its adjustments, source and influence. Open circle: sold price. Solid dot: adjusted
        value.
      </p>
      <div className="comp-explorer-grid">
        <div className="comp-choices" role="group" aria-label="Inspect a comparable">
          {[...result.comps]
            .sort((a, b) => b.weight - a.weight)
            .map(comp => {
              const p = candidates.find(c => c.id === comp.propertyId);
              return (
                <button
                  key={comp.propertyId}
                  className={`comp-choice ${selected?.propertyId === comp.propertyId ? 'selected' : ''}`}
                  aria-pressed={selected?.propertyId === comp.propertyId}
                  onClick={() => setSelectedId(comp.propertyId)}
                >
                  <span className="comp-choice-top">
                    <strong>{p?.address || comp.propertyId}</strong>
                    <span>{(comp.weight * 100).toFixed(1)}% weight</span>
                  </span>
                  <span className="comp-choice-meta">
                    {comp.distanceMiles.toFixed(2)} mi · {Math.round(comp.ageDays)} days since sale ·{' '}
                    {p ? `${number(p.sqft)} sq ft` : 'Size unavailable'}
                  </span>
                  <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="comp-price-plot" aria-hidden="true">
                    <line x1="3" x2="97" y1="5" y2="5" stroke="#dfe6dc" strokeWidth=".4" />
                    <line
                      x1={x(p?.soldPrice ?? comp.adjustedPrice)}
                      x2={x(comp.adjustedPrice)}
                      y1="5"
                      y2="5"
                      stroke="#2b5543"
                      strokeWidth=".7"
                    />
                    <circle
                      cx={x(p?.soldPrice ?? comp.adjustedPrice)}
                      cy="5"
                      r="1.5"
                      fill="white"
                      stroke="#2b5543"
                      strokeWidth=".6"
                    />
                    <circle cx={x(comp.adjustedPrice)} cy="5" r="1.6" fill="#2b5543" />
                  </svg>
                  <span className="comp-price-pair">
                    <span>Sold {p?.soldPrice ? money(p.soldPrice) : 'unknown'}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                    <strong>Adjusted {money(comp.adjustedPrice)}</strong>
                  </span>
                </button>
              );
            })}
        </div>
        {selected && record && (
          <div
            className="comp-inspector"
            ref={inspector}
            tabIndex={-1}
            role="region"
            aria-label="Selected comparable detail"
            aria-live="polite"
          >
            <span className="eyebrow">SALE → ADJUSTMENTS → WEIGHT</span>
            <h3>{record.address}</h3>
            <p className="studio-muted">
              Closed {record.soldAt ? date(record.soldAt) : 'date missing'} ·{' '}
              {record.roomCountsUnavailable
                ? 'Bedrooms and bathrooms unavailable'
                : `${record.beds} beds · ${record.baths} baths`}
              · {number(record.sqft)} sq ft
            </p>
            <dl className="comp-waterfall">
              <div>
                <dt>Recorded sold price</dt>
                <dd>{money(record.soldPrice!)}</dd>
              </div>
              {selected.adjustments.map(a => (
                <div key={a.factor}>
                  <dt>
                    <details>
                      <summary>
                        {record.ratingKind === 'quality-grade'
                          ? a.factor.replace('Condition', 'Quality grade')
                          : a.factor}
                      </summary>
                      <p>
                        {record.ratingKind === 'quality-grade'
                          ? a.explanation
                              .replace('condition points', 'quality grade points')
                              .replace(
                                'subjective rubric, verify inspection',
                                'assessor construction quality, not interior condition',
                              )
                          : a.explanation}
                      </p>
                    </details>
                  </dt>
                  <dd>{signed(a.amount)}</dd>
                </div>
              ))}
              <div className="comp-total">
                <dt>Adjusted to the subject</dt>
                <dd>{money(selected.adjustedPrice)}</dd>
              </div>
            </dl>
            <details className="studio-disclosure">
              <summary>Exactly how the weight is calculated</summary>
              <p>
                Raw weight = 1 ÷ ((1 + distance in miles) × (1 + sale age in days ÷ 90) × (1 + |ln(subject area ÷ comp
                area)| × 4)). Each raw weight is divided by the sum of all eligible raw weights.
              </p>
              <p>
                This sale: {selected.distanceMiles.toFixed(4)} miles, {selected.ageDays.toFixed(3)} days,{' '}
                {number(result.inputSnapshot?.subject.sqft ?? 0)} ÷ {number(record.sqft)} sq ft →{' '}
                {(selected.weight * 100).toFixed(2)}% of the weighted estimate. Rounded displays may differ slightly
                from full precision.
              </p>
            </details>
            <div className="comp-provenance">
              <ShieldCheck size={16} aria-hidden="true" />
              <div>
                <strong>{source?.label || 'Source metadata unavailable'}</strong>
                <p>
                  {source?.kind === 'synthetic'
                    ? 'Fictional evidence'
                    : source?.kind === 'user'
                      ? 'User-provided evidence'
                      : source?.kind === 'licensed'
                        ? 'Licensed provider evidence'
                        : source?.kind === 'public'
                          ? 'Public-record evidence'
                          : 'Verify provenance'}{' '}
                  · Observed {source ? date(source.observedAt) : 'unknown'}
                </p>
                <p>{source?.license || 'Verify source permissions before use.'}</p>
              </div>
            </div>
            {selected.warnings.map(w => (
              <p className="studio-warning" key={w}>
                {w}
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="studio-disclosure">
        <summary>What changes my decision? Test each sale’s influence</summary>
        <p>
          Each row removes only that sale and renormalizes weights, holding all other inputs fixed. These are
          alternative calculations, not market predictions.
        </p>
        <div className="influence-list">
          {sensitivity.map(s => (
            <div key={s.propertyId}>
              <span>{candidates.find(p => p.id === s.propertyId)?.address || s.propertyId}</span>
              <strong>
                {s.estimate === null ? 'No remaining sales' : `${signed(s.difference!)} → ${money(s.estimate)}`}
              </strong>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export function DecisionArithmetic({ previous, current }: { previous: CmaResult; current: CmaResult }) {
  const delta = explainDecisionDelta(previous, current);
  const name = (id: string) =>
    current.inputSnapshot?.candidates.find(p => p.id === id)?.address ||
    previous.inputSnapshot?.candidates.find(p => p.id === id)?.address ||
    id;
  const changed = delta.rows.filter(row => Math.abs(row.total) >= 0.005 || row.kind !== 'retained');
  return (
    <div
      className="decision-arithmetic"
      id={`decision-delta-${previous.calculationHash}`}
      aria-label="Explanation of the valuation difference"
    >
      <h3>The arithmetic behind the difference</h3>
      <p className="studio-muted">
        Each sale’s contribution reconciles the two estimates. Adjusted-value effects and weight effects are separated;
        they do not establish market causation.
      </p>
      <div className="decision-bridge">
        <span>
          Previous<strong>{money(previous.estimate)}</strong>
        </span>
        <ArrowRight size={19} aria-hidden="true" />
        <span>
          Difference<strong>{signed(delta.change)}</strong>
        </span>
        <ArrowRight size={19} aria-hidden="true" />
        <span>
          Current<strong>{money(current.estimate)}</strong>
        </span>
      </div>
      {changed.length ? (
        <div className="studio-table-scroll" tabIndex={0} role="region" aria-label="Comparable contribution arithmetic">
          <table className="studio-table">
            <thead>
              <tr>
                <th scope="col">Sale</th>
                <th scope="col">Adjusted-value effect</th>
                <th scope="col">Weight / eligibility effect</th>
                <th scope="col">Total effect</th>
              </tr>
            </thead>
            <tbody>
              {changed.map(row => (
                <tr key={row.propertyId}>
                  <th scope="row">
                    {name(row.propertyId)}
                    <small>
                      {row.kind} · {(row.previousWeight * 100).toFixed(1)}% → {(row.currentWeight * 100).toFixed(1)}%
                    </small>
                  </th>
                  <td>{signedExact(row.adjustedValueEffect)}</td>
                  <td>{signedExact(row.weightAndEligibilityEffect)}</td>
                  <td>{signedExact(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          <CheckCircle2 size={16} aria-hidden="true" /> The estimates have the same comparable contributions.
        </p>
      )}
      <p className="fine">
        Reference: previous estimate. Retained value effect = old weight × change in adjusted value. Weight effect =
        change in weight × (new adjusted value − reference); added and removed sales use that reference too. Rounding
        reconciliation: {delta.rounding.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. Displayed
        effects sum to {money(delta.change)} including rounding.
      </p>
    </div>
  );
}
