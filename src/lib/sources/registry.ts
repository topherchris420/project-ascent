/**
 * The public sources Ascent may read for homeowners, each with the permission it was given, the fields it may
 * request and what each of its dates means. A source with no confirmed permission is listed as disabled with the
 * permission it needs; an adapter refuses to run for it. Nothing here is inferred from a website being reachable.
 *
 * Every license record names the evidence that was checked and the date it was checked. Re-check before relying on
 * a record after that date; a source that changes its terms must be disabled here first.
 */
export const SOURCE_REGISTRY_VERSION = 'ascent-source-registry-1';

export type DataCategory =
  | 'recorded-transfers'
  | 'parcels'
  | 'assessments'
  | 'characteristics'
  | 'permits'
  | 'property-tax'
  | 'environmental-risk'
  | 'price-index'
  | 'listings';
/** What a source's terms permit. Ascent's own policy (`ASCENT_POLICY`) can be stricter than a license. */
export type SourceUse =
  'display' | 'monitoring' | 'valuation' | 'export' | 'redistribution' | 'bulk-download' | 'model-inference';
export const sourceUses: readonly SourceUse[] = [
  'display',
  'monitoring',
  'valuation',
  'export',
  'redistribution',
  'bulk-download',
  'model-inference',
];
export type Jurisdiction =
  'dc' | 'maryland' | 'montgomery' | 'prince-georges' | 'fairfax' | 'arlington' | 'loudoun' | 'united-states';
export type LicenseKind = 'open' | 'public-domain' | 'us-government-work' | 'restricted' | 'unconfirmed';

export type PublicSource = {
  id: string;
  name: string;
  publisher: string;
  jurisdiction: Jurisdiction;
  /** Directive phases: A is the District, B Montgomery and Prince George’s, C Northern Virginia. */
  phase: 'A' | 'B' | 'C' | 'regional';
  categories: DataCategory[];
  license: { name: string; kind: LicenseKind; evidence: string; checkedOn: string; termsUrl: string };
  attribution: string;
  uses: Record<SourceUse, boolean>;
  access: { protocol: 'arcgis-rest' | 'socrata' | 'csv-download' | 'bundled' | 'none'; endpoint: string | null };
  /** Field allowlist. Personal fields the source also publishes are listed so a reviewer can see they are refused. */
  fields: { requested: readonly string[]; neverRequested: readonly string[] };
  /** Which field carries each kind of date; `null` when the source does not publish that date at all. */
  dates: { transaction: string | null; recording: string | null; publication: string | null; note: string };
  refresh: {
    cadence: string;
    incremental: boolean;
    /** Minimum time between two requests to this source from one server process. */
    minIntervalMs: number;
    pageSize: number;
    maxPagesPerRun: number;
    timeoutMs: number;
    retries: number;
    /** How long one per-home answer may be reused before the source is asked again. */
    cacheHours: number;
    /** Requests one server process may send this source in an hour, across every homeowner. */
    hourlyCeiling: number;
  };
  status: 'enabled' | 'disabled';
  disabledReason?: string;
  requiredPermission?: string;
  limitations: readonly string[];
};

/**
 * Ascent's own rules on top of any license. Records refreshed after a validated snapshot never reach an estimate:
 * folding them in changes the fingerprints the published studies scored and needs a new registered protocol.
 */
export const ASCENT_POLICY = {
  refreshedRecordsInValuation: false,
  ownerNamesRequested: false,
  scraping: false,
  note: 'Refreshed public records are shown and monitored. They are never added to an estimate, because the published accuracy studies scored the bundled snapshots and only a new registered study can change that.',
} as const;

const CHECKED = '2026-10-22';
const ccBy = (evidence: string) =>
  ({
    name: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    kind: 'open',
    evidence,
    checkedOn: CHECKED,
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/',
  }) as const;
