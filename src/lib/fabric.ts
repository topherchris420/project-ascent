import { buildDecisionGraph, calculationChecksum, defaultAssumptions, DEMO_AS_OF, distanceMiles } from './analytics';
import type { CmaAssumptions, Property, Source, Workspace } from './types';
import type {
  CanonicalProperty,
  FabricAccessContext,
  FabricSource,
  FabricState,
  FabricUse,
  IngestRun,
  NormalizedIncoming,
  RegionConfig,
  RegionCoverage,
  RegionId,
  SourceAccess,
} from './fabric-types';

export const regions: RegionConfig[] = [
  {
    id: 'dmv',
    name: 'Washington · DC / Maryland / Virginia',
    states: ['DC', 'MD', 'VA'],
    countyFips: ['11001', '24031', '24033', '51013', '51059', '51510'],
    center: { lat: 38.8895, lng: -77.093 },
    description:
      'Configured Washington-area jurisdictions. Fictional demonstration coverage; no blanket MLS access or complete regional coverage is implied.',
  },
  {
    id: 'austin',
    name: 'Austin · Central Texas',
    states: ['TX'],
    countyFips: ['48453', '48491', '48209'],
    center: { lat: 30.2088, lng: -97.7872 },
    description:
      'Configured Travis, Williamson, and Hays jurisdictions. Fictional demonstration coverage; availability depends on source and licensing.',
  },
];
export const regionConfigs = regions;
/** Analyst-selected scenario defaults, not fitted coefficients or empirical local superiority. */
export function regionalAssumptions(regionId: string): CmaAssumptions {
  regionConfig(regionId);
  return {
    ...defaultAssumptions,
    ...(regionId === 'dmv'
      ? {
          sqftRate: 145,
          bedroomValue: 18000,
          bathroomValue: 22000,
          conditionValue: 20000,
          maxDistanceMiles: 2,
          maxAgeDays: 180,
          maxSizeRatio: 1.3,
        }
      : {}),
  };
}
export function registerRegion(config: RegionConfig): void {
  if (
    !/^[a-z][a-z0-9-]{1,49}$/.test(config.id) ||
    !config.name.trim() ||
    !config.states.length ||
    !config.countyFips.length ||
    config.countyFips.some(fips => !/^\d{5}$/.test(fips)) ||
    regions.some(region => region.id === config.id)
  )
    throw new Error('Region requires a unique stable ID, states and five-digit county FIPS codes.');
  if (
    !Number.isFinite(config.center.lat) ||
    Math.abs(config.center.lat) > 90 ||
    !Number.isFinite(config.center.lng) ||
    Math.abs(config.center.lng) > 180
  )
    throw new Error('Region center coordinates are invalid.');
  regions.push(structuredClone(config));
}
export const adapterRegistry = [
  {
    id: 'reso',
    name: 'RESO JSON listing adapter',
    documentationUrl: 'https://transport.reso.org/proposals/web-api-core/',
    liveStatus:
      'Requires independently verified provider agreement, credential and configured endpoint. Implements a bounded first JSON page, not a nationwide MLS feed.',
  },
  {
    id: 'assessor',
    name: 'County assessor / open-data adapter',
    documentationUrl: 'https://opendata.dc.gov/',
    liveStatus:
      'Maps explicit fields from an authorized configured source. Assessments are not sales or an asking-price substitute.',
  },
  {
    id: 'census',
    name: 'Census geographic-link adapter',
    documentationUrl:
      'https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html',
    liveStatus:
      'Parses supplied Census geographic matches. Approximate/interpolated coordinates are not parcel ownership or valuation evidence.',
  },
] as const;
const unique = (items: string[]) => [...new Set(items)].sort();
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
const normalizeAddress = (value?: string) =>
  value?.normalize('NFKC').toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
const requiredFacts: string[] = [
  'address',
  'city',
  'state',
  'zip',
  'lat',
  'lng',
  'countyFips',
  'beds',
  'baths',
  'sqft',
  'lotSqft',
  'yearBuilt',
  'condition',
  'status',
  'price',
  'listedAt',
  'dom',
];
const stateFips: Record<string, string> = {
  AL: '01',
  AK: '02',
  AZ: '04',
  AR: '05',
  CA: '06',
  CO: '08',
  CT: '09',
  DE: '10',
  DC: '11',
  FL: '12',
  GA: '13',
  HI: '15',
  ID: '16',
  IL: '17',
  IN: '18',
  IA: '19',
  KS: '20',
  KY: '21',
  LA: '22',
  ME: '23',
  MD: '24',
  MA: '25',
  MI: '26',
  MN: '27',
  MS: '28',
  MO: '29',
  MT: '30',
  NE: '31',
  NV: '32',
  NH: '33',
  NJ: '34',
  NM: '35',
  NY: '36',
  NC: '37',
  ND: '38',
  OH: '39',
  OK: '40',
  OR: '41',
  PA: '42',
  RI: '44',
  SC: '45',
  SD: '46',
  TN: '47',
  TX: '48',
  UT: '49',
  VT: '50',
  VA: '51',
  WA: '53',
  WV: '54',
  WI: '55',
  WY: '56',
  AS: '60',
  GU: '66',
  MP: '69',
  PR: '72',
  VI: '78',
};
export const regionConfig = (id: string) => {
  const found = regions.find(region => region.id === id);
  if (!found) throw new Error('Unknown configured region.');
  return found;
};

export function sourceFreshness(source: FabricSource, asOf: string): SourceAccess['freshness'] {
  const ageHours = (Date.parse(asOf) - Date.parse(source.observedAt)) / 3600000;
  if (
    !Number.isFinite(ageHours) ||
    ageHours < 0 ||
    !Number.isFinite(source.expectedUpdateHours) ||
    source.expectedUpdateHours <= 0
  )
    return {
      ageHours: null,
      status: 'unknown',
      explanation: 'Observation time or declared source refresh policy is missing or inconsistent.',
    };
  return {
    ageHours: Number(ageHours.toFixed(2)),
    status: ageHours <= source.expectedUpdateHours ? 'fresh' : 'stale',
    explanation: `${Number(ageHours.toFixed(1))} hours since observation; compared with the source-declared ${source.expectedUpdateHours}-hour refresh policy. This is not a guarantee of listing currency.`,
  };
}

