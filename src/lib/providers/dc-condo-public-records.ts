import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { condoDefaultState, CONDO_ACCURACY_NOTICE } from '../dc-condo-studio';
import {
  dcPermitRecord,
  displayName,
  inferFloor,
  newestFirst,
  permitBeforeSale,
  PROPERTY_FACTS_VERSION,
  DC_PERMIT_STATUS_NOTE,
  type PropertyFacts,
} from '../property-facts';
import type { Source, ValuationProperty } from '../types';
import { csvRecords, displayDcAddress, loadFacts, normalizeDcAddress } from './dc-public-records';
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
  yearRemodeled: number;
  marId: string;
};
type Sale = Omit<Condo, 'address' | 'yearBuilt' | 'yearRemodeled' | 'marId'> & {
  saleId: string;
  soldOn: string;
  price: number;
};
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
      yearRemodeled: +row.year_remodeled,
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
let factsCache: ReturnType<typeof loadFacts> | undefined;
/** Regime, unit and permit facts for covered condominium units; loaded once, after the core snapshots. */
export function condoFactsData() {
  factsCache ??= loadFacts(
    directory,
    'dc-condo-facts.provenance.json',
    'dc-condo-facts.csv.gz',
    'dc-condo-permits.csv.gz',
  );
  return factsCache;
}
const CONDO_FACTS_LICENSE =
  'Contains District of Columbia open data licensed under CC BY 4.0. Joined and filtered by Ascent; not an inspection.';

/**
 * What District records show about a condominium unit and its building beyond the valuation inputs. The estimate
 * never uses these. The floor is inferred from the unit number and always labeled as an inference.
 */
export function condoPropertyFacts(parcel: Condo, comparableSales: Sale[]): PropertyFacts {
  const { facts, permits, provenance, later } = condoFactsData();
  const row = facts.row(parcel.parcelId);
  const unitPermits = permits.rows(parcel.parcelId).map(entry => dcPermitRecord(entry, 'home'));
  const buildingPermits = row?.building_lot
    ? permits.rows(row.building_lot).map(entry => dcPermitRecord(entry, 'building'))
    : [];
  const floor = inferFloor(parcel.address);
  const other = Number(row?.regime_other_units || 0);
  const recorded = [
    ['Condominium', row?.regime_name ? displayName(row.regime_name) : ''],
    ['Residential units in the condominium', row?.regime_units],
    [
      'Other recorded units in the condominium',
      other ? `${other} with no residential assessor record, for example parking, storage or commercial` : '',
    ],
    [
      'Floor',
      floor.floor === null
        ? ''
        : `${floor.floor === 'penthouse' ? 'Penthouse' : floor.floor} (inferred from the unit number)`,
    ],
    ['Rooms', row?.rooms],
    ['Year built', parcel.yearBuilt ? String(parcel.yearBuilt) : ''],
    ['Last recorded remodel', parcel.yearRemodeled ? String(parcel.yearRemodeled) : 'None recorded'],
    [
      'Effective year built',
      row?.effective_year_built ? `${row.effective_year_built} (the assessor’s estimate of age after updates)` : '',
    ],
    ['Heating', row?.heat],
    ['Central air', row?.central_air === 'Y' ? 'Yes' : row?.central_air === 'N' ? 'No' : ''],
    ['Fireplaces', row?.fireplaces],
  ]
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([label, value]) => ({ label, value, source: 'dc-condo-assessor' }));
  const comparables: PropertyFacts['comparables'] = {};
  for (const sale of comparableSales) {
    const building = facts.row(sale.parcelId)?.regime_id;
    const prior = permitBeforeSale(
      permits.rows(sale.parcelId).map(entry => dcPermitRecord(entry, 'home')),
      sale.soldOn,
    );
    if (building || prior)
      comparables[sale.saleId] = { ...(building ? { building } : {}), ...(prior ? { permitBeforeSale: prior } : {}) };
  }
  return {
    version: PROPERTY_FACTS_VERSION,
    sources: [
      {
        id: 'dc-condo-assessor',
        label: 'District condominium assessor records and regimes',
        license: CONDO_FACTS_LICENSE,
        collectedAt: provenance.fetchedAt,
      },
      {
        id: 'dc-permits',
        label: 'District Department of Buildings permits',
        license: CONDO_FACTS_LICENSE,
        collectedAt: provenance.fetchedAt,
      },
    ],
    recorded,
    years: {
      built: parcel.yearBuilt || null,
      remodeled: parcel.yearRemodeled || null,
      effective: row?.effective_year_built ? Number(row.effective_year_built) : null,
    },
    permits: {
      source: 'dc-permits',
      since: provenance.permitsSince,
      coverage: `District permits issued since ${provenance.permitsSince.slice(0, 4)} for this unit and for its condominium’s record lot`,
      closeOutRecorded: false,
      statusNote: DC_PERMIT_STATUS_NOTE,
      records: [...unitPermits, ...buildingPermits].sort(newestFirst).slice(0, 400),
    },
    permitGap: null,
    building: {
      name: row?.regime_name ? displayName(row.regime_name) : null,
      units: row?.regime_units ? Number(row.regime_units) : null,
      otherUnits: row?.regime_other_units ? other : null,
      floor: floor.floor,
      floorBasis: floor.basis,
      id: row?.regime_id || null,
    },
    comparables,
    later: later && { checkedAt: later.checkedAt, sales: later.sales, after: later.after, source: later.source },
  };
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
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  return {
    parcel,
    subject,
    candidates,
    facts: condoPropertyFacts(
      parcel,
      sales.filter(sale => candidateIds.has(sale.saleId)),
    ),
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
