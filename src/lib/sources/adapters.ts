import {
  classifyDcPermit,
  classifyMontgomeryPermit,
  dcPermitStatus,
  montgomeryPermitStatus,
  sentenceCase,
} from '../property-facts';
import { publicSource } from './registry';
import {
  dcParcel,
  dcSsl,
  finite,
  isoDay,
  isoTime,
  observation,
  type Observation,
  type ObservationValue,
} from './observations';
import type { AdapterPage, SourceAdapter } from './ingest';

/**
 * Concrete adapters for the enabled public sources. Each one names only allowlisted fields, builds queries from
 * validated identifiers (never from free text), and turns a row into observations without inventing a value:
 * a blank cell stays null. Owner names, applicants, mailing addresses and tax balances are never requested.
 */
type Row = Record<string, unknown>;
const DC_PARCEL = /^[A-Za-z0-9_]{4,32}$/;
const MD_ACCOUNT = /^\d{10,12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function arcgisUrl(endpoint: string, params: Record<string, string>, page: number, pageSize: number) {
  return `${endpoint}/query?${new URLSearchParams({
    ...params,
    returnGeometry: 'false',
    resultOffset: String(page * pageSize),
    resultRecordCount: String(pageSize),
    f: 'json',
  })}`;
}
/** ArcGIS reports errors inside a 200 response; those are failures, not empty results. */
function arcgisRows(body: string, pageSize: number): AdapterPage<Row> {
  const page = JSON.parse(body) as {
    error?: { message?: string };
    features?: { attributes: Row }[];
    exceededTransferLimit?: boolean;
  };
  if (page.error) throw new Error(`Source error: ${page.error.message ?? 'unspecified'}`);
  if (!Array.isArray(page.features)) throw new Error('Unexpected response: no feature list.');
  const rows = page.features.map(feature => feature.attributes);
  return { rows, more: !!page.exceededTransferLimit || rows.length === pageSize };
}
function socrataRows(body: string, pageSize: number): AdapterPage<Row> {
  const rows = JSON.parse(body) as unknown;
  if (!Array.isArray(rows)) {
    const message = rows && typeof rows === 'object' && 'message' in rows ? String(rows.message) : 'not a row list';
    throw new Error(`Unexpected response: ${message}`);
  }
  return { rows: rows as Row[], more: rows.length === pageSize };
}
const socrataUrl = (endpoint: string, params: Record<string, string>, page: number, pageSize: number) =>
  `${endpoint}?${new URLSearchParams({ ...params, $limit: String(pageSize), $offset: String(page * pageSize) })}`;
const socrataPublication = (url: string) => ({
  url,
  parse: (body: string) => isoTime((JSON.parse(body) as { rowsUpdatedAt?: number }).rowsUpdatedAt ?? null),
});
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value));
const endpoint = (id: string) => publicSource(id).access.endpoint!;

// ——— District of Columbia ———

export type ParcelScope = { parcelId: string };
export type AfterScope = { after: string };
const DC_SALE_FIELDS = ['SSL', 'SALE_DATE', 'SALE_PRICE', 'QUALIFIED', 'SALE_CODE', 'GIS_LAST_MOD_DTTM'] as const;

