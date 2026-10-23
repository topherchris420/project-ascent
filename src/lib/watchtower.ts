import { z } from 'zod';
import type { Observation } from './sources/observations';
import type { SourceCheck } from './sources/property-check';

/**
 * The Property Watchtower: opt-in monitoring of the public records about a home. A watch keeps a baseline of record
 * fingerprints; each check compares what the sources return now with that baseline and records an event for every
 * record that is new, changed or removed, and for every source that stops or starts answering. Event ids are
 * deterministic, so the same change seen twice is one event.
 *
 * What it never does: simulate activity when a source is down, announce a value change (records are reported as
 * records; the estimate is only ever changed by a validated calculation the homeowner runs), or check more often than
 * the documented schedule. Watches live in this browser; nothing is sent anywhere except the public-record check.
 */
export const WATCHTOWER_VERSION = 'ascent-watchtower-1';
export const WATCHTOWER_STORAGE_KEY = 'ascent.watchtower.v1';
export const WATCH_POLICY = {
  /** A home is checked at most this often, whether automatically on opening Ascent or with "Check now". */
  minIntervalHours: 12,
  /** A watch not successfully checked for this long is shown as stale. */
  staleAfterHours: 72,
  maxWatches: 10,
  dailyChecksPerDevice: 20,
  maxEventsPerWatch: 200,
  maxChecksLogged: 30,
  schedule:
    'Ascent has no background process on your device. A watched home is checked when you open Ascent, at most once every 12 hours, and the public responses are shared through a 12-hour cache, so a check can reflect records up to 12 hours old.',
} as const;
export const watchTopics = ['own-records', 'nearby-sales', 'flood-zone', 'price-index'] as const;
export type WatchTopic = (typeof watchTopics)[number];
export const watchTopicLabels: Record<WatchTopic, { label: string; detail: string }> = {
  'own-records': {
    label: 'This home’s public records',
    detail: 'Recorded sales, tax assessments, property tax and building permits for this lot.',
  },
  'nearby-sales': {
    label: 'Nearby recorded sales',
    detail: 'Qualified sales of covered homes nearby that are newer than the bundled snapshot.',
  },
  'flood-zone': { label: 'FEMA flood zone', detail: 'The mapped flood zone at this home’s location.' },
  'price-index': {
    label: 'Regional price index',
    detail: 'New quarters of the FHFA purchase-only index for the metro area, not for this home.',
  },
};

const iso = z.iso.datetime();
const checkSchema = z
  .object({
    at: iso,
    sources: z.array(
      z.object({ sourceId: z.string().max(60), status: z.string().max(20), cached: z.boolean() }).strict(),
    ),
    records: z.number().int().min(0),
    events: z.number().int().min(0),
  })
  .strict();
const watchSchema = z
  .object({
    key: z.string().regex(/^(dc|dc-condos|maryland):[A-Za-z0-9_]{4,32}$/),
    market: z.enum(['dc', 'dc-condos', 'maryland']),
    parcelId: z.string().regex(/^[A-Za-z0-9_]{4,32}$/),
    address: z.string().max(160),
    topics: z.array(z.enum(watchTopics)).min(1).max(watchTopics.length),
    radiusMiles: z.number().min(0.1).max(2),
    createdAt: iso,
    paused: z.boolean(),
    /** Fingerprints by record key, from the first successful check. Null until then. */
    baseline: z.record(z.string(), z.object({ fingerprint: z.string(), label: z.string() }).strict()).nullable(),
    /** Source ids that failed on the latest check, with when they started failing. */
    unavailable: z.record(z.string(), iso),
    lastCheckAt: iso.nullable(),
    lastSuccessfulCheckAt: iso.nullable(),
    checks: z.array(checkSchema).max(WATCH_POLICY.maxChecksLogged),
  })
  .strict();
export type Watch = z.infer<typeof watchSchema>;
export const watchEventKinds = ['new', 'changed', 'removed', 'source-unavailable', 'source-restored'] as const;
const eventSchema = z
  .object({
    id: z.string().max(400),
    watchKey: z.string(),
    topic: z.enum(watchTopics).or(z.literal('source')),
    kind: z.enum(watchEventKinds),
    title: z.string().max(200),
    detail: z.string().max(600),
    sourceId: z.string().max(60),
    /** The record's own date when it has one (a sale date, an issue date), never the check date. */
    recordDate: z.string().max(30).nullable(),
    detectedAt: iso,
    read: z.boolean(),
  })
  .strict();
