import type { StudioEvidence } from './demo-studio';
import { snapshotAge } from './data-freshness';
import { permitStatusText, type PermitRecord } from './property-facts';
import type { Observation } from './sources/observations';
import type { SourceCheck } from './sources/property-check';

/**
 * The Property Evidence Timeline: everything the public records say happened to one home, newest first, with each
 * event's own date kept apart from when it was recorded, when the source published it and when Ascent looked.
 * Bundled snapshot records and live-checked records are merged by identity (a sale by its date, a permit by its
 * number); disagreements are shown, not resolved. Nothing here feeds or changes the estimate.
 */
export const TIMELINE_VERSION = 'ascent-evidence-timeline-1';

export type TimelineSourceRef = {
  sourceId: string;
  label: string;
  origin: 'snapshot' | 'live';
  recorded: string | null;
  published: string | null;
  observed: string;
};
export type TimelineEvent = {
  id: string;
  category: 'transfer' | 'permit' | 'assessment' | 'tax' | 'risk' | 'construction' | 'source';
  /** The event's own date: a sale date, an issue date, a build year. Never the fetch date unless labeled so. */
  date: string | null;
  precision: 'day' | 'month' | 'year';
  dateLabel: string;
  title: string;
  detail: string;
  values: { label: string; value: string }[];
  sources: TimelineSourceRef[];
  /** A live record dated after the bundled snapshot it would have appeared in. */
  newSinceSnapshot: boolean;
  conflict: string | null;
};
export type LiveCheck = { checkedAt: string; sources: SourceCheck[]; observations: Observation[] };
export type EvidenceTimeline = {
  version: typeof TIMELINE_VERSION;
  property: { id: string; address: string };
  events: TimelineEvent[];
  sources: { sourceId: string; label: string; status: string; checkedAt: string | null; detail: string }[];
  gaps: string[];
  live: { checkedAt: string } | null;
  freshness: { status: string; text: string } | null;
  counts: { transfers: number; permits: number; newSinceSnapshot: number; conflicts: number };
};

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const usdCents = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const SOURCE_LABELS: Record<string, string> = {
  'dc-property-sales': 'District property sales',
  'dc-tax-extract': 'District tax extract',
  'dc-building-permits': 'District building permits',
  'md-sdat-assessments': 'Maryland SDAT assessment record',
  'montgomery-permits': 'Montgomery County permits',
  'prince-georges-permits': 'Prince George’s County permits',
  'fema-flood-hazard': 'FEMA flood hazard layer',
  'fhfa-purchase-only-index': 'FHFA metropolitan price index',
};
const sourceLabel = (id: string) => SOURCE_LABELS[id] ?? id;
const liveRef = (item: Observation): TimelineSourceRef => ({
  sourceId: item.sourceId,
  label: sourceLabel(item.sourceId),
  origin: 'live',
  recorded: item.dates.recorded,
  published: item.dates.published,
  observed: item.dates.observed,
});
const value = (item: Observation, key: string) => item.values[key];
const numberValue = (item: Observation, key: string) => {
  const raw = value(item, key);
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
};