export function sourceAccess(
  source: FabricSource,
  fabric: FabricState,
  context: FabricAccessContext,
  regionId: RegionId,
  use: FabricUse,
  asOf: string,
): SourceAccess {
  const reasons: string[] = [];
  if (source.license.deploymentScope === 'local-development' && process.env.NODE_ENV === 'production')
    reasons.push('Private development approval cannot authorize production source access.');
  if (!source.regionIds.includes(regionId)) reasons.push('Source is not licensed/configured for the selected region.');
  if (!source.license.allowedUses.includes(use)) reasons.push(`Source license does not permit ${use}.`);
  if (use === 'export' && !source.license.exportAllowed) reasons.push('Source license prohibits export.');
  if (!Number.isInteger(source.license.retentionDays) || source.license.retentionDays < 1)
    reasons.push('A positive, explicit retention policy is required.');
  if (
    source.license.expiresAt &&
    (!validDate(source.license.expiresAt) || Date.parse(source.license.expiresAt) <= Date.parse(asOf))
  )
    reasons.push('Source license has expired or has an invalid expiration.');
  if (source.kind === 'licensed') {
    const review = source.license.contractReview;
    const reviewedExplorerPermission =
      source.providerId === 'rentcast' &&
      source.adapter === 'rentcast' &&
      source.license.requiresProfessionalVerification === false &&
      Boolean(
        review?.reviewedBy &&
        review.licenseReference &&
        validDate(review.reviewedAt) &&
        Date.parse(review.reviewedAt) <= Date.parse(asOf) &&
        validDate(review.expiresAt) &&
        Date.parse(review.expiresAt) > Date.parse(asOf),
      );
    if (source.license.requiresProfessionalVerification === false && !reviewedExplorerPermission)
      reasons.push(
        'A current independently reviewed contract must explicitly permit access without professional verification; source labels or payment cannot create that exception.',
      );
    if (
      !reviewedExplorerPermission &&
      (!context.credentialVerified ||
        (context.credentialExpiresAt &&
          (!validDate(context.credentialExpiresAt) || Date.parse(context.credentialExpiresAt) <= Date.parse(asOf))))
    )
      reasons.push(
        'An independently verified, current professional credential is required. Subscription payment does not verify credentials.',
      );
    if (!reviewedExplorerPermission && context.credentialRegionIds && !context.credentialRegionIds.includes(regionId))
      reasons.push('Verified credential does not cover this region.');
    const validGrant = (item: FabricState['grants'][number]) =>
      item.providerId === source.providerId &&
      item.regionIds.includes(regionId) &&
      item.allowedUses.includes(use) &&
      validDate(item.verifiedAt) &&
      Date.parse(item.verifiedAt) <= Date.parse(asOf) &&
      Boolean(item.verifiedBy) &&
      validDate(item.expiresAt) &&
      Date.parse(item.expiresAt) > Date.parse(asOf);
    const grant = fabric.grants.find(validGrant);
    if (!grant)
      reasons.push(
        'An independently verified provider grant for this region and use is required. A subscription or credential alone does not confer data rights.',
      );
    if (
      source.license.providerGrantIds &&
      (!source.license.providerGrantIds.length ||
        source.license.providerGrantIds.some(id => !fabric.grants.some(item => item.id === id && validGrant(item))))
    )
      reasons.push(
        'A specific provider grant bound to this archived evidence bundle is unavailable, revoked, expired or does not permit this use. Another unrelated grant cannot reauthorize it.',
      );
  }
  return { sourceId: source.id, allowed: reasons.length === 0, reasons, freshness: sourceFreshness(source, asOf) };
}

function addNumber(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (value === null || value === undefined || value === '') return;
  const parsed = number(value);
  if (parsed === undefined || parsed < min || parsed > max)
    throw new Error(`Invalid ${key}; no value was substituted.`);
  target[key] = parsed;
}
function identityFrom(raw: Record<string, unknown>, adapter: FabricSource['adapter']): NormalizedIncoming['identity'] {
  const identity: Record<string, unknown> = {};
  const reso = adapter === 'reso';
  const mappings = reso
    ? {
        countyFips: raw.CountyFips ?? raw.CountyFIPS,
        parcelId: raw.ParcelNumber,
        address: raw.UnparsedAddress,
        unit: raw.UnitNumber,
        city: raw.City,
        state: raw.StateOrProvince,
        zip: raw.PostalCode,
      }
    : {
        countyFips: raw.countyFips ?? raw.county_fips,
        parcelId: raw.parcelId ?? raw.parcel_id,
        address: raw.address,
        unit: raw.unit,
        city: raw.city,
        state: raw.state,
        zip: raw.zip,
      };
  for (const [key, value] of Object.entries(mappings))
    if (text(value)) identity[key] = key === 'state' ? text(value)!.toUpperCase() : text(value);
  addNumber(identity, 'lat', reso ? raw.Latitude : raw.lat, -90, 90);
  addNumber(identity, 'lng', reso ? raw.Longitude : raw.lng, -180, 180);
  if (identity.countyFips && !/^\d{5}$/.test(String(identity.countyFips)))
    throw new Error('County FIPS must contain five digits including its state prefix.');
  return identity as NormalizedIncoming['identity'];
}

