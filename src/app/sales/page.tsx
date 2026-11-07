import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { recordedSalesSources, searchRecordedSales } from '@/lib/market-search-data';
import {
  MAX_QUERY_LENGTH,
  MAX_ZIP_GROUPS,
  MIN_GROUP_FOR_MEDIAN,
  SALES_SEARCH_BOUNDARIES,
  salesMarketLabels,
  sortOrders,
  type SalesGroup,
  type SalesRecord,
  type SortOrder,
} from '@/lib/market-search';
import { displayDcAddress } from '@/lib/address-format';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import '../pricing-studio.css';
import '../sales.css';

export const metadata: Metadata = {
  title: 'Search recorded home sales · Ascent',
  description:
    'Ask in plain English what DC and Maryland homes sold for. Ascent reads your words back as filters and summarizes government-recorded sales: medians, price bands, months and every sale. Free, no account.',
};

const EXAMPLES = [
  '2 bed condos in 20009 under $700k in the last 6 months',
  'Houses in Silver Spring between $500k and $750k',
  '3+ bedroom houses in DC over 1,500 sq ft',
  'Prince George’s County since 2025',
];
const sortLabels: Record<SortOrder, string> = {
  newest: 'Newest first',
  'price-high': 'Highest price',
  'price-low': 'Lowest price',
  'ppsf-high': 'Highest $/sq ft',
  'ppsf-low': 'Lowest $/sq ft',
};
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const place = (sale: SalesRecord) =>
  sale.market !== 'maryland'
    ? `Washington, DC ${sale.zip}`
    : `${sale.city ? `${displayDcAddress(sale.city)}, ` : ''}MD ${sale.zip}`;
const rooms = (sale: SalesRecord) =>
  sale.beds === null
    ? 'Not recorded'
    : `${sale.beds === 0 ? (sale.market === 'dc-condos' ? 'Studio' : '0 bd') : `${sale.beds} bd`} · ${sale.baths} ba`;

/** "Not recorded" under its column heading; on a phone, where headings are gone, a phrase that names the field. */
function Unrecorded({ phone }: { phone: string }) {
  return (
    <>
      <span className="sales-cell-wide">Not recorded</span>
      <span className="sales-cell-label">{phone}</span>
    </>
  );
}

