import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { dcBenchmark, validatedAssumptions } from '../valuation-safeguards';
import type { CmaAssumptions, Source, ValuationProperty } from '../types';

/**
 * District of Columbia public-record adapter. Server-only: it reads two bundled CC BY 4.0 snapshots.
 * - Recorded sales: the exact file the DC valuation validation scored (evidence/datasets copy, same SHA-256).
 * - Residential parcels: active street addresses and assessor characteristics for search and labels.
 * It never contacts a live service, never stores owner names and never presents an asking price as a sale.
 */
export const DC_SOURCE_ID = 'source-dc-public-records';
const DATA_DIR = join(process.cwd(), 'src', 'datasets', 'dc');
/** Candidate sales are kept wider than the validated 0.5 mi / 90 days so widening a filter can be tested. */
export const DC_CANDIDATE_RADIUS_MILES = 2;
export const DC_CANDIDATE_MAX_AGE_DAYS = 365;

type Provenance = { fetchedAt: string; csvSha256: string; rows: number; attribution: string; lastSale?: string };
export type DcParcel = {
  parcelId: string;
  address: string;
  aliases: string[];
  zip: string;
  lat: number;
  lng: number;
  beds: number;
  baths: number;
  sqft: number;
  condition: number;
  yearBuilt: number;
  yearRemodeled: number;
};
export type DcSale = {
  saleId: string;
  parcelId: string;
  soldOn: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  condition: number;
  lat: number;
  lng: number;
  zip: string;
};
export type DcSearchResult = {
  parcelId: string;
  address: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number;
};

/** Minimal RFC 4180 reader: quoted fields may contain commas and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(cells => cells.length > 1 || cells[0]);
}

const records = (file: string, expected: string) => {
  const bytes = gunzipSync(readFileSync(join(DATA_DIR, file)));
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('DC snapshot fingerprint mismatch.');
  const [header, ...rows] = parseCsv(bytes.toString('utf8'));
  return rows.map(cells => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])));
};

const SUFFIXES: Record<string, string> = {
  ST: 'STREET',
  AVE: 'AVENUE',
  AV: 'AVENUE',
  RD: 'ROAD',
  PL: 'PLACE',
  CT: 'COURT',
  TER: 'TERRACE',
  TERR: 'TERRACE',
  DR: 'DRIVE',
  BLVD: 'BOULEVARD',
  LN: 'LANE',
  CIR: 'CIRCLE',
  PKWY: 'PARKWAY',
  SQ: 'SQUARE',
  HWY: 'HIGHWAY',
  ALY: 'ALLEY',
  CRES: 'CRESCENT',
  WY: 'WAY',
};
/** Upper-case, strip punctuation and city/state, and expand common street abbreviations. */
export function normalizeDcAddress(value: string) {
  return value
    .toUpperCase()
    .replace(/,?\s*(WASHINGTON)?,?\s*(DC|D\.C\.)?\s*(\d{5})?\s*$/, '')
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => SUFFIXES[token] ?? token)
    .join(' ');
}

/** District records are upper case; show them as people write addresses, keeping quadrants upper case. */
export const displayDcAddress = (address: string) =>
  address
    .toLowerCase()
    .replace(/\b([a-z])/g, c => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, q => q.toUpperCase());

let cache:
  | {
      parcels: Map<string, DcParcel>;
      index: { key: string; parcelId: string }[];
      sales: DcSale[];
      salesProvenance: Provenance;
      parcelsProvenance: Provenance;
    }
  | undefined;

/** Loads and indexes both snapshots once per server process. */
export function dcData() {
  if (cache) return cache;
  const provenance = (file: string) => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as Provenance;
  const salesProvenance = provenance('dc-residential-sales.provenance.json'),
    parcelsProvenance = provenance('dc-residential-properties.provenance.json');
  if (salesProvenance.csvSha256 !== dcBenchmark.dataset.csvSha256)
    throw new Error('DC sales have changed; revalidation is required.');
  const parcels = new Map<string, DcParcel>();
  const index: { key: string; parcelId: string }[] = [];
  for (const row of records('dc-residential-properties.csv.gz', parcelsProvenance.csvSha256)) {
    const parcel: DcParcel = {
      parcelId: row.parcel_id,
      address: row.address,
      aliases: row.aliases ? row.aliases.split('|') : [],
      zip: row.zip,
      lat: Number(row.lat),
      lng: Number(row.lng),
      beds: Number(row.beds),
      baths: Number(row.baths),
      sqft: Number(row.sqft),
      condition: Number(row.condition),
      yearBuilt: Number(row.year_built),
      yearRemodeled: Number(row.year_remodeled),
    };
    if (parcels.has(parcel.parcelId)) throw new Error('Duplicate DC parcel identifier.');
    parcels.set(parcel.parcelId, parcel);
    for (const address of [parcel.address, ...parcel.aliases])
      index.push({ key: normalizeDcAddress(address), parcelId: parcel.parcelId });
  }
  const sales = records('dc-residential-sales.csv.gz', salesProvenance.csvSha256).map(row => ({
    saleId: row.sale_id,
    parcelId: row.parcel_id,
    soldOn: row.sold_on,
    price: Number(row.price),
    beds: Number(row.beds),
    baths: Number(row.baths),
    sqft: Number(row.sqft),
    condition: Number(row.condition),
    lat: Number(row.lat),
    lng: Number(row.lng),
    zip: row.zip,
  }));
  if (
    parcels.size !== parcelsProvenance.rows ||
    sales.length !== salesProvenance.rows ||
    new Set(sales.map(s => s.saleId)).size !== sales.length
  )
    throw new Error('Incomplete or duplicate DC snapshot records.');
  cache = {
    parcels,
    index,
    sales,
    salesProvenance,
    parcelsProvenance,
  };
  return cache;
}