/** Recorded transfers of one lot, or every qualified sale dated after a snapshot's newest sale. */
export const dcSalesAdapter: SourceAdapter<ParcelScope | AfterScope, Row> = {
  sourceId: 'dc-property-sales',
  use: 'monitoring',
  fields: DC_SALE_FIELDS,
  describe: scope =>
    'parcelId' in scope ? `transfers of lot ${scope.parcelId}` : `qualified sales dated after ${scope.after}`,
  request(scope, page, pageSize) {
    let where: string;
    if ('parcelId' in scope) {
      if (!DC_PARCEL.test(scope.parcelId)) throw new Error('Invalid District parcel identifier.');
      where = `SSL='${dcSsl(scope.parcelId)}'`;
    } else {
      if (!DAY.test(scope.after)) throw new Error('Invalid date.');
      where = `QUALIFIED='Q' AND SALE_PRICE > 0 AND SALE_DATE > date '${scope.after}'`;
    }
    return arcgisUrl(
      endpoint('dc-property-sales'),
      { where, outFields: DC_SALE_FIELDS.join(','), orderByFields: 'OBJECTID' },
      page,
      pageSize,
    );
  },
  parse: arcgisRows,
  validate(row, scope) {
    if (typeof row.SSL !== 'string' || !row.SSL.trim()) return 'missing lot identifier';
    if (!isoDay(row.SALE_DATE)) return 'missing or invalid sale date';
    if (finite(row.SALE_PRICE) === null || finite(row.SALE_PRICE)! < 0) return 'missing or invalid price';
    if ('parcelId' in scope && dcParcel(row.SSL) !== scope.parcelId) return 'different lot';
    return null;
  },
  normalize(row, { observedAt }) {
    const parcelId = dcParcel(row.SSL);
    const transaction = isoDay(row.SALE_DATE)!;
    return [
      observation({
        sourceId: 'dc-property-sales',
        kind: 'recorded-transfer',
        parcelId,
        identity: `${parcelId}:${transaction}`,
        values: {
          price: finite(row.SALE_PRICE),
          qualified: text(row.QUALIFIED) === 'Q',
          saleCode: text(row.SALE_CODE) || null,
        },
        dates: {
          transaction,
          recorded: null,
          effective: null,
          published: isoTime(row.GIS_LAST_MOD_DTTM),
          observed: observedAt,
        },
      }),
    ];
  },
};

const DC_TAX_FIELDS = publicSource('dc-tax-extract').fields.requested;
/** The tax extract row for one lot: assessment, annual tax and the most recent sale with its deed date. */
export const dcTaxExtractAdapter: SourceAdapter<ParcelScope, Row> = {
  sourceId: 'dc-tax-extract',
  use: 'monitoring',
  fields: DC_TAX_FIELDS,
  describe: scope => `tax record of lot ${scope.parcelId}`,
  request(scope, page, pageSize) {
    if (!DC_PARCEL.test(scope.parcelId)) throw new Error('Invalid District parcel identifier.');
    return arcgisUrl(
      endpoint('dc-tax-extract'),
      { where: `SSL='${dcSsl(scope.parcelId)}'`, outFields: DC_TAX_FIELDS.join(','), orderByFields: 'SSL' },
      page,
      pageSize,
    );
  },
  parse: arcgisRows,
  validate(row, scope) {
    if (dcParcel(row.SSL) !== scope.parcelId) return 'different lot';
    return null;
  },
  normalize(row, { observedAt }) {
    const parcelId = dcParcel(row.SSL);
    const published = isoTime(row.EXTRACTDAT);
    const dates = { transaction: null, recorded: null, effective: null, published, observed: observedAt };
    const out: Observation[] = [
      observation({
        sourceId: 'dc-tax-extract',
        kind: 'assessment',
        parcelId,
        identity: `${parcelId}:assessment`,
        values: {
          currentTotal: finite(row.ASSESSMENT),
          proposedTotal: finite(row.NEWTOTAL),
          proposedLand: finite(row.NEWLAND),
          proposedImprovements: finite(row.NEWIMPR),
          priorYearTotal: finite(row.OLDTOTAL),
          propertyType: text(row.PROPTYPE) || null,
          useCode: text(row.USECODE) || null,
        },
        dates,
      }),
      observation({
        sourceId: 'dc-tax-extract',
        kind: 'property-tax',
        parcelId,
        identity: `${parcelId}:tax`,
        values: {
          annualTax: finite(row.ANNUALTAX),
          ratePerHundred: finite(row.TAXRATE),
          taxClass: text(row.CLASSTYPE) || null,
        },
        dates,
      }),
    ];
    const sold = isoDay(row.SALEDATE);
    if (sold)
      out.push(
        observation({
          sourceId: 'dc-tax-extract',
          kind: 'recorded-transfer',
          parcelId,
          identity: `${parcelId}:${sold}`,
          values: {
            price: finite(row.SALEPRICE),
            acceptance: text(row.ACCEPTCODE) || null,
            saleType: text(row.SALETYPE) || null,
          },
          dates: { ...dates, transaction: sold, recorded: isoDay(row.DEEDDATE) },
        }),
      );
    return out;
  },
};

