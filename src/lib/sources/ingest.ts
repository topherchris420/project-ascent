import {
  assertFieldsAllowed,
  assertSourceUse,
  publicSource,
  SOURCE_REGISTRY_VERSION,
  SourcePermissionError,
  type PublicSource,
} from './registry';
import { canonicalJson, sha256, type Observation } from './observations';

/**
 * The one ingestion path every public-source adapter runs through: permission and field checks first, then bounded,
 * polite requests (minimum spacing, timeout, retry with backoff, page cap and an hourly ceiling per source), schema
 * validation, deterministic normalization, duplicate and conflict handling, and a manifest whose content digest is
 * identical whenever the same records come back. A failure is reported in the manifest, never hidden or simulated.
 */
export const MANIFEST_VERSION = 'ascent-ingestion-manifest-1';

export type FetchResponse = { ok: boolean; status: number; text(): Promise<string> };
export type Fetcher = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<FetchResponse>;
export type IngestionContext = {
  fetcher?: Fetcher;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};
export type AdapterPage<Raw> = { rows: Raw[]; more: boolean };
export type SourceAdapter<Scope, Raw = Record<string, unknown>> = {
  sourceId: string;
  use: 'monitoring' | 'display';
  /** Every field the requests name; checked against the source's allowlist before anything is sent. */
  fields: readonly string[];
  /** A stable human-readable description of what is asked, used in the manifest and as the cache key. */
  describe(scope: Scope): string;
  request(scope: Scope, page: number, pageSize: number): string;
  parse(body: string, pageSize: number): AdapterPage<Raw>;
  /** Why a row is rejected, or null when it is usable. */
  validate(row: Raw, scope: Scope): string | null;
  normalize(row: Raw, context: { observedAt: string; published: string | null; scope: Scope }): Observation[];
  /** Optional dataset-level publication time, fetched once per run. */
  publication?: { url: string; parse(body: string): string | null };
};
export type ManifestStatus = 'complete' | 'partial' | 'failed' | 'disabled' | 'deferred';
export type IngestionManifest = {
  version: typeof MANIFEST_VERSION;
  registryVersion: typeof SOURCE_REGISTRY_VERSION;
  sourceId: string;
  sourceName: string;
  license: string;
  scope: string;
  status: ManifestStatus;
  startedAt: string;
  finishedAt: string;
  requests: number;
  pages: number;
  received: number;
  valid: number;
  invalid: Record<string, number>;
  duplicates: number;
  conflicts: { identity: string; fingerprints: string[] }[];
  observations: number;
  /** Latest publication or modification time the source reported, if any. */
  publishedAt: string | null;
  /** SHA-256 of the sorted observation fingerprints: the same records always give the same digest. */
  contentSha256: string;
  errors: string[];
  /** Why a disabled source did not run, and what would enable it. */
  permission?: { reason: string; required: string | null };
};
export type IngestionResult = { manifest: IngestionManifest; observations: Observation[] };

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const lastRequest = new Map<string, number>();
const hourly = new Map<string, { windowStart: number; count: number }>();
const HOUR = 3_600_000;

/** Reserves one request against the source's hourly ceiling for this process; false when the ceiling is reached. */
export function reserveRequest(source: PublicSource, now: number) {
  const entry = hourly.get(source.id);
  if (!entry || now - entry.windowStart >= HOUR) {
    hourly.set(source.id, { windowStart: now, count: 1 });
    return source.refresh.hourlyCeiling > 0;
  }
  if (entry.count >= source.refresh.hourlyCeiling) return false;
  entry.count += 1;
  return true;
}
export function resetIngestionState() {
  lastRequest.clear();
  hourly.clear();
}

class DeferredError extends Error {}
class PermanentError extends Error {}