function transferEvents(evidence: StudioEvidence, live: Observation[], snapshotLastSale: string | null) {
  const snapshotRef: TimelineSourceRef = {
    sourceId: evidence.sources[0]?.id ?? 'snapshot',
    label: `Bundled ${evidence.sources[0]?.label ?? 'snapshot'}`,
    origin: 'snapshot',
    recorded: null,
    published: null,
    observed: evidence.snapshot?.salesFetchedAt ?? evidence.asOf,
  };
  const byDate = new Map<string, { snapshotPrice: number | null; live: Observation[] }>();
  for (const entry of evidence.subject.history ?? []) {
    const date = entry.date.slice(0, 10);
    byDate.set(date, { snapshotPrice: entry.price ?? null, live: [] });
  }
  for (const item of live.filter(entry => entry.kind === 'recorded-transfer' && entry.dates.transaction)) {
    const date = item.dates.transaction!;
    const group = byDate.get(date) ?? { snapshotPrice: null, live: [] };
    group.live.push(item);
    byDate.set(date, group);
  }
  const events: TimelineEvent[] = [];
  for (const [date, group] of byDate) {
    const prices = new Map<string, number>();
    if (group.snapshotPrice !== null) prices.set(`Ascent’s snapshot`, group.snapshotPrice);
    for (const item of group.live) {
      const price = numberValue(item, 'price');
      if (price !== null) prices.set(sourceLabel(item.sourceId), price);
    }
    const distinct = [...new Set(prices.values())];
    const price = group.snapshotPrice ?? distinct[0] ?? null;
    const recorded = group.live.map(item => item.dates.recorded).find(Boolean) ?? null;
    const qualified = group.live.find(item => typeof value(item, 'qualified') === 'boolean');
    const conveyance = group.live.map(item => value(item, 'conveyance')).find(Boolean);
    const acceptance = group.live.map(item => value(item, 'acceptance')).find(Boolean);
    const book = group.live.find(item => value(item, 'deedBook'));
    const inSnapshot = group.snapshotPrice !== null;
    const newer = !inSnapshot && !!snapshotLastSale && date > snapshotLastSale;
    const values: TimelineEvent['values'] = [];
    if (price !== null) values.push({ label: 'Recorded price', value: usd(price) });
    if (recorded) values.push({ label: 'Deed dated', value: day(recorded) });
    if (qualified)
      values.push({
        label: 'Assessor qualification',
        value: value(qualified, 'qualified') ? 'Qualified (arm’s-length)' : 'Not qualified',
      });
    if (acceptance) values.push({ label: 'Tax record says', value: String(acceptance) });
    if (conveyance) values.push({ label: 'Conveyance', value: String(conveyance) });
    if (book)
      values.push({
        label: 'Land records reference',
        value: `Book ${value(book, 'deedBook')}, page ${value(book, 'deedPage') ?? '?'}`,
      });
    const detail = [
      `The transfer is dated ${day(date)}.`,
      recorded && recorded !== date ? `The deed is dated ${day(recorded)}.` : '',
      inSnapshot
        ? 'It is in the bundled snapshot as a qualified sale of this home. A home’s own sales are never its comparables.'
        : newer
          ? 'It is newer than the bundled snapshot, so the estimate has not seen it and will not use it.'
          : 'It is not among the snapshot’s qualified sales: the source records it, but it was not an assessor-qualified or arm’s-length sale, or it was filtered out.',
    ]
      .filter(Boolean)
      .join(' ');
    events.push({
      id: `transfer:${date}`,
      category: 'transfer',
      date,
      precision: 'day',
      dateLabel: 'Sale dated',
      title: price !== null ? `Recorded transfer, ${usd(price)}` : 'Recorded transfer, price not recorded',
      detail,
      values,
      sources: [...(inSnapshot ? [snapshotRef] : []), ...group.live.map(liveRef)],
      newSinceSnapshot: newer,
      conflict:
        distinct.length > 1
          ? `Sources disagree on the price: ${[...prices].map(([label, amount]) => `${usd(amount)} (${label})`).join(' vs ')}.`
          : group.live.length > 1 && new Set(group.live.map(item => item.fingerprint)).size > 1 && !distinct.length
            ? 'More than one record exists for this date.'
            : null,
    });
  }
  return events;
}