/** Building permit layers by issue year; a year without a configured layer is reported, never guessed. */
export const DC_PERMIT_LAYERS: Record<number, number> = {
  2016: 24,
  2017: 37,
  2018: 9,
  2019: 8,
  2020: 2,
  2021: 3,
  2022: 14,
  2023: 15,
  2024: 16,
  2025: 17,
  2026: 18,
};
const DC_PERMIT_FIELDS = publicSource('dc-building-permits').fields.requested;
/** The importer's rules, applied the same way to live rows (scripts/datasets/fetch-dc-facts.py). */
const DC_KEPT_SUBTYPES: Record<string, readonly string[]> = {
  CONSTRUCTION: [
    'ALTERATION AND REPAIR',
    'ADDITION ALTERATION REPAIR',
    'ADDITION',
    'NEW BUILDING',
    'DEMOLITION',
    'RAZE',
    'FOUNDATION ONLY',
    'DECK',
    'FENCE',
    'GARAGE',
    'SHED',
    'SWIMMING POOL',
    'RETAINING WALL',
    'SOLAR SYSTEM',
    'AWNING',
    'MISCELLANEOUS',
  ],
  SUPPLEMENTAL: ['ELECTRICAL', 'PLUMBING AND GAS', 'MECHANICAL', 'BOILER'],
  'POST CARD': ['BUILDING', 'PLUMBING', 'MECHANICAL', 'GAS FITTING', 'ELECTRICAL - GENERAL', 'ELECTRICAL - HEAVY UP'],
};
const DC_DROPPED_STATUSES = ['CANCEL', 'WITHDRAW', 'REVOKE'];
export type PermitYearScope = ParcelScope & { year: number };

export const dcPermitsAdapter: SourceAdapter<PermitYearScope, Row> = {
  sourceId: 'dc-building-permits',
  use: 'monitoring',
  fields: DC_PERMIT_FIELDS,
  describe: scope => `${scope.year} permits on lot ${scope.parcelId}`,
  request(scope, page, pageSize) {
    if (!DC_PARCEL.test(scope.parcelId)) throw new Error('Invalid District parcel identifier.');
    const layer = DC_PERMIT_LAYERS[scope.year];
    if (layer === undefined) throw new Error(`No District permit layer is configured for ${scope.year}.`);
    const base = endpoint('dc-building-permits').replace(/\/\d+$/, `/${layer}`);
    return arcgisUrl(
      base,
      { where: `SSL='${dcSsl(scope.parcelId)}'`, outFields: DC_PERMIT_FIELDS.join(','), orderByFields: 'PERMIT_ID' },
      page,
      pageSize,
    );
  },
  parse: arcgisRows,
  validate(row, scope) {
    if (dcParcel(row.SSL) !== scope.parcelId) return 'different lot';
    if (!text(row.PERMIT_ID)) return 'unnumbered permit';
    if (!isoDay(row.ISSUE_DATE)) return 'no issue date';
    const type = text(row.PERMIT_TYPE_NAME).toUpperCase();
    if (!DC_KEPT_SUBTYPES[type]?.includes(text(row.PERMIT_SUBTYPE_NAME).toUpperCase())) return 'kind not kept';
    if (DC_DROPPED_STATUSES.some(word => text(row.APPLICATION_STATUS_NAME).toUpperCase().includes(word)))
      return 'canceled, withdrawn or revoked';
    return null;
  },
  normalize(row, { observedAt }) {
    const parcelId = dcParcel(row.SSL);
    const type = text(row.PERMIT_TYPE_NAME).toUpperCase();
    const subtype = text(row.PERMIT_SUBTYPE_NAME).toUpperCase();
    const { kind, work } = classifyDcPermit(type, subtype);
    const statusLabel = text(row.APPLICATION_STATUS_NAME);
    return [
      observation({
        sourceId: 'dc-building-permits',
        kind: 'permit',
        parcelId,
        identity: text(row.PERMIT_ID),
        values: {
          permitKind: kind,
          work,
          status: dcPermitStatus(statusLabel),
          statusLabel: sentenceCase(statusLabel),
        },
        dates: {
          transaction: null,
          recorded: null,
          effective: isoDay(row.ISSUE_DATE),
          published: isoTime(row.LASTMODIFIEDDATE),
          observed: observedAt,
        },
      }),
    ];
  },
};

// ——— Maryland ———