/** Mapping does not infer a missing sale, a condition score, or an assessment-to-value conversion. */
export function normalizeIncoming(
  adapter: FabricSource['adapter'],
  input: unknown,
  observedAt: string,
): NormalizedIncoming {
  if (adapter === 'rentcast')
    throw new Error(
      'RentCast uses its dedicated typed property/listing/AVM normalizer; generic assessor or RESO coercion is prohibited.',
    );
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Record must be a JSON object.');
  if (!validDate(observedAt)) throw new Error('Observation timestamp is invalid.');
  const raw = input as Record<string, unknown>;
  if (adapter === 'census') {
    const geographies = raw.geographies as Record<string, unknown> | undefined;
    const counties = geographies?.Counties as Record<string, unknown>[] | undefined;
    const county = counties?.[0];
    const coordinates = raw.coordinates as Record<string, unknown> | undefined;
    const matched = text(raw.matchedAddress);
    if (!matched || !coordinates || !county || counties?.length !== 1)
      throw new Error(
        'Census input requires exactly one explicit county/address match; ambiguous geography is quarantined.',
      );
    const identity = identityFrom(
      { address: matched, state: raw.state, countyFips: county.GEOID, lat: coordinates.y, lng: coordinates.x },
      'assessor',
    );
    return {
      externalId: text(raw.id) ?? calculationChecksum({ matched, county: county.GEOID }),
      identity,
      facts: {},
      observedAt,
    };
  }
  const externalId = text(
    adapter === 'reso' ? raw.ListingKey : (raw.recordId ?? raw.id ?? raw.parcel_id ?? raw.parcelId),
  );
  if (!externalId) throw new Error('A stable provider record ID is required; no identity was invented.');
  const facts: Record<string, unknown> = {};
  const mapping =
    adapter === 'reso'
      ? {
          beds: raw.BedroomsTotal,
          baths: raw.BathroomsTotalDecimal,
          sqft: raw.LivingArea,
          lotSqft: raw.LotSizeSquareFeet,
          yearBuilt: raw.YearBuilt,
          condition: raw.AscentConditionScore,
          price: raw.ListPrice,
          soldPrice: raw.ClosePrice,
          dom: raw.DaysOnMarket,
        }
      : {
          beds: raw.beds,
          baths: raw.baths,
          sqft: raw.sqft,
          lotSqft: raw.lotSqft ?? raw.lot_sqft,
          yearBuilt: raw.yearBuilt ?? raw.year_built,
          condition: raw.condition,
          price: raw.listPrice,
          soldPrice: raw.soldPrice,
          dom: raw.dom,
        };
  for (const [key, value] of Object.entries(mapping))
    addNumber(facts, key, value, 0, key === 'condition' ? 5 : 1_000_000_000);
  const status = text(adapter === 'reso' ? raw.StandardStatus : raw.status);
  if (status) {
    const statuses: Record<string, Property['status']> = {
      Active: 'active',
      Closed: 'sold',
      Pending: 'pending',
      Withdrawn: 'withdrawn',
      active: 'active',
      sold: 'sold',
      pending: 'pending',
      withdrawn: 'withdrawn',
    };
    if (!statuses[status])
      throw new Error(`Unsupported listing status ${status}; it was not coerced into an active listing.`);
    facts.status = statuses[status];
  }
  for (const [key, value] of Object.entries({
    listedAt: adapter === 'reso' ? raw.ListingContractDate : raw.listedAt,
    soldAt: adapter === 'reso' ? raw.CloseDate : raw.soldAt,
  })) {
    if (value !== null && value !== undefined && value !== '') {
      if (!validDate(value)) throw new Error(`Invalid ${key}.`);
      facts[key] = value;
    }
  }
  const description = text(adapter === 'reso' ? raw.PublicRemarks : raw.description);
  if (description) facts.description = description;
  if (Array.isArray(raw.history))
    facts.history = raw.history
      .filter(
        item =>
          item &&
          typeof item === 'object' &&
          validDate(item.date) &&
          typeof item.event === 'string' &&
          (item.price === undefined || (Number.isFinite(item.price) && item.price >= 0)),
      )
      .map(item => ({
        date: item.date,
        event: item.event,
        ...(item.price !== undefined ? { price: item.price } : {}),
      }));
  return { externalId, identity: identityFrom(raw, adapter), facts: facts as NormalizedIncoming['facts'], observedAt };
}

export function assessQuality(
  record: Pick<CanonicalProperty, 'facts' | 'address' | 'city' | 'state' | 'zip' | 'lat' | 'lng' | 'countyFips'>,
): { missingFields: string[]; quality: CanonicalProperty['quality'] } {
  const values = { ...record, ...record.facts } as Record<string, unknown>;
  const required = [...requiredFacts, ...(record.facts.status === 'sold' ? ['soldAt', 'soldPrice'] : [])] as string[];
  const missingFields = required.filter(
    field => values[field] === undefined || values[field] === null || values[field] === '',
  );
  if (record.facts.sqft !== undefined && record.facts.sqft <= 0) missingFields.push('positive sqft');
  if (record.facts.status === 'sold' && record.facts.soldPrice !== undefined && record.facts.soldPrice <= 0)
    missingFields.push('positive soldPrice');
  return {
    missingFields: unique(missingFields),
    quality: {
      score: Math.max(0, Math.round(((required.length - missingFields.length) / required.length) * 100)),
      explanations: [
        `${required.length - missingFields.length}/${required.length} required analytic fields supplied; this is completeness, not estimated truth or valuation accuracy.`,
        ...(missingFields.length
          ? [
              `Unavailable: ${unique(missingFields).join(', ')}. Missing facts remain missing; no CMA projection is created.`,
            ]
          : [
              'Required analytic facts are present; source rights, timing, and comparable eligibility still require checking.',
            ]),
      ],
    },
  };
}

export function matchCanonical(
  incoming: NormalizedIncoming,
  records: CanonicalProperty[],
  regionId: RegionId,
): { kind: 'new' | 'match' | 'ambiguous'; candidateIds: string[]; reason: string } {
  const identity = incoming.identity;
  const scoped = records.filter(record => record.regionId === regionId);
  if (identity.countyFips && identity.parcelId) {
    const parcels = scoped.filter(
      record =>
        record.countyFips === identity.countyFips &&
        record.parcelId === identity.parcelId &&
        (record.unit ?? '') === (identity.unit ?? ''),
    );
    if (parcels.length)
      return {
        kind: parcels.length === 1 ? 'match' : 'ambiguous',
        candidateIds: parcels.map(record => record.id),
        reason: 'Exact county-qualified parcel identifier and unit; parcel IDs are never matched across jurisdictions.',
      };
  }
  const address = normalizeAddress(identity.address);
  if (!address || !identity.countyFips || identity.lat === undefined || identity.lng === undefined)
    return {
      kind: 'new',
      candidateIds: [],
      reason: 'Insufficient independently scoped address/geography evidence for automatic cross-source matching.',
    };
  const possible = scoped.filter(
    record =>
      record.countyFips === identity.countyFips &&
      normalizeAddress(record.address) === address &&
      (normalizeAddress(record.unit) ?? '') === (normalizeAddress(identity.unit) ?? ''),
  );
  const near = possible.filter(
    record =>
      record.lat !== undefined &&
      record.lng !== undefined &&
      record.state === identity.state &&
      distanceMiles({ lat: record.lat, lng: record.lng }, { lat: identity.lat!, lng: identity.lng! }) <= 0.015,
  );
  if (possible.length && near.length !== 1)
    return {
      kind: 'ambiguous',
      candidateIds: possible.map(record => record.id),
      reason:
        'Address collision or conflicting coordinates; no merge performed. The configured 0.015-mile coordinate tolerance is a conservative matching policy, not validated accuracy.',
    };
  return near.length === 1
    ? {
        kind: 'match',
        candidateIds: [near[0].id],
        reason: 'Exact county, address, unit, state and nearby coordinates under an explicit 0.015-mile policy.',
      }
    : { kind: 'new', candidateIds: [], reason: 'No high-confidence candidate.' };
}

