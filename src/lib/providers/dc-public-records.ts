import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { distanceMiles } from '../analytics';
import { recordedHistory } from './recorded-history';
import { compareAddressKeys, firstByOrder, lazyAddressIndex } from './address-index';
import { DC_CONDITION_LABELS } from '../dc-studio';
import {
  dcPermitRecord,
  newestFirst,
  permitBeforeSale,
  PROPERTY_FACTS_VERSION,
  DC_PERMIT_STATUS_NOTE,
  structureLabel,
  type PermitRecord,
  type PropertyFacts,
} from '../property-facts';
import { dcBenchmark, validatedAssumptions } from '../valuation-safeguards';
import type { CmaAssumptions, Source, ValuationProperty } from '../types';
import { displayDcAddress } from '../address-format';

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
  // Without a quote character every comma and line break is a delimiter, so splitting gives the same rows faster.
  if (!text.includes('"'))
    return text
      .split(/\r\n|\r|\n/)
      .map(line => line.split(','))
      .filter(cells => cells.length > 1 || cells[0]);
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

/** Rows keyed by the header line; a missing trailing cell reads as an empty string. */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  const records: Record<string, string>[] = new Array(Math.max(0, rows.length - 1));
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r],
      record: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) record[header[i]] = cells[i] ?? '';
    records[r - 1] = record;
  }
  return records;
}

/** A bundled snapshot's decompressed text, after checking its fingerprint. */
const snapshotText = (file: string, expected: string, directory = DATA_DIR) => {
  const bytes = gunzipSync(readFileSync(join(directory, file)));
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('DC snapshot fingerprint mismatch.');
  return bytes.toString('utf8');
};
const records = (file: string, expected: string, directory = DATA_DIR) =>
  csvRecords(snapshotText(file, expected, directory));

/**
 * CSV rows kept as raw lines grouped by their first column, the parcel, and parsed only when a property asks for
 * them. Held as objects, a quarter of a million permit rows would cost hundreds of megabytes per server instance.
 */
