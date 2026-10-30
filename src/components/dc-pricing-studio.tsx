'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, LoaderCircle, MapPin, Search, ShieldCheck } from 'lucide-react';
import { DC_CONDITION_LABELS, DC_CONDITION_MAX, dcDefaultState, dcReportHref } from '@/lib/dc-studio';
import { dcBenchmark } from '@/lib/valuation-safeguards';
import { condoBenchmark, condoDefaultState, condoReportHref, CONDO_ACCURACY_NOTICE } from '@/lib/dc-condo-studio';
import { AccuracyScorecard } from './accuracy-scorecard';
import { MISSING_EVIDENCE } from '@/lib/home-markets';
import type { PropertyFacts } from '@/lib/property-facts';
import type { CmaAssumptions, Source, ValuationProperty } from '@/lib/types';
import { PricingStudio } from './pricing-studio';
import { warmAddressSearch } from '@/lib/address-search-client';
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
  snapshot: {
    salesFetchedAt: string;
    lastRecordedSale: string | null;
    parcelsFetchedAt: string;
    salesSha256?: string;
    parcelsSha256?: string;
  };
  facts?: PropertyFacts;
  attribution: string;
};

function AddressSearch({
  onPick,
  compact,
  condos = false,
}: {
  onPick: (parcelId: string) => void;
  compact?: boolean;
  condos?: boolean;
}) {
  const api = condos ? 'dc-condos' : 'dc';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState('Type at least 3 characters to find a home.');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => warmAddressSearch(api), [api]);
  const changeQuery = (value: string) => {
    // Invalidate immediately, including when a query is cleared before the effect runs.
    request.current += 1;
    setQuery(value);
    setResults([]);
    setFailed(false);
    setBusy(value.trim().length >= 3);
    setStatus(value.trim().length >= 3 ? 'Searching DC public records…' : 'Type at least 3 characters to find a home.');
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
    setStatus('Searching DC public records…');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/${api}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search request failed.');
        const body = await response.json();
        if (!Array.isArray(body.results)) throw new Error('Search returned an unexpected response.');
        if (!active || id !== request.current) return;
        const found: SearchResult[] = body.results;
        setResults(found);
        setStatus(
          found.length
            ? `${found.length} matching DC home${found.length === 1 ? '' : 's'}. Choose an address to see its analysis.`
            : condos
              ? 'No matching condo in these records. Try the building address and unit number. Only units with an unambiguous public-record address are covered.'
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
  }, [query, retry, api]);
  return (
    <section className={`dc-search ${compact ? 'compact' : ''}`} aria-label="Find a DC home">
      <label htmlFor="dc-address">Street address in Washington, DC</label>
      <div className="dc-search-field">
        <Search size={18} aria-hidden="true" />
        <input
          ref={field}
          id="dc-address"
          type="search"
          autoComplete="off"
          placeholder={
            condos
              ? 'Building address and unit, e.g. 2123 California NW Unit D1'
              : 'House number and street, e.g. 313 Shepherd St NW'
          }
          value={query}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') changeQuery('');
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              list.current?.querySelector('button')?.focus();
            }
          }}
          aria-describedby="dc-search-status"
          aria-controls={results.length ? 'dc-search-results' : undefined}
        />
        {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      </div>
      <p id="dc-search-status" className="fine" role="status">
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
              changeQuery(condos ? '2123 California' : '313 Shepherd');
              field.current?.focus();
            }}
          >
            Try an example address <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {results.length > 0 && (
        <ul className="dc-results" id="dc-search-results" ref={list} aria-label="Matching DC homes">
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
export function DcPricingStudio({ condos = false }: { condos?: boolean }) {
  const api = condos ? 'dc-condos' : 'dc';
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
    fetch(`/api/${api}/property?parcel=${encodeURIComponent(parcel)}`, { signal: controller.signal })
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
  }, [parcel, retry, api]);
  const evidence = useMemo(
    () =>
      data
        ? {
            subject: data.subject,
            candidates: data.candidates,
            sources: data.sources,
            asOf: data.asOf,
            snapshot: data.snapshot,
            facts: data.facts,
          }
        : null,
    [data],
  );
  const defaultState = useMemo(() => (condos ? condoDefaultState() : dcDefaultState()), [condos]);
  if (data && evidence && !loading)
    return (
      <PricingStudio
        key={data.parcelId}
        resultFirst
        evidence={evidence}
        defaultState={defaultState}
        storageKey={`ascent.${api}-studio.${condos ? 'v2' : 'v1'}.${data.parcelId}`}
        reportHref={(state, format) =>
          condos ? condoReportHref(data.parcelId, state, format) : dcReportHref(data.parcelId, state, format)
        }
        conditionMax={DC_CONDITION_MAX}
        conditionLabels={DC_CONDITION_LABELS}
        calibrated={!condos}
        before={
          <>
            <AddressSearch compact onPick={pick} condos={condos} />
            {condos && (
              <div>
                <p className="error-box" data-testid="condo-unvalidated">
                  {CONDO_ACCURACY_NOTICE}
                </p>
                <details>
                  <summary>See the condo accuracy results</summary>
                  <AccuracyScorecard benchmark={condoBenchmark} />
                </details>
              </div>
            )}
          </>
        }
        intro={{
          eyebrow: 'DISTRICT OF COLUMBIA PUBLIC RECORDS',
          titleTop: condos ? 'Price a DC condo.' : 'Price a real DC home.',
          titleBottom: 'See the sales behind the price.',
          lede: condos
            ? 'Search a unit, inspect recorded condo sales, and build a draft. Condo accuracy failed its separate test; no calibrated range is shown.'
            : 'Review the recorded sales, test your assumptions, and build a report. Based on District public records; not an appraisal.',
          badgeTitle: 'Real public records',
          badgeLines: [
            'District of Columbia data, CC BY 4.0',
            `Sales recorded through ${data.snapshot.lastRecordedSale ? date(data.snapshot.lastRecordedSale) : 'the snapshot date'}`,
          ],
        }}
        subjectEyebrow={`SUBJECT · WASHINGTON, DC ${data.subject.zip}`}
        evidenceNote={`Recorded sales as of ${date(data.asOf)} · the newest weeks may not be recorded yet · ${data.candidates.length} recorded sales within ${condos ? 3 : 2} miles in the past year`}
        passport={{
          facts: condos
            ? 'Unit address, recorded bedrooms, baths and living area come from the District’s condominium assessment records, joined to building address points, with the condominium’s name and units, rooms, systems and permits for the unit and its building since 2016. Prices are District-qualified recorded transfers. No condition field is provided.'
            : "Address, coordinates, living area, bedrooms, baths and the assessor's condition grade come from District records, with structure type, construction grade, effective age, systems and lot. Building permits since 2016 are listed in the brief. Comparable prices and dates are recorded deed transfers the District marks as ordinary market sales.",
          assumptions: condos
            ? 'Condo-specific fitted rates and search filters. Condition adjustment is fixed to zero. The condo holdout failed acceptance; DC single-family accuracy does not apply.'
            : "Adjustment rates, the trend and the search filters start at the DC-validated settings fitted on earlier recorded sales. The assessor's condition grade is not an inspection.",
          missing: MISSING_EVIDENCE[condos ? 'dc-condos' : 'dc'],
          footnote: `${data.attribution} Ascent joined and filtered these records; see the provenance files in the repository.`,
        }}
        reportNote="Draft · District public records · not reviewed by a licensed professional"
        footerNote="District of Columbia public records (CC BY 4.0) · deterministic engine · no account required"
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
              {condos ? 'Price a DC condo.' : 'Price a real DC home.'}
              <br />
              <span>See the sales behind the price.</span>
            </h1>
            <p>
              {condos
                ? CONDO_ACCURACY_NOTICE
                : 'Find a single-family home in District records. Review comparable sales, test a price, and open your report.'}
            </p>
          </div>
          <div className="studio-sample-label">
            <ShieldCheck size={20} />
            <strong>Real public records</strong>
            <span>
              District of Columbia data, CC BY 4.0
              <br />
              Free to explore · no account needed
            </span>
          </div>
        </div>
        <AddressSearch onPick={pick} condos={condos} />
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
              <strong>Covered:</strong>{' '}
              {condos ? (
                'residential condos in Washington, DC with one unambiguous unit address, priced only from recorded condo sales.'
              ) : (
                <>
                  single-family homes in Washington, DC with an active street address, priced from recorded sales the
                  District marks as ordinary market sales (not between relatives or other related parties).
                </>
              )}
            </li>
            <li>
              {condos ? (
                <>
                  <strong>Unmeasured:</strong> {CONDO_ACCURACY_NOTICE}
                </>
              ) : (
                <>
                  <strong>Measured:</strong> with the tested DC settings, the typical (median) error was{' '}
                  {(dcBenchmark.primary.mdape * 100).toFixed(1)}% on {dcBenchmark.holdout.sales.toLocaleString('en-US')}{' '}
                  past sales kept out of building the method. Changing a setting means that figure no longer applies.
                </>
              )}
            </li>
            <li>
              <strong>Not covered:</strong>{' '}
              {condos
                ? 'co-ops, commercial or combined units, ambiguous unit addresses, condition, HOA information and a validated condo range.'
                : 'multi-unit buildings, other jurisdictions, MLS listing history, concessions and interior condition.'}
            </li>
          </ul>
          <p className="fine">
            {condos ? (
              <Link href="/dc">Single-family DC homes</Link>
            ) : (
              <Link href="/dc/condos">Search DC condos (unvalidated)</Link>
            )}
            . In Maryland? <Link href="/maryland">Search Montgomery and Prince George’s homes</Link>. Want to practice
            first? <Link href="/demo">Open the fictional sample</Link> instead.
          </p>
        </section>
      </main>
    </div>
  );
}