function permitEvents(evidence: StudioEvidence, live: Observation[]) {
  const facts = evidence.facts;
  const collected = facts?.sources.find(source => source.id === facts.permits?.source)?.collectedAt ?? null;
  const snapshotRef = (label: string): TimelineSourceRef => ({
    sourceId: facts?.permits?.source ?? 'snapshot',
    label: `Bundled ${label}`,
    origin: 'snapshot',
    recorded: null,
    published: null,
    observed: collected ?? evidence.asOf,
  });
  const byId = new Map<string, { bundled: PermitRecord | null; live: Observation | null }>();
  for (const record of facts?.permits?.records ?? []) byId.set(record.id, { bundled: record, live: null });
  for (const item of live.filter(entry => entry.kind === 'permit')) {
    const group = byId.get(item.identity) ?? { bundled: null, live: null };
    group.live = item;
    byId.set(item.identity, group);
  }
  const label = facts?.sources.find(source => source.id === facts.permits?.source)?.label ?? 'permit records';
  return [...byId].map(([id, { bundled, live: item }]): TimelineEvent => {
    const issued = bundled?.issued ?? (item ? String(item.dates.effective ?? '') : '');
    const work = bundled?.work ?? String(item?.values.work ?? 'Permit');
    const liveStatus = item ? String(item.values.status) : null;
    const liveLabel = item ? String(item.values.statusLabel ?? liveStatus) : null;
    const status = bundled ? permitStatusText(bundled) : (liveLabel ?? '').toLowerCase();
    const changed = !!bundled && !!item && liveStatus !== bundled.status;
    const newer = !bundled && !!collected && issued > collected.slice(0, 10);
    const values: TimelineEvent['values'] = [
      { label: 'Permit', value: id },
      { label: 'Status', value: changed ? `${liveLabel} (snapshot: ${bundled!.statusLabel})` : status },
    ];
    const declared = bundled?.declaredValue ?? (item ? numberValue(item, 'declaredValue') : null);
    if (declared) values.push({ label: 'Declared cost', value: usd(declared) });
    const finaled = bundled?.finaled ?? (item ? (value(item, 'finaled') as string | null) : null);
    if (finaled) values.push({ label: 'Final approval', value: day(finaled) });
    if (bundled?.scope === 'building') values.push({ label: 'Applies to', value: 'The building' });
    return {
      id: `permit:${id}`,
      category: 'permit',
      date: issued || null,
      precision: 'day',
      dateLabel: 'Issued',
      title: work,
      detail: [
        'A permit shows authorized work, not finished work or current condition.',
        changed ? 'Its status has changed since the snapshot was collected.' : '',
        newer ? 'It was issued after the bundled snapshot was collected.' : '',
      ]
        .filter(Boolean)
        .join(' '),
      values,
      sources: [...(bundled ? [snapshotRef(label)] : []), ...(item ? [liveRef(item)] : [])],
      newSinceSnapshot: newer,
      conflict: null,
    };
  });
}