/** One request with spacing, a timeout and retries on network errors, 429 and 5xx. 4xx is permanent. */
async function politeRequest(source: PublicSource, url: string, context: Required<IngestionContext>) {
  let lastError = 'Request failed.';
  for (let attempt = 0; attempt <= source.refresh.retries; attempt++) {
    if (!reserveRequest(source, context.now().getTime()))
      throw new DeferredError(`The hourly request ceiling for ${source.name} was reached; the check was deferred.`);
    const wait = (lastRequest.get(source.id) ?? 0) + source.refresh.minIntervalMs - context.now().getTime();
    if (wait > 0) await context.sleep(wait);
    lastRequest.set(source.id, context.now().getTime());
    try {
      const response = await context.fetcher(url, {
        signal: AbortSignal.timeout(source.refresh.timeoutMs || 30_000),
        headers: { Accept: 'application/json, text/plain', 'User-Agent': 'Ascent public-record research/1.0' },
      });
      if (response.ok) return { body: await response.text(), attempts: attempt + 1 };
      lastError = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) throw new PermanentError(lastError);
    } catch (error) {
      if (error instanceof PermanentError) throw error;
      lastError = error instanceof Error ? error.message || error.name : 'Network error';
    }
    if (attempt < source.refresh.retries) await context.sleep(500 * 2 ** attempt);
  }
  throw new Error(`${lastError} after ${source.refresh.retries + 1} attempts.`);
}

