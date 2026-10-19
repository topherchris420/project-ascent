'use client';
import '@/app/home-search.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Building2, Home, LoaderCircle, Search, X } from 'lucide-react';
import { warmAddressSearch } from '@/lib/address-search-client';
import { number } from './format';

/**
 * One address box for every covered public-record market. Each market's existing search endpoint is queried in
 * parallel, results appear as each answers, and choosing one opens that market's studio for the parcel.
 */
type Api = 'dc' | 'dc-condos' | 'maryland';
type Found = {
  parcelId: string;
  address: string;
  zip: string;
  sqft: number;
  beds?: number;
  baths?: number;
  city?: string;
  county?: string;
};
type Market = { api: Api; label: string; studio: string; detail: (home: Found) => string };

const rooms = (home: Found) => (home.beds === undefined ? '' : ` · ${home.beds} bd · ${home.baths} ba`);
const MARKETS: readonly Market[] = [
  {
    api: 'dc',
    label: 'Washington, DC · houses and rowhomes',
    studio: '/dc',
    detail: home => `Washington, DC ${home.zip}${rooms(home)} · ${number(home.sqft)} sq ft`,
  },
  {
    api: 'dc-condos',
    label: 'Washington, DC · condominiums',
    studio: '/dc/condos',
    detail: home => `Condo · Washington, DC ${home.zip}${rooms(home)} · ${number(home.sqft)} sq ft`,
  },
  {
    api: 'maryland',
    label: 'Montgomery and Prince George’s counties, MD',
    studio: '/maryland',
    detail: home =>
      `${home.city ? `${home.city}, ` : ''}MD ${home.zip} · ${home.county} County · ${number(home.sqft)} sq ft`,
  },
];
const PER_MARKET = 5;
const VIRGINIA =
  /\b(VA|VIRGINIA|ARLINGTON|ALEXANDRIA|FAIRFAX|LOUDOUN|MCLEAN|RESTON|VIENNA|FALLS CHURCH)\b|\b(201\d\d|2[234]\d\d\d)\b/i;

type Answer = { status: 'loading' | 'done' | 'failed'; results: Found[] };
const idle = (): Record<Api, Answer> => ({
  dc: { status: 'done', results: [] },
  'dc-condos': { status: 'done', results: [] },
  maryland: { status: 'done', results: [] },
});
const loading = (): Record<Api, Answer> => ({
  dc: { status: 'loading', results: [] },
  'dc-condos': { status: 'loading', results: [] },
  maryland: { status: 'loading', results: [] },
});

export const studioHref = (studio: string, parcelId: string) => `${studio}?parcel=${encodeURIComponent(parcelId)}`;