const SDAT = {
  account: 'account_id_mdp_field_acctid',
  date1: 'sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89',
  price1: 'sales_segment_1_consideration_mdp_field_considr1_sdat_field_90',
  conveyed1: 'sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87',
  book1: 'deed_reference_1_liber_mdp_field_dr1liber_sdat_field_30',
  page1: 'deed_reference_1_folio_mdp_field_dr1folio_sdat_field_31',
  date2: 'sales_segment_2_transfer_date_yyyy_mm_dd_sdat_field_109',
  price2: 'sales_segment_2_consideration_sdat_field_110',
  total: 'current_assessment_year_total_assessment_sdat_field_172',
  phaseIn: 'current_assessment_year_total_phase_in_value_sdat_field_171',
  prior: 'prior_assessment_year_total_assessment_sdat_field_161',
  land: 'current_cycle_data_land_value_mdp_field_names_nfmlndvl_curlndvl_and_sallndvl_sdat_field_164',
  improvements: 'current_cycle_data_improvements_value_mdp_field_names_nfmimpvl_curimpvl_and_salimpvl_sdat_field_165',
  assessed: 'current_cycle_data_date_assessed_yyyy_mm_mdp_field_lastassd_sdat_field_169',
} as const;
const SDAT_FIELDS = Object.values(SDAT);
/** "Private arms-length transfer, Improved (1)" → "Private arms-length transfer, improved". */
const conveyance = (value: unknown) => {
  const label = text(value).replace(/\s*\(\d+\)$/, '');
  return label ? label.charAt(0) + label.slice(1).toLowerCase() : null;
};
const sdatPublication = socrataPublication('https://opendata.maryland.gov/api/views/ed4q-f8tm.json');

/** One account's state record, or covered-county accounts whose newest transfer is after a date. */
export const mdSdatAdapter: SourceAdapter<ParcelScope | AfterScope, Row> = {
  sourceId: 'md-sdat-assessments',
  use: 'monitoring',
  fields: SDAT_FIELDS,
  describe: scope =>
    'parcelId' in scope
      ? `state record of account ${scope.parcelId}`
      : `Montgomery and Prince George’s transfers after ${scope.after}`,
  publication: sdatPublication,
  request(scope, page, pageSize) {
    let where: string;
    if ('parcelId' in scope) {
      if (!MD_ACCOUNT.test(scope.parcelId)) throw new Error('Invalid Maryland account identifier.');
      where = `${SDAT.account}='${scope.parcelId}'`;
    } else {
      if (!DAY.test(scope.after)) throw new Error('Invalid date.');
      where = `jurisdiction_code_mdp_field_jurscode in ('MONT','PRIN') AND ${SDAT.date1} > '${scope.after.replaceAll('-', '.')}'`;
    }
    return socrataUrl(
      endpoint('md-sdat-assessments'),
      { $select: SDAT_FIELDS.join(','), $where: where, $order: SDAT.account },
      page,
      'parcelId' in scope ? 10 : pageSize,
    );
  },
  parse: socrataRows,
  validate(row, scope) {
    if (!MD_ACCOUNT.test(text(row[SDAT.account]))) return 'missing account identifier';
    if ('parcelId' in scope && text(row[SDAT.account]) !== scope.parcelId) return 'different account';
    return null;
  },
  normalize(row, { observedAt, published }) {
    const parcelId = text(row[SDAT.account]);
    const dates = { transaction: null, recorded: null, effective: null, published, observed: observedAt };
    const assessed = text(row[SDAT.assessed]);
    const out: Observation[] = [
      observation({
        sourceId: 'md-sdat-assessments',
        kind: 'assessment',
        parcelId,
        identity: `${parcelId}:assessment`,
        values: {
          currentTotal: finite(row[SDAT.total]),
          phaseInValue: finite(row[SDAT.phaseIn]),
          priorYearTotal: finite(row[SDAT.prior]),
          land: finite(row[SDAT.land]),
          improvements: finite(row[SDAT.improvements]),
        },
        dates: { ...dates, effective: /^\d{4}\.\d{2}$/.test(assessed) ? `${assessed.replace('.', '-')}-01` : null },
      }),
    ];
    for (const [date, price, extra] of [
      [SDAT.date1, SDAT.price1, true],
      [SDAT.date2, SDAT.price2, false],
    ] as const) {
      const transaction = isoDay(text(row[date]));
      if (!transaction) continue;
      const values: Record<string, ObservationValue> = { price: finite(row[price]) };
      if (extra) {
        values.conveyance = conveyance(row[SDAT.conveyed1]);
        values.deedBook = text(row[SDAT.book1]) || null;
        values.deedPage = text(row[SDAT.page1]) || null;
      }
      out.push(
        observation({
          sourceId: 'md-sdat-assessments',
          kind: 'recorded-transfer',
          parcelId,
          identity: `${parcelId}:${transaction}`,
          values,
          dates: { ...dates, transaction },
        }),
      );
    }
    return out;
  },
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
  TRL: 'TRAIL',
  XING: 'CROSSING',
  PIKE: 'PIKE',
  GRN: 'GREEN',
  PT: 'POINT',
  RDG: 'RIDGE',
  CV: 'COVE',
  LOOP: 'LOOP',
  RUN: 'RUN',
  WALK: 'WALK',
  TPKE: 'TURNPIKE',
  CTR: 'CENTER',
};
const DIRECTIONS: Record<string, string> = {
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
};
/** The bundled importer's address key (scripts/datasets/fetch-maryland-facts.py), so live and bundled agree. */
export function montgomeryAddressKey(address: string, zip: string) {
  const words = address
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => SUFFIXES[word] ?? DIRECTIONS[word] ?? word);
  return words.length && /^\d/.test(words[0]) ? `${words.join(' ')}|${zip.slice(0, 5)}` : '';
}
const MONTGOMERY_FIELDS = publicSource('montgomery-permits').fields.requested;
export type AddressScope = ParcelScope & { address: string; zip: string };

