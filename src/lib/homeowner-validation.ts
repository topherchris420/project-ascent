import { z } from 'zod';
import { dcBenchmark, usesValidatedConfiguration } from './valuation-safeguards';
import { marylandRevisedBenchmark } from './maryland-studio';
import { condoBenchmark } from './dc-condo-studio';
import { studioUnmodified, type StudioEvidence, type StudioState } from './demo-studio';

export const accuracyReferenceSchema = z.object({
  market: z.enum(['dc', 'maryland-v2', 'dc-condos']),
  label: z.string().max(150),
  accepted: z.boolean(),
  criteriaMet: z.number().int().min(0).max(9),
  holdoutSales: z.number().int().positive(),
  holdoutFrom: z.string().max(40),
  holdoutTo: z.string().max(40),
  medianAbsolutePercentError: z.number().min(0),
  reportDigest: z.string().max(100),
  missedCriteria: z.array(z.string().max(200)).max(9),
  matchesStudySettings: z.boolean(),
  boundary: z.string().max(1000),
});
/** Freeze the published cohort reference with the decision; never borrow house results for condos. */
export function homeownerAccuracyReference(evidence: StudioEvidence, state: StudioState) {
  const source = evidence.subject.sourceId;
  const market =
    source === 'source-dc-public-records'
      ? 'dc'
      : source === 'source-maryland-public-records'
        ? 'maryland-v2'
        : source === 'source-dc-condo-public-records'
          ? 'dc-condos'
          : null;
  if (!market) return null;
  const benchmark =
    market === 'dc' ? dcBenchmark : market === 'maryland-v2' ? marylandRevisedBenchmark : condoBenchmark;
  if (
    evidence.subject.state !== benchmark.market.state ||
    (market === 'dc' && evidence.subject.propertyType === 'condominium')
  )
    return null;
  return accuracyReferenceSchema.parse({
    market,
    label: benchmark.market.label,
    accepted: benchmark.accepted,
    criteriaMet: benchmark.acceptance.filter(c => c.passed).length,
    holdoutSales: benchmark.holdout.sales,
    holdoutFrom: benchmark.holdout.from,
    holdoutTo: benchmark.holdout.to,
    medianAbsolutePercentError: benchmark.primary.mdape * 100,
    reportDigest: benchmark.reportDigest,
    missedCriteria: benchmark.acceptance.filter(c => !c.passed).map(c => c.label),
    matchesStudySettings: studioUnmodified(state) && usesValidatedConfiguration(state.assumptions, benchmark),
    boundary:
      'Internal retrospective cohort study, not independent certification or an individual-property accuracy guarantee. Altered settings or evidence do not inherit measured accuracy. This passport offers no calibrated interval.',
  });
}
