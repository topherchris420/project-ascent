import { distanceMiles } from '../analytics';
import { DC_PARCEL_PATTERN } from '../dc-studio';
import { MD_PARCEL_PATTERN } from '../maryland-studio';
import { condoData } from '../providers/dc-condo-public-records';
import { dcData, displayDcAddress } from '../providers/dc-public-records';
import { marylandData } from '../providers/maryland-public-records';
import {
  dcPermitsAdapter,
  dcSalesAdapter,
  dcTaxExtractAdapter,
  disabledAdapter,
  femaFloodAdapter,
  fhfaIndexAdapter,
  mdSdatAdapter,
  montgomeryPermitsAdapter,
  WASHINGTON_MSAD,
} from './adapters';
import { cachedIngest, type IngestionContext, type IngestionResult, type ManifestStatus } from './ingest';
import type { Observation } from './observations';
import { publicSource } from './registry';

/**
 * A live, bounded check of the public sources that cover one home in the bundled snapshots. Only homes Ascent
 * already covers can be checked, so a request can never be turned into an arbitrary query against a public server.
 * Every source answers through the shared cache; a source that fails is reported as unavailable, never filled in.
 */
export const HOME_MARKETS = ['dc', 'dc-condos', 'maryland'] as const;
export type HomeMarket = (typeof HOME_MARKETS)[number];
export type CoveredHome = {
  market: HomeMarket;
  parcelId: string;
  address: string;
  zip: string;
  lat: number;
  lng: number;
  county: 'dc' | 'montgomery' | 'prince-georges';
  /** The newest recorded sale in the bundled snapshot this home's estimate uses. */
  snapshotLastSale: string;
};

export function coveredHome(market: string, parcelId: string): CoveredHome | null {
  if (market === 'dc' && DC_PARCEL_PATTERN.test(parcelId)) {
    const { parcels, salesProvenance } = dcData();
    const parcel = parcels.get(parcelId);
    return parcel
      ? {
          market,
          parcelId,
          address: displayDcAddress(parcel.address),
          zip: parcel.zip,
          lat: parcel.lat,
          lng: parcel.lng,
          county: 'dc',
          snapshotLastSale: salesProvenance.lastSale ?? salesProvenance.fetchedAt.slice(0, 10),
        }
      : null;
  }
  if (market === 'dc-condos' && DC_PARCEL_PATTERN.test(parcelId)) {
    const { parcels, salesProvenance } = condoData();
    const unit = parcels.get(parcelId);
    return unit
      ? {
          market,
          parcelId,
          address: displayDcAddress(unit.address),
          zip: unit.zip,
          lat: unit.lat,
          lng: unit.lng,
          county: 'dc',
          snapshotLastSale: salesProvenance.lastSale,
        }
      : null;
  }
  if (market === 'maryland' && MD_PARCEL_PATTERN.test(parcelId)) {
    const { parcels, provenance } = marylandData();
    const parcel = parcels.get(parcelId);
    return parcel
      ? {
          market,
          parcelId,
          address: `${parcel.address}, ${parcel.city}`,
          zip: parcel.zip,
          lat: parcel.lat,
          lng: parcel.lng,
          county: parcel.county === 'MONT' ? 'montgomery' : 'prince-georges',
          snapshotLastSale: provenance.lastSale,
        }
      : null;
  }
  return null;
}

export type SourceCheck = {
  sourceId: string;
  name: string;
  status: ManifestStatus;
  cached: boolean;
  checkedAt: string;
  publishedAt: string | null;
  observations: number;
  invalid: number;
  conflicts: number;
  errors: string[];
  contentSha256: string;
  permission?: { reason: string; required: string | null };
  attribution: string;
};
const summary = (result: IngestionResult & { cached: boolean }): SourceCheck => {
  const { manifest } = result;
  return {
    sourceId: manifest.sourceId,
    name: manifest.sourceName,
    status: manifest.status,
    cached: result.cached,
    checkedAt: manifest.finishedAt,
    publishedAt: manifest.publishedAt,
    observations: manifest.observations,
    invalid: Object.values(manifest.invalid).reduce((total, count) => total + count, 0),
    conflicts: manifest.conflicts.length,
    errors: manifest.errors,
    contentSha256: manifest.contentSha256,
    ...(manifest.permission ? { permission: manifest.permission } : {}),
    attribution: publicSource(manifest.sourceId).attribution,
  };
};

