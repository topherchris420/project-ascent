import { z } from 'zod';
import { calculateCma, defaultAssumptions } from './analytics';
import { SAMPLE_AS_OF, sampleCandidates, sampleSources, sampleSubject } from './pricing-sample';
import type { PropertyFacts } from './property-facts';
import type { CmaAssumptions, Source, ValuationProperty } from './types';

/** User-entered practice sales are labeled separately from any fixture or public record. */
export const PRACTICE_ENTRY_SOURCE = 'source-practice-user-entry';
export const practiceEntryIds = ['practice-entry-1', 'practice-entry-2', 'practice-entry-3'] as const;
const MILES_PER_DEGREE_LATITUDE = 69.0;

/** One evidence set the studio can price: the fictional sample or a public-record subject and its sales. */
export type StudioEvidence = {
  subject: ValuationProperty;
  candidates: ValuationProperty[];
  sources: Source[];
  asOf: string;
  snapshot?: {
    salesFetchedAt: string;
    parcelsFetchedAt: string;
    salesSha256?: string;
    parcelsSha256?: string;
    lastRecordedSale?: string | null;
  };
  /** Public-record facts beyond the valuation inputs; never read by the engine. Absent for fictional records. */
  facts?: PropertyFacts;
};

export const practiceSaleSchemaFor = (conditionMax: number) =>
  z
    .object({
      id: z.enum(practiceEntryIds),
      address: z.string().trim().min(3).max(80),
      soldPrice: z.number().int().min(10000).max(100000000),
      soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      beds: z.number().int().min(0).max(20),
      baths: z.number().min(0).max(20).multipleOf(0.5),
      sqft: z.number().int().min(200).max(30000),
      condition: z.number().int().min(1).max(conditionMax),
      distanceMiles: z.number().min(0).max(25),
    })
    .strict();
export const practiceSaleSchema = practiceSaleSchemaFor(5);
export type PracticeSale = z.infer<typeof practiceSaleSchema>;

/** Bounded scenario state. Exclusions may only name a sale in this evidence set or a practice entry. */
export function studioStateSchema(
  baseIds: readonly string[],
  conditionMax = 5,
  roomCountsUnavailable = false,
  conditionAvailable = true,
) {
  const ids = new Set(baseIds);
  return z
    .object({
      assumptions: z
        .object({
          sqftRate: z.number().min(0).max(1000),
          bedroomValue: z.number().min(0).max(100000),
          bathroomValue: z.number().min(0).max(100000),
          conditionValue: z
            .number()
            .min(0)
            .max(conditionMax > 6 ? 1000000 : 100000),
          monthlyTrend: z.number().min(-0.1).max(0.1),
          maxDistanceMiles: z.number().min(0.05).max(25),
          maxAgeDays: z.number().int().min(1).max(1825),
          maxSizeRatio: z.number().min(1).max(3),
        })
        .strict(),
      exclusions: z
        .array(z.object({ id: z.string().min(1).max(60), reason: z.string().trim().min(3).max(300) }).strict())
        .max(ids.size + practiceEntryIds.length)
        .refine(entries => new Set(entries.map(e => e.id)).size === entries.length),
      listPrice: z.number().min(1).max(100000000).nullable(),
      commissionPercent: z.number().min(0).max(25),
      closingPercent: z.number().min(0).max(25),
      concessions: z.number().min(0).max(100000000),
      payoff: z.number().min(0).max(1000000000),
      /** Analyst rating of the subject; optional so practice drafts saved before it existed still restore. */
      subjectCondition: z.number().int().min(1).max(conditionMax).optional(),
      addedSales: z
        .array(practiceSaleSchemaFor(conditionMax))
        .max(practiceEntryIds.length)
        .refine(entries => new Set(entries.map(e => e.id)).size === entries.length)
        .optional(),
    })
    .strict()
    .refine(state => conditionAvailable || state.assumptions.conditionValue === 0, {
      message: 'Condition is unavailable; its adjustment must remain disabled.',
    })
    .refine(
      state =>
        !roomCountsUnavailable ||
        (state.assumptions.bedroomValue === 0 &&
          state.assumptions.bathroomValue === 0 &&
          (state.addedSales ?? []).every(sale => sale.beds === 0 && sale.baths === 0)),
      { message: 'Room counts are unavailable in this model; room adjustments must remain disabled.' },
    )
    .refine(state => state.exclusions.every(e => ids.has(e.id) || (state.addedSales ?? []).some(s => s.id === e.id)), {
      message: 'Exclusions may only name a sale in this decision.',
      path: ['exclusions'],
    });
}
export type StudioState = z.infer<ReturnType<typeof studioStateSchema>>;
export const defaultStudioState = (assumptions: CmaAssumptions): StudioState => ({
  assumptions: { ...assumptions },
  exclusions: [],
  listPrice: null,
  commissionPercent: 2.5,
  closingPercent: 1,
  concessions: 0,
  payoff: 0,
});

