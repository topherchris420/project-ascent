import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { marylandBenchmark, marylandDefaultState, MD_GRADE_LABELS } from '../maryland-studio';
import {
  monthYear,
  montgomeryPermitRecord,
  newestFirst,
  permitBeforeSale,
  PROPERTY_FACTS_VERSION,
  MONTGOMERY_PERMIT_STATUS_NOTE,
  structureLabel,
  type PropertyFacts,
} from '../property-facts';
import type { Source, ValuationProperty } from '../types';
import { csvRecords, displayDcAddress, loadFacts, normalizeDcAddress } from './dc-public-records';
import { compareAddressKeys, firstByOrder, lazyAddressIndex } from './address-index';

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
  | { parcels: Map<string, Parcel>; index: ReturnType<typeof lazyAddressIndex>; sales: Sale[]; provenance: Provenance }
  | undefined;
const normalize = (value: string) => normalizeDcAddress(value.replace(/\bMARYLAND\b|\bMD\b/gi, ''));

export function marylandData() {
  if (cached) return cached;
  const provenance = JSON.parse(readFileSync(join(directory, 'maryland.provenance.json'), 'utf8')) as Provenance;
  const records = (file: string, expected: string) => {
    const bytes = gunzipSync(readFileSync(join(directory, file)));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Maryland snapshot fingerprint mismatch.');
    return csvRecords(bytes.toString('utf8'));
  };
  if (provenance.csvSha256 !== marylandBenchmark.dataset.csvSha256)
    throw new Error('Maryland sales have changed; revalidation is required.');
  const parcels = new Map<string, Parcel>();
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
  const index = lazyAddressIndex(() =>
    [...parcels.values()].map(parcel => ({
      key: normalize(`${parcel.address} ${parcel.city} ${parcel.zip}`),
      parcelId: parcel.parcelId,
    })),
  );
  cached = { parcels, index, sales, provenance };
  return cached;
}

export function searchMarylandAddresses(query: string, limit = 8) {
  const wanted = normalize(query);
  if (wanted.length < 3) return [];
  const terms = wanted.split(' ');
  const { parcels } = marylandData();
  const index = marylandData().index();
  return firstByOrder(
    index.matches(terms).map(position => index.entries[position]),
    limit,
    (a, b) => Number(!a.key.startsWith(wanted)) - Number(!b.key.startsWith(wanted)) || compareAddressKeys(a.key, b.key),
  ).map(({ parcelId }) => {
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

let factsCache: ReturnType<typeof loadFacts> | undefined;
/** State assessor facts and Montgomery County permits for covered parcels; loaded once, after the core snapshots. */
export function marylandFactsData() {
  factsCache ??= loadFacts(
    directory,
    'maryland-facts.provenance.json',
    'maryland-facts.csv.gz',
    'montgomery-permits.csv.gz',
  );
  return factsCache;
}
const MD_FACTS_LICENSE =
  'Public domain (Maryland SDAT/MDP; Montgomery County DPS). Joined by Ascent; not an inspection.';
const lotText = (sqft: number) =>
  `${sqft.toLocaleString('en-US')} sq ft${sqft >= 43560 ? ` (${(sqft / 43560).toFixed(2)} acres)` : ''}`;

/**
 * What state and county records show about a Maryland home beyond the valuation inputs. The estimate never uses
 * these. Permits exist for Montgomery County only; Prince George's publishes none under a stated open license.
 */
export function marylandPropertyFacts(parcel: Parcel, comparableSales: Sale[]): PropertyFacts {
  const { facts, permits, provenance, later } = marylandFactsData();
  const row = facts.row(parcel.parcelId);
  const montgomery = parcel.county === 'MONT';
  const recorded = [
    ['Dwelling type', row?.dwelling_type ? structureLabel(row.dwelling_type) : ''],
    ['Exterior construction', row?.construction],
    [
      'Construction quality grade',
      `${parcel.grade} of 9 (${MD_GRADE_LABELS[parcel.grade] ?? 'unlabeled'}), used in the estimate`,
    ],
    ['Year built', parcel.yearBuilt ? String(parcel.yearBuilt) : ''],
    ['Lot', row?.land_sqft ? lotText(Number(row.land_sqft)) : ''],
    ['Assessor last reviewed the record', row?.inspected ? monthYear(`${row.inspected}-01`) : ''],
  ]
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([label, value]) => ({ label, value, source: 'md-assessor' }));
  const comparables: PropertyFacts['comparables'] = {};
  for (const sale of comparableSales) {
    const recordedType = facts.row(sale.parcelId)?.dwelling_type;
    const structure = recordedType ? structureLabel(recordedType) : undefined;
    const prior = permitBeforeSale(permits.rows(sale.parcelId).map(montgomeryPermitRecord), sale.soldOn);
    if (structure || prior)
      comparables[sale.saleId] = { ...(structure ? { structure } : {}), ...(prior ? { permitBeforeSale: prior } : {}) };
  }
  return {
    version: PROPERTY_FACTS_VERSION,
    sources: [
      {
        id: 'md-assessor',
        label: 'Maryland SDAT/MDP assessment records',
        license: MD_FACTS_LICENSE,
        collectedAt: provenance.fetchedAt,
      },
      ...(montgomery
        ? [
            {
              id: 'montgomery-permits',
              label: 'Montgomery County residential permits',
              license: MD_FACTS_LICENSE,
              collectedAt: provenance.fetchedAt,
            },
          ]
        : []),
    ],
    recorded,
    years: { built: parcel.yearBuilt || null, remodeled: null, effective: null },
    permits: montgomery
      ? {
          source: 'montgomery-permits',
          since: provenance.permitsSince,
          coverage: `Montgomery County residential permits issued since ${provenance.permitsSince.slice(0, 4)}, matched to this address`,
          closeOutRecorded: true,
          statusNote: MONTGOMERY_PERMIT_STATUS_NOTE,
          records: permits.rows(parcel.parcelId).map(montgomeryPermitRecord).sort(newestFirst).slice(0, 400),
        }
      : null,
    permitGap: montgomery
      ? null
      : 'Prince George’s County publishes building permits without a stated open license, so Ascent shows none for this home.',
    building: null,
    comparables,
    later: later && { checkedAt: later.checkedAt, sales: later.sales, after: later.after, source: later.source },
  };
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
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  return {
    parcel,
    subject,
    candidates,
    facts: marylandPropertyFacts(
      parcel,
      sales.filter(sale => candidateIds.has(sale.saleId)),
    ),
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