export type WatchEvent = z.infer<typeof eventSchema>;
export const watchtowerSchema = z
  .object({
    version: z.literal(WATCHTOWER_VERSION),
    watches: z.array(watchSchema).max(WATCH_POLICY.maxWatches),
    events: z.array(eventSchema).max(WATCH_POLICY.maxWatches * WATCH_POLICY.maxEventsPerWatch),
    /** Checks this device ran on each UTC day, for the daily quota. */
    usage: z.object({ day: z.string().max(10), checks: z.number().int().min(0) }).strict(),
  })
  .strict();
export type Watchtower = z.infer<typeof watchtowerSchema>;

export const emptyWatchtower = (): Watchtower => ({
  version: WATCHTOWER_VERSION,
  watches: [],
  events: [],
  usage: { day: '', checks: 0 },
});
export function parseWatchtower(raw: string | null): Watchtower {
  if (!raw) return emptyWatchtower();
  return watchtowerSchema.parse(JSON.parse(raw));
}

export function watchKey(market: string, parcelId: string) {
  return `${market}:${parcelId}`;
}
export function addWatch(
  state: Watchtower,
  home: { market: Watch['market']; parcelId: string; address: string },
  topics: readonly WatchTopic[],
  now: Date,
  radiusMiles = 0.5,
): Watchtower {
  const key = watchKey(home.market, home.parcelId);
  if (state.watches.some(watch => watch.key === key))
    return updateWatch(state, key, { topics: [...topics], paused: false });
  if (state.watches.length >= WATCH_POLICY.maxWatches)
    throw new Error(`You can watch up to ${WATCH_POLICY.maxWatches} homes on this device. Remove one to add another.`);
  const watch = watchSchema.parse({
    key,
    market: home.market,
    parcelId: home.parcelId,
    address: home.address,
    topics: [...new Set(topics)],
    radiusMiles,
    createdAt: now.toISOString(),
    paused: false,
    baseline: null,
    unavailable: {},
    lastCheckAt: null,
    lastSuccessfulCheckAt: null,
    checks: [],
  });
  return { ...state, watches: [...state.watches, watch] };
}
export function updateWatch(
  state: Watchtower,
  key: string,
  patch: Partial<Pick<Watch, 'topics' | 'paused' | 'radiusMiles'>>,
) {
  return {
    ...state,
    watches: state.watches.map(watch => (watch.key === key ? watchSchema.parse({ ...watch, ...patch }) : watch)),
  };
}
/** Deleting a watch deletes its baseline, its check log and every event it produced. */
export function removeWatch(state: Watchtower, key: string): Watchtower {
  return {
    ...state,
    watches: state.watches.filter(watch => watch.key !== key),
    events: state.events.filter(event => event.watchKey !== key),
  };
}
export function markRead(state: Watchtower, key: string): Watchtower {
  return { ...state, events: state.events.map(event => (event.watchKey === key ? { ...event, read: true } : event)) };
}

const HOUR = 3_600_000;
export type WatchStatus = {
  state: 'paused' | 'never-checked' | 'current' | 'stale' | 'unavailable';
  text: string;
  nextCheckAfter: string | null;
};
export function watchStatus(watch: Watch, now: Date): WatchStatus {
  const next = watch.lastCheckAt
    ? new Date(Date.parse(watch.lastCheckAt) + WATCH_POLICY.minIntervalHours * HOUR).toISOString()
    : null;
  const nextCheckAfter = next && next > now.toISOString() ? next : null;
  if (watch.paused) return { state: 'paused', text: 'Paused. No checks run until you resume.', nextCheckAfter: null };
  if (!watch.lastCheckAt) return { state: 'never-checked', text: 'Not checked yet.', nextCheckAfter: null };
  const failing = Object.keys(watch.unavailable);
  if (!watch.lastSuccessfulCheckAt)
    return {
      state: 'unavailable',
      text: 'No source has answered yet. Nothing is assumed in the meantime.',
      nextCheckAfter,
    };
  const age = now.getTime() - Date.parse(watch.lastSuccessfulCheckAt);
  if (age > WATCH_POLICY.staleAfterHours * HOUR)
    return {
      state: 'stale',
      text: `Last successful check over ${WATCH_POLICY.staleAfterHours} hours ago; records since then are unknown.`,
      nextCheckAfter,
    };
  if (failing.length)
    return {
      state: 'unavailable',
      text: `${failing.length} source${failing.length === 1 ? '' : 's'} did not answer on the latest check; their records are unknown, not unchanged.`,
      nextCheckAfter,
    };
  return { state: 'current', text: 'Every watched source answered on the latest check.', nextCheckAfter };
}