/** Exact duplicates are dropped and counted; the same identity with different content is kept twice and reported. */
export function reconcile(observations: Observation[]) {
  const byIdentity = new Map<string, Observation[]>();
  let duplicates = 0;
  for (const item of observations) {
    const key = `${item.kind}|${item.identity}`;
    const group = byIdentity.get(key) ?? [];
    if (group.some(existing => existing.fingerprint === item.fingerprint)) duplicates += 1;
    else group.push(item);
    byIdentity.set(key, group);
  }
  const conflicts: IngestionManifest['conflicts'] = [];
  const kept: Observation[] = [];
  for (const group of byIdentity.values()) {
    const sorted = group.toSorted((a, b) => cmp(a.fingerprint, b.fingerprint));
    if (sorted.length > 1)
      conflicts.push({ identity: sorted[0].identity, fingerprints: sorted.map(item => item.fingerprint) });
    kept.push(...sorted);
  }
  kept.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.identity, b.identity) || cmp(a.fingerprint, b.fingerprint));
  conflicts.sort((a, b) => cmp(a.identity, b.identity));
  return { kept, duplicates, conflicts };
}
/** Code-unit order, independent of the server's locale, so manifests sort identically everywhere. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const contentDigest = (observations: readonly Observation[]) =>
  sha256(canonicalJson(observations.map(item => item.fingerprint).toSorted()));

export async function ingest<Scope, Raw>(
  adapter: SourceAdapter<Scope, Raw>,
  scope: Scope,
  context: IngestionContext = {},
): Promise<IngestionResult> {
  const ctx: Required<IngestionContext> = {
    fetcher: context.fetcher ?? defaultFetcher,
    now: context.now ?? (() => new Date()),
    sleep: context.sleep ?? defaultSleep,
  };
  const startedAt = ctx.now().toISOString();
  const source = publicSource(adapter.sourceId);
  const manifest: IngestionManifest = {
    version: MANIFEST_VERSION,
    registryVersion: SOURCE_REGISTRY_VERSION,
    sourceId: source.id,
    sourceName: source.name,
    license: source.license.name,
    scope: adapter.describe(scope),
    status: 'complete',
    startedAt,
    finishedAt: startedAt,
    requests: 0,
    pages: 0,
    received: 0,
    valid: 0,
    invalid: {},
    duplicates: 0,
    conflicts: [],
    observations: 0,
    publishedAt: null,
    contentSha256: contentDigest([]),
    errors: [],
  };
  const finish = (observations: Observation[]): IngestionResult => {
    manifest.finishedAt = ctx.now().toISOString();
    manifest.observations = observations.length;
    manifest.contentSha256 = contentDigest(observations);
    return { manifest, observations };
  };
  try {
    assertSourceUse(source.id, adapter.use);
    assertFieldsAllowed(source, adapter.fields);
  } catch (error) {
    if (!(error instanceof SourcePermissionError)) throw error;
    manifest.status = 'disabled';
    manifest.errors.push(error.message);
    manifest.permission = {
      reason: source.disabledReason ?? error.message,
      required: source.requiredPermission ?? null,
    };
    return finish([]);
  }
  const observedAt = startedAt;
  const collected: Observation[] = [];
  try {
    if (adapter.publication) {
      const { body } = await politeRequest(source, adapter.publication.url, ctx);
      manifest.requests += 1;
      manifest.publishedAt = adapter.publication.parse(body);
    }
    const pageSize = Math.max(1, source.refresh.pageSize);
    for (let page = 0; ; page++) {
      if (page >= Math.max(1, source.refresh.maxPagesPerRun)) {
        manifest.status = 'partial';
        manifest.errors.push(`Stopped at the ${source.refresh.maxPagesPerRun}-page limit; later pages were not read.`);
        break;
      }
      const { body } = await politeRequest(source, adapter.request(scope, page, pageSize), ctx);
      manifest.requests += 1;
      const parsed = adapter.parse(body, pageSize);
      manifest.pages += 1;
      manifest.received += parsed.rows.length;
      for (const row of parsed.rows) {
        const reason = adapter.validate(row, scope);
        if (reason) {
          manifest.invalid[reason] = (manifest.invalid[reason] ?? 0) + 1;
          continue;
        }
        manifest.valid += 1;
        collected.push(...adapter.normalize(row, { observedAt, published: manifest.publishedAt, scope }));
      }
      if (!parsed.more || !parsed.rows.length) break;
    }
  } catch (error) {
    manifest.status = error instanceof DeferredError ? 'deferred' : collected.length ? 'partial' : 'failed';
    manifest.errors.push(error instanceof Error ? error.message : 'Unknown failure.');
  }
  const { kept, duplicates, conflicts } = reconcile(collected);
  manifest.duplicates = duplicates;
  manifest.conflicts = conflicts;
  const published = kept.map(item => item.dates.published).filter((value): value is string => !!value);
  if (published.length) manifest.publishedAt = published.toSorted().at(-1)!;
  return finish(kept);
}

/** The manifest's own digest, excluding its timestamps, so two runs over identical records compare equal. */
export function manifestContentKey(manifest: IngestionManifest) {
  const { startedAt: _started, finishedAt: _finished, ...rest } = manifest;
  void _started;
  void _finished;
  return sha256(canonicalJson(rest));
}

type CacheEntry = { at: number; result: IngestionResult };
const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 2000;
const FAILURE_CACHE_MS = 5 * 60_000;

/**
 * The shared, bounded cache in front of per-home checks: one answer per source and question is reused for the
 * source's cache period, a failure for five minutes, so many homeowners never multiply requests to a public server.
 */
export async function cachedIngest<Scope, Raw>(
  adapter: SourceAdapter<Scope, Raw>,
  scope: Scope,
  context: IngestionContext = {},
): Promise<IngestionResult & { cached: boolean }> {
  const now = (context.now ?? (() => new Date()))().getTime();
  const key = `${adapter.sourceId}|${adapter.describe(scope)}`;
  const hit = cache.get(key);
  const source = publicSource(adapter.sourceId);
  const ttl =
    hit && ['complete', 'disabled'].includes(hit.result.manifest.status)
      ? source.refresh.cacheHours * HOUR
      : FAILURE_CACHE_MS;
  if (hit && now - hit.at < ttl) return { ...hit.result, cached: true };
  const result = await ingest(adapter, scope, context);
  cache.delete(key);
  cache.set(key, { at: now, result });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return { ...result, cached: false };
}
export function clearIngestionCache() {
  cache.clear();
}