/** The caller supplies an already authorized payload; failure and quarantine metadata contain no raw customer payload. */
export function ingestBatch(
  fabric: FabricState,
  source: FabricSource,
  regionId: RegionId,
  payload: unknown,
  context: FabricAccessContext,
  asOf = DEMO_AS_OF,
): IngestRun {
  const run: IngestRun = {
    id: `run-${calculationChecksum({ source: source.id, regionId, asOf, n: fabric.runs.length })}`,
    sourceId: source.id,
    regionId,
    startedAt: asOf,
    finishedAt: asOf,
    status: 'success',
    received: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    quarantined: 0,
    errors: [],
  };
  const access = sourceAccess(source, fabric, context, regionId, 'research', asOf);
  if (!access.allowed) {
    run.status = 'denied';
    run.errors = access.reasons;
    fabric.runs.unshift(run);
    return run;
  }
  const items = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { value?: unknown }).value)
      ? (payload as { value: unknown[] }).value
      : null;
  if (!items || items.length > 1000) {
    run.status = 'failed';
    run.errors.push('Expected an array or RESO value array of at most 1,000 records.');
    fabric.runs.unshift(run);
    return run;
  }
  const region = regionConfig(regionId);
  const storedSource = fabric.sources.find(item => item.id === source.id);
  if (!storedSource) fabric.sources.push(structuredClone(source));
  else if (
    storedSource.providerId !== source.providerId ||
    storedSource.kind !== source.kind ||
    storedSource.adapter !== source.adapter
  ) {
    run.status = 'failed';
    run.errors.push('Source identity, kind, or adapter changed under a stable source ID; a new source ID is required.');
    fabric.runs.unshift(run);
    return run;
  } else if (Date.parse(source.observedAt) >= Date.parse(storedSource.observedAt))
    Object.assign(storedSource, structuredClone(source));
  const quarantine = (raw: unknown, reason: string, candidateIds: string[] = [], externalId?: string) => {
    const checksum = calculationChecksum(raw);
    fabric.quarantine.unshift({
      id: `quarantine-${calculationChecksum({ run: run.id, checksum, index: run.quarantined })}`,
      runId: run.id,
      sourceId: source.id,
      externalId,
      reason,
      candidateIds,
      at: asOf,
      checksum,
    });
    run.quarantined++;
  };
  for (const raw of items) {
    run.received++;
    try {
      const incoming = normalizeIncoming(source.adapter, raw, source.observedAt);
      const identity = incoming.identity;
      if (identity.state && !region.states.includes(identity.state))
        throw new Error('Record state is outside the selected configured region.');
      if (identity.countyFips && !region.countyFips.includes(identity.countyFips))
        throw new Error('Record county is outside the selected configured region.');
      if (identity.countyFips && identity.state && identity.countyFips.slice(0, 2) !== stateFips[identity.state])
        throw new Error('State and county FIPS contradict each other.');
      const checksum = calculationChecksum({ identity, facts: incoming.facts });
      const partition = fabric.records.filter(record => record.synthetic === (source.kind === 'synthetic'));
      const direct = partition.filter(
        record =>
          record.regionId === regionId &&
          record.provenance.some(entry => entry.sourceId === source.id && entry.externalId === incoming.externalId),
      );
      const match = direct.length
        ? {
            kind: direct.length === 1 ? ('match' as const) : ('ambiguous' as const),
            candidateIds: direct.map(record => record.id),
            reason: 'Existing provider record key.',
          }
        : matchCanonical(incoming, partition, regionId);
      if (match.kind === 'ambiguous') {
        quarantine(raw, match.reason, match.candidateIds, incoming.externalId);
        continue;
      }
      const existing =
        match.kind === 'match' ? fabric.records.find(record => record.id === match.candidateIds[0]) : undefined;
      if (
        existing?.provenance.some(
          entry =>
            entry.sourceId === source.id && entry.externalId === incoming.externalId && entry.checksum === checksum,
        )
      ) {
        run.unchanged++;
        continue;
      }
      if (existing) {
        if (existing.countyFips && identity.countyFips && existing.countyFips !== identity.countyFips) {
          quarantine(
            raw,
            'Provider key changed county identity; manual review required.',
            [existing.id],
            incoming.externalId,
          );
          continue;
        }
        if (existing.parcelId && identity.parcelId && existing.parcelId !== identity.parcelId) {
          quarantine(
            raw,
            'Provider key changed parcel identity; manual review required.',
            [existing.id],
            incoming.externalId,
          );
          continue;
        }
        if (Date.parse(incoming.observedAt) <= Date.parse(existing.updatedAt)) {
          quarantine(
            raw,
            'Changed record is not newer than the stored version; no overwrite performed.',
            [existing.id],
            incoming.externalId,
          );
          continue;
        }
        const conflicts = Object.entries(incoming.facts)
          .filter(
            ([key, value]) =>
              key in existing.facts &&
              calculationChecksum(value) !== calculationChecksum(existing.facts[key as keyof typeof existing.facts]),
          )
          .map(([key]) => key);
        const sameSource = existing.provenance.some(
          entry => entry.sourceId === source.id && entry.externalId === incoming.externalId,
        );
        if (conflicts.length && !sameSource) {
          quarantine(
            raw,
            `Cross-source fact conflict (${conflicts.join(', ')}); no source priority was silently assumed.`,
            [existing.id],
            incoming.externalId,
          );
          continue;
        }
        const changedFields = unique([
          ...Object.keys(identity).filter(
            key => (identity as Record<string, unknown>)[key] !== (existing as unknown as Record<string, unknown>)[key],
          ),
          ...Object.keys(incoming.facts).filter(
            key =>
              calculationChecksum(incoming.facts[key as keyof typeof incoming.facts]) !==
              calculationChecksum(existing.facts[key as keyof typeof existing.facts]),
          ),
        ]);
        Object.assign(existing, identity);
        Object.assign(existing.facts, incoming.facts);
        existing.updatedAt = incoming.observedAt;
        existing.provenance.push({
          sourceId: source.id,
          externalId: incoming.externalId,
          observedAt: incoming.observedAt,
          fields: unique([...Object.keys(identity), ...Object.keys(incoming.facts)]),
          checksum,
        });
        existing.versions.push({ at: incoming.observedAt, checksum, sourceId: source.id, changedFields });
        Object.assign(existing, assessQuality(existing));
        run.updated++;
      } else {
        const id = `fabric-${calculationChecksum({ regionId, sourceId: source.id, externalId: incoming.externalId })}`;
        const record: CanonicalProperty = {
          id,
          regionId,
          ...identity,
          facts: incoming.facts,
          provenance: [
            {
              sourceId: source.id,
              externalId: incoming.externalId,
              observedAt: incoming.observedAt,
              fields: unique([...Object.keys(identity), ...Object.keys(incoming.facts)]),
              checksum,
            },
          ],
          versions: [
            {
              at: incoming.observedAt,
              checksum,
              sourceId: source.id,
              changedFields: unique([...Object.keys(identity), ...Object.keys(incoming.facts)]),
            },
          ],
          missingFields: [],
          quality: { score: 0, explanations: [] },
          updatedAt: incoming.observedAt,
          synthetic: source.kind === 'synthetic',
        };
        Object.assign(record, assessQuality(record));
        fabric.records.push(record);
        run.inserted++;
      }
    } catch (error) {
      quarantine(raw, error instanceof Error ? error.message : 'Invalid record.');
    }
  }
  run.status = run.quarantined ? (run.inserted + run.updated + run.unchanged ? 'partial' : 'failed') : 'success';
  fabric.runs.unshift(run);
  return run;
}