function recordEvents(live: Observation[]) {
  const events: TimelineEvent[] = [];
  for (const item of live) {
    if (item.kind === 'assessment') {
      const current = numberValue(item, 'currentTotal');
      const prior = numberValue(item, 'priorYearTotal');
      const proposed = numberValue(item, 'proposedTotal');
      const values: TimelineEvent['values'] = [];
      if (current !== null) values.push({ label: 'Current assessed value', value: usd(current) });
      if (proposed !== null) values.push({ label: 'Proposed assessment', value: usd(proposed) });
      if (prior !== null) values.push({ label: 'Prior year assessment', value: usd(prior) });
      const land = numberValue(item, 'land') ?? numberValue(item, 'proposedLand');
      const improvements = numberValue(item, 'improvements') ?? numberValue(item, 'proposedImprovements');
      if (land !== null) values.push({ label: 'Land', value: usd(land) });
      if (improvements !== null) values.push({ label: 'Buildings', value: usd(improvements) });
      const effective = item.dates.effective;
      events.push({
        id: `assessment:${item.identity}`,
        category: 'assessment',
        date: effective ?? item.dates.published?.slice(0, 10) ?? null,
        precision: effective ? 'month' : 'day',
        dateLabel: effective ? 'Assessed' : 'Tax record exported',
        title: current !== null ? `Tax assessment ${usd(current)}` : 'Tax assessment record',
        detail:
          'An assessment is the government’s valuation for property tax, set on its own schedule. It is not a market value or an appraisal, and it does not change Ascent’s estimate.',
        values,
        sources: [liveRef(item)],
        newSinceSnapshot: false,
        conflict: null,
      });
    } else if (item.kind === 'property-tax') {
      const annual = numberValue(item, 'annualTax');
      const rate = numberValue(item, 'ratePerHundred');
      events.push({
        id: `tax:${item.identity}`,
        category: 'tax',
        date: item.dates.published?.slice(0, 10) ?? null,
        precision: 'day',
        dateLabel: 'Tax record exported',
        title: annual !== null ? `Annual property tax ${usdCents(annual)}` : 'Property tax record',
        detail:
          'The current annual tax as the tax record states it. Credits, exemptions and payment status are not shown; Ascent does not request payment balances.',
        values: [
          ...(annual !== null ? [{ label: 'Annual tax', value: usdCents(annual) }] : []),
          ...(rate !== null ? [{ label: 'Rate', value: `$${rate.toFixed(2)} per $100 of assessed value` }] : []),
          ...(value(item, 'taxClass') ? [{ label: 'Tax class', value: String(value(item, 'taxClass')) }] : []),
        ],
        sources: [liveRef(item)],
        newSinceSnapshot: false,
        conflict: null,
      });
    } else if (item.kind === 'flood-zone') {
      const special = value(item, 'specialFloodHazardArea') === true;
      events.push({
        id: `flood:${item.identity}`,
        category: 'risk',
        date: item.dates.observed.slice(0, 10),
        precision: 'day',
        dateLabel: 'Looked up',
        title: `FEMA flood zone ${value(item, 'zone')}${special ? ', a special flood hazard area' : ''}`,
        detail: `${value(item, 'subtype') ?? 'Zone as mapped'}. ${
          special
            ? 'Lenders usually require flood insurance in a special flood hazard area.'
            : 'Outside a special flood hazard area on the current map.'
        } The digital layer is not an official determination; a lender’s flood determination and the effective map are. Dated by when Ascent looked it up.`,
        values: [
          { label: 'Zone', value: String(value(item, 'zone')) },
          { label: 'Special flood hazard area', value: special ? 'Yes' : 'No' },
        ],
        sources: [liveRef(item)],
        newSinceSnapshot: false,
        conflict: null,
      });
    }
  }
  return events;
}

const sortKey = (event: TimelineEvent) => (event.date ? event.date.padEnd(10, '-') : '0000');
const CATEGORY_ORDER: Record<TimelineEvent['category'], number> = {
  transfer: 0,
  permit: 1,
  assessment: 2,
  tax: 3,
  risk: 4,
  construction: 5,
  source: 6,
};

