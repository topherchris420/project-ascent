import { calculateCma } from './analytics';
import type { CmaResult } from './types';

export type DecisionContribution = {
  propertyId: string;
  kind: 'added' | 'removed' | 'retained';
  previousWeight: number;
  currentWeight: number;
  adjustedValueEffect: number;
  weightAndEligibilityEffect: number;
  total: number;
};

/** Exact arithmetic attribution, not a causal explanation of a market change.
 * Retained sales: old weight × adjusted-value difference, then changed weight ×
 * (new adjusted value − old estimate). Added/removed sales use the same reference.
 * Centering on the old estimate avoids misleading million-dollar cancelling bars.
 */
export function explainDecisionDelta(previous: CmaResult, current: CmaResult) {
  if (previous.subjectId !== current.subjectId) throw new Error('Compare the same subject property.');
  const old = new Map(previous.comps.map(comp => [comp.propertyId, comp]));
  const next = new Map(current.comps.map(comp => [comp.propertyId, comp]));
  const cents = (n: number) => Math.round(n * 100) / 100;
  const rows: DecisionContribution[] = [...new Set([...old.keys(), ...next.keys()])].sort().map(propertyId => {
    const a = old.get(propertyId),
      b = next.get(propertyId);
    const adjustedValueEffect = a && b ? a.weight * (b.adjustedPrice - a.adjustedPrice) : 0;
    const weightAndEligibilityEffect =
      a && b
        ? (b.weight - a.weight) * (b.adjustedPrice - previous.estimate)
        : b
          ? b.weight * (b.adjustedPrice - previous.estimate)
          : -a!.weight * (a!.adjustedPrice - previous.estimate);
    return {
      propertyId,
      kind: a && b ? 'retained' : b ? 'added' : 'removed',
      previousWeight: a?.weight ?? 0,
      currentWeight: b?.weight ?? 0,
      adjustedValueEffect: cents(adjustedValueEffect),
      weightAndEligibilityEffect: cents(weightAndEligibilityEffect),
      total: cents(adjustedValueEffect) + cents(weightAndEligibilityEffect),
    };
  });
  const change = current.estimate - previous.estimate;
  const attributed = cents(rows.reduce((sum, row) => sum + row.total, 0));
  return { rows, change, rounding: cents(change - attributed), reference: previous.estimate };
}

/** Remove one eligible sale at a time, holding all other evidence, dates and assumptions fixed. */
export function comparableSensitivity(result: CmaResult) {
  const inputs = result.inputSnapshot;
  if (!inputs) return [];
  return result.comps
    .map(comp => {
      try {
        const alternative = calculateCma(
          inputs.subject,
          inputs.candidates.filter(p => p.id !== comp.propertyId),
          result.assumptions,
          result.asOf,
        );
        return {
          propertyId: comp.propertyId,
          estimate: alternative.estimate,
          difference: alternative.estimate - result.estimate,
          remaining: alternative.comps.length,
        };
      } catch {
        return { propertyId: comp.propertyId, estimate: null, difference: null, remaining: 0 };
      }
    })
    .sort(
      (a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0) || a.propertyId.localeCompare(b.propertyId),
    );
}
