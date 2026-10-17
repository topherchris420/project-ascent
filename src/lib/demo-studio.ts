import { z } from 'zod';
import { calculateCma, defaultAssumptions } from './analytics';
import { SAMPLE_AS_OF, sampleCandidates, sampleSources, sampleSubject } from './pricing-sample';
import type { Source, ValuationProperty } from './types';

/** User-entered practice sales are labeled separately from the authored fictional fixture. */
export const PRACTICE_ENTRY_SOURCE = 'source-practice-user-entry';
export const practiceEntryIds = ['practice-entry-1', 'practice-entry-2', 'practice-entry-3'] as const;
const MILES_PER_DEGREE_LATITUDE = 69.0;

export const practiceSaleSchema = z
  .object({
    id: z.enum(practiceEntryIds),
    address: z.string().trim().min(3).max(80),
    soldPrice: z.number().int().min(10000).max(100000000),
    soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    beds: z.number().int().min(0).max(20),
    baths: z.number().min(0).max(20).multipleOf(0.5),
    sqft: z.number().int().min(200).max(30000),
    condition: z.number().int().min(1).max(5),
    distanceMiles: z.number().min(0).max(25),
  })
  .strict();
export type PracticeSale = z.infer<typeof practiceSaleSchema>;

const knownIds = (state: { addedSales?: PracticeSale[] }) => [
  ...sampleCandidates.map(p => p.id),
  ...(state.addedSales ?? []).map(s => s.id),
];
export const demoStudioSchema = z
  .object({
    assumptions: z
      .object({
        sqftRate: z.number().min(0).max(1000),
        bedroomValue: z.number().min(0).max(100000),
        bathroomValue: z.number().min(0).max(100000),
        conditionValue: z.number().min(0).max(100000),
        monthlyTrend: z.number().min(-0.1).max(0.1),
        maxDistanceMiles: z.number().min(0.05).max(25),
        maxAgeDays: z.number().int().min(1).max(1825),
        maxSizeRatio: z.number().min(1).max(3),
      })
      .strict(),
    exclusions: z
      .array(z.object({ id: z.string().min(1).max(40), reason: z.string().trim().min(3).max(300) }).strict())
      .max(sampleCandidates.length + practiceEntryIds.length)
      .refine(entries => new Set(entries.map(e => e.id)).size === entries.length),
    listPrice: z.number().min(1).max(100000000).nullable(),
    commissionPercent: z.number().min(0).max(25),
    closingPercent: z.number().min(0).max(25),
    concessions: z.number().min(0).max(100000000),
    payoff: z.number().min(0).max(1000000000),
    /** Analyst rating of the subject; optional so practice drafts saved before it existed still restore. */
    subjectCondition: z.number().int().min(1).max(5).optional(),
    addedSales: z
      .array(practiceSaleSchema)
      .max(practiceEntryIds.length)
      .refine(entries => new Set(entries.map(e => e.id)).size === entries.length)
      .optional(),
  })
  .strict()
  .refine(state => state.exclusions.every(e => knownIds(state).includes(e.id)), {
    message: 'Exclusions may only name a sale in this practice decision.',
    path: ['exclusions'],
  });
export type DemoStudioState = z.infer<typeof demoStudioSchema>;
export const defaultDemoState: DemoStudioState = {
  assumptions: { ...defaultAssumptions },
  exclusions: [],
  listPrice: null,
  commissionPercent: 2.5,
  closingPercent: 1,
  concessions: 0,
  payoff: 0,
};

export function demoSubject(state: DemoStudioState): ValuationProperty {
  return state.subjectCondition === undefined ? sampleSubject : { ...sampleSubject, condition: state.subjectCondition };
}

/**
 * A practice entry has no geocoded address. Its entered distance places it due north of the subject so the
 * engine's distance weighting uses exactly that distance; no real parcel or map position is implied.
 */
export function practiceSaleRecord(sale: PracticeSale): ValuationProperty {
  return {
    id: sale.id,
    address: sale.address,
    city: sampleSubject.city,
    state: sampleSubject.state,
    zip: sampleSubject.zip,
    lat: Number((sampleSubject.lat + sale.distanceMiles / MILES_PER_DEGREE_LATITUDE).toFixed(6)),
    lng: sampleSubject.lng,
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

export const practiceEntrySource: Source = {
  id: PRACTICE_ENTRY_SOURCE,
  label: 'Entered by you in the practice studio (unverified)',
  kind: 'user',
  observedAt: SAMPLE_AS_OF,
  license: 'User-provided practice entry. Not verified against any record; location is an entered distance only.',
  confidence: 0,
};

export function demoCandidates(state: DemoStudioState): ValuationProperty[] {
  return [...sampleCandidates, ...(state.addedSales ?? []).map(practiceSaleRecord)];
}
export function demoSources(state: DemoStudioState): Source[] {
  return state.addedSales?.length ? [...sampleSources, practiceEntrySource] : sampleSources;
}

export function calculateDemo(state: DemoStudioState) {
  return calculateCma(
    demoSubject(state),
    demoCandidates(state).filter(p => !state.exclusions.some(e => e.id === p.id)),
    state.assumptions,
    SAMPLE_AS_OF,
  );
}
export function demoReportHref(state: DemoStudioState, format?: 'json') {
  const query = new URLSearchParams({ state: JSON.stringify(state) });
  if (format) query.set('format', format);
  return `/api/demo/report?${query}`;
}
export const demoCosts = (state: DemoStudioState) => ({
  commissionPercent: state.commissionPercent,
  closingPercent: state.closingPercent,
  concessions: state.concessions,
});
