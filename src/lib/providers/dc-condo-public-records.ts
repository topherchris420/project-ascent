import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { condoDefaultState, CONDO_ACCURACY_NOTICE } from '../dc-condo-studio';
import type { Source, ValuationProperty } from '../types';
import { csvRecords, displayDcAddress, normalizeDcAddress } from './dc-public-records';
import { compareAddressKeys, firstByOrder, lazyAddressIndex } from './address-index';

const directory = join(process.cwd(), 'src/datasets/dc-condos');
export const CONDO_SOURCE_ID = 'source-dc-condo-public-records';
type Condo = {
  parcelId: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  marId: string;
};
type Sale = Omit<Condo, 'address' | 'yearBuilt' | 'marId'> & { saleId: string; soldOn: string; price: number };
type Provenance = {
  fetchedAt: string;
  attribution: string;
  propertyCsvSha256: string;
  csvSha256: string;
  rows: number;
  properties: number;
  lastSale: string;
};
let cache:
  | {
      parcels: Map<string, Condo>;
      index: ReturnType<typeof lazyAddressIndex>;
      sales: Sale[];
      salesProvenance: Provenance;
    }
  | undefined;
export function condoData() {
  if (cache) return cache;
  const provenance = JSON.parse(readFileSync(join(directory, 'dc-condos.provenance.json'), 'utf8')) as Provenance;
  const records = (file: string, expected: string) => {
    const bytes = gunzipSync(readFileSync(join(directory, file)));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Condo snapshot fingerprint mismatch.');
    return csvRecords(bytes.toString('utf8'));
  };
  const parcels = new Map<string, Condo>();
  for (const row of records('dc-condo-properties.csv.gz', provenance.propertyCsvSha256)) {
    const condo = {
      parcelId: row.parcel_id,
      address: row.address,
      zip: row.zip,
      lat: +row.lat,
      lng: +row.lng,
      beds: +row.beds,
      baths: +row.baths,
      sqft: +row.sqft,
      yearBuilt: +row.year_built,
      marId: row.mar_id,
    };
    parcels.set(condo.parcelId, condo);
  }
  const sales = records('dc-condo-sales.csv.gz', provenance.csvSha256).map(row => ({
    parcelId: row.parcel_id,
    saleId: row.sale_id,
    soldOn: row.sold_on,
    price: +row.price,
    zip: row.zip,
    lat: +row.lat,
    lng: +row.lng,
    beds: +row.beds,
    baths: +row.baths,
    sqft: +row.sqft,
  }));
  if (parcels.size !== provenance.properties || sales.length !== provenance.rows)
    throw new Error('Incomplete condo snapshot.');
  const index = lazyAddressIndex(() =>
    [...parcels.values()].map(condo => ({ key: normalizeDcAddress(condo.address), parcelId: condo.parcelId })),
  );
  cache = { parcels, index, sales, salesProvenance: provenance };
  return cache;
}
export function searchCondoAddresses(query: string, limit = 8) {
  const wanted = normalizeDcAddress(query);
  if (wanted.length < 3) return [];
  const terms = wanted.split(' ');
  const { parcels } = condoData();
  const index = condoData().index();
  return firstByOrder(
    index.matches(terms).map(position => index.entries[position]),
    limit,
    (a, b) => Number(!a.key.startsWith(wanted)) - Number(!b.key.startsWith(wanted)) || compareAddressKeys(a.key, b.key),
  ).map(({ parcelId }) => {
    const condo = parcels.get(parcelId)!;
    return {
      parcelId,
      address: displayDcAddress(condo.address),
      zip: condo.zip,
      beds: condo.beds,
      baths: condo.baths,
      sqft: condo.sqft,
    };
  });
}
export function condoValuationInputs(parcelId: string) {
  const { parcels, sales, salesProvenance } = condoData();
  const parcel = parcels.get(parcelId);
  if (!parcel) return null;
  const asOf = salesProvenance.fetchedAt;
  const subject: ValuationProperty = {
    id: `dc-condo-parcel-${parcelId}`,
    address: displayDcAddress(parcel.address),
    city: 'Washington',
    state: 'DC',
    zip: parcel.zip,
    lat: parcel.lat,
    lng: parcel.lng,
    beds: parcel.beds,
    baths: parcel.baths,
    sqft: parcel.sqft,
    yearBuilt: parcel.yearBuilt || undefined,
    sourceId: CONDO_SOURCE_ID,
    propertyType: 'condominium',
  };
  const candidates: ValuationProperty[] = sales
    .filter(sale => {
      const age = (Date.parse(asOf) - Date.parse(`${sale.soldOn}T00:00:00Z`)) / 86400000;
      return sale.parcelId !== parcelId && age >= 0 && age <= 365 && distanceMiles(parcel, sale) <= 3;
    })
    .map(sale => ({
      ...subject,
      id: sale.saleId,
      address: displayDcAddress(parcels.get(sale.parcelId)!.address),
      beds: sale.beds,
      baths: sale.baths,
      sqft: sale.sqft,
      lat: sale.lat,
      lng: sale.lng,
      zip: sale.zip,
      yearBuilt: parcels.get(sale.parcelId)!.yearBuilt || undefined,
      status: 'sold',
      soldAt: `${sale.soldOn}T00:00:00.000Z`,
      soldPrice: sale.price,
    }));
  subject.history = recordedHistory(parcelId, sales, asOf);
  const source: Source = {
    id: CONDO_SOURCE_ID,
    kind: 'public',
    label: 'DC condominium public records (CC BY 4.0)',
    observedAt: asOf,
    confidence: 0,
    license: `${salesProvenance.attribution} ${CONDO_ACCURACY_NOTICE} Coordinates identify building addresses, not unit floors. Current assessor characteristics; recordings lag closing.`,
  };
  return {
    parcel,
    subject,
    candidates,
    sources: [source],
    asOf,
    assumptions: condoDefaultState().assumptions,
    snapshot: {
      salesFetchedAt: asOf,
      parcelsFetchedAt: asOf,
      lastRecordedSale: salesProvenance.lastSale,
      salesSha256: salesProvenance.csvSha256,
      parcelsSha256: salesProvenance.propertyCsvSha256,
    },
    attribution: salesProvenance.attribution,
  };
}