/** Whether a check may run now under the schedule and the device's daily quota. */
export function checkAllowed(state: Watchtower, watch: Watch, now: Date): { allowed: boolean; reason: string } {
  if (watch.paused) return { allowed: false, reason: 'This watch is paused.' };
  if (watch.lastCheckAt && now.getTime() - Date.parse(watch.lastCheckAt) < WATCH_POLICY.minIntervalHours * HOUR)
    return {
      allowed: false,
      reason: `Checked within the last ${WATCH_POLICY.minIntervalHours} hours; the public sources are not asked again sooner.`,
    };
  const day = now.toISOString().slice(0, 10);
  if (state.usage.day === day && state.usage.checks >= WATCH_POLICY.dailyChecksPerDevice)
    return { allowed: false, reason: `This device has run its ${WATCH_POLICY.dailyChecksPerDevice} checks for today.` };
  return { allowed: true, reason: '' };
}
export const dueWatches = (state: Watchtower, now: Date) =>
  state.watches.filter(watch => checkAllowed(state, watch, now).allowed);

export type WatchInput = {
  checkedAt: string;
  sources: Pick<SourceCheck, 'sourceId' | 'name' | 'status' | 'cached' | 'errors'>[];
  observations: Observation[];
  nearby?: {
    source: Pick<SourceCheck, 'sourceId' | 'name' | 'status' | 'cached' | 'errors'>;
    sales: { identity: string; address: string; distanceMiles: number; observation: Observation }[];
  } | null;
};
type Tracked = {
  key: string;
  topic: WatchTopic;
  sourceId: string;
  fingerprint: string;
  label: string;
  date: string | null;
};
const usd = (value: unknown) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : 'price not recorded';
const KIND_LABELS: Partial<Record<Observation['kind'], string>> = {
  'recorded-transfer': 'Recorded transfer',
  assessment: 'Tax assessment record',
  'property-tax': 'Property tax record',
  permit: 'Building permit',
};
function tracked(watch: Watch, input: WatchInput): Tracked[] {
  const items: Tracked[] = [];
  const topics = new Set(watch.topics);
  for (const item of input.observations) {
    if (item.parcelId === watch.parcelId && KIND_LABELS[item.kind] && topics.has('own-records'))
      items.push({
        key: `own-records|${item.sourceId}|${item.kind}|${item.identity}`,
        topic: 'own-records',
        sourceId: item.sourceId,
        fingerprint: item.fingerprint,
        label:
          item.kind === 'recorded-transfer'
            ? `${KIND_LABELS[item.kind]} dated ${item.dates.transaction}, ${usd(item.values.price)}`
            : item.kind === 'permit'
              ? `${KIND_LABELS[item.kind]} ${item.identity}: ${item.values.work ?? 'work'} (${item.values.statusLabel ?? item.values.status})`
              : `${KIND_LABELS[item.kind]}`,
        date: item.dates.transaction ?? item.dates.effective ?? null,
      });
    else if (item.kind === 'flood-zone' && item.parcelId === watch.parcelId && topics.has('flood-zone'))
      items.push({
        key: `flood-zone|${item.sourceId}`,
        topic: 'flood-zone',
        sourceId: item.sourceId,
        fingerprint: item.fingerprint,
        label: `FEMA flood zone ${item.values.zone}`,
        date: null,
      });
  }
  if (topics.has('price-index')) {
    const quarters = input.observations
      .filter(item => item.kind === 'price-index')
      .toSorted((a, b) => ((a.dates.effective ?? '') < (b.dates.effective ?? '') ? 1 : -1));
    const latest = quarters[0];
    if (latest)
      items.push({
        key: `price-index|${latest.sourceId}`,
        topic: 'price-index',
        sourceId: latest.sourceId,
        fingerprint: latest.identity,
        label: `Regional index for the quarter ending ${latest.dates.effective}`,
        date: latest.dates.effective,
      });
  }
  if (topics.has('nearby-sales'))
    for (const sale of input.nearby?.sales ?? [])
      if (sale.distanceMiles <= watch.radiusMiles)
        items.push({
          key: `nearby-sales|${sale.observation.sourceId}|${sale.identity}`,
          topic: 'nearby-sales',
          sourceId: sale.observation.sourceId,
          fingerprint: sale.observation.fingerprint,
          label: `${sale.address}, ${sale.distanceMiles} mi away: sold ${sale.observation.dates.transaction} for ${usd(sale.observation.values.price)}`,
          date: sale.observation.dates.transaction,
        });
  return items;
}
const TOPIC_SOURCES: Record<WatchTopic, (sourceId: string) => boolean> = {
  'own-records': id => !['fema-flood-hazard', 'fhfa-purchase-only-index'].includes(id),
  'flood-zone': id => id === 'fema-flood-hazard',
  'price-index': id => id === 'fhfa-purchase-only-index',
  'nearby-sales': () => true,
};
const NOT_A_VALUE =
  'This is a public record, not a change to your estimate. Your estimate changes only when you re-run its validated calculation.';