/** Permits filed at one covered Montgomery address, matched exactly as the bundled snapshot matched them. */
export const montgomeryPermitsAdapter: SourceAdapter<AddressScope, Row> = {
  sourceId: 'montgomery-permits',
  use: 'monitoring',
  fields: MONTGOMERY_FIELDS,
  describe: scope => `permits at ${montgomeryAddressKey(scope.address, scope.zip)}`,
  publication: socrataPublication('https://data.montgomerycountymd.gov/api/views/m88u-pqki.json'),
  request(scope, page, pageSize) {
    const number = scope.address.trim().split(/\s+/)[0];
    if (!/^\d{1,6}[A-Z]?$/i.test(number) || !/^\d{5}$/.test(scope.zip.slice(0, 5)))
      throw new Error('This address cannot be matched to county permits.');
    return socrataUrl(
      endpoint('montgomery-permits'),
      {
        $select: MONTGOMERY_FIELDS.join(','),
        $where: `stno='${number.toUpperCase()}' AND starts_with(zip, '${scope.zip.slice(0, 5)}') AND issueddate >= '2016-01-01T00:00:00'`,
        $order: 'permitno',
      },
      page,
      pageSize,
    );
  },
  parse: socrataRows,
  validate(row, scope) {
    const key = montgomeryAddressKey(
      ['stno', 'predir', 'stname', 'suffix', 'postdir'].map(part => text(row[part])).join(' '),
      text(row.zip),
    );
    if (!key || key !== montgomeryAddressKey(scope.address, scope.zip)) return 'different address';
    if (!text(row.permitno)) return 'unnumbered permit';
    if (!isoDay(text(row.issueddate).slice(0, 10))) return 'no issue date';
    return null;
  },
  normalize(row, { observedAt, published, scope }) {
    const { kind, work } = classifyMontgomeryPermit(text(row.worktype), text(row.usecode));
    const declared = finite(row.declaredvaluation);
    return [
      observation({
        sourceId: 'montgomery-permits',
        kind: 'permit',
        parcelId: scope.parcelId,
        identity: text(row.permitno),
        values: {
          permitKind: kind,
          work,
          status: montgomeryPermitStatus(text(row.status)),
          statusLabel: text(row.status),
          finaled: isoDay(text(row.finaleddate).slice(0, 10)),
          declaredValue: declared === null ? null : Math.round(declared),
        },
        dates: {
          transaction: null,
          recorded: null,
          effective: isoDay(text(row.issueddate).slice(0, 10)),
          published,
          observed: observedAt,
        },
      }),
    ];
  },
};

// ——— Regional and national ———

/** The FHFA metropolitan division that covers the District, Montgomery and Prince George’s. */
export const WASHINGTON_MSAD = { cbsa: '47764', name: 'Washington, DC-MD metropolitan division' } as const;
export type IndexScope = { cbsa: string };
const quarterEnd = (year: number, quarter: number) =>
  new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);

