'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LoaderCircle, MapPin, Search, ShieldCheck } from 'lucide-react';
import {
  MD_GRADE_LABELS,
  MD_GRADE_MAX,
  marylandDefaultState,
  marylandReportHref,
  marylandRevisedBenchmark as marylandBenchmark,
  marylandVerdict,
} from '@/lib/maryland-studio';
import { AccuracyScorecard } from './accuracy-scorecard';
import type { CmaAssumptions, Source, ValuationProperty } from '@/lib/types';
import { PricingStudio } from './pricing-studio';
import { warmAddressSearch } from '@/lib/address-search-client';
import { date, number } from './format';
import '@/app/pricing-studio.css';

type SearchResult = { parcelId: string; address: string; zip: string; city: string; county: string; sqft: number };
type PropertyPayload = {
  parcelId: string;
  subject: ValuationProperty;
  candidates: ValuationProperty[];
  sources: Source[];
  asOf: string;
  assumptions: CmaAssumptions;
  snapshot: {
    salesFetchedAt: string;
    lastRecordedSale: string | null;
    parcelsFetchedAt: string;
    salesSha256?: string;
    parcelsSha256?: string;
  };
  attribution: string;
};

function AddressSearch({ onPick, compact }: { onPick: (parcelId: string) => void; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState('Type at least 3 characters to find a home.');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => warmAddressSearch('maryland'), []);
  const changeQuery = (value: string) => {
    // Invalidate immediately, including when a query is cleared before the effect runs.
    request.current += 1;
    setQuery(value);
    setResults([]);
    setFailed(false);
    setBusy(value.trim().length >= 3);
    setStatus(
      value.trim().length >= 3 ? 'Searching Maryland public records…' : 'Type at least 3 characters to find a home.',
    );
  };
  useEffect(() => {
    const id = ++request.current;
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    setFailed(false);
    setStatus('Searching Maryland public records…');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/maryland/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Search request failed.');
        const body = await response.json();
        if (!Array.isArray(body.results)) throw new Error('Search returned an unexpected response.');
        if (!active || id !== request.current) return;
        const found: SearchResult[] = body.results;
        setResults(found);
        setStatus(
          found.length
            ? `${found.length} matching Maryland home${found.length === 1 ? '' : 's'}. Choose an address to see its analysis.`
            : 'No matching home in these records. Try the house number and street without the ZIP code. Condominiums and multi-unit buildings are not covered.',
        );
      } catch {
        if (!active || id !== request.current) return;
        setResults([]);
        setFailed(true);
        setStatus('Search is unavailable right now. Retry, or explore the fictional sample.');
      } finally {
        if (active && id === request.current) setBusy(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, retry]);
  return (
    <section className={`dc-search ${compact ? 'compact' : ''}`} aria-label="Find a Maryland home">
      <label htmlFor="md-address">Street address in Montgomery or Prince George’s County, MD</label>
      <div className="dc-search-field">
        <Search size={18} aria-hidden="true" />
        <input
          ref={field}
          id="md-address"
          type="search"
          autoComplete="off"
          placeholder="House number and street, e.g. 7300 Maple Ave"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') changeQuery('');
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              list.current?.querySelector('button')?.focus();
            }
          }}
          aria-describedby="md-search-status"
          aria-controls={results.length ? 'md-search-results' : undefined}
        />
        {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      </div>
      <p id="md-search-status" className="fine" role="status">
        {status}
      </p>
      {failed && (
        <div className="dc-search-recovery">
          <button type="button" className="button small" onClick={() => setRetry(value => value + 1)}>
            Retry search
          </button>
          <Link href="/demo">Try the sample</Link>
        </div>
      )}
      {!compact && !query && (
        <div className="dc-search-example">
          <span>No address in mind?</span>
          <button
            type="button"
            className="button small"
            onClick={() => {
              changeQuery('7300 Maple');
              field.current?.focus();
            }}
          >
            Try an example address <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {results.length > 0 && (
        <ul className="dc-results" id="md-search-results" ref={list} aria-label="Matching Maryland homes">
          {results.map(result => (
            <li key={result.parcelId}>
              <button
                type="button"
                onClick={() => {
                  changeQuery('');
                  onPick(result.parcelId);
                }}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>
                  <strong>{result.address}</strong>
                  <small>
                    {result.city} · {result.county} · {result.zip} · {number(result.sqft)} sq ft
                  </small>
                </span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Price a real Maryland home from bundled public records with the Maryland-tested settings. */
export function MarylandPricingStudio() {
  const [parcel, setParcel] = useState(''),
    [data, setData] = useState<PropertyPayload | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const pick = (parcelId: string, push = true) => {
    setParcel(parcelId);
    if (push) {
      const url = new URL(window.location.href);
      url.searchParams.set('parcel', parcelId);
      window.history.pushState(null, '', url);
    }
  };
  useEffect(() => {
    const sync = () => setParcel(new URL(window.location.href).searchParams.get('parcel') ?? '');
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (!parcel) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    let live = true;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    fetch(`/api/maryland/property?parcel=${encodeURIComponent(parcel)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'That home could not be loaded.');
        if (live) setData(body);
      })
      .catch(e => live && (setData(null), setError(e instanceof Error ? e.message : 'That home could not be loaded.')))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
      controller.abort();
    };
  }, [parcel, retry]);
  const evidence = useMemo(
    () =>
      data
        ? {
            subject: data.subject,
            candidates: data.candidates,
            sources: data.sources,
            asOf: data.asOf,
            snapshot: data.snapshot,
          }
        : null,
    [data],
  );
  const defaultState = useMemo(marylandDefaultState, []);
  if (data && evidence && !loading)
    return (
      <PricingStudio
        key={data.parcelId}
        resultFirst
        evidence={evidence}
        defaultState={defaultState}
        storageKey={`ascent.maryland-studio.v2.${data.parcelId}`}
        reportHref={(state, format) => marylandReportHref(data.parcelId, state, format)}
        conditionMax={MD_GRADE_MAX}
        conditionLabels={MD_GRADE_LABELS}
        before={
          <>
            <AddressSearch compact onPick={pick} />
            <p className="error-box" data-testid="maryland-verdict">
              {marylandVerdict()} Median error {(marylandBenchmark.primary.mdape * 100).toFixed(1)}%. Bedrooms and
              bathrooms unavailable; prices use size, quality grade, location and sale timing only.{' '}
              <a href="#maryland-accuracy">Read the published test</a>.
            </p>
            <details id="maryland-accuracy" className="panel">
              <summary>Maryland accuracy: full results and missed criteria</summary>
              <AccuracyScorecard benchmark={marylandBenchmark} />
            </details>
          </>
        }
        intro={{
          eyebrow: 'MARYLAND SDAT/MDP PUBLIC RECORDS',
          titleTop: 'Price a real Maryland home.',
          titleBottom: 'See the sales behind the price.',
          lede: 'Price from size, assessor quality grade, location and sale timing. Bedroom and bathroom counts are unavailable. Not MLS data or an appraisal.',
          badgeTitle: 'Real public records',
          badgeLines: [
            'Maryland SDAT/MDP data, public domain',
            `Sales recorded through ${data.snapshot.lastRecordedSale ? date(data.snapshot.lastRecordedSale) : 'the snapshot date'}`,
          ],
        }}
        subjectEyebrow={`SUBJECT · MARYLAND ${data.subject.zip}`}
        evidenceNote={`Recorded sales as of ${date(data.asOf)} · the newest weeks may not be recorded yet · ${data.candidates.length} recorded sales within 3 miles in the past year`}
        passport={{
          facts:
            "Address, structure area, location and dwelling quality grade come from Maryland state records. Comparable prices and dates are private arm's-length improved transfers. Bedrooms and bathrooms are unavailable.",
          assumptions:
            'Rates and filters were fitted on earlier Maryland transfers. Room adjustments are fixed to zero. The 1–9 quality grade measures construction quality, not interior condition or renovation.',
          missing:
            'No bedrooms, bathrooms, MLS listing history, concessions, interior condition, permits or owner information. Only the latest three transfers per parcel are retained; older history is incomplete. Condominiums and multi-unit homes are excluded. Current assessor facts can postdate sales.',
          footnote: `${data.attribution} Ascent joined and filtered these records; see the provenance files in the repository.`,
        }}
        reportNote="Draft · Maryland public records · not reviewed by a licensed professional"
        footerNote="Maryland SDAT/MDP public records (public domain) · deterministic engine · no account required"
      />
    );
  return (
    <div className="studio-page">
      <a className="skip-link" href="#studio-main">
        Skip to property search
      </a>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">PRICING STUDIO · MARYLAND</span>
        <Link href="/" className="button small">
          <ArrowLeft size={15} /> All of Ascent
        </Link>
      </header>
      <main id="studio-main" className="studio-main dc-start">
        <div className="studio-intro">
          <div>
            <span className="eyebrow">MARYLAND SDAT/MDP PUBLIC RECORDS</span>
            <h1>
              Price a real Maryland home.
              <br />
              <span>See the sales behind the price.</span>
            </h1>
            <p>
              Search single-family homes and townhouses in Montgomery and Prince George’s counties. Prices use size,
              quality grade, location and sale timing only. Bedrooms and bathrooms are unavailable.
            </p>
          </div>
          <div className="studio-sample-label">
            <ShieldCheck size={20} />
            <strong>Real public records</strong>
            <span>
              Maryland SDAT/MDP data, public domain
              <br />
              Free to explore · no account needed
            </span>
          </div>
        </div>
        <AddressSearch onPick={pick} />
        {loading && (
          <p className="dc-loading" role="status">
            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading recorded sales…
          </p>
        )}
        {error && (
          <div role="alert" className="error-box">
            <p>{error}</p>
            <div className="dc-search-recovery">
              <button type="button" className="button small" onClick={() => setRetry(value => value + 1)}>
                Retry this property
              </button>
              <Link href="/demo">Try the sample</Link>
            </div>
          </div>
        )}
        <section className="panel dc-coverage" aria-label="What this covers">
          <h2>Know what you’re working with.</h2>
          <ul className="studio-findings">
            <li>
              <strong>Covered:</strong> single-unit homes and townhouses in Montgomery and Prince George’s counties with
              a usable state address, priced from private arm&apos;s-length improved transfers in Maryland state
              records.
            </li>
            <li>
              <strong>Measured:</strong> with the Maryland-tested settings, the median error was{' '}
              {(marylandBenchmark.primary.mdape * 100).toFixed(1)}% on{' '}
              {marylandBenchmark.holdout.sales.toLocaleString('en-US')} held-out sales. {marylandVerdict()} Editing a
              setting leaves that measured configuration. The displayed price range is an uncalibrated comparable
              envelope.
            </li>
            <li>
              <strong>Not covered:</strong> condominiums, multi-unit buildings, other Maryland counties and Virginia,
              MLS listing history, concessions and interior condition.
            </li>
          </ul>
          <p className="fine">
            Virginia awaits written permission. Want to practise first?{' '}
            <Link href="/demo">Open the fictional sample</Link> instead.
          </p>
        </section>
        <section id="maryland-accuracy" className="panel">
          <h2>Maryland accuracy — results and misses</h2>
          <AccuracyScorecard benchmark={marylandBenchmark} />
        </section>
      </main>
    </div>
  );
}