/** Missing analytic facts prevent projection instead of becoming zero-valued fabricated records. */
export function projectProperty(record: CanonicalProperty): Property | null {
  if (assessQuality(record).missingFields.length) return null;
  const facts = record.facts as Required<typeof record.facts>;
  const address = record.unit ? `${record.address} Unit ${record.unit}` : record.address!;
  return {
    id: record.propertyId ?? record.id,
    address,
    city: record.city!,
    state: record.state!,
    zip: record.zip!,
    lat: record.lat!,
    lng: record.lng!,
    beds: facts.beds,
    baths: facts.baths,
    sqft: facts.sqft,
    lotSqft: facts.lotSqft,
    yearBuilt: facts.yearBuilt,
    condition: facts.condition,
    status: facts.status,
    price: facts.price,
    ...(facts.soldPrice !== undefined ? { soldPrice: facts.soldPrice } : {}),
    ...(facts.soldAt ? { soldAt: facts.soldAt } : {}),
    listedAt: facts.listedAt,
    dom: facts.dom,
    sourceId: record.provenance.at(-1)!.sourceId,
    description: facts.description ?? 'Source supplied no description. Missing facts are not inferred.',
    history: structuredClone(facts.history ?? []),
  };
}

export function activePropertyIds(fabric: FabricState | undefined, regionId = fabric?.selectedRegionId): string[] {
  return (
    fabric?.records
      .filter(
        record =>
          record.regionId === regionId &&
          record.synthetic === (fabric.dataMode !== 'authorized') &&
          !record.missingFields.length,
      )
      .map(record => record.propertyId ?? record.id) ?? []
  );
}

export function regionCoverage(fabric: FabricState, context: FabricAccessContext, asOf: string): RegionCoverage[] {
  return regions.map(region => {
    const records = fabric.records.filter(record => record.regionId === region.id);
    const sources = fabric.sources.filter(source => source.regionIds.includes(region.id));
    const usable = records.filter(record =>
      record.provenance.every(entry => {
        const source = fabric.sources.find(item => item.id === entry.sourceId);
        return (
          source &&
          sourceAccess(source, fabric, context, region.id, 'valuation', asOf).allowed &&
          Date.parse(asOf) - Date.parse(entry.observedAt) <= source.license.retentionDays * 86400000
        );
      }),
    );
    const projected = usable.map(projectProperty).filter((property): property is Property => property !== null);
    const sold = projected.filter(
      property => property.status === 'sold' && property.soldAt && Date.parse(property.soldAt) <= Date.parse(asOf),
    );
    const missing = records.filter(record => record.missingFields.length).length;
    return {
      regionId: region.id,
      records: records.length,
      projectable: projected.length,
      closedSales: sold.length,
      capabilities: {
        propertyResearch: records.length > 0,
        cma: sold.length >= 3 && projected.length > sold.length,
        market: projected.length > 0,
        licensedFeed: sources.some(
          source =>
            source.kind === 'licensed' && sourceAccess(source, fabric, context, region.id, 'research', asOf).allowed,
        ),
      },
      limitations: [
        sources.every(source => source.kind === 'synthetic')
          ? 'Synthetic demonstration records only; no observed market accuracy, MLS coverage, or current inventory claim.'
          : 'Coverage reflects supplied records only; completeness and representativeness are unverified.',
        `${missing} records lack required analytic facts and cannot produce a CMA projection.`,
        'CMA availability indicates sufficient supplied record structure, not comparable eligibility or valuation reliability; distance/age/size filters still apply.',
        'Public assessor and Census data do not confer listing-feed rights. A paid subscription never supplies an MLS entitlement.',
      ],
      sourceIds: sources.map(source => source.id),
    };
  });
}

export function createFabricState(): FabricState {
  return {
    version: 1,
    selectedRegionId: 'dmv',
    dataMode: 'demo',
    records: [],
    sources: [],
    runs: [],
    quarantine: [],
    grants: [],
  };
}
export function demoSource(regionId: RegionId): FabricSource {
  return {
    id: `fabric-demo-${regionId}`,
    providerId: 'ascent-fictional-fixtures',
    label: `${regionId === 'dmv' ? 'Washington-area' : 'Austin-area'} fictional fixture · SYNTHETIC`,
    kind: 'synthetic',
    adapter: 'reso',
    regionIds: [regionId],
    observedAt: DEMO_AS_OF,
    expectedUpdateHours: 24 * 365,
    license: {
      label: 'Locally authored fictional fixture; demonstration only, no actual MLS or parcel records.',
      allowedUses: ['research', 'valuation', 'market', 'export'],
      exportAllowed: true,
      retentionDays: 3650,
    },
    documentationUrl: 'https://transport.reso.org/proposals/web-api-core/',
  };
}

