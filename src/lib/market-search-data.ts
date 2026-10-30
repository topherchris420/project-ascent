import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  describeFilters,
  longDay,
  parseSalesQuery,
  salesMarketLabels,
  salesMarkets,
  salesWindow,
  summarizeSales,
  type MarylandCounty,
  type SalesMarket,
  type SalesRecord,
  type SortOrder,
} from './market-search';

/**
 * Server-only: the /sales snapshot, one row per recorded sale with its address, built from the bundled DC, DC condo and
 * Maryland snapshots by src/lib/sales-search-build.ts. Reading it costs a few megabytes; joining the full property
 * tables on each cold server instance cost seconds and hundreds of megabytes.
 */
export const SALES_SNAPSHOT_DIR = join(process.cwd(), 'src', 'datasets', 'sales-search');
export const SALES_SNAPSHOT_FILE = 'sales-search.json.gz';
export const SALES_SNAPSHOT_PROVENANCE = 'sales-search.provenance.json';

export type SalesSnapshotProvenance = {
  datasetId: 'sales-search';
  title: string;
  builtBy: string;
  /** Fingerprints of the bundled snapshots this one was built from. */
  sources: Record<SalesMarket, { sales: string; properties: string }>;
  attribution: Record<SalesMarket, string>;
  firstSale: Record<SalesMarket, string>;
  lastSale: Record<SalesMarket, string>;
  rows: number;
  jsonSha256: string;
};

type SnapshotRow = [
  SalesMarket,
  string,
  string,
  string,
  number,
  number | null,
  number | null,
  number | null,
  string,
  string | null,
  string | null,
  MarylandCounty | null,
];
/** One sale per line in a fixed column order, so the text and its fingerprint are the same on every platform. */
export const encodeSalesSnapshot = (sales: readonly SalesRecord[]) =>
  `[\n${sales
    .map(sale =>
      JSON.stringify([
        sale.market,
        sale.saleId,
        sale.parcelId,
        sale.soldOn,
        sale.price,
        sale.beds,
        sale.baths,
        sale.sqft,
        sale.zip,
        sale.address,
        sale.city,
        sale.county,
      ] satisfies SnapshotRow),
    )
    .join(',\n')}\n]\n`;

let provenance: SalesSnapshotProvenance | undefined;
/** Sources and dates only; cheap enough for a page that has not searched yet. */
export function salesSnapshotProvenance() {
  provenance ??= JSON.parse(
    readFileSync(join(SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_PROVENANCE), 'utf8'),
  ) as SalesSnapshotProvenance;
  return provenance;
}

let cache: { sales: SalesRecord[]; cities: string[]; zipsByMarket: Record<SalesMarket, Set<string>> } | undefined;

function salesIndex() {
  if (cache) return cache;
  const { jsonSha256 } = salesSnapshotProvenance();
  const bytes = gunzipSync(readFileSync(join(SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_FILE)));
  if (createHash('sha256').update(bytes).digest('hex') !== jsonSha256)
    throw new Error('The /sales snapshot does not match its provenance. Run: npm run datasets:sales-search');
  const rows = JSON.parse(bytes.toString('utf8')) as SnapshotRow[];
  const sales = rows.map(
    ([market, saleId, parcelId, soldOn, price, beds, baths, sqft, zip, address, city, county]): SalesRecord => ({
      market,
      saleId,
      parcelId,
      soldOn,
      price,
      beds,
      baths,
      sqft,
      zip,
      address,
      city,
      county,
    }),
  );
  const zipsByMarket = Object.fromEntries(salesMarkets.map(market => [market, new Set<string>()])) as Record<
    SalesMarket,
    Set<string>
  >;
  const cities = new Set<string>();
  for (const sale of sales) {
    if (sale.zip) zipsByMarket[sale.market].add(sale.zip);
    if (sale.city) cities.add(sale.city);
  }
  cache = { sales, cities: [...cities], zipsByMarket };
  return cache;
}

export function recordedSalesSources() {
  const { attribution, lastSale } = salesSnapshotProvenance();
  return salesMarkets.map(market => ({ market, latestSale: lastSale[market], attribution: attribution[market] }));
}

export function searchRecordedSales(query: string, sort: SortOrder = 'newest') {
  const index = salesIndex();
  const { firstSale, lastSale } = salesSnapshotProvenance();
  const overall = salesMarkets
    .map(market => lastSale[market])
    .sort()
    .at(-1)!;
  const parsed = parseSalesQuery(query, { marylandCities: index.cities, zipsByMarket: index.zipsByMarket }, overall);
  // Relative windows end at the newest sale in the markets actually searched, so a later DC snapshot does not
  // quietly shorten a Maryland-only window.
  const latest =
    parsed.filters.markets
      .map(market => lastSale[market])
      .sort()
      .at(-1) ?? overall;
  if (latest !== overall) parsed.readBack = describeFilters(parsed.filters, latest);
  const window = salesWindow(parsed.filters, latest);
  for (const market of parsed.filters.markets)
    if (window.since < firstSale[market])
      parsed.notes.push(
        `${salesMarketLabels[market]} in Ascent’s records start ${longDay(firstSale[market])}; there are no earlier sales to show.`,
      );
  const summary = summarizeSales(index.sales, parsed.filters, latest, sort);
  return { parsed, summary, snapshots: recordedSalesSources() };
}
