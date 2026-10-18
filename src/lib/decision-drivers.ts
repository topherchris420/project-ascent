import { calculateCma } from './analytics';
import type { CmaAssumptions, CmaResult, ValuationProperty } from './types';

export type DriverUnit = 'usd-per-sqft' | 'usd' | 'percent-per-month' | 'miles' | 'days' | 'ratio' | 'points';
export type DriverOutcome = { setting: number; estimate: number | null; change: number | null; comparables: number };
export type DecisionDriver = {
  key: keyof CmaAssumptions | 'subjectCondition';
  label: string;
  kind: 'rate' | 'filter' | 'subject';
  unit: DriverUnit;
  current: number;
  lower: DriverOutcome;
  higher: DriverOutcome;
  /** Largest absolute estimate change across the two settings; a calculation with no eligible sales counts as unknown. */
  swing: number;
  unavailable: boolean;
};

/** Disclosed perturbations. They are review steps, not a claim about plausible market uncertainty. */
export const DRIVER_STEPS = {
  ratePercent: 20,
  trendPoints: 0.005,
  conditionPoints: 1,
  filterFactor: 2,
} as const;

const round = (value: number, step: number) => Math.round(value / step) * step;

/**
 * One-input-at-a-time arithmetic sensitivity of a deterministic CMA. Every other input, the frozen
 * comparable set (including manual exclusions) and the analysis date are held fixed, so each row
 * answers "how much does this calculation depend on that assumption?" It does not forecast a sale,
 * estimate market uncertainty or rank which assumption is correct.
 */
export function decisionDrivers(result: CmaResult, options: { conditionMax?: number } = {}): DecisionDriver[] {
  const conditionMax = options.conditionMax ?? 5;
  const snapshot = result.inputSnapshot;
  if (!snapshot) return [];
  const { subject, candidates } = snapshot;
  const base = result.assumptions;
  const run = (setting: number, assumptions: CmaAssumptions, subjectFacts: ValuationProperty = subject) => {
    try {
      const alternative = calculateCma(subjectFacts, candidates, assumptions, result.asOf);
      return {
        setting,
        estimate: alternative.estimate,
        change: alternative.estimate - result.estimate,
        comparables: alternative.comps.length,
      };
    } catch {
      return { setting, estimate: null, change: null, comparables: 0 };
    }
  };
  const factor = DRIVER_STEPS.ratePercent / 100;
  const rows: Omit<DecisionDriver, 'swing' | 'unavailable'>[] = [];
  const rate = (
    key: 'sqftRate' | 'bedroomValue' | 'bathroomValue' | 'conditionValue',
    label: string,
    unit: DriverUnit,
  ) => {
    const step = unit === 'usd-per-sqft' ? 1 : 100;
    const lower = round(base[key] * (1 - factor), step),
      higher = round(base[key] * (1 + factor), step);
    rows.push({
      key,
      label,
      kind: 'rate',
      unit,
      current: base[key],
      lower: run(lower, { ...base, [key]: lower }),
      higher: run(higher, { ...base, [key]: higher }),
    });
  };
  rate('sqftRate', 'Living-area rate', 'usd-per-sqft');
  if (!subject.roomCountsUnavailable) {
    rate('bedroomValue', 'Bedroom adjustment', 'usd');
    rate('bathroomValue', 'Bathroom adjustment', 'usd');
  }
  // A disabled condition adjustment stays disabled: unknown condition is never re-imagined as a score.
  if (base.conditionValue > 0) {
    rate(
      'conditionValue',
      subject.ratingKind === 'quality-grade' ? 'Quality-grade value' : 'Condition-point value',
      'usd',
    );
    const condition = subject.condition;
    if (condition !== undefined && Number.isFinite(condition)) {
      const lower = Math.max(1, condition - DRIVER_STEPS.conditionPoints),
        higher = Math.min(conditionMax, condition + DRIVER_STEPS.conditionPoints);
      rows.push({
        key: 'subjectCondition',
        label: subject.ratingKind === 'quality-grade' ? 'Subject quality grade' : 'Subject condition rating',
        kind: 'subject',
        unit: 'points',
        current: condition,
        lower: lower === condition ? run(condition, base) : run(lower, base, { ...subject, condition: lower }),
        higher: higher === condition ? run(condition, base) : run(higher, base, { ...subject, condition: higher }),
      });
    }
  }
  const trendLower = Number((base.monthlyTrend - DRIVER_STEPS.trendPoints).toFixed(4)),
    trendHigher = Number((base.monthlyTrend + DRIVER_STEPS.trendPoints).toFixed(4));
  rows.push({
    key: 'monthlyTrend',
    label: 'Monthly market trend',
    kind: 'rate',
    unit: 'percent-per-month',
    current: base.monthlyTrend,
    lower: run(trendLower, { ...base, monthlyTrend: trendLower }),
    higher: run(trendHigher, { ...base, monthlyTrend: trendHigher }),
  });
  const filter = (key: 'maxDistanceMiles' | 'maxAgeDays' | 'maxSizeRatio', label: string, unit: DriverUnit) => {
    const value = base[key];
    const narrow =
      key === 'maxSizeRatio'
        ? Number((1 + (value - 1) / DRIVER_STEPS.filterFactor).toFixed(3))
        : key === 'maxAgeDays'
          ? Math.max(1, Math.round(value / DRIVER_STEPS.filterFactor))
          : Number((value / DRIVER_STEPS.filterFactor).toFixed(3));
    const wide =
      key === 'maxSizeRatio'
        ? Number((1 + (value - 1) * DRIVER_STEPS.filterFactor).toFixed(3))
        : key === 'maxAgeDays'
          ? Math.round(value * DRIVER_STEPS.filterFactor)
          : Number((value * DRIVER_STEPS.filterFactor).toFixed(3));
    rows.push({
      key,
      label,
      kind: 'filter',
      unit,
      current: value,
      lower: run(narrow, { ...base, [key]: narrow }),
      higher: run(wide, { ...base, [key]: wide }),
    });
  };
  filter('maxDistanceMiles', 'Search radius', 'miles');
  filter('maxAgeDays', 'Sale-age window', 'days');
  filter('maxSizeRatio', 'Size-similarity limit', 'ratio');
  return rows
    .map(row => {
      const unavailable = row.lower.estimate === null || row.higher.estimate === null;
      return {
        ...row,
        unavailable,
        swing: Math.max(Math.abs(row.lower.change ?? 0), Math.abs(row.higher.change ?? 0)),
      };
    })
    .sort(
      (a, b) => Number(b.unavailable) - Number(a.unavailable) || b.swing - a.swing || a.label.localeCompare(b.label),
    );
}

/** One deterministic sentence naming the largest arithmetic dependency; never a market claim. */
export function summarizeDrivers(drivers: DecisionDriver[], money: (n: number) => string) {
  const empties = drivers.filter(d => d.unavailable);
  const largest = drivers.find(d => !d.unavailable && d.swing > 0);
  const inert = drivers.filter(d => !d.unavailable && d.swing === 0).map(d => d.label.toLowerCase());
  const parts: string[] = [];
  if (largest)
    parts.push(
      `${largest.label} moves this calculation most: the tested settings change the estimate by up to ${money(largest.swing)}.`,
    );
  if (empties.length)
    parts.push(
      `Narrowing ${empties.map(d => d.label.toLowerCase()).join(', ')} leaves no eligible sale, so the estimate depends on that filter staying wide.`,
    );
  if (inert.length) parts.push(`No tested change to ${inert.join(', ')} moves the estimate.`);
  return parts.join(' ') || 'No tested input changes the estimate.';
}