export function buildEvidenceTimeline(input: {
  evidence: StudioEvidence;
  /** The home's parcel identifier; live records about any other parcel are ignored. */
  parcelId: string;
  live?: LiveCheck | null;
  now: number;
}) {
  const { evidence, now } = input;
  const live = input.live ?? null;
  const observations = (live?.observations ?? []).filter(item => item.parcelId === input.parcelId);
  const snapshotLastSale = evidence.snapshot?.lastRecordedSale ?? null;
  const events = [
    ...transferEvents(evidence, observations, snapshotLastSale),
    ...permitEvents(evidence, observations),
    ...recordEvents(observations),
  ];
  const years = evidence.facts?.years;
  if (years?.built)
    events.push({
      id: 'built',
      category: 'construction',
      date: String(years.built),
      precision: 'year',
      dateLabel: 'Built',
      title: `Built in ${years.built}`,
      detail: 'The year built as the assessor records it.',
      values: years.effective ? [{ label: 'Effective year built', value: String(years.effective) }] : [],
      sources: [],
      newSinceSnapshot: false,
      conflict: null,
    });
  if (years?.remodeled)
    events.push({
      id: 'remodeled',
      category: 'construction',
      date: String(years.remodeled),
      precision: 'year',
      dateLabel: 'Remodeled',
      title: `Last recorded remodel, ${years.remodeled}`,
      detail:
        'The assessor’s most recent remodel year. Work after it may be missing from the recorded characteristics.',
      values: [],
      sources: [],
      newSinceSnapshot: false,
      conflict: null,
    });
  if (evidence.snapshot)
    events.push({
      id: 'snapshot',
      category: 'source',
      date: evidence.snapshot.salesFetchedAt.slice(0, 10),
      precision: 'day',
      dateLabel: 'Collected',
      title: 'Bundled sales snapshot collected',
      detail: `Ascent collected the recorded sales its estimate uses on ${day(evidence.snapshot.salesFetchedAt)}${
        snapshotLastSale ? `; the newest sale in it is dated ${day(snapshotLastSale)}` : ''
      }. A collection date is not a sale date.`,
      values: evidence.snapshot.salesSha256
        ? [{ label: 'Snapshot fingerprint', value: `${evidence.snapshot.salesSha256.slice(0, 12)}…` }]
        : [],
      sources: [],
      newSinceSnapshot: false,
      conflict: null,
    });
  events.sort(
    (a, b) =>
      (sortKey(a) < sortKey(b) ? 1 : sortKey(a) > sortKey(b) ? -1 : 0) ||
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      (a.id < b.id ? -1 : 1),
  );
  const gaps: string[] = [];
  const freshness = snapshotLastSale ? snapshotAge(snapshotLastSale, now) : null;
  if (!live)
    gaps.push(
      `These are the public records bundled with Ascent${evidence.snapshot ? `, collected ${day(evidence.snapshot.salesFetchedAt)}` : ''}. Check the public records now to see anything recorded since; the check never changes the estimate.`,
    );
  if (freshness) gaps.push(freshness.text);
  gaps.push('Recording lags closing by weeks, so a sale that closed recently may not appear in any public record yet.');
  for (const source of live?.sources ?? []) {
    if (source.status === 'disabled')
      gaps.push(`${source.name} is not used: ${source.permission?.reason ?? 'no permission is recorded'}.`);
    else if (source.status === 'failed' || source.status === 'deferred')
      gaps.push(
        `${source.name} could not be checked (${source.errors[0] ?? 'unavailable'}), so its newer records may be missing.`,
      );
    else if (source.status === 'partial')
      gaps.push(`${source.name} answered only in part, so some of its records may be missing.`);
  }
  if (evidence.facts?.permitGap && !gaps.some(gap => gap.includes('permits is not used')))
    gaps.push(evidence.facts.permitGap);
  return {
    version: TIMELINE_VERSION,
    property: { id: evidence.subject.id, address: evidence.subject.address },
    events,
    sources: (live?.sources ?? [])
      .filter(source => source.sourceId !== 'fhfa-purchase-only-index')
      .map(source => ({
        sourceId: source.sourceId,
        label: sourceLabel(source.sourceId),
        status: source.status,
        checkedAt: source.checkedAt,
        detail:
          source.status === 'complete'
            ? `${source.observations} record${source.observations === 1 ? '' : 's'}${source.cached ? ' (from the shared cache)' : ''}${
                source.publishedAt ? `; source last published ${day(source.publishedAt)}` : ''
              }`
            : source.status === 'disabled'
              ? (source.permission?.required ?? 'Disabled')
              : (source.errors[0] ?? source.status),
      })),
    gaps,
    live: live ? { checkedAt: live.checkedAt } : null,
    freshness: freshness ? { status: freshness.status, text: freshness.text } : null,
    counts: {
      transfers: events.filter(event => event.category === 'transfer').length,
      permits: events.filter(event => event.category === 'permit').length,
      newSinceSnapshot: events.filter(event => event.newSinceSnapshot).length,
      conflicts: events.filter(event => event.conflict).length,
    },
  } satisfies EvidenceTimeline;
}