export function syntheticRegionPayload(regionId: RegionId): Record<string, unknown>[] {
  if (!['dmv', 'austin'].includes(regionId))
    throw new Error(
      'No authored demonstration fixture exists for this region. Configure a source adapter; no regional records were invented.',
    );
  const dmv = regionId === 'dmv';
  const center = dmv ? { lat: 38.88, lng: -77.102 } : { lat: 30.2088, lng: -97.7872 };
  return Array.from({ length: 9 }, (_, index) => {
    const status = index < 2 ? 'Active' : index < 7 ? 'Closed' : index === 7 ? 'Pending' : 'Withdrawn';
    const basePrice = dmv ? 965000 : 725000;
    const sqft = (dmv ? 2200 : 2480) + (index - 3) * 35;
    const saleDate = `2026-${index < 4 ? '08' : '09'}-${String(8 + index * 2).padStart(2, '0')}T12:00:00.000Z`;
    const listedAt = '2026-07-20T12:00:00.000Z';
    const listPrice = basePrice + (index - 3) * 8000 + (status === 'Active' ? 20000 : 0);
    return {
      ListingKey: `${regionId}-fictional-${index + 1}`,
      CountyFips: dmv ? '51013' : '48453',
      ParcelNumber: `DEMO-${regionId.toUpperCase()}-${index + 1}`,
      UnparsedAddress: `${100 + index * 14} Example ${dmv ? 'Potomac' : 'Bluebonnet'} Way`,
      City: dmv ? 'Arlington' : 'Austin',
      StateOrProvince: dmv ? 'VA' : 'TX',
      PostalCode: dmv ? '22204' : '78745',
      Latitude: center.lat + ((index % 3) - 1) * 0.003,
      Longitude: center.lng + (Math.floor(index / 3) - 1) * 0.004,
      BedroomsTotal: 4,
      BathroomsTotalDecimal: 3,
      LivingArea: sqft,
      LotSizeSquareFeet: dmv ? 5600 + index * 100 : 6900 + index * 100,
      YearBuilt: dmv ? 1996 : 2006,
      AscentConditionScore: 4,
      StandardStatus: status,
      ListPrice: listPrice,
      ...(status === 'Closed' ? { ClosePrice: basePrice + (index - 3) * 8000 - 6000, CloseDate: saleDate } : {}),
      ListingContractDate: listedAt,
      DaysOnMarket:
        status === 'Closed'
          ? Math.floor((Date.parse(saleDate) - Date.parse(listedAt)) / 86400000)
          : status === 'Pending'
            ? 45
            : status === 'Withdrawn'
              ? 70
              : 87,
      PublicRemarks:
        'SYNTHETIC DEMO ONLY. Fictional property, parcel, prices, and history. Approximate geographic context, no real listing or valuation.',
      history: [
        { date: listedAt, event: 'Synthetic listing created', price: listPrice },
        ...(status === 'Closed'
          ? [{ date: saleDate, event: 'Synthetic closed sale', price: basePrice + (index - 3) * 8000 - 6000 }]
          : []),
      ],
    };
  });
}

export function bootstrapFabric(workspace: Workspace): FabricState {
  const fabric = workspace.fabric ?? createFabricState();
  // Admit existing Austin fixtures without replacing their stable IDs or dangling workflow references.
  if (!fabric.records.some(record => record.regionId === 'austin')) {
    const source = demoSource('austin');
    const originals = workspace.properties.filter(
      property => property.state === 'TX' && property.sourceId.startsWith('source-synthetic'),
    );
    if (originals.length) {
      const payload = originals.map(property => ({
        ListingKey: property.id,
        CountyFips: '48453',
        ParcelNumber: `DEMO-EXISTING-${property.id}`,
        UnparsedAddress: property.address,
        City: property.city,
        StateOrProvince: property.state,
        PostalCode: property.zip,
        Latitude: property.lat,
        Longitude: property.lng,
        BedroomsTotal: property.beds,
        BathroomsTotalDecimal: property.baths,
        LivingArea: property.sqft,
        LotSizeSquareFeet: property.lotSqft,
        YearBuilt: property.yearBuilt,
        AscentConditionScore: property.condition,
        StandardStatus: { active: 'Active', sold: 'Closed', pending: 'Pending', withdrawn: 'Withdrawn' }[
          property.status
        ],
        ListPrice: property.price,
        ClosePrice: property.soldPrice,
        CloseDate: property.soldAt,
        ListingContractDate: property.listedAt,
        DaysOnMarket: property.dom,
        PublicRemarks: property.description,
        history: property.history,
      }));
      ingestBatch(fabric, source, 'austin', payload, { credentialVerified: false }, workspace.asOf);
      for (const record of fabric.records.filter(item => item.regionId === 'austin'))
        record.propertyId = record.provenance.find(entry => entry.sourceId === source.id)!.externalId;
    }
  }
  if (!fabric.records.some(record => record.regionId === 'dmv'))
    ingestBatch(
      fabric,
      demoSource('dmv'),
      'dmv',
      syntheticRegionPayload('dmv'),
      { credentialVerified: false },
      DEMO_AS_OF,
    );
  workspace.fabric = fabric;
  return fabric;
}

export function applyFabricProjection(workspace: Workspace, context: FabricAccessContext, asOf = workspace.asOf) {
  const fabric = workspace.fabric;
  if (!fabric) return;
  for (const source of fabric.sources) {
    const projected: Source = {
      id: source.id,
      label: source.label,
      kind: source.kind,
      observedAt: source.observedAt,
      license: `${source.license.label} Uses: ${source.license.allowedUses.join(', ')}. Export: ${source.license.exportAllowed ? 'permitted' : 'prohibited'}. Retention: ${source.license.retentionDays} days.`,
      confidence: source.kind === 'synthetic' ? 1 : 0.8,
    };
    if (!workspace.sources.some(item => item.id === projected.id)) workspace.sources.push(projected);
  }
  for (const record of fabric.records) {
    const allowed = record.provenance.every(entry => {
      const source = fabric.sources.find(item => item.id === entry.sourceId);
      return (
        source &&
        sourceAccess(source, fabric, context, record.regionId, 'valuation', asOf).allowed &&
        Date.parse(asOf) - Date.parse(entry.observedAt) <= source.license.retentionDays * 86400000
      );
    });
    if (!allowed) continue;
    const property = projectProperty(record);
    if (!property) continue;
    record.propertyId = property.id;
    const index = workspace.properties.findIndex(item => item.id === property.id);
    if (index < 0) workspace.properties.push(property);
    // Existing workflow records are retained; fabric-owned records carry versioned evidence before updating.
    else if (property.id.startsWith('fabric-')) workspace.properties[index] = property;
  }
}