export const fhfaIndexAdapter: SourceAdapter<IndexScope, Row> = {
  sourceId: 'fhfa-purchase-only-index',
  use: 'monitoring',
  fields: publicSource('fhfa-purchase-only-index').fields.requested,
  describe: scope => `purchase-only index for CBSA ${scope.cbsa}`,
  request: () => endpoint('fhfa-purchase-only-index'),
  parse(body) {
    const lines = body.trim().split(/\r?\n/);
    const header = lines[0]?.split('\t').map(cell => cell.trim());
    if (!header || ['cbsa', 'metro_name', 'yr', 'qtr', 'index_nsa', 'index_sa'].some(name => !header.includes(name)))
      throw new Error('Unexpected index file layout.');
    const rows = lines.slice(1).map(line => {
      const cells = line.split('\t');
      return Object.fromEntries(header.map((name, i) => [name, (cells[i] ?? '').replace(/^"|"$/g, '').trim()]));
    });
    return { rows, more: false };
  },
  validate(row, scope) {
    if (text(row.cbsa) !== scope.cbsa) return 'other area';
    const year = Number(row.yr),
      quarter = Number(row.qtr);
    if (!Number.isInteger(year) || !(quarter >= 1 && quarter <= 4)) return 'invalid period';
    if (finite(row.index_nsa) === null) return 'no index value';
    return null;
  },
  normalize(row, { observedAt, scope }) {
    const year = Number(row.yr),
      quarter = Number(row.qtr);
    return [
      observation({
        sourceId: 'fhfa-purchase-only-index',
        kind: 'price-index',
        parcelId: null,
        identity: `${scope.cbsa}:${year}Q${quarter}`,
        values: {
          area: text(row.metro_name),
          indexNsa: finite(row.index_nsa),
          indexSa: finite(row.index_sa),
          year,
          quarter,
        },
        dates: {
          transaction: null,
          recorded: null,
          effective: quarterEnd(year, quarter),
          published: null,
          observed: observedAt,
        },
      }),
    ];
  },
};

export type PointScope = ParcelScope & { lat: number; lng: number };
const FEMA_FIELDS = publicSource('fema-flood-hazard').fields.requested;
export const femaFloodAdapter: SourceAdapter<PointScope, Row> = {
  sourceId: 'fema-flood-hazard',
  use: 'monitoring',
  fields: FEMA_FIELDS,
  describe: scope => `flood zone at ${scope.lat.toFixed(6)},${scope.lng.toFixed(6)}`,
  request(scope, page, pageSize) {
    if (!(Math.abs(scope.lat) <= 90 && Math.abs(scope.lng) <= 180)) throw new Error('Invalid coordinates.');
    return arcgisUrl(
      endpoint('fema-flood-hazard'),
      {
        geometry: `${scope.lng.toFixed(6)},${scope.lat.toFixed(6)}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: FEMA_FIELDS.join(','),
      },
      page,
      pageSize,
    );
  },
  parse: (body, pageSize) => ({ ...arcgisRows(body, pageSize), more: false }),
  validate: row => (text(row.FLD_ZONE) ? null : 'no zone'),
  normalize(row, { observedAt, scope }) {
    const zone = text(row.FLD_ZONE);
    return [
      observation({
        sourceId: 'fema-flood-hazard',
        kind: 'flood-zone',
        parcelId: scope.parcelId,
        identity: `${scope.parcelId}:flood:${zone}`,
        values: {
          zone,
          subtype: text(row.ZONE_SUBTY) ? sentenceCase(text(row.ZONE_SUBTY)) : null,
          specialFloodHazardArea: text(row.SFHA_TF) === 'T',
          mapArea: text(row.DFIRM_ID) || null,
        },
        dates: { transaction: null, recorded: null, effective: null, published: null, observed: observedAt },
      }),
    ];
  },
};

/** A disabled source as an adapter: running it returns a `disabled` manifest with the permission it needs. */
export function disabledAdapter(sourceId: string): SourceAdapter<ParcelScope, Row> {
  return {
    sourceId,
    use: 'monitoring',
    fields: [],
    describe: scope => `records of ${scope.parcelId}`,
    request: () => {
      throw new Error('Disabled sources never send requests.');
    },
    parse: () => ({ rows: [], more: false }),
    validate: () => 'disabled',
    normalize: () => [],
  };
}
