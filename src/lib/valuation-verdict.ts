import { SAFEGUARD_THRESHOLDS, type ReleaseAssessment } from './valuation-safeguards';

/**
 * Whether the evidence lets Ascent state a value at all. The Home Decision Brief applies this rule, and the
 * pre-registered external study measures it, so it lives in one place. Changing it requires a new version
 * and a new evaluation.
 */
export const VERDICT_POLICY_VERSION = 'ascent-brief-verdict-1';
export const VERDICT_POLICY = {
  /** Fewer eligible recorded sales than this and no value is stated (the release gate's own minimum). */
  minComparables: SAFEGUARD_THRESHOLDS.minComparables,
} as const;
export type EvidenceVerdict = 'supported' | 'limited' | 'declined';

/** Declined below the comparable minimum or when the gate withholds; limited when any check needs review. */
export function evidenceVerdict(
  comparables: number,
  gate: Pick<ReleaseAssessment, 'decision' | 'checks'> | null,
): EvidenceVerdict {
  if (!gate || comparables < VERDICT_POLICY.minComparables || gate.decision === 'withhold') return 'declined';
  return gate.checks.some(check => check.status === 'review' || check.status === 'block') ? 'limited' : 'supported';
}