/** Address search over active DC street addresses: every typed word must match, and earlier matches rank first. */
export function searchDcAddresses(query: string, limit = 8): DcSearchResult[] {
  const wanted = normalizeDcAddress(query);
  if (wanted.length < 3) return [];
  const terms = wanted.split(' ');
  const { index, parcels } = dcData();
  const seen = new Set<string>();
  const scored: { score: number; parcelId: string; key: string }[] = [];
  for (const entry of index) {
    if (seen.has(entry.parcelId)) continue;
    const words = entry.key.split(' ');
    // The last typed term may be partial; earlier terms must match whole words.
    const matches = terms.every((term, i) =>
      i === terms.length - 1 ? words.some(word => word.startsWith(term)) : words.includes(term),
    );
    if (!matches) continue;
    seen.add(entry.parcelId);
    scored.push({ score: entry.key.startsWith(wanted) ? 0 : words[0] === terms[0] ? 1 : 2, ...entry });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key, 'en', { numeric: true }))
    .slice(0, limit)
    .map(({ parcelId }) => {
      const parcel = parcels.get(parcelId)!;
      return {
        parcelId,
        address: displayDcAddress(parcel.address),
        zip: parcel.zip,
        beds: parcel.beds,
        baths: parcel.baths,
        sqft: parcel.sqft,
      };
    });
}

export function dcSource(): Source {
  const { salesProvenance, parcelsProvenance } = dcData();
  return {
    id: DC_SOURCE_ID,
    label: 'District of Columbia public records (CC BY 4.0)',
    kind: 'public',
    observedAt: salesProvenance.fetchedAt,
    license: `${salesProvenance.attribution} Parcel addresses and characteristics fetched ${parcelsProvenance.fetchedAt.slice(0, 10)}. Joined and filtered by Ascent; not MLS data. Recorded sales lag closing, concessions are not recorded and assessor characteristics are current rather than as of each sale.`,
    // Not a declared accuracy: measured accuracy lives in the published DC validation report.
    confidence: 0,
  };
}

const place = (zip: string) => ({ city: 'Washington', state: 'DC', zip, sourceId: DC_SOURCE_ID });

/** The subject and its nearby recorded sales, as of the sales snapshot, ready for the deterministic engine. */
export function dcValuationInputs(parcelId: string) {
  const { parcels, sales, salesProvenance, parcelsProvenance } = dcData();
  const parcel = parcels.get(parcelId);
  if (!parcel) return null;
  const asOf = salesProvenance.fetchedAt;
  const asOfTime = Date.parse(asOf);
  const subject: ValuationProperty = {
    ...place(parcel.zip),
    id: `dc-parcel-${parcel.parcelId}`,
    address: displayDcAddress(parcel.address),
    lat: parcel.lat,
    lng: parcel.lng,
    beds: parcel.beds,
    baths: parcel.baths,
    sqft: parcel.sqft,
    condition: parcel.condition,
    yearBuilt: parcel.yearBuilt || undefined,
    history: recordedHistory(parcelId, sales, asOf),
  };
  const candidates: ValuationProperty[] = sales
    .filter(sale => {
      if (sale.parcelId === parcel.parcelId) return false; // the home's own sales are not its comparables
      const age = (asOfTime - Date.parse(`${sale.soldOn}T12:00:00.000Z`)) / 86400000;
      return age >= 0 && age <= DC_CANDIDATE_MAX_AGE_DAYS && distanceMiles(parcel, sale) <= DC_CANDIDATE_RADIUS_MILES;
    })
    .map(sale => ({
      ...place(sale.zip),
      id: sale.saleId,
      address: displayDcAddress(
        parcels.get(sale.parcelId)?.address ?? `DC parcel ${sale.parcelId.replace(/_+/g, ' ')}`,
      ),
      lat: sale.lat,
      lng: sale.lng,
      beds: sale.beds,
      baths: sale.baths,
      sqft: sale.sqft,
      condition: sale.condition,
      status: 'sold' as const,
      soldAt: `${sale.soldOn}T12:00:00.000Z`,
      soldPrice: sale.price,
    }));
  return {
    parcel,
    subject,
    candidates,
    asOf,
    sources: [dcSource()],
    assumptions: validatedAssumptions(dcBenchmark) as CmaAssumptions,
    snapshot: {
      salesFetchedAt: salesProvenance.fetchedAt,
      lastRecordedSale: salesProvenance.lastSale ?? null,
      parcelsFetchedAt: parcelsProvenance.fetchedAt,
      salesSha256: salesProvenance.csvSha256,
      parcelsSha256: parcelsProvenance.csvSha256,
    },
    attribution: salesProvenance.attribution,
  };
}