/**
 * Applies one check to a watch. Returns the updated state and the events it produced. A record is "removed" only
 * when its source answered completely; a source that failed leaves its records in the baseline, unknown rather
 * than gone.
 */
export function applyCheck(
  state: Watchtower,
  key: string,
  input: WatchInput,
): { state: Watchtower; events: WatchEvent[] } {
  const watch = state.watches.find(item => item.key === key);
  if (!watch) throw new Error('That watch no longer exists.');
  const at = iso.parse(input.checkedAt);
  const sources = [
    ...input.sources,
    ...(input.nearby && watch.topics.includes('nearby-sales') ? [input.nearby.source] : []),
  ];
  // Completeness is judged per check: the nearby list reuses the home's sales source, so one answering does not
  // vouch for the other.
  const ownComplete = new Set(
    input.sources.filter(source => source.status === 'complete').map(source => source.sourceId),
  );
  const nearbyComplete = !!input.nearby && input.nearby.source.status === 'complete';
  const complete = new Set([...ownComplete, ...(nearbyComplete ? [input.nearby!.source.sourceId] : [])]);
  const failed = sources.filter(
    source => source.status === 'failed' || source.status === 'deferred' || source.status === 'partial',
  );
  const events: WatchEvent[] = [];
  const event = (fields: Omit<WatchEvent, 'watchKey' | 'detectedAt' | 'read'>) =>
    events.push({ ...fields, watchKey: key, detectedAt: at, read: false });
  const items = tracked(watch, input);
  const current = Object.fromEntries(items.map(item => [item.key, item]));
  const baseline = { ...(watch.baseline ?? {}) };
  if (watch.baseline) {
    for (const item of items) {
      const before = watch.baseline[item.key];
      if (!before)
        event({
          id: `${key}|new|${item.key}|${item.fingerprint.slice(0, 24)}`,
          topic: item.topic,
          kind: 'new',
          title: `New: ${item.label}`,
          detail:
            item.topic === 'price-index'
              ? `The FHFA published a new quarter for the metropolitan area. It describes the region, not this home. ${NOT_A_VALUE}`
              : `${sources.find(source => source.sourceId === item.sourceId)?.name ?? item.sourceId} now lists this record. ${NOT_A_VALUE}`,
          sourceId: item.sourceId,
          recordDate: item.date,
        });
      else if (before.fingerprint !== item.fingerprint)
        event({
          id: `${key}|changed|${item.key}|${item.fingerprint.slice(0, 24)}`,
          topic: item.topic,
          kind: 'changed',
          title: `Changed: ${item.label}`,
          detail: `The source’s record differs from the one first seen (${before.label}). The source may have corrected or updated it. ${NOT_A_VALUE}`,
          sourceId: item.sourceId,
          recordDate: item.date,
        });
      baseline[item.key] = { fingerprint: item.fingerprint, label: item.label };
    }
    for (const [recordKey, before] of Object.entries(watch.baseline)) {
      if (current[recordKey]) continue;
      const [topic, sourceId] = recordKey.split('|') as [WatchTopic, string];
      if (!watch.topics.includes(topic)) {
        delete baseline[recordKey];
        continue;
      }
      // Only a complete answer can show a record is gone; the nearby list also needs its own complete answer.
      if (topic === 'nearby-sales' ? !nearbyComplete : !ownComplete.has(sourceId)) continue;
      if (topic === 'price-index') {
        delete baseline[recordKey];
        continue;
      }
      event({
        id: `${key}|removed|${recordKey}|${before.fingerprint.slice(0, 24)}`,
        topic,
        kind: 'removed',
        title: `No longer listed: ${before.label}`,
        detail:
          topic === 'nearby-sales'
            ? 'The sale is no longer among the nearby qualified sales. The source may have reclassified it, or it is outside the radius you set.'
            : 'The source no longer returns this record. It may have been corrected or withdrawn; the original is kept in your exported history.',
        sourceId,
        recordDate: null,
      });
      delete baseline[recordKey];
    }
  } else if (complete.size)
    for (const item of items) baseline[item.key] = { fingerprint: item.fingerprint, label: item.label };
  const relevant = (sourceId: string) => watch.topics.some(topic => TOPIC_SOURCES[topic](sourceId));
  const unavailable: Record<string, string> = {};
  for (const source of failed) {
    if (!relevant(source.sourceId)) continue;
    const since = watch.unavailable[source.sourceId] ?? at;
    unavailable[source.sourceId] = since;
    if (!watch.unavailable[source.sourceId])
      event({
        id: `${key}|source-unavailable|${source.sourceId}|${since}`,
        topic: 'source',
        kind: 'source-unavailable',
        title: `${source.name} did not answer`,
        detail: `${source.errors[0] ?? 'The source was unavailable.'} Its records are unknown until it answers again; nothing is assumed in the meantime.`,
        sourceId: source.sourceId,
        recordDate: null,
      });
  }
  for (const [sourceId, since] of Object.entries(watch.unavailable))
    if (complete.has(sourceId) && !unavailable[sourceId])
      event({
        id: `${key}|source-restored|${sourceId}|${since}`,
        topic: 'source',
        kind: 'source-restored',
        title: `${sources.find(source => source.sourceId === sourceId)?.name ?? sourceId} is answering again`,
        detail: 'Its records were compared with your baseline on this check.',
        sourceId,
        recordDate: null,
      });
  const known = new Set(state.events.map(item => item.id));
  const fresh = events.filter(item => !known.has(item.id) && (known.add(item.id), true));
  const succeeded = complete.size > 0;
  const updated: Watch = {
    ...watch,
    baseline: succeeded || watch.baseline ? baseline : null,
    unavailable,
    lastCheckAt: at,
    lastSuccessfulCheckAt: succeeded ? at : watch.lastSuccessfulCheckAt,
    checks: [
      ...watch.checks,
      {
        at,
        sources: sources.map(source => ({ sourceId: source.sourceId, status: source.status, cached: source.cached })),
        records: items.length,
        events: fresh.length,
      },
    ].slice(-WATCH_POLICY.maxChecksLogged),
  };
  const mine = [...state.events.filter(item => item.watchKey === key), ...fresh].slice(-WATCH_POLICY.maxEventsPerWatch);
  const day = at.slice(0, 10);
  return {
    state: watchtowerSchema.parse({
      ...state,
      watches: state.watches.map(item => (item.key === key ? updated : item)),
      events: [...state.events.filter(item => item.watchKey !== key), ...mine],
      usage: { day, checks: (state.usage.day === day ? state.usage.checks : 0) + 1 },
    }),
    events: fresh,
  };
}

export function exportWatchtower(state: Watchtower, now: Date) {
  return {
    format: 'ascent-watchtower-export-1',
    exportedAt: now.toISOString(),
    policy: WATCH_POLICY,
    privacy: 'Your watched homes, check history and notifications from this browser. Nothing here was sent to Ascent.',
    ...state,
  };
}