export function HomeSearch({ id = 'home-address', autoFocus = false }: { id?: string; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const [answers, setAnswers] = useState(idle);
  const [retry, setRetry] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const term = query.trim();
  const warm = () => MARKETS.forEach(market => warmAddressSearch(market.api));
  const changeQuery = (value: string) => {
    // Clear old results synchronously, before any in-flight reply or effect cleanup.
    if (value.trim() !== term) {
      request.current += 1;
      setAnswers(value.trim().length >= 3 ? loading() : idle());
    }
    setQuery(value);
  };

  useEffect(() => {
    const sequence = ++request.current;
    if (term.length < 3) {
      setAnswers(idle());
      return;
    }
    const controller = new AbortController();
    let active = true;
    setAnswers(loading());
    const timer = setTimeout(async () => {
      // Keep successful markets visible if another market stalls or fails.
      const deadline = setTimeout(() => controller.abort(), 30000);
      try {
        await Promise.all(
          MARKETS.map(async market => {
            let answer: Answer;
            try {
              const response = await fetch(`/api/${market.api}/search?q=${encodeURIComponent(term)}`, {
                signal: controller.signal,
              });
              const body = await response.json();
              if (
                !response.ok ||
                !Array.isArray(body.results) ||
                !body.results.every(
                  (home: Found) =>
                    home &&
                    typeof home.parcelId === 'string' &&
                    typeof home.address === 'string' &&
                    typeof home.zip === 'string' &&
                    typeof home.sqft === 'number' &&
                    (home.city === undefined || typeof home.city === 'string') &&
                    (home.county === undefined || typeof home.county === 'string'),
                )
              )
                throw new Error('Search failed.');
              answer = { status: 'done', results: body.results.slice(0, PER_MARKET) };
            } catch {
              answer = { status: 'failed', results: [] };
            }
            if (active && sequence === request.current) setAnswers(current => ({ ...current, [market.api]: answer }));
          }),
        );
      } finally {
        clearTimeout(deadline);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, retry]);

  const pending = MARKETS.filter(market => answers[market.api].status === 'loading');
  const failed = MARKETS.filter(market => answers[market.api].status === 'failed');
  const groups = MARKETS.filter(market => answers[market.api].results.length);
  const count = groups.reduce((sum, market) => sum + answers[market.api].results.length, 0);
  const status =
    term.length < 3
      ? 'Type at least 3 characters of a street address.'
      : count
        ? `${count} matching ${count === 1 ? 'home' : 'homes'}${pending.length ? ', still searching' : ''}. Choose one to open its analysis.`
        : pending.length
          ? 'Searching DC and Maryland public records…'
          : failed.length === MARKETS.length
            ? 'Search is unavailable right now. Retry, or explore the fictional sample.'
            : failed.length
              ? 'No matches in the available records. Some areas could not be searched; retry to check them.'
              : 'No covered home matches this address.';
  const focusResult = (step: number) => {
    const links = [...(list.current?.querySelectorAll('a') ?? [])];
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (at + step < 0) field.current?.focus();
    else links[Math.min(links.length - 1, at + step)]?.focus();
  };

  return (
    <section className="home-search" aria-label="Look up a home">
      <label htmlFor={id}>Your home’s street address</label>
      <div className="home-search-field">
        <Search size={19} aria-hidden="true" />
        <input
          ref={field}
          id={id}
          type="search"
          autoComplete="off"
          maxLength={100}
          enterKeyHint="search"
          autoFocus={autoFocus}
          placeholder="e.g. 313 Shepherd St NW"
          value={query}
          onFocus={warm}
          onPointerEnter={warm}
          onChange={e => changeQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') changeQuery('');
            if (e.key === 'ArrowDown' && count) {
              e.preventDefault();
              focusResult(1);
            }
          }}
          aria-describedby={`${id}-status`}
          aria-controls={count ? `${id}-results` : undefined}
        />
        {pending.length > 0 && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
        {query && (
          <button
            className="home-search-clear"
            type="button"
            aria-label="Clear address"
            onClick={() => {
              changeQuery('');
              field.current?.focus();
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <p id={`${id}-status`} className="home-search-status" role="status">
        {status}
      </p>
      {!term && (
        <div className="home-search-examples" role="group" aria-label="Try an example address">
          <span>Try an example:</span>
          {[
            { label: 'DC house', address: '313 Shepherd' },
            { label: 'Maryland home', address: '7300 Maple' },
            { label: 'DC condo', address: '2123 California' },
          ].map(example => (
            <button
              key={example.label}
              type="button"
              onClick={() => {
                changeQuery(example.address);
                field.current?.focus();
              }}
            >
              {example.label} <ArrowRight size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {term.length >= 3 && failed.length > 0 && (
        <div className="home-search-note">
          {failed.length < MARKETS.length && (
            <span>{failed.map(market => market.label).join(' and ')}: search unavailable.</span>
          )}
          <button type="button" onClick={() => setRetry(value => value + 1)}>
            Retry search
          </button>
        </div>
      )}
      {groups.length > 0 && (
        <div
          className="home-search-results"
          id={`${id}-results`}
          ref={list}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              focusResult(e.key === 'ArrowDown' ? 1 : -1);
            }
            if (e.key === 'Escape') {
              changeQuery('');
              field.current?.focus();
            }
          }}
        >
          {groups.map(market => (
            <div key={market.api} className="home-search-group">
              <p className="home-search-market">{market.label}</p>
              <ul aria-label={`Matching homes: ${market.label}`}>
                {answers[market.api].results.map(home => (
                  <li key={home.parcelId}>
                    <Link prefetch={false} href={studioHref(market.studio, home.parcelId)}>
                      {market.api === 'dc-condos' ? (
                        <Building2 size={16} aria-hidden="true" />
                      ) : (
                        <Home size={16} aria-hidden="true" />
                      )}
                      <span>
                        <strong>{home.address}</strong>
                        <small>{market.detail(home)}</small>
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {term.length >= 3 && !count && !pending.length && failed.length < MARKETS.length && (
        <div className="home-search-empty">
          <p>
            Ascent covers single-family homes and condos in Washington, DC, and houses and townhouses in Montgomery and
            Prince George’s counties, Maryland. Try the house number and street name without the unit or ZIP code.
          </p>
          {VIRGINIA.test(term) && (
            <p>
              Virginia is not covered yet. Northern Virginia’s counties do not publish their recorded sales under terms
              that clearly allow this use, so Ascent does not copy them.
            </p>
          )}
          <p>
            <Link href="/demo">Practise with the fictional sample</Link> or{' '}
            <Link href="/accuracy">read what each market’s test showed</Link>.
          </p>
        </div>
      )}
    </section>
  );
}