const openUses: Record<SourceUse, boolean> = {
  display: true,
  monitoring: true,
  valuation: true,
  export: true,
  redistribution: true,
  'bulk-download': true,
  // No license here restricts it; Ascent's production policy still blocks external model synthesis.
  'model-inference': true,
};
const noUses: Record<SourceUse, boolean> = {
  display: false,
  monitoring: false,
  valuation: false,
  export: false,
  redistribution: false,
  'bulk-download': false,
  'model-inference': false,
};
const DC_LAND = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer';
const DC_ATTRIBUTION = 'Contains District of Columbia open data licensed under CC BY 4.0.';
const arcgisRefresh = {
  minIntervalMs: 400,
  pageSize: 2000,
  maxPagesPerRun: 25,
  timeoutMs: 30_000,
  retries: 3,
  cacheHours: 12,
  hourlyCeiling: 600,
} as const;
const disabledRefresh = {
  cadence: 'Not refreshed',
  incremental: false,
  minIntervalMs: 0,
  pageSize: 0,
  maxPagesPerRun: 0,
  timeoutMs: 0,
  retries: 0,
  cacheHours: 0,
  hourlyCeiling: 0,
} as const;

export const PUBLIC_SOURCES: readonly PublicSource[] = [
  {
    id: 'dc-property-sales',
    name: 'District Tax System Property Sales (CAMA)',
    publisher: 'District of Columbia, Office of Tax and Revenue, via DC GIS',
    jurisdiction: 'dc',
    phase: 'A',
    categories: ['recorded-transfers'],
    license: ccBy(`Layer item information at ${DC_LAND}/57/iteminfo?f=json states CC BY 4.0.`),
    attribution: `${DC_ATTRIBUTION} Tax System Property Sales (CAMA).`,
    uses: openUses,
    access: { protocol: 'arcgis-rest', endpoint: `${DC_LAND}/57` },
    fields: {
      requested: ['SSL', 'SALE_DATE', 'SALE_PRICE', 'QUALIFIED', 'SALE_CODE', 'GIS_LAST_MOD_DTTM'],
      neverRequested: ['SALE_CURR_OWNER'],
    },
    dates: {
      transaction: 'SALE_DATE',
      recording: null,
      publication: 'GIS_LAST_MOD_DTTM',
      note: 'The layer is republished as a whole, so every row carries the same recent modification time. A new modification time is not a new sale; only a new sale date is.',
    },
    refresh: { cadence: 'Republished daily by the District', incremental: true, ...arcgisRefresh },
    status: 'enabled',
    limitations: [
      'Recordation lags closing by weeks; the newest weeks are always incomplete.',
      'Concessions and terms are not recorded.',
      'Row identifiers change on each republish, so Ascent identifies a sale by its lot, date and price.',
    ],
  },
  {
    id: 'dc-tax-extract',
    name: 'District Integrated Tax System Public Extract (ITSPE)',
    publisher: 'District of Columbia, Office of the Chief Financial Officer, via DC GIS',
    jurisdiction: 'dc',
    phase: 'A',
    categories: ['assessments', 'property-tax', 'recorded-transfers', 'parcels'],
    license: ccBy(`Layer item information at ${DC_LAND}/53/iteminfo?f=json states CC BY 4.0.`),
    attribution: `${DC_ATTRIBUTION} Integrated Tax System Public Extract.`,
    uses: openUses,
    access: { protocol: 'arcgis-rest', endpoint: `${DC_LAND}/53` },
    fields: {
      requested: [
        'SSL',
        'USECODE',
        'PROPTYPE',
        'OLDTOTAL',
        'NEWLAND',
        'NEWIMPR',
        'NEWTOTAL',
        'ASSESSMENT',
        'ANNUALTAX',
        'TAXRATE',
        'CLASSTYPE',
        'SALEPRICE',
        'SALEDATE',
        'DEEDDATE',
        'ACCEPTCODE',
        'SALETYPE',
        'EXTRACTDAT',
      ],
      neverRequested: [
        'OWNERNAME',
        'OWNNAME2',
        'CAREOFNAME',
        'ADDRESS1',
        'ADDRESS2',
        'CITYSTZIP',
        'MORTGAGECO',
        'HSTDCODE',
        'OWNOCCT',
        'LASTPAYDT',
        'TOTBALAMT',
      ],
    },
    dates: {
      transaction: 'SALEDATE',
      recording: 'DEEDDATE',
      publication: 'EXTRACTDAT',
      note: 'The sale date is the transfer, the deed date is when the deed is dated, and the extract date is when the District last exported the tax record. None of them is when Ascent looked.',
    },
    refresh: { cadence: 'Extracted periodically by the District', incremental: false, ...arcgisRefresh },
    status: 'enabled',
    limitations: [
      'Only the most recent sale is carried; earlier transfers come from the sales layer.',
      'An assessment is the District’s tax valuation, not a market value or an appraisal.',
      'Tax payment status and balances are deliberately not requested.',
    ],
  },
  {
    id: 'dc-building-permits',
    name: 'District Department of Buildings permits',
    publisher: 'District of Columbia, Department of Buildings, via DC GIS',
    jurisdiction: 'dc',
    phase: 'A',
    categories: ['permits'],
    license: ccBy(
      'Layer item information at https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/18/iteminfo?f=json states CC BY 4.0.',
    ),
    attribution: `${DC_ATTRIBUTION} Building Permits.`,
    uses: openUses,
    access: {
      protocol: 'arcgis-rest',
      endpoint: 'https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/18',
    },
    fields: {
      requested: [
        'PERMIT_ID',
        'ISSUE_DATE',
        'PERMIT_TYPE_NAME',
        'PERMIT_SUBTYPE_NAME',
        'APPLICATION_STATUS_NAME',
        'SSL',
        'LASTMODIFIEDDATE',
      ],
      neverRequested: ['OWNER_NAME', 'PERMIT_APPLICANT', 'DESC_OF_WORK', 'FEES_PAID', 'FEE_TYPE'],
    },
    dates: {
      transaction: null,
      recording: null,
      publication: 'LASTMODIFIEDDATE',
      note: 'The issue date is when the work was authorized. A permit is not finished work, and unpermitted work never appears.',
    },
    refresh: {
      cadence: 'Updated continuously by the District; one layer per issue year, the current year is checked live',
      incremental: true,
      ...arcgisRefresh,
    },
    status: 'enabled',
    limitations: [
      'Live checks read the current year’s layer; earlier years come from the bundled snapshot since 2016.',
      'A permit shows authorized work, not completed work or current condition.',
    ],
  },
  {
    id: 'dc-cama-and-addresses',
    name: 'District CAMA Residential and Condominium characteristics, Address Points',
    publisher: 'District of Columbia, Office of Tax and Revenue and OCTO',
    jurisdiction: 'dc',
    phase: 'A',
    categories: ['characteristics', 'parcels'],
    license: ccBy(`Layer item information for ${DC_LAND}/25, /24 and /52 states CC BY 4.0.`),
    attribution: `${DC_ATTRIBUTION} CAMA Residential, Condominium and Address Points.`,
    uses: openUses,
    access: { protocol: 'bundled', endpoint: `${DC_LAND}/25` },
    fields: {
      requested: ['See scripts/datasets/fetch-dc-sales.py and fetch-dc-facts.py'],
      neverRequested: ['OWNERNAME'],
    },
    dates: {
      transaction: null,
      recording: null,
      publication: null,
      note: 'Characteristics are the assessor’s current record, not the home as of any sale.',
    },
    refresh: {
      ...disabledRefresh,
      cadence:
        'Bundled snapshot; refreshed only by the Python importers, which change the validated fingerprints and require re-validation',
    },
    status: 'enabled',
    limitations: ['Refreshing this snapshot changes what the published studies scored; it is deliberately manual.'],
  },
  {
    id: 'md-sdat-assessments',
    name: 'Maryland SDAT/MDP Real Property Assessments (owner names hidden)',
    publisher: 'Maryland State Department of Assessments and Taxation and Department of Planning',
    jurisdiction: 'maryland',
    phase: 'B',
    categories: ['assessments', 'recorded-transfers', 'characteristics', 'parcels'],
    license: {
      name: 'Public Domain',
      kind: 'public-domain',
      evidence:
        'Dataset metadata at https://opendata.maryland.gov/api/views/ed4q-f8tm.json lists license “Public Domain”.',
      checkedOn: CHECKED,
      termsUrl: 'https://opendata.maryland.gov/d/ed4q-f8tm',
    },
    attribution: 'Maryland SDAT and MDP real property assessment data (public domain).',
    uses: openUses,
    access: { protocol: 'socrata', endpoint: 'https://opendata.maryland.gov/resource/ed4q-f8tm.json' },
    fields: {
      requested: [
        'account_id_mdp_field_acctid',
        'sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89',
        'sales_segment_1_consideration_mdp_field_considr1_sdat_field_90',
        'sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87',
        'deed_reference_1_liber_mdp_field_dr1liber_sdat_field_30',
        'deed_reference_1_folio_mdp_field_dr1folio_sdat_field_31',
        'sales_segment_2_transfer_date_yyyy_mm_dd_sdat_field_109',
        'sales_segment_2_consideration_sdat_field_110',
        'current_assessment_year_total_assessment_sdat_field_172',
        'current_assessment_year_total_phase_in_value_sdat_field_171',
        'prior_assessment_year_total_assessment_sdat_field_161',
        'current_cycle_data_land_value_mdp_field_names_nfmlndvl_curlndvl_and_sallndvl_sdat_field_164',
        'current_cycle_data_improvements_value_mdp_field_names_nfmimpvl_curimpvl_and_salimpvl_sdat_field_165',
        'current_cycle_data_date_assessed_yyyy_mm_mdp_field_lastassd_sdat_field_169',
      ],
      neverRequested: [
        'sales_segment_1_grantor_name_mdp_field_grntnam1_sdat_field_80',
        'sales_segment_2_grantor_name_sdat_field_100',
        'mailing address fields',
      ],
    },
    dates: {
      transaction: 'sales_segment_1_transfer_date (transfer date)',
      recording: null,
      publication: 'dataset rowsUpdatedAt',
      note: 'The state records a transfer date and a land-records book and page, not a recording date. The dataset’s update time is when the state last refreshed the file.',
    },
    refresh: {
      cadence: 'Refreshed by the state roughly monthly',
      incremental: false,
      minIntervalMs: 500,
      pageSize: 50_000,
      maxPagesPerRun: 4,
      timeoutMs: 45_000,
      retries: 3,
      cacheHours: 24,
      hourlyCeiling: 300,
    },
    status: 'enabled',
    limitations: [
      'Only the three most recent transfers are carried per account.',
      'Assessments follow a three-year cycle with phase-in, so the assessed value lags the market by design.',
    ],
  },
  {
    id: 'montgomery-permits',
    name: 'Montgomery County DPS Residential Permits',
    publisher: 'Montgomery County Department of Permitting Services',
    jurisdiction: 'montgomery',
    phase: 'B',
    categories: ['permits'],
    license: {
      name: 'Public Domain',
      kind: 'public-domain',
      evidence:
        'Dataset metadata at https://data.montgomerycountymd.gov/api/views/m88u-pqki.json lists license “Public Domain”.',
      checkedOn: CHECKED,
      termsUrl: 'https://data.montgomerycountymd.gov/d/m88u-pqki',
    },
    attribution: 'Montgomery County Department of Permitting Services residential permits (public domain).',
    uses: openUses,
    access: { protocol: 'socrata', endpoint: 'https://data.montgomerycountymd.gov/resource/m88u-pqki.json' },
    fields: {
      requested: [
        'permitno',
        'status',
        'stno',
        'predir',
        'stname',
        'suffix',
        'postdir',
        'zip',
        'issueddate',
        'finaleddate',
        'declaredvaluation',
        'worktype',
        'usecode',
      ],
      neverRequested: ['description', 'applicant and contractor fields'],
    },
    dates: {
      transaction: null,
      recording: null,
      publication: 'dataset rowsUpdatedAt',
      note: 'Issue and final dates describe the permit. The county publishes no parcel identifier, so a permit is matched to a home by its exact address.',
    },
    refresh: {
      cadence: 'Updated by the county daily',
      incremental: true,
      minIntervalMs: 500,
      pageSize: 1000,
      maxPagesPerRun: 2,
      timeoutMs: 30_000,
      retries: 3,
      cacheHours: 12,
      hourlyCeiling: 300,
    },
    status: 'enabled',
    limitations: ['A permit filed under a different form of the address is missed.'],
  },
  {
    id: 'prince-georges-permits',
    name: 'Prince George’s County permits',
    publisher: 'Prince George’s County Department of Permitting, Inspections and Enforcement',
    jurisdiction: 'prince-georges',
    phase: 'B',
    categories: ['permits'],
    license: {
      name: 'No stated license',
      kind: 'unconfirmed',
      evidence:
        'The county publishes permit data without a stated open license (checked for the October 22 property records work).',
      checkedOn: CHECKED,
      termsUrl: 'https://data.princegeorgescountymd.gov/',
    },
    attribution: '',
    uses: noUses,
    access: { protocol: 'none', endpoint: null },
    fields: { requested: [], neverRequested: [] },
    dates: { transaction: null, recording: null, publication: null, note: 'Not read.' },
    refresh: disabledRefresh,
    status: 'disabled',
    disabledReason: 'No open license is stated, so reuse and redistribution are not established.',
    requiredPermission:
      'A published open license on the dataset, or written permission from the county covering display, monitoring and redistribution of permit records.',
    limitations: ['Prince George’s homes show no permits; the brief says why.'],
  },
  ...(
    [
      ['fairfax-county', 'fairfax', 'Fairfax County GIS and Department of Tax Administration'],
      ['arlington-county', 'arlington', 'Arlington County Department of Real Estate Assessments'],
      ['loudoun-county', 'loudoun', 'Loudoun County Office of the Commissioner of the Revenue and GIS'],
    ] as const
  ).map(([id, jurisdiction, publisher]): PublicSource => ({
    id: `${id}-records`,
    name: `${publisher} parcel, assessment and sales records`,
    publisher,
    jurisdiction,
    phase: 'C',
    categories: ['parcels', 'assessments', 'recorded-transfers', 'characteristics'],
    license: {
      name: 'Permission not received',
      kind: 'restricted',
      evidence:
        'Published terms grant internal or personal use only, or state no reuse terms. Written requests are drafted in docs/data-permissions/virginia-requests.md and unsent.',
      checkedOn: '2026-10-18',
      termsUrl: 'docs/data-permissions/virginia-requests.md',
    },
    attribution: '',
    uses: noUses,
    access: { protocol: 'none', endpoint: null },
    fields: { requested: [], neverRequested: [] },
    dates: { transaction: null, recording: null, publication: null, note: 'Not read.' },
    refresh: disabledRefresh,
    status: 'disabled',
    disabledReason: 'No written permission covers public display, valuation or redistribution.',
    requiredPermission:
      'A written reply from the county naming the datasets and permitted uses (display, valuation, monitoring and redistribution of a minimized snapshot), attribution, refresh limits and expiry.',
    limitations: ['Virginia homes are not covered.'],
  })),
  {
    id: 'fhfa-purchase-only-index',
    name: 'FHFA purchase-only house price index, metropolitan divisions',
    publisher: 'U.S. Federal Housing Finance Agency',
    jurisdiction: 'united-states',
    phase: 'regional',
    categories: ['price-index'],
    license: {
      name: 'U.S. Government work',
      kind: 'us-government-work',
      evidence:
        'The data.gov record for the FHFA House Price Indexes lists no license and marks the data for public access; works of U.S. federal employees have no U.S. copyright (17 U.S.C. 105). The index names are FHFA trademarks, so Ascent attributes the data and does not brand with them.',
      checkedOn: CHECKED,
      termsUrl: 'https://catalog.data.gov/dataset/fhfa-house-price-indexes-hpis',
    },
    attribution:
      'U.S. Federal Housing Finance Agency, purchase-only house price index (quarterly, metropolitan divisions).',
    uses: openUses,
    access: {
      protocol: 'csv-download',
      endpoint: 'https://www.fhfa.gov/hpi/download/quarterly_datasets/hpi_po_metro.txt',
    },
    fields: { requested: ['cbsa', 'metro_name', 'yr', 'qtr', 'index_nsa', 'index_sa'], neverRequested: [] },
    dates: {
      transaction: null,
      recording: null,
      publication: null,
      note: 'Each value describes a calendar quarter of sales across a whole metropolitan division, published about two months after the quarter ends. The file carries no release date, so a quarter is dated by its end and Ascent records when it fetched the file.',
    },
    refresh: {
      cadence: 'Quarterly',
      incremental: false,
      minIntervalMs: 1000,
      pageSize: 0,
      maxPagesPerRun: 1,
      timeoutMs: 45_000,
      retries: 3,
      cacheHours: 24,
      hourlyCeiling: 20,
    },
    status: 'enabled',
    limitations: [
      'A metropolitan index describes a whole region, not any one home or neighborhood.',
      'It is never used in an estimate and never announced as a change in your home’s value.',
    ],
  },
  {
    id: 'fema-flood-hazard',
    name: 'FEMA National Flood Hazard Layer, flood hazard zones',
    publisher: 'U.S. Federal Emergency Management Agency',
    jurisdiction: 'united-states',
    phase: 'regional',
    categories: ['environmental-risk'],
    license: {
      name: 'U.S. Government work',
      kind: 'us-government-work',
      evidence:
        'The data.gov record for the National Flood Hazard Layer lists license https://www.usa.gov/government-works and public access.',
      checkedOn: CHECKED,
      termsUrl: 'https://catalog.data.gov/dataset/national-flood-hazard-layer',
    },
    attribution: 'FEMA National Flood Hazard Layer.',
    uses: openUses,
    access: {
      protocol: 'arcgis-rest',
      endpoint: 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
    },
    fields: { requested: ['FLD_ZONE', 'ZONE_SUBTY', 'SFHA_TF', 'DFIRM_ID'], neverRequested: [] },
    dates: {
      transaction: null,
      recording: null,
      publication: null,
      note: 'The layer does not return an effective date with the zone; FEMA updates it as new maps take effect.',
    },
    refresh: {
      cadence: 'Updated by FEMA as new flood maps take effect',
      incremental: false,
      minIntervalMs: 500,
      pageSize: 10,
      maxPagesPerRun: 1,
      timeoutMs: 30_000,
      retries: 2,
      cacheHours: 24 * 7,
      hourlyCeiling: 300,
    },
    status: 'enabled',
    limitations: [
      'The digital layer is not an official flood determination; the effective FIRM and a lender’s determination are.',
      'A zone is looked up at the home’s recorded point, which may differ from the building footprint.',
    ],
  },
];