function Breakdown({ title, groups, caption }: { title: string; groups: SalesGroup[]; caption?: string }) {
  if (!groups.length) return null;
  const most = Math.max(...groups.map(group => group.count));
  return (
    <section className="sales-breakdown" aria-labelledby={`sales-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <h3 id={`sales-${title.replace(/\W+/g, '-').toLowerCase()}`}>{title}</h3>
      {caption && <p className="sales-fine">{caption}</p>}
      <table>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col" className="num">
              Sales
            </th>
            <th scope="col" className="num">
              Median price
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <tr key={group.key}>
              <th scope="row">{group.label}</th>
              <td>
                <span className="sales-count">
                  <span className="sales-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, (group.count / most) * 100)}%` }} />
                  </span>
                  <span>{group.count.toLocaleString('en-US')}</span>
                </span>
              </td>
              <td className="num">
                {group.medianPrice === null ? <span className="sales-muted">Too few</span> : usd(group.medianPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function SalesSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (typeof params.q === 'string' ? params.q : '').slice(0, MAX_QUERY_LENGTH).trim();
  const sort = (sortOrders as readonly string[]).includes(String(params.sort)) ? (params.sort as SortOrder) : 'newest';
  const result = query ? searchRecordedSales(query, sort) : null;
  const sources = result?.snapshots ?? recordedSalesSources();
  const summary = result?.summary;
  const hrefFor = (order: SortOrder) =>
    `/sales?${new URLSearchParams({ q: query, ...(order === 'newest' ? {} : { sort: order }) })}`;
  return (
    <div className="studio-page sales-page">
      <a className="skip-link" href="#sales-main">
        Skip to the sales search
      </a>
      <SiteHeader label="Recorded sales" current="sales" />
      <main id="sales-main" className="sales-main">
        <section className="sales-intro" aria-labelledby="sales-title">
          <h1 id="sales-title">What did homes like this sell for?</h1>
          <p>
            Ask in plain words. Ascent reads your question back as filters, then summarizes completed sales recorded by
            the District of Columbia and the State of Maryland. Nothing here is a listing, a prediction or a value
            estimate.
          </p>
          <form className="sales-form" action="/sales" method="get" role="search">
            <label htmlFor="sales-q">Describe the sales you want to see</label>
            <div className="sales-field">
              <Search size={20} aria-hidden="true" />
              <input
                id="sales-q"
                name="q"
                type="search"
                defaultValue={query}
                maxLength={MAX_QUERY_LENGTH}
                placeholder="2 bed condos in 20009 under $700k"
                autoComplete="off"
                enterKeyHint="search"
              />
              <button className="button primary" type="submit">
                Search
              </button>
            </div>
          </form>
          <div className="sales-examples" aria-label="Example searches">
            <span>Try:</span>
            {EXAMPLES.map(example => (
              <Link key={example} href={`/sales?${new URLSearchParams({ q: example })}`}>
                {example}
              </Link>
            ))}
          </div>
        </section>

        {result && summary && (
          <>
            <section className="sales-readback" aria-labelledby="sales-readback-title">
              <h2 id="sales-readback-title">How Ascent read “{result.parsed.query}”</h2>
              <ul className="sales-chips">
                {result.parsed.readBack.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {result.parsed.ignored.length > 0 && (
                <div className="sales-ignored">
                  <h3>Not searched</h3>
                  <ul>
                    {result.parsed.ignored.map(item => (
                      <li key={item.term}>
                        <strong>{item.term}</strong>: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.parsed.notes.map(note => (
                <p key={note} className="sales-note">
                  {note}
                </p>
              ))}
            </section>

            <section className="sales-summary" aria-labelledby="sales-summary-title" aria-live="polite">
              <h2 id="sales-summary-title" className="sr-only">
                Summary
              </h2>
              <dl className="sales-tiles">
                <div>
                  <dt>Recorded sales</dt>
                  <dd>{summary.count.toLocaleString('en-US')}</dd>
                  <dd className="sales-tile-note">
                    {day(summary.window.since)} – {day(summary.window.until)}
                  </dd>
                </div>
                <div>
                  <dt>Median sale price</dt>
                  <dd>{summary.medianPrice !== null ? usd(summary.medianPrice) : '—'}</dd>
                  <dd className="sales-tile-note">
                    {summary.lowerQuartile !== null && summary.upperQuartile !== null
                      ? `Middle half ${usd(summary.lowerQuartile)} – ${usd(summary.upperQuartile)}`
                      : `Shown from ${MIN_GROUP_FOR_MEDIAN} sales`}
                  </dd>
                </div>
                <div>
                  <dt>Median price per sq ft</dt>
                  <dd>{summary.medianPricePerSqft !== null ? usd(summary.medianPricePerSqft) : '—'}</dd>
                  <dd className="sales-tile-note">
                    {summary.withArea.toLocaleString('en-US')} sales with a recorded living area
                  </dd>
                </div>
                <div>
                  <dt>Median living area</dt>
                  <dd>
                    {summary.medianSqft !== null
                      ? `${Math.round(summary.medianSqft).toLocaleString('en-US')} sq ft`
                      : '—'}
                  </dd>
                  <dd className="sales-tile-note">As recorded by the assessor</dd>
                </div>
              </dl>
              {summary.count === 0 && (
                <p className="sales-empty">
                  No recorded sales match. Widen the price, drop a filter or try a longer window, such as “in the last 2
                  years”.
                </p>
              )}
            </section>

            {summary.count > 0 && (
              <div className="sales-breakdowns">
                <Breakdown title="By price" groups={summary.byPriceBand} />
                <Breakdown title="By month sold" groups={summary.byMonth} />
                <Breakdown
                  title="By bedrooms"
                  groups={summary.byBedrooms}
                  caption={
                    summary.byMarket.some(group => group.key === 'maryland')
                      ? 'DC sales only: Maryland records carry no bedroom counts.'
                      : undefined
                  }
                />
                {summary.byMarket.length > 1 && <Breakdown title="By record set" groups={summary.byMarket} />}
                {summary.byZip.length > 1 && (
                  <Breakdown title={`By ZIP code (${MAX_ZIP_GROUPS} busiest)`} groups={summary.byZip} />
                )}
              </div>
            )}

            {summary.count > 0 && (
              <section className="sales-list" aria-labelledby="sales-list-title">
                <div className="sales-list-head">
                  <h2 id="sales-list-title">
                    {summary.shown < summary.count
                      ? `${summary.shown} of ${summary.count.toLocaleString('en-US')} sales`
                      : `All ${summary.count.toLocaleString('en-US')} sales`}
                  </h2>
                  <nav className="sales-sort" aria-label="Sort sales">
                    {sortOrders.map(order => (
                      <Link
                        key={order}
                        href={hrefFor(order)}
                        scroll={false}
                        aria-current={order === sort ? 'true' : undefined}
                      >
                        {sortLabels[order]}
                      </Link>
                    ))}
                  </nav>
                </div>
                <div className="sales-table-wrap" tabIndex={0} role="region" aria-labelledby="sales-list-title">
                  {/* Roles keep the table's semantics where a phone layout re-flows rows into stacked cards. */}
                  <table className="sales-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th scope="col" role="columnheader">
                          Home
                        </th>
                        <th scope="col" role="columnheader">
                          Sold
                        </th>
                        <th scope="col" role="columnheader" className="num">
                          Price
                        </th>
                        <th scope="col" role="columnheader">
                          Rooms
                        </th>
                        <th scope="col" role="columnheader" className="num">
                          Living area
                        </th>
                        <th scope="col" role="columnheader" className="num">
                          $/sq ft
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {summary.rows.map(sale => (
                        <tr key={sale.saleId} role="row">
                          <th scope="row" role="rowheader" className="sales-home">
                            {sale.address ? (
                              <Link href={`/home/${sale.market}/${encodeURIComponent(sale.parcelId)}`}>
                                {displayDcAddress(sale.address)}
                              </Link>
                            ) : (
                              'Address not in snapshot'
                            )}
                            <small>
                              {place(sale)} · {salesMarketLabels[sale.market]}
                            </small>
                          </th>
                          <td role="cell" className="sales-sold">
                            <span className="sales-cell-label">Sold </span>
                            {day(sale.soldOn)}
                          </td>
                          <td role="cell" className="num sales-price">
                            {usd(sale.price)}
                          </td>
                          <td role="cell" className="sales-rooms">
                            {sale.beds === null ? <Unrecorded phone="No room count" /> : rooms(sale)}
                          </td>
                          <td role="cell" className="num sales-area">
                            {sale.sqft ? (
                              `${sale.sqft.toLocaleString('en-US')} sq ft`
                            ) : (
                              <Unrecorded phone="No living area" />
                            )}
                          </td>
                          <td role="cell" className={`num sales-psf${sale.sqft ? '' : ' is-empty'}`}>
                            {sale.sqft ? (
                              <>
                                {usd(sale.price / sale.sqft)}
                                <span className="sales-cell-label">/sq ft</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        <section className="sales-limits" aria-labelledby="sales-limits-title">
          <h2 id="sales-limits-title">What these records can and cannot tell you</h2>
          <ul>
            {SALES_SEARCH_BOUNDARIES.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h3>Sources</h3>
          <ul className="sales-sources">
            {sources.map(snapshot => (
              <li key={snapshot.market}>
                <strong>{salesMarketLabels[snapshot.market]}</strong>: {snapshot.attribution} Latest recorded sale in
                this snapshot: {day(snapshot.latestSale)}.
              </li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