export class ParcelLines {
  private constructor(
    private readonly header: string[],
    private readonly lines: Map<string, string[]>,
    /** Rows in the file. */
    readonly total: number,
  ) {}
  static parse(text: string) {
    const lines = text.split('\n');
    const grouped = new Map<string, string[]>();
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parcel = line.slice(0, line.indexOf(','));
      const group = grouped.get(parcel);
      if (group) group.push(line);
      else grouped.set(parcel, [line]);
      total++;
    }
    return new ParcelLines(lines[0].split(','), grouped, total);
  }
  /** Distinct parcels. */
  get size() {
    return this.lines.size;
  }
  rows(parcel: string): Record<string, string>[] {
    return (this.lines.get(parcel) ?? []).map(line => this.record(line));
  }
  row(parcel: string): Record<string, string> | undefined {
    const line = this.lines.get(parcel)?.[0];
    return line === undefined ? undefined : this.record(line);
  }
  private record(line: string) {
    const cells = line.includes('"') ? parseCsv(line)[0] : line.split(',');
    const record: Record<string, string> = {};
    this.header.forEach((name, i) => (record[name] = cells[i] ?? ''));
    return record;
  }
}
export type FactsProvenance = {
  fetchedAt: string;
  attribution: string;
  factsCsvSha256: string;
  permitsCsvSha256: string;
  facts: number;
  permits: number;
  permitsSince: string;
};
/** A dated count of qualifying sales the live source held beyond the snapshot (scripts/datasets/probe-freshness.py). */
export type LaterSales = { checkedAt: string; sales: number; after: string; source: string };
export const laterSales = (directory: string): LaterSales | null => {
  const path = join(directory, 'freshness.json');
  if (!existsSync(path)) return null;
  const { checkedAt, sales, after, source } = JSON.parse(readFileSync(path, 'utf8')) as LaterSales;
  return { checkedAt, sales, after, source };
};
/** Facts and permit files for one snapshot directory, checked against their provenance like every snapshot. */
export function loadFacts(directory: string, provenanceFile: string, factsFile: string, permitsFile: string) {
  const provenance = JSON.parse(readFileSync(join(directory, provenanceFile), 'utf8')) as FactsProvenance;
  const facts = ParcelLines.parse(snapshotText(factsFile, provenance.factsCsvSha256, directory));
  const permits = ParcelLines.parse(snapshotText(permitsFile, provenance.permitsCsvSha256, directory));
  if (facts.total !== provenance.facts || facts.size !== facts.total || permits.total !== provenance.permits)
    throw new Error('Incomplete or duplicate facts snapshot.');
  return { provenance, facts, permits, later: laterSales(directory) };
}
const sqftText = (value: string) => `${Number(value).toLocaleString('en-US')} sq ft`;
const yesNo = (value: string) => (value === 'Y' ? 'Yes' : value === 'N' ? 'No' : '');

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
const TRAILING_LOCALITY = /,?\s*(WASHINGTON)?,?\s*(DC|D\.C\.)?\s*(\d{5})?\s*$/;
const LOCALITY_CHARACTER = /[,\sWASHINGTODC.\d]/;
const WHITESPACE = /\s/;
/** Upper-case, strip punctuation and city/state, and expand common street abbreviations. */
export function normalizeDcAddress(value: string) {
  const upper = value.toUpperCase();
  // The trailing city/state/ZIP pattern only matches these characters, so it is searched for in that tail alone;
  // run over a whole address its optional groups are retried at every position.
  let tail = upper.length;
  while (tail > 0 && LOCALITY_CHARACTER.test(upper[tail - 1])) tail--;
  const text = tail === upper.length ? upper : upper.slice(0, tail) + upper.slice(tail).replace(TRAILING_LOCALITY, '');
  // One pass over the words: periods, commas, number signs and whitespace separate them.
  let normalized = '',
    start = -1;
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? text.charCodeAt(i) : 32;
    const separator =
      code === 32 ||
      code === 46 ||
      code === 44 ||
      code === 35 ||
      (code >= 9 && code <= 13) ||
      (code > 127 && WHITESPACE.test(text[i]));
    if (!separator) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const token = text.slice(start, i);
      normalized += (normalized ? ' ' : '') + (SUFFIXES[token] ?? token);
      start = -1;
    }
  }
  return normalized;
}

// Kept in its own module so pages that only format addresses do not bundle these snapshots.
export { displayDcAddress };

let cache:
  | {
      parcels: Map<string, DcParcel>;
      index: ReturnType<typeof lazyAddressIndex>;
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
    index: lazyAddressIndex(() =>
      [...parcels.values()].flatMap(parcel =>
        [parcel.address, ...parcel.aliases].map(address => ({
          key: normalizeDcAddress(address),
          parcelId: parcel.parcelId,
        })),
      ),
    ),
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
  const { parcels } = dcData();
  const index = dcData().index();
  const seen = new Set<string>();
  const scored: { score: number; parcelId: string; key: string }[] = [];
  // The last typed term may be partial; earlier terms must match whole words. An alias matches for its parcel.
  for (const position of index.matches(terms)) {
    const entry = index.entries[position];
    if (seen.has(entry.parcelId)) continue;
    seen.add(entry.parcelId);
    const first = entry.key.split(' ', 1)[0];
    scored.push({ score: entry.key.startsWith(wanted) ? 0 : first === terms[0] ? 1 : 2, ...entry });
  }
  return firstByOrder(scored, limit, (a, b) => a.score - b.score || compareAddressKeys(a.key, b.key)).map(
    ({ parcelId }) => {
      const parcel = parcels.get(parcelId)!;
      return {
        parcelId,
        address: displayDcAddress(parcel.address),
        zip: parcel.zip,
        beds: parcel.beds,
        baths: parcel.baths,
        sqft: parcel.sqft,
      };
    },
  );
}