export class SourcePermissionError extends Error {
  constructor(
    public sourceId: string,
    message: string,
  ) {
    super(message);
  }
}

export function publicSource(id: string): PublicSource {
  const source = PUBLIC_SOURCES.find(item => item.id === id);
  if (!source) throw new SourcePermissionError(id, `Unknown source ${id}; it has no permission record.`);
  return source;
}

/** Throws unless the source is enabled and its recorded terms permit the use. */
export function assertSourceUse(id: string, use: SourceUse): PublicSource {
  const source = publicSource(id);
  if (source.status !== 'enabled')
    throw new SourcePermissionError(id, `${source.name} is disabled: ${source.disabledReason ?? 'no permission.'}`);
  if (!source.uses[use]) throw new SourcePermissionError(id, `${source.name} does not permit ${use}.`);
  if (use === 'valuation' && !ASCENT_POLICY.refreshedRecordsInValuation)
    throw new SourcePermissionError(id, ASCENT_POLICY.note);
  return source;
}

/** Throws when a request would ask for a field the source record does not allow. */
export function assertFieldsAllowed(source: PublicSource, fields: readonly string[]) {
  const allowed = new Set(source.fields.requested);
  const refused = fields.filter(field => !allowed.has(field));
  if (refused.length)
    throw new SourcePermissionError(source.id, `Fields outside ${source.name}’s allowlist: ${refused.join(', ')}.`);
}

/** The registry as a reviewer reads it: what is enabled, what is blocked and what each needs. */
export function sourceCoverage() {
  return PUBLIC_SOURCES.map(source => ({
    id: source.id,
    name: source.name,
    jurisdiction: source.jurisdiction,
    phase: source.phase,
    status: source.status,
    license: source.license.name,
    checkedOn: source.license.checkedOn,
    categories: source.categories,
    permitted: sourceUses.filter(use => source.uses[use]),
    ...(source.status === 'disabled'
      ? { disabledReason: source.disabledReason, requiredPermission: source.requiredPermission }
      : {}),
  }));
}