function workspaceFabricContext(
  workspace: Workspace,
  now: string,
): { fabric: FabricState; context: FabricAccessContext } {
  const fabric = structuredClone(workspace.fabric ?? createFabricState());
  const platform = workspace.platform;
  const verification = platform?.verification;
  const credentialVerified = Boolean(
    verification?.status === 'verified' &&
    verification.reviewedBy &&
    verification.reviewedAt &&
    validDate(verification.reviewedAt) &&
    Date.parse(verification.reviewedAt) <= Date.parse(now) &&
    verification.evidence?.length &&
    verification.expiresAt,
  );
  // Only platform operator-reviewed grants are authoritative; browser-visible mirrors never self-authorize.
  fabric.grants = (platform?.providerGrants ?? [])
    .filter(grant => !grant.revokedAt && validDate(grant.issuedAt) && Date.parse(grant.issuedAt) <= Date.parse(now))
    .map(grant => ({
      id: grant.id,
      providerId: grant.providerId,
      regionIds: grant.regionIds,
      allowedUses: grant.allowedUses.filter((use): use is FabricUse =>
        ['research', 'valuation', 'market', 'export'].includes(use),
      ),
      verifiedAt: grant.verifiedAt,
      verifiedBy: grant.reviewedBy,
      expiresAt: grant.expiresAt,
    }));
  return { fabric, context: { credentialVerified, credentialExpiresAt: verification?.expiresAt } };
}