let factsCache: ReturnType<typeof loadFacts> | undefined;
/** Assessor facts and building permits for covered houses; loaded once, after the core snapshots. */
export function dcFactsData() {
  factsCache ??= loadFacts(
    DATA_DIR,
    'dc-residential-facts.provenance.json',
    'dc-residential-facts.csv.gz',
    'dc-house-permits.csv.gz',
  );
  return factsCache;
}
const DC_FACTS_LICENSE =
  'Contains District of Columbia open data licensed under CC BY 4.0. Joined and filtered by Ascent; not an inspection.';

/**
 * What District records show about a house beyond the valuation inputs. The estimate never uses these: they say
 * what the records show about structure, condition and renovations, and how current the sales are.
 */
export function dcPropertyFacts(parcel: DcParcel, comparableSales: DcSale[]): PropertyFacts {
  const { facts, permits, provenance, later } = dcFactsData();
  const row = facts.row(parcel.parcelId);
  const history = permits
    .rows(parcel.parcelId)
    .map(entry => dcPermitRecord(entry, 'home'))
    .sort(newestFirst);
  const recorded = [
    ['Structure', row?.structure ? structureLabel(row.structure) : ''],
    ['Style', row?.style],
    ['Construction grade', row?.grade],
    [
      'Assessor condition grade',
      `${parcel.condition} of 6 (${DC_CONDITION_LABELS[parcel.condition] ?? 'unlabeled'}), used in the estimate`,
    ],
    ['Year built', parcel.yearBuilt ? String(parcel.yearBuilt) : ''],
    ['Last recorded remodel', parcel.yearRemodeled ? String(parcel.yearRemodeled) : 'None recorded'],
    [
      'Effective year built',
      row?.effective_year_built ? `${row.effective_year_built} (the assessor’s estimate of age after updates)` : '',
    ],
    ['Heating', row?.heat],
    ['Central air', yesNo(row?.central_air ?? '')],
    ['Kitchens', row?.kitchens],
    ['Fireplaces', row?.fireplaces],
    ['Exterior', row?.exterior],
    ['Roof', row?.roof],
    ['Floors', row?.floors],
    ['Lot', row?.land_sqft ? sqftText(row.land_sqft) : ''],
  ]
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([label, value]) => ({ label, value, source: 'dc-assessor' }));
  const comparables: PropertyFacts['comparables'] = {};
  for (const sale of comparableSales) {
    const recordedStructure = facts.row(sale.parcelId)?.structure;
    const structure = recordedStructure ? structureLabel(recordedStructure) : undefined;
    const prior = permitBeforeSale(
      permits.rows(sale.parcelId).map(entry => dcPermitRecord(entry, 'home')),
      sale.soldOn,
    );
    if (structure || prior)
      comparables[sale.saleId] = { ...(structure ? { structure } : {}), ...(prior ? { permitBeforeSale: prior } : {}) };
  }
  return {
    version: PROPERTY_FACTS_VERSION,
    sources: [
      {
        id: 'dc-assessor',
        label: 'District assessor records (CAMA Residential)',
        license: DC_FACTS_LICENSE,
        collectedAt: provenance.fetchedAt,
      },
      {
        id: 'dc-permits',
        label: 'District Department of Buildings permits',
        license: DC_FACTS_LICENSE,
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
      coverage: `District building permits issued on this lot since ${provenance.permitsSince.slice(0, 4)}`,
      closeOutRecorded: false,
      statusNote: DC_PERMIT_STATUS_NOTE,
      records: history.slice(0, 400) as PermitRecord[],
    },
    permitGap: null,
    building: null,
    comparables,
    later: later && { checkedAt: later.checkedAt, sales: later.sales, after: later.after, source: later.source },
  };
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
  const candidateIds = new Set(candidates.map(candidate => candidate.id));
  return {
    parcel,
    subject,
    candidates,
    facts: dcPropertyFacts(
      parcel,
      sales.filter(sale => candidateIds.has(sale.saleId)),
    ),
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
