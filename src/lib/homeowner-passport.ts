import { z } from 'zod';
import { calculationChecksum } from './analytics';
import { compareCmaDecisions } from './decision-review';
import {
  calculateStudio,
  studioStateSchema,
  studioSources,
  studioCandidates,
  type StudioEvidence,
  type StudioState,
} from './demo-studio';
import { compareDecisions, decisionKinds, financeSchema, type FinanceInputs } from './homeowner-finance';
import type { Source, ValuationProperty } from './types';
import { accuracyReferenceSchema, homeownerAccuracyReference } from './homeowner-validation';

export const HOME_STORAGE_KEY = 'ascent.homeowner-profiles.v1';
const text = z.string().max(1000);
const propertySchema = z.object({
  id: text,
  address: text,
  city: text,
  state: text,
  zip: text,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  beds: z.number().min(0).max(30),
  baths: z.number().min(0).max(30),
  sqft: z.number().positive().max(1000000),
  sourceId: text,
  condition: z.number().min(0).max(9).optional(),
  status: z.enum(['active', 'sold', 'pending', 'withdrawn']).optional(),
  soldPrice: z.number().positive().optional(),
  soldAt: text.optional(),
  price: z.number().nonnegative().optional(),
  yearBuilt: z.number().optional(),
  lotSqft: z.number().optional(),
  roomCountsUnavailable: z.boolean().optional(),
  ratingKind: z.literal('quality-grade').optional(),
  county: text.optional(),
  propertyType: z.literal('condominium').optional(),
  history: z
    .array(z.object({ date: text, event: text, price: z.number().optional() }))
    .max(50)
    .optional(),
});
const sourceSchema = z.object({
  id: text,
  label: text,
  kind: z.enum(['synthetic', 'public', 'user', 'licensed']),
  observedAt: z.iso.datetime(),
  license: z.string().max(4000),
  confidence: z.number(),
});
const evidenceSchema = z.object({
  subject: propertySchema,
  candidates: z.array(propertySchema).max(10000),
  sources: z.array(sourceSchema).max(10),
  asOf: z.iso.datetime(),
  snapshot: z
    .object({
      salesFetchedAt: z.iso.datetime(),
      parcelsFetchedAt: z.iso.datetime(),
      salesSha256: text.optional(),
      parcelsSha256: text.optional(),
    })
    .optional(),
});
const improvementSchema = z.object({
  year: z.number().int().min(1800).max(2200),
  description: z.string().trim().min(1).max(500),
  cost: z.number().min(0).max(100000000).nullable(),
});
export type Improvement = z.infer<typeof improvementSchema>;
export const ownerNotesSchema = z.object({
  improvements: z.array(improvementSchema).max(30),
  disputedEvidence: z.string().max(2000),
  monitor: z.boolean(),
});
export type OwnerNotes = z.infer<typeof ownerNotesSchema>;
export const emptyOwnerNotes = (): OwnerNotes => ({ improvements: [], disputedEvidence: '', monitor: false });
const allowedSources: Record<string, Source['kind']> = {
  'source-dc-public-records': 'public',
  'source-maryland-public-records': 'public',
  'source-dc-condo-public-records': 'public',
  'source-synthetic-landing': 'synthetic',
  'source-practice-user-entry': 'user',
};
/** Only the account-free public/sample studio may use device passports. Licensed work stays in scoped server paths. */
export function assertPortableEvidence(evidence: StudioEvidence) {
  if (!evidence.sources.length || evidence.sources.some(s => allowedSources[s.id] !== s.kind))
    throw new Error('Device passports support only the bundled public-record studios and fictional sample.');
  const ids = new Set(evidence.sources.map(s => s.id));
  if (
    ids.size !== evidence.sources.length ||
    new Set(evidence.candidates.map(p => p.id)).size !== evidence.candidates.length
  )
    throw new Error('Duplicate source or comparable identifiers need review.');
  if ([evidence.subject, ...evidence.candidates].some(p => !ids.has(p.sourceId)))
    throw new Error('Evidence has an unidentified source.');
}
export type HomeSnapshot = {
  id: string;
  savedAt: string;
  evidence: StudioEvidence;
  state: StudioState;
  finance: FinanceInputs;
  notes: OwnerNotes;
  calculation: z.infer<typeof calculationSchema>;
};
const calculationSchema = z.object({
  accuracyReference: accuracyReferenceSchema.nullable().optional(),
  valuationVersion: text.nullable(),
  valuationHash: text.nullable(),
  valuationEstimate: z.number().finite().nullable(),
  financeVersion: text,
  financeHash: text,
  scenarios: z
    .array(
      z.object({
        kind: z.enum(decisionKinds),
        available: z.boolean(),
        netPosition: z.number().finite().nullable(),
        monthlyCashFlow: z.number().finite().nullable(),
        terminalEquity: z.number().finite().nullable(),
      }),
    )
    .length(6),
});
export type HomeProfile = { propertyId: string; address: string; href: string; snapshots: HomeSnapshot[] };
const snapshotSchema = z.object({
  id: z.string().max(100),
  savedAt: z.iso.datetime(),
  evidence: evidenceSchema,
  state: z.unknown(),
  finance: financeSchema,
  notes: ownerNotesSchema,
  calculation: calculationSchema,
});
const profileSchema = z.object({
  propertyId: text,
  address: text,
  href: z.string().max(150),
  snapshots: z.array(snapshotSchema).min(1).max(10),
});
export function parseProfiles(raw: string): HomeProfile[] {
  if (raw.length > 4_000_000)
    throw new Error('Saved profiles exceed the supported size. Export or remove older profiles.');
  const parsed = z.object({ version: z.literal(1), profiles: z.array(profileSchema).max(10) }).parse(JSON.parse(raw));
  const ids = new Set<string>();
  return parsed.profiles.map(p => {
    if (ids.has(p.propertyId)) throw new Error('Duplicate saved property.');
    ids.add(p.propertyId);
    return {
      ...p,
      snapshots: p.snapshots.map(s => {
        assertPortableEvidence(s.evidence);
        if (s.evidence.subject.id !== p.propertyId || propertyHref(s.evidence.subject) !== p.href)
          throw new Error('Saved property identity does not match.');
        const checked = { ...s, state: parseStudioState(s.evidence, s.state) };
        const { id, ...body } = checked;
        if (calculationChecksum(body) !== id) throw new Error('Saved snapshot does not match its checksum.');
        return checked;
      }),
    };
  });
}
function parseStudioState(evidence: StudioEvidence, raw: unknown) {
  const max = evidence.subject.state === 'MD' ? 9 : evidence.subject.state === 'DC' ? 6 : 5;
  return studioStateSchema(
    evidence.candidates.map(p => p.id),
    max,
    !!evidence.subject.roomCountsUnavailable,
    evidence.subject.condition !== undefined,
  ).parse(raw);
}
export function propertyHref(subject: ValuationProperty) {
  if (subject.id === 'landing-subject' && subject.sourceId === 'source-synthetic-landing') return '/demo';
  const base =
    subject.sourceId === 'source-maryland-public-records'
      ? '/maryland'
      : subject.propertyType === 'condominium'
        ? '/dc/condos'
        : '/dc';
  const parcel = subject.id.replace(/^(dc-condo-parcel-|dc-parcel-|md-parcel-)/, '');
  return `${base}?parcel=${encodeURIComponent(parcel)}`;
}
export function createHomeSnapshot(
  evidence: StudioEvidence,
  state: StudioState,
  finance: FinanceInputs,
  notes: OwnerNotes,
  at: string,
): HomeSnapshot {
  const clean = evidenceSchema.parse(evidence);
  assertPortableEvidence(clean);
  const input = {
    savedAt: z.iso.datetime().parse(at),
    evidence: clean,
    state: parseStudioState(clean, state),
    finance: financeSchema.parse(finance),
    notes: ownerNotesSchema.parse(notes),
  };
  let valuation = null;
  try {
    valuation = calculateStudio(clean, input.state);
  } catch {
    /* Preserve missing-evidence abstention. */
  }
  const financial = compareDecisions(input.finance);
  const calculation = {
    accuracyReference: homeownerAccuracyReference(clean, input.state),
    valuationVersion: valuation?.version ?? null,
    valuationHash: valuation?.calculationHash ?? null,
    valuationEstimate: valuation?.estimate ?? null,
    financeVersion: financial.version,
    financeHash: financial.calculationHash,
    scenarios: financial.results.map(r => ({
      kind: r.kind,
      available: r.available,
      netPosition: r.netPosition,
      monthlyCashFlow: r.monthlyCashFlow,
      terminalEquity: r.terminalEquity,
    })),
  };
  return structuredClone({ id: calculationChecksum({ ...input, calculation }), ...input, calculation });
}
export function studioStorageKey(subject: ValuationProperty) {
  if (subject.id === 'landing-subject') return 'ascent.practice-studio.v1';
  const parcel = subject.id.replace(/^(dc-condo-parcel-|dc-parcel-|md-parcel-)/, '');
  const prefix =
    subject.sourceId === 'source-maryland-public-records'
      ? 'maryland-studio.v2'
      : subject.sourceId === 'source-dc-condo-public-records'
        ? 'dc-condos-studio.v2'
        : 'dc-studio.v1';
  return `ascent.${prefix}.${parcel}`;
}
export function saveHomeSnapshot(profiles: HomeProfile[], snapshot: HomeSnapshot): HomeProfile[] {
  const subject = snapshot.evidence.subject,
    old = profiles.find(p => p.propertyId === subject.id);
  if (!old && profiles.length >= 10)
    throw new Error('Ten homes are saved. Export or remove a home before adding another.');
  const snapshots = [...(old?.snapshots ?? []), snapshot];
  if (snapshots.length > 10)
    throw new Error('Ten versions are saved for this home. Export or remove an older version first.');
  const profile = { propertyId: subject.id, address: subject.address, href: propertyHref(subject), snapshots };
  const next = [...profiles.filter(p => p.propertyId !== subject.id), profile];
  // Validate the exact persisted representation and its size before claiming success.
  return parseProfiles(JSON.stringify({ version: 1, profiles: next }));
}
const finiteTime = (at: string) => {
  const n = Date.parse(at);
  if (!Number.isFinite(n)) throw new Error('Invalid review date.');
  return n;
};
export function sourceReview(sources: Source[], at: string) {
  const now = finiteTime(at);
  return sources.map(source => {
    const observed = Date.parse(source.observedAt);
    const ageDays = Number.isFinite(observed) ? Math.floor((now - observed) / 86400000) : null;
    return {
      sourceId: source.id,
      label: source.label,
      collectedAt: source.observedAt,
      ageDays,
      status: ageDays === null || ageDays < 0 ? 'unknown' : ageDays > 30 ? 'review' : 'snapshot',
      explanation:
        ageDays === null || ageDays < 0
          ? 'Collection date needs review.'
          : `${ageDays} days since collection. This is a static snapshot, not live inventory. The 30-day review reminder is a product heuristic, not a source update promise.`,
    };
  });
}
/** Exact field differences, with the existing Decision Time Machine for the valuation component. */
export function compareHomeSnapshots(previous: HomeSnapshot, current: HomeSnapshot) {
  if (previous.evidence.subject.id !== current.evidence.subject.id)
    throw new Error('Compare versions of the same home.');
  const changes: { path: string; before: unknown; after: unknown }[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (calculationChecksum(a) === calculationChecksum(b) && JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const left = a as Record<string, unknown>,
        right = b as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort())
        walk(left[key], right[key], `${path}.${key}`);
    } else changes.push({ path, before: a ?? null, after: b ?? null });
  };
  walk(previous.finance, current.finance, 'assumptions');
  walk(previous.notes, current.notes, 'homeowner');
  walk(previous.evidence.asOf, current.evidence.asOf, 'evidence.analysisAt');
  walk(previous.evidence.snapshot, current.evidence.snapshot, 'evidence.snapshot');
  walk(previous.evidence.subject, current.evidence.subject, 'property');
  const left = new Map(previous.evidence.candidates.map(p => [p.id, p])),
    right = new Map(current.evidence.candidates.map(p => [p.id, p]));
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort())
    walk(left.get(id), right.get(id), `sales.${id}`);
  const sourceBefore = new Map(previous.evidence.sources.map(s => [s.id, s])),
    sourceAfter = new Map(current.evidence.sources.map(s => [s.id, s]));
  for (const id of [...new Set([...sourceBefore.keys(), ...sourceAfter.keys()])].sort())
    walk(sourceBefore.get(id), sourceAfter.get(id), `sources.${id}`);
  walk(previous.state, current.state, 'valuationChoices');
  walk(previous.calculation.valuationVersion, current.calculation.valuationVersion, 'calculation.valuationVersion');
  walk(previous.calculation.financeVersion, current.calculation.financeVersion, 'calculation.financeVersion');
  walk(previous.calculation.accuracyReference, current.calculation.accuracyReference, 'calculation.accuracyReference');
  let valuation: ReturnType<typeof compareCmaDecisions> | null = null;
  try {
    const a = calculateStudio(previous.evidence, previous.state),
      b = calculateStudio(current.evidence, current.state);
    if (
      a.calculationHash === previous.calculation.valuationHash &&
      b.calculationHash === current.calculation.valuationHash
    )
      valuation = compareCmaDecisions(a, b);
  } catch {
    /* An abstaining calculation has no valuation delta. */
  }
  return {
    changes,
    valuation,
    savedEstimateChange:
      previous.calculation.valuationEstimate !== null && current.calculation.valuationEstimate !== null
        ? current.calculation.valuationEstimate - previous.calculation.valuationEstimate
        : null,
  };
}
/** A new collection timestamp alone is not a changed property or a market alert. */
export function propertyMonitorChanges(previous: HomeSnapshot, current: HomeSnapshot) {
  return compareHomeSnapshots(previous, current).changes.filter(
    c => /^(property|sales)\./.test(c.path) || (/^sources\./.test(c.path) && !c.path.endsWith('.observedAt')),
  );
}
export function evidencePassport(snapshot: HomeSnapshot, includePrivate = false) {
  assertPortableEvidence(snapshot.evidence);
  let valuation = null;
  try {
    if (includePrivate || (!snapshot.state.addedSales?.length && snapshot.state.subjectCondition === undefined)) {
      const result = calculateStudio(snapshot.evidence, snapshot.state);
      valuation = {
        result,
        replay: {
          reproduced: result.calculationHash === snapshot.calculation.valuationHash,
          savedHash: snapshot.calculation.valuationHash,
          savedVersion: snapshot.calculation.valuationVersion,
          explanation:
            'Recomputed from saved inputs and compared with the hash frozen when this snapshot was saved. A checksum is not authenticity.',
        },
      };
    }
  } catch {
    /* Preserve an abstention and its evidence. */
  }
  const exportedSources = includePrivate ? studioSources(snapshot.evidence, snapshot.state) : snapshot.evidence.sources;
  const records = [
    snapshot.evidence.subject,
    ...(includePrivate ? studioCandidates(snapshot.evidence, snapshot.state) : snapshot.evidence.candidates),
  ].map(record => ({
    record,
    sourceId: record.sourceId,
    collectedAt:
      record.sourceId === 'source-practice-user-entry'
        ? snapshot.savedAt
        : record.id === snapshot.evidence.subject.id
          ? (snapshot.evidence.snapshot?.parcelsFetchedAt ??
            snapshot.evidence.sources.find(s => s.id === record.sourceId)?.observedAt ??
            null)
          : (snapshot.evidence.snapshot?.salesFetchedAt ??
            snapshot.evidence.sources.find(s => s.id === record.sourceId)?.observedAt ??
            null),
    datasetSha256:
      record.sourceId === 'source-practice-user-entry'
        ? null
        : record.id === snapshot.evidence.subject.id
          ? (snapshot.evidence.snapshot?.parcelsSha256 ?? null)
          : (snapshot.evidence.snapshot?.salesSha256 ?? null),
    license: exportedSources.find(s => s.id === record.sourceId)?.license ?? 'Unknown',
    observedAt: null,
    eventAt: record.soldAt ?? null,
    permissionScope: 'Bundled public research and export, or labeled fictional practice',
    provenanceReferences: [record.sourceId, record.id],
    missingFields: ['beds', 'baths', 'condition', 'yearBuilt'].filter(
      key =>
        (record.roomCountsUnavailable && (key === 'beds' || key === 'baths')) ||
        record[key as keyof ValuationProperty] === undefined,
    ),
    qualityIndicators:
      record.sourceId === 'source-practice-user-entry'
        ? ['Homeowner-entered; not independently verified']
        : record.sourceId === 'source-synthetic-landing'
          ? ['fictional']
          : ['Recorded snapshot; not independently inspected'],
  }));
  return {
    format: 'ascent-property-evidence-passport-1',
    snapshotId: includePrivate
      ? snapshot.id
      : calculationChecksum({ evidence: snapshot.evidence, valuation: valuation?.result.calculationHash }),
    analysisAt: snapshot.evidence.asOf,
    savedAt: snapshot.savedAt,
    privacy: includePrivate
      ? 'Private financial assumptions and homeowner notes included.'
      : 'Public evidence only. No debt, finances, improvements or disputed-evidence notes included.',
    property: snapshot.evidence.subject,
    accuracyReference: snapshot.calculation.accuracyReference ?? null,
    records,
    sources: exportedSources,
    snapshot: snapshot.evidence.snapshot,
    valuation,
    valuationOmission:
      !includePrivate && (snapshot.state.addedSales?.length || snapshot.state.subjectCondition !== undefined)
        ? 'The valuation contains homeowner-entered sales or a condition rating. Export a private passport to include it.'
        : null,
    freshness: sourceReview(snapshot.evidence.sources, snapshot.savedAt),
    missingEvidence: [
      'Verified mortgage payoff',
      'Tax bill',
      'Insurance quote',
      'Inspected condition',
      'Complete title/permit/hazard history',
      'Live listings and concessions',
    ],
    ...(includePrivate
      ? {
          finance: compareDecisions(snapshot.finance),
          savedCalculation: snapshot.calculation,
          financeReplayMatches: compareDecisions(snapshot.finance).calculationHash === snapshot.calculation.financeHash,
          homeowner: snapshot.notes,
          studioChoices: snapshot.state,
        }
      : {}),
    reproduction:
      'Valuation: use archived result.inputSnapshot, assumptions and asOf with its engine version. Finance: run compareDecisions with the stated inputs and finance version. Checksums are not cryptographic authenticity.',
    sharing:
      'This is a downloaded copy. Ascent does not host a public sharing link and cannot revoke copies already shared.',
  };
}
