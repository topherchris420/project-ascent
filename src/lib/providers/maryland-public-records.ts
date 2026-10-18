import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { marylandBenchmark, marylandDefaultState } from '../maryland-studio';
import type { Source, ValuationProperty } from '../types';
import { parseCsv, displayDcAddress, normalizeDcAddress } from './dc-public-records';

export const MD_SOURCE_ID = 'source-maryland-public-records';
const directory = join(process.cwd(), 'src/datasets/maryland');
type Parcel = {
  parcelId: string;
  address: string;
  city: string;
  county: string;
  zip: string;
  lat: number;
  lng: number;
  sqft: number;
  grade: number;
  yearBuilt: number;
};
type Sale = {
  saleId: string;
  parcelId: string;
  soldOn: string;
  price: number;
  sqft: number;
  grade: number;
  lat: number;
  lng: number;
  zip: string;
};
type Provenance = {
  fetchedAt: string;
  attribution: string;
  csvSha256: string;
  propertyCsvSha256: string;
  rows: number;
  properties: number;
  lastSale: string;
};
let cached:
  | { parcels: Map<string, Parcel>; index: { key: string; parcelId: string }[]; sales: Sale[]; provenance: Provenance }
  | undefined;
const normalize = (value: string) => normalizeDcAddress(value.replace(/\bMARYLAND\b|\bMD\b/gi, ''));

export function marylandData() {
  if (cached) return cached;
  const provenance = JSON.parse(readFileSync(join(directory, 'maryland.provenance.json'), 'utf8')) as Provenance;
  const records = (file: string, expected: string) => {
    const bytes = gunzipSync(readFileSync(join(directory, file)));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Maryland snapshot fingerprint mismatch.');
    const [header, ...rows] = parseCsv(bytes.toString('utf8'));
    return rows.map(cells => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ''])));
  };
  if (provenance.csvSha256 !== marylandBenchmark.dataset.csvSha256)
    throw new Error('Maryland sales have changed; revalidation is required.');
  const parcels = new Map<string, Parcel>();
  const index: { key: string; parcelId: string }[] = [];
  for (const row of records('maryland-properties.csv.gz', provenance.propertyCsvSha256)) {
    const parcel = {
      parcelId: row.parcel_id,
      address: row.address,
      city: row.city,
      county: row.county,
      zip: row.zip,
      lat: +row.lat,
      lng: +row.lng,
      sqft: +row.sqft,
      grade: +row.grade,
      yearBuilt: +row.year_built,
    };
    parcels.set(parcel.parcelId, parcel);
    index.push({ key: normalize(`${parcel.address} ${parcel.city} ${parcel.zip}`), parcelId: parcel.parcelId });
  }
  const sales = records('maryland-sales.csv.gz', provenance.csvSha256).map(row => ({
    saleId: row.sale_id,
    parcelId: row.parcel_id,
    soldOn: row.sold_on,
    price: +row.price,
    sqft: +row.sqft,
    grade: +row.condition,
    lat: +row.lat,
    lng: +row.lng,
    zip: row.zip,
  }));
  if (parcels.size !== provenance.properties || sales.length !== provenance.rows)
    throw new Error('Incomplete Maryland snapshot.');
  cached = { parcels, index, sales, provenance };
  return cached;
}

export function searchMarylandAddresses(query: string, limit = 8) {
  const wanted = normalize(query);
  if (wanted.length < 3) return [];
  const terms = wanted.split(' ');
  const { parcels, index } = marylandData();
  return index
    .filter(entry => {
      const words = entry.key.split(' ');
      return terms.every((term, i) =>
        i === terms.length - 1 ? words.some(word => word.startsWith(term)) : words.includes(term),
      );
    })
    .sort(
      (a, b) =>
        Number(!a.key.startsWith(wanted)) - Number(!b.key.startsWith(wanted)) ||
        a.key.localeCompare(b.key, 'en', { numeric: true }),
    )
    .slice(0, limit)
    .map(({ parcelId }) => {
      const parcel = parcels.get(parcelId)!;
      return {
        parcelId,
        address: displayDcAddress(parcel.address),
        city: displayDcAddress(parcel.city),
        county: parcel.county === 'MONT' ? 'Montgomery' : 'Prince George’s',
        zip: parcel.zip,
        sqft: parcel.sqft,
      };
    });
}

export function marylandValuationInputs(parcelId: string) {
  const { parcels, sales, provenance } = marylandData();
  const parcel = parcels.get(parcelId);
  if (!parcel) return null;
  const asOf = provenance.fetchedAt;
  const makeProperty = (home: Parcel): ValuationProperty => ({
    id: `md-parcel-${home.parcelId}`,
    address: displayDcAddress(home.address),
    city: displayDcAddress(home.city),
    state: 'MD',
    county: home.county,
    zip: home.zip,
    lat: home.lat,
    lng: home.lng,
    // The legacy numeric engine requires these slots. They are not observed zero rooms.
    beds: 0,
    baths: 0,
    roomCountsUnavailable: true,
    ratingKind: 'quality-grade',
    sqft: home.sqft,
    condition: home.grade,
    yearBuilt: home.yearBuilt || undefined,
    sourceId: MD_SOURCE_ID,
  });
  const subject = makeProperty(parcel);
  subject.history = recordedHistory(parcelId, sales, asOf);
  const candidates: ValuationProperty[] = sales
    .filter(sale => {
      const age = (Date.parse(asOf) - Date.parse(`${sale.soldOn}T00:00:00Z`)) / 86400000;
      return (
        sale.price >= 50000 && sale.parcelId !== parcelId && age >= 0 && age <= 365 && distanceMiles(parcel, sale) <= 3
      );
    })
    .map(sale => ({
      ...makeProperty(parcels.get(sale.parcelId)!),
      id: sale.saleId,
      sqft: sale.sqft,
      condition: sale.grade,
      lat: sale.lat,
      lng: sale.lng,
      status: 'sold',
      soldAt: `${sale.soldOn}T00:00:00.000Z`,
      soldPrice: sale.price,
    }));
  const source: Source = {
    id: MD_SOURCE_ID,
    kind: 'public',
    label: 'Maryland SDAT/MDP public-domain records',
    observedAt: asOf,
    confidence: 0,
    license: `${provenance.attribution} Montgomery and Prince George’s only. Revised model: comparable consideration must be at least $50,000. Bedrooms and bathrooms unavailable; both adjustments disabled. Quality grade is not interior condition. Current assessor characteristics; latest three transfers per parcel, incomplete older history. Not MLS data or an appraisal.`,
  };
  return {
    parcel,
    subject,
    candidates,
    asOf,
    sources: [source],
    assumptions: marylandDefaultState().assumptions,
    snapshot: {
      salesFetchedAt: asOf,
      parcelsFetchedAt: asOf,
      lastRecordedSale: provenance.lastSale,
      salesSha256: provenance.csvSha256,
      parcelsSha256: provenance.propertyCsvSha256,
    },
    attribution: provenance.attribution,
  };
}