export function studioSubject(evidence: StudioEvidence, state: StudioState): ValuationProperty {
  return state.subjectCondition === undefined
    ? evidence.subject
    : { ...evidence.subject, condition: state.subjectCondition };
}

/**
 * A practice entry has no geocoded address. Its entered distance places it due north of the subject so the
 * engine's distance weighting uses exactly that distance; no real parcel or map position is implied.
 */
export function practiceSaleRecord(sale: PracticeSale, subject: ValuationProperty = sampleSubject): ValuationProperty {
  return {
    id: sale.id,
    address: sale.address,
    city: subject.city,
    state: subject.state,
    zip: subject.zip,
    lat: Number((subject.lat + sale.distanceMiles / MILES_PER_DEGREE_LATITUDE).toFixed(6)),
    lng: subject.lng,
    beds: sale.beds,
    baths: sale.baths,
    sqft: sale.sqft,
    condition: sale.condition,
    status: 'sold',
    soldAt: `${sale.soldAt}T12:00:00.000Z`,
    soldPrice: sale.soldPrice,
    sourceId: PRACTICE_ENTRY_SOURCE,
  };
}

export const practiceEntrySource = (observedAt: string): Source => ({
  id: PRACTICE_ENTRY_SOURCE,
  label: 'Entered by you in the practice studio (unverified)',
  kind: 'user',
  observedAt,
  license: 'User-provided practice entry. Not verified against any record; location is an entered distance only.',
  confidence: 0,
});

export function studioCandidates(evidence: StudioEvidence, state: StudioState): ValuationProperty[] {
  return [
    ...evidence.candidates,
    ...(state.addedSales ?? []).map(sale => ({
      ...practiceSaleRecord(sale, evidence.subject),
      ...(evidence.subject.condition === undefined ? { condition: undefined } : {}),
      ...(evidence.subject.propertyType ? { propertyType: evidence.subject.propertyType } : {}),
      ...(evidence.subject.roomCountsUnavailable
        ? { roomCountsUnavailable: true, ratingKind: evidence.subject.ratingKind }
        : {}),
    })),
  ];
}
export function studioSources(evidence: StudioEvidence, state: StudioState): Source[] {
  return state.addedSales?.length ? [...evidence.sources, practiceEntrySource(evidence.asOf)] : evidence.sources;
}
export function calculateStudio(evidence: StudioEvidence, state: StudioState) {
  if (
    evidence.subject.roomCountsUnavailable &&
    (state.assumptions.bedroomValue !== 0 ||
      state.assumptions.bathroomValue !== 0 ||
      (state.addedSales ?? []).some(sale => sale.beds !== 0 || sale.baths !== 0))
  )
    throw new Error('Room counts are unavailable; bedroom and bathroom adjustments must remain zero.');
  return calculateCma(
    studioSubject(evidence, state),
    studioCandidates(evidence, state).filter(p => !state.exclusions.some(e => e.id === p.id)),
    state.assumptions,
    evidence.asOf,
  );
}
/** True when the analysis is exactly the evidence and settings provided, with nothing excluded, added or re-rated. */
export const studioUnmodified = (state: StudioState) =>
  !state.exclusions.length && !state.addedSales?.length && state.subjectCondition === undefined;
export const studioCosts = (state: StudioState) => ({
  commissionPercent: state.commissionPercent,
  closingPercent: state.closingPercent,
  concessions: state.concessions,
});

// The account-free fictional sample.
export const sampleEvidence: StudioEvidence = {
  subject: sampleSubject,
  candidates: sampleCandidates,
  sources: sampleSources,
  asOf: SAMPLE_AS_OF,
};
export const demoStudioSchema = studioStateSchema(sampleCandidates.map(p => p.id));
export type DemoStudioState = StudioState;
export const defaultDemoState: DemoStudioState = defaultStudioState(defaultAssumptions);
export const demoSubject = (state: StudioState) => studioSubject(sampleEvidence, state);
export const demoCandidates = (state: StudioState) => studioCandidates(sampleEvidence, state);
export const demoSources = (state: StudioState) => studioSources(sampleEvidence, state);
export const calculateDemo = (state: StudioState) => calculateStudio(sampleEvidence, state);
export const demoCosts = studioCosts;
/** `study: 'abstention'` reports on the comprehension study's separate fictional home with two sales. */
export function demoReportHref(state: StudioState, format?: 'json', study?: 'abstention') {
  const query = new URLSearchParams({ state: JSON.stringify(state) });
  if (format) query.set('format', format);
  if (study) query.set('study', study);
  return `/api/demo/report?${query}`;
}
