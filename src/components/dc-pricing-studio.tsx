'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LoaderCircle, MapPin, Search, ShieldCheck } from 'lucide-react';
import { DC_CONDITION_LABELS, DC_CONDITION_MAX, dcDefaultState, dcReportHref } from '@/lib/dc-studio';
import { dcBenchmark } from '@/lib/valuation-safeguards';
import type { CmaAssumptions, Source, ValuationProperty } from '@/lib/types';
import { PricingStudio } from './pricing-studio';
import { date, number } from './format';
import '@/app/pricing-studio.css';

type SearchResult = { parcelId: string; address: string; zip: string; beds: number; baths: number; sqft: number };
type PropertyPayload = {
  parcelId: string;
  subject: ValuationProperty;
  candidates: ValuationProperty[];
  sources: Source[];
  asOf: string;
  assumptions: CmaAssumptions;
  snapshot: { salesFetchedAt: string; lastRecordedSale: string | null; parcelsFetchedAt: string };
  attribution: string;
};

function AddressSearch({ onPick, compact }: { onPick: (parcelId: string) => void; compact?: boolean }) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<SearchResult[]>([]),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      setStatus('');
      return;
    }
    const id = ++request.current;
    setBusy(true);
    const timer = setTimeout(() => {
      fetch(`/api/dc/search?q=${encodeURIComponent(term)}`)
        .then(response => response.json())
        .then(body => {
          if (id !== request.current) return;
          const found: SearchResult[] = body.results ?? [];
          setResults(found);
          setStatus(
            found.length
              ? `${found.length} matching DC home${found.length === 1 ? '' : 's'}`
              : 'No single-family DC home matches. Condominiums and multi-unit buildings are not covered. Try the house number and street, for example 1234 Main St NW.',
          );
        })
        .catch(() => id === request.current && setStatus('Search is unavailable right now. Try again shortly.'))
        .finally(() => id === request.current && setBusy(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <section className={`dc-search ${compact ? 'compact' : ''}`} aria-label="Find a DC home">
      <label htmlFor="dc-address">Street address in Washington, DC</label>
      <div className="dc-search-field">
        <Search size={18} aria-hidden="true" />
        <input
          id="dc-address"
          type="search"
          autoComplete="off"
          placeholder="e.g. 3400 Macomb St NW"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-describedby="dc-search-status"
        />
        {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      </div>
      <p id="dc-search-status" className="fine" role="status">
        {status}
      </p>
      {results.length > 0 && (
        <ul className="dc-results">
          {results.map(result => (
            <li key={result.parcelId}>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  onPick(result.parcelId);
                }}
              >
                <MapPin size={15} aria-hidden="true" />
                <span>
                  <strong>{result.address}</strong>
                  <small>
                    {result.zip} · {result.beds} bd · {result.baths} ba · {number(result.sqft)} sq ft
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

/** Price a real District home from bundled public records with the DC-validated settings. */
export function DcPricingStudio() {
  const [parcel, setParcel] = useState(''),
    [data, setData] = useState<PropertyPayload | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
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
      return;
    }
    let live = true;
    setLoading(true);
    setError('');
    fetch(`/api/dc/property?parcel=${encodeURIComponent(parcel)}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'That home could not be loaded.');
        if (live) setData(body);
      })
      .catch(e => live && (setData(null), setError(e instanceof Error ? e.message : 'That home could not be loaded.')))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [parcel]);
  const evidence = useMemo(
    () =>
      data
        ? {
            subject: data.subject,
            candidates: data.candidates,
            sources: data.sources,
            asOf: data.asOf,
          }
        : null,
    [data],
  );
  const defaultState = useMemo(dcDefaultState, []);
  if (data && evidence && !loading)
    return (
      <PricingStudio
        key={data.parcelId}
        evidence={evidence}
        defaultState={defaultState}
        storageKey={`ascent.dc-studio.v1.${data.parcelId}`}
        reportHref={(state, format) => dcReportHref(data.parcelId, state, format)}
        conditionMax={DC_CONDITION_MAX}
        conditionLabels={DC_CONDITION_LABELS}
        calibrated
        before={<AddressSearch compact onPick={pick} />}
        intro={{
          eyebrow: 'DISTRICT OF COLUMBIA PUBLIC RECORDS',
          titleTop: 'Price a real DC home.',
          titleBottom: 'See every recorded sale behind it.',
          lede: `Recorded sales and assessor characteristics from the District's open data, priced with the settings validated on ${dcBenchmark.holdout.sales.toLocaleString('en-US')} DC sales the engine never saw. Not MLS data and not an appraisal.`,
          badgeTitle: 'Real public records',
          badgeLines: [
            'District of Columbia data, CC BY 4.0',
            `Sales recorded through ${data.snapshot.lastRecordedSale ? date(data.snapshot.lastRecordedSale) : 'the snapshot date'}`,
          ],
        }}
        subjectEyebrow={`SUBJECT · WASHINGTON, DC ${data.subject.zip}`}
        evidenceNote={`Recorded sales as of ${date(data.asOf)} · the newest weeks may not be recorded yet · ${data.candidates.length} recorded sales within 2 miles in the past year`}
        passport={{
          facts:
            "Address, coordinates, living area, bedrooms, baths and the assessor's condition grade come from District records. Comparable prices and dates are recorded deed transfers the District marks as arm's-length.",
          assumptions:
            "Adjustment rates, the trend and the search filters start at the DC-validated settings fitted on earlier recorded sales. The assessor's condition grade is not an inspection.",
          missing:
            'No MLS listing history, active competition, concessions, interior condition, permits or owner information. Condominiums and multi-unit buildings are not covered, and recent sales can take weeks to be recorded.',
          footnote: `${data.attribution} Ascent joined and filtered these records; see the provenance files in the repository.`,
        }}
        reportNote="Draft · District public records · not reviewed by a licensed professional"
        footerNote="District of Columbia public records (CC BY 4.0) · deterministic engine · no account required"
      />
    );
  return (
    <div className="studio-page">
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">PRICING STUDIO · DC</span>
        <Link href="/" className="button small">
          <ArrowLeft size={15} /> All of Ascent
        </Link>
      </header>
      <main id="studio-main" className="studio-main dc-start">
        <div className="studio-intro">
          <div>
            <span className="eyebrow">DISTRICT OF COLUMBIA PUBLIC RECORDS</span>
            <h1>
              Price a real DC home.
              <br />
              <span>See every recorded sale behind it.</span>
            </h1>
            <p>
              Search any single-family home in the District. Ascent prices it from recorded sales with settings tested
              on {dcBenchmark.holdout.sales.toLocaleString('en-US')} DC sales it never saw, then lets you take the
              decision apart.
            </p>
          </div>
          <div className="studio-sample-label">
            <ShieldCheck size={20} />
            <strong>Real public records</strong>
            <span>
              District of Columbia data, CC BY 4.0
              <br />
              No account, MLS feed or model request
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
            {error}
          </div>
        )}
        <section className="panel dc-coverage" aria-label="What this covers">
          <h2>What this covers, and what it does not</h2>
          <ul className="studio-findings">
            <li>
              <strong>Covered:</strong> single-family homes in Washington, DC with an active street address, priced from
              recorded sales the District marks as arm&apos;s-length.
            </li>
            <li>
              <strong>Measured:</strong> with the DC-validated settings, the median error was{' '}
              {(dcBenchmark.primary.mdape * 100).toFixed(1)}% on {dcBenchmark.holdout.sales.toLocaleString('en-US')}{' '}
              held-out sales. Editing a setting leaves that measured configuration.
            </li>
            <li>
              <strong>Not covered:</strong> condominiums, multi-unit buildings, Maryland and Virginia, MLS listing
              history, concessions and interior condition.
            </li>
          </ul>
          <p className="fine">
            Want to practise first? <Link href="/demo">Open the fictional sample</Link> instead.
          </p>
        </section>
      </main>
    </div>
  );
}