/** Read-time license/retention enforcement. Never changes durable history or trusts subscription status. */
export function scopeWorkspaceForAccess(
  workspace: Workspace,
  use: FabricUse = 'research',
  now = new Date().toISOString(),
): Workspace {
  const scoped = structuredClone(workspace);
  const { fabric, context } = workspaceFabricContext(workspace, now);
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new Error('Access evaluation timestamp is invalid.');
  const deniedSourceIds = new Set<string>();
  const allowedSource = (
    sourceId: string,
    observedAt?: string,
    regionId?: string,
    requestedUse: FabricUse = use,
  ): boolean => {
    const policy = fabric.sources.find(source => source.id === sourceId);
    const original = workspace.sources.find(source => source.id === sourceId);
    if (!policy)
      return Boolean(
        original &&
        (original.kind === 'synthetic' ||
          original.kind === 'user' ||
          (original.kind === 'public' && requestedUse === 'research')),
      );
    const requestedRegions = regionId ? [regionId] : policy.regionIds;
    // Archived Property inputs lack an explicit region field; ambiguous multi-region rights fail closed.
    if (
      !requestedRegions.length ||
      requestedRegions.some(region => !sourceAccess(policy, fabric, context, region, requestedUse, now).allowed)
    )
      return false;
    const observed = Date.parse(observedAt ?? policy.observedAt);
    return (
      Number.isFinite(observed) &&
      observed <= timestamp &&
      timestamp - observed <= policy.license.retentionDays * 86400000
    );
  };
  for (const source of [...workspace.sources, ...fabric.sources])
    if (!allowedSource(source.id)) deniedSourceIds.add(source.id);
  const deniedPropertyIds = new Set(
    workspace.properties.filter(property => !allowedSource(property.sourceId)).map(property => property.id),
  );
  for (const record of fabric.records)
    if (
      !record.provenance.length ||
      record.provenance.some(entry => !allowedSource(entry.sourceId, entry.observedAt, record.regionId))
    )
      deniedPropertyIds.add(record.propertyId ?? record.id);
  const propertyAllowed = (property: Property) =>
    !deniedPropertyIds.has(property.id) && allowedSource(property.sourceId);
  scoped.properties = scoped.properties.filter(propertyAllowed);
  scoped.sources = scoped.sources.filter(source => !deniedSourceIds.has(source.id));
  const propertyIds = new Set(scoped.properties.map(property => property.id));
  // A saved valuation remains a valuation when viewed for research or export: both rights are required.
  const allowedCmaSource = (sourceId: string) =>
    allowedSource(sourceId) && allowedSource(sourceId, undefined, undefined, 'valuation');
  scoped.cmas = scoped.cmas.filter(cma => {
    const snapshot = cma.result.inputSnapshot;
    const archivedAllowed =
      snapshot &&
      allowedCmaSource(snapshot.subject.sourceId) &&
      snapshot.candidates.every(candidate => allowedCmaSource(candidate.sourceId));
    const subject = scoped.properties.find(property => property.id === cma.propertyId);
    const currentInputsAllowed =
      subject &&
      allowedCmaSource(subject.sourceId) &&
      cma.result.comps.every(comp => {
        const candidate = scoped.properties.find(property => property.id === comp.propertyId);
        return candidate && allowedCmaSource(candidate.sourceId);
      });
    return cma.result.sourceIds.every(allowedCmaSource) && (snapshot ? archivedAllowed : currentInputsAllowed);
  });
  const cmaIds = new Set(scoped.cmas.map(cma => cma.id));
  scoped.offers = scoped.offers.filter(offer => propertyIds.has(offer.propertyId));
  const offerIds = new Set(scoped.offers.map(offer => offer.id));
  scoped.transactions = scoped.transactions.filter(transaction => propertyIds.has(transaction.propertyId));
  const transactionIds = new Set(scoped.transactions.map(transaction => transaction.id));
  scoped.documents = scoped.documents.filter(document => transactionIds.has(document.transactionId));
  scoped.alerts = scoped.alerts.filter(
    alert =>
      (!alert.propertyId || propertyIds.has(alert.propertyId)) &&
      alert.sourceIds.every(sourceId => allowedSource(sourceId)),
  );
  scoped.outcomes = scoped.outcomes.filter(outcome => propertyIds.has(outcome.propertyId) && cmaIds.has(outcome.cmaId));
  scoped.approvals = scoped.approvals.filter(
    approval =>
      propertyIds.has(approval.entityId) ||
      offerIds.has(approval.entityId) ||
      cmaIds.has(approval.entityId) ||
      transactionIds.has(approval.entityId),
  );
  const anyDenied = deniedPropertyIds.size > 0 || deniedSourceIds.size > 0;
  // Feedback is free text without field-level origin tracking, so it is withheld like other notes.
  if (scoped.listingCheckIns)
    scoped.listingCheckIns = scoped.listingCheckIns
      .filter(checkIn => propertyIds.has(checkIn.propertyId))
      .map(checkIn =>
        anyDenied ? { ...checkIn, feedback: '[Feedback withheld while a source is unavailable.]' } : checkIn,
      );
  scoped.clients = scoped.clients.map(client => ({
    ...client,
    savedPropertyIds: client.savedPropertyIds.filter(id => propertyIds.has(id)),
    followUps: client.followUps
      ?.filter(task => !task.propertyId || propertyIds.has(task.propertyId))
      .map(task => (anyDenied ? { ...task, title: '[Follow-up text withheld while a source is unavailable.]' } : task)),
    ...(anyDenied
      ? {
          preferences:
            '[Free-text context withheld while a source is unavailable; contact records remain authorized workspace data.]',
          timeline: [],
        }
      : {}),
  }));
  if (anyDenied) {
    scoped.approvals = []; // Drafts can contain copied source text without field-level origin tracking.
    scoped.transactions = scoped.transactions.map(transaction => ({
      ...transaction,
      notes: '[Free-text notes withheld while source access is unavailable.]',
    }));
    // A partial or edited hash chain would fail verification; withhold it without forging replacement hashes.
    scoped.audit = [];
  }
  if (scoped.fabric) {
    scoped.fabric.records = scoped.fabric.records.filter(
      record =>
        !deniedPropertyIds.has(record.propertyId ?? record.id) &&
        record.provenance.every(entry => allowedSource(entry.sourceId, entry.observedAt, record.regionId)),
    );
    scoped.fabric.runs = scoped.fabric.runs.filter(run => !deniedSourceIds.has(run.sourceId));
    scoped.fabric.quarantine = scoped.fabric.quarantine.filter(record => !deniedSourceIds.has(record.sourceId));
    scoped.fabric.grants = fabric.grants;
  }
  if (scoped.domain) {
    scoped.domain.evaluations = scoped.domain.evaluations.filter(
      evaluation =>
        evaluation.entityIds.length > 0 && evaluation.entityIds.every(id => cmaIds.has(id) || offerIds.has(id)),
    );
  }
  const contextAllowed = (context: {
    propertyId?: string;
    clientId?: string;
    cmaId?: string;
    transactionId?: string;
    domainProposalId?: string;
  }) =>
    (!context.propertyId || propertyIds.has(context.propertyId)) &&
    (!context.cmaId || cmaIds.has(context.cmaId)) &&
    (!context.transactionId || transactionIds.has(context.transactionId)) &&
    (!context.clientId || scoped.clients.some(client => client.id === context.clientId)) &&
    (!context.domainProposalId || scoped.domain?.proposals.some(proposal => proposal.id === context.domainProposalId));
  if (scoped.trust) {
    scoped.trust.tickets = scoped.trust.tickets
      .filter(ticket => contextAllowed(ticket.context))
      .map(ticket =>
        anyDenied
          ? {
              ...ticket,
              title: '[Content withheld while source access is unavailable.]',
              message: undefined,
              response: undefined,
              professionalReview: ticket.professionalReview
                ? { ...ticket.professionalReview, evidence: undefined }
                : undefined,
            }
          : ticket,
      );
    scoped.trust.feedback = scoped.trust.feedback.filter(entry => contextAllowed(entry.context));
  }
  if (scoped.migration) {
    const documentIds = new Set(scoped.documents.map(document => document.id));
    scoped.migration.documentRefs = scoped.migration.documentRefs
      .filter(reference => documentIds.has(reference.documentId))
      .map(reference =>
        anyDenied ? { ...reference, label: '[Label withheld while source access is unavailable.]' } : reference,
      );
    if (anyDenied) {
      scoped.migration.previews = [];
      scoped.migration.commits = scoped.migration.commits.map(commit => ({ ...commit, operations: [] }));
    }
  }
  if (scoped.providerData) {
    const state = scoped.providerData,
      policy = state.policy;
    const verification = workspace.platform?.verification;
    const verified = Boolean(
      verification?.status === 'verified' &&
      verification.reviewedBy &&
      verification.reviewedAt &&
      validDate(verification.reviewedAt) &&
      Date.parse(verification.reviewedAt) <= timestamp &&
      verification.evidence?.length &&
      verification.expiresAt &&
      Date.parse(verification.expiresAt) > timestamp,
    );
    const policyValid = Boolean(
      policy &&
      !(policy.deploymentScope === 'local-development' && process.env.NODE_ENV === 'production') &&
      policy.reviewedBy &&
      policy.licenseReference &&
      validDate(policy.reviewedAt) &&
      Date.parse(policy.reviewedAt) <= timestamp &&
      validDate(policy.expiresAt) &&
      Date.parse(policy.expiresAt) > timestamp &&
      policy.allowedUses.includes(use) &&
      Number.isFinite(policy.retentionHours) &&
      policy.retentionHours > 0 &&
      (!policy.requiresProfessionalVerification || verified),
    );
    state.cache = state.cache.filter(entry => {
      if (
        !validDate(entry.observedAt) ||
        Date.parse(entry.observedAt) > timestamp ||
        !validDate(entry.expiresAt) ||
        Date.parse(entry.expiresAt) <= timestamp
      )
        return false;
      if (entry.fixture) return true;
      if (
        !policyValid ||
        !policy ||
        entry.policyVersion !== policy.version ||
        timestamp - Date.parse(entry.observedAt) > policy.retentionHours * 3600000
      )
        return false;
      return Boolean(
        workspace.platform?.providerGrants.some(
          grant =>
            grant.id === entry.grantId &&
            grant.providerId === policy.providerId &&
            grant.regionIds.includes('us') &&
            grant.allowedUses.includes(use) &&
            !grant.revokedAt &&
            grant.reviewedBy &&
            validDate(grant.verifiedAt) &&
            Date.parse(grant.verifiedAt) <= timestamp &&
            validDate(grant.issuedAt) &&
            Date.parse(grant.issuedAt) <= timestamp &&
            validDate(grant.expiresAt) &&
            Date.parse(grant.expiresAt) > timestamp,
        ),
      );
    });
  }
  const graph = buildDecisionGraph(scoped);
  scoped.nodes = graph.nodes;
  scoped.edges = graph.edges;
  return scoped;
}