/** Every source that can speak about this home, run concurrently through the shared cache. */
export async function checkHomeSources(home: CoveredHome, context: IngestionContext = {}) {
  const now = (context.now ?? (() => new Date()))();
  const year = now.getUTCFullYear();
  const runs: Promise<IngestionResult & { cached: boolean }>[] = [];
  if (home.county === 'dc') {
    runs.push(cachedIngest(dcSalesAdapter, { parcelId: home.parcelId }, context));
    runs.push(cachedIngest(dcTaxExtractAdapter, { parcelId: home.parcelId }, context));
    runs.push(cachedIngest(dcPermitsAdapter, { parcelId: home.parcelId, year }, context));
  } else {
    runs.push(cachedIngest(mdSdatAdapter, { parcelId: home.parcelId }, context));
    runs.push(
      home.county === 'montgomery'
        ? cachedIngest(
            montgomeryPermitsAdapter,
            { parcelId: home.parcelId, address: home.address.split(',')[0], zip: home.zip },
            context,
          )
        : cachedIngest(disabledAdapter('prince-georges-permits'), { parcelId: home.parcelId }, context),
    );
  }
  runs.push(cachedIngest(femaFloodAdapter, { parcelId: home.parcelId, lat: home.lat, lng: home.lng }, context));
  runs.push(cachedIngest(fhfaIndexAdapter, { cbsa: WASHINGTON_MSAD.cbsa }, context));
  const results = await Promise.all(runs);
  return {
    home,
    checkedAt: now.toISOString(),
    sources: results.map(summary),
    observations: results.flatMap(result => result.observations),
  };
}

export type NearbySale = {
  identity: string;
  parcelId: string;
  address: string;
  distanceMiles: number;
  observation: Observation;
};
/**
 * Qualified recorded sales of covered homes near this one, dated after the snapshot's newest sale. They are shown and
 * monitored, never priced: they are outside the snapshot the published study scored.
 */
export async function nearbyLaterSales(home: CoveredHome, radiusMiles: number, context: IngestionContext = {}) {
  const radius = Math.min(Math.max(radiusMiles, 0.1), 2);
  const result =
    home.county === 'dc'
      ? await cachedIngest(dcSalesAdapter, { after: home.snapshotLastSale }, context)
      : await cachedIngest(mdSdatAdapter, { after: home.snapshotLastSale }, context);
  const covered: Map<string, { address: string; lat: number; lng: number; city?: string }> =
    home.market === 'dc'
      ? dcData().parcels
      : home.market === 'dc-condos'
        ? condoData().parcels
        : marylandData().parcels;
  const sales: NearbySale[] = [];
  for (const item of result.observations) {
    if (item.kind !== 'recorded-transfer' || !item.parcelId || item.parcelId === home.parcelId) continue;
    if (!item.dates.transaction || item.dates.transaction <= home.snapshotLastSale) continue;
    if (home.county !== 'dc' && !/arms-length/i.test(String(item.values.conveyance ?? ''))) continue;
    const parcel = covered.get(item.parcelId);
    if (!parcel) continue;
    const distance = distanceMiles(home, parcel);
    if (distance > radius) continue;
    sales.push({
      identity: item.identity,
      parcelId: item.parcelId,
      address: home.county === 'dc' ? displayDcAddress(parcel.address) : `${parcel.address}, ${parcel.city ?? ''}`,
      distanceMiles: Math.round(distance * 100) / 100,
      observation: item,
    });
  }
  sales.sort((a, b) => a.distanceMiles - b.distanceMiles || (a.identity < b.identity ? -1 : 1));
  return { radiusMiles: radius, after: home.snapshotLastSale, source: summary(result), sales: sales.slice(0, 50) };
}

const buckets = new Map<string, { windowStart: number; count: number }>();
/**
 * A per-process limiter for the public live-check routes, so they keep working without a database. Requests share
 * one bucket unless the deployment vouches for client addresses (TRUST_PROXY), as the database limiter does.
 */
export function allowPublicCheck(request: Request, limit = 30, now = Date.now()) {
  const key =
    process.env.TRUST_PROXY === 'true'
      ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      : 'shared';
  const entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= 60_000) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  // A shared bucket serves every visitor at once, so it is wider; the per-source hourly ceilings still apply.
  return entry.count <= (key === 'shared' ? limit * 4 : limit);
}
