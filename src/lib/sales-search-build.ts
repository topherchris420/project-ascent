/**
 * Builds the /sales snapshot from the bundled DC, DC condo and Maryland snapshots: one row per recorded sale with the
 * address fields the search shows. The page then reads a few megabytes instead of every property table (about 600,000
 * parcels). Run `npm run datasets:sales-search` after any of those snapshots changes; tests/sales-search-snapshot fails
 * until it is rebuilt.
 */
import { createHash } from 'node:crypto';
import { dcData } from './providers/dc-public-records';
import { condoData } from './providers/dc-condo-public-records';
import { marylandData } from './providers/maryland-public-records';
import {
  MARYLAND_MIN_PRICE,
  salesMarkets,
  type MarylandCounty,
  type SalesMarket,
  type SalesRecord,
} from './market-search';
import { encodeSalesSnapshot, type SalesSnapshotProvenance } from './market-search-data';

export function buildSalesRecords() {
  const dc = dcData(),
    condos = condoData(),
    maryland = marylandData();
  const sales: SalesRecord[] = [];
  for (const sale of dc.sales)
    sales.push({
      market: 'dc',
      saleId: sale.saleId,
      parcelId: sale.parcelId,
      soldOn: sale.soldOn,
      price: sale.price,
      beds: sale.beds,
      baths: sale.baths,
      sqft: sale.sqft > 0 ? sale.sqft : null,
      zip: sale.zip,
      address: dc.parcels.get(sale.parcelId)?.address ?? null,
      city: null,
      county: null,
    });
  for (const sale of condos.sales)
    sales.push({
      market: 'dc-condos',
      saleId: sale.saleId,
      parcelId: sale.parcelId,
      soldOn: sale.soldOn,
      price: sale.price,
      beds: sale.beds,
      baths: sale.baths,
      sqft: sale.sqft > 0 ? sale.sqft : null,
      zip: sale.zip,
      address: condos.parcels.get(sale.parcelId)?.address ?? null,
      city: null,
      county: null,
    });
  for (const sale of maryland.sales) {
    if (sale.price < MARYLAND_MIN_PRICE) continue;
    const parcel = maryland.parcels.get(sale.parcelId);
    sales.push({
      market: 'maryland',
      saleId: sale.saleId,
      parcelId: sale.parcelId,
      soldOn: sale.soldOn,
      price: sale.price,
      // The State's records carry no room counts; null keeps them out of any bedroom or bathroom filter.
      beds: null,
      baths: null,
      sqft: sale.sqft > 0 ? sale.sqft : null,
      zip: sale.zip,
      address: parcel?.address ?? null,
      city: parcel?.city ?? null,
      county: parcel?.county === 'MONT' || parcel?.county === 'PRIN' ? (parcel.county as MarylandCounty) : null,
    });
  }
  const text = encodeSalesSnapshot(sales);
  const firstSale = Object.fromEntries(salesMarkets.map(market => [market, '9999-12-31'])) as Record<
    SalesMarket,
    string
  >;
  const lastSale = Object.fromEntries(salesMarkets.map(market => [market, ''])) as Record<SalesMarket, string>;
  for (const sale of sales) {
    if (sale.soldOn < firstSale[sale.market]) firstSale[sale.market] = sale.soldOn;
    if (sale.soldOn > lastSale[sale.market]) lastSale[sale.market] = sale.soldOn;
  }
  const provenance: SalesSnapshotProvenance = {
    datasetId: 'sales-search',
    title: 'Recorded sales with their addresses, joined from the bundled DC, DC condo and Maryland snapshots',
    builtBy: 'npm run datasets:sales-search (src/lib/sales-search-build.ts)',
    sources: {
      dc: { sales: dc.salesProvenance.csvSha256, properties: dc.parcelsProvenance.csvSha256 },
      'dc-condos': { sales: condos.salesProvenance.csvSha256, properties: condos.salesProvenance.propertyCsvSha256 },
      maryland: { sales: maryland.provenance.csvSha256, properties: maryland.provenance.propertyCsvSha256 },
    },
    attribution: {
      dc: dc.salesProvenance.attribution,
      'dc-condos': condos.salesProvenance.attribution,
      maryland: maryland.provenance.attribution,
    },
    firstSale,
    lastSale,
    rows: sales.length,
    jsonSha256: createHash('sha256').update(text).digest('hex'),
  };
  return { text, provenance };
}
