import {
  cents,
  decisionKinds,
  decisionLabels,
  evaluateDecision,
  financeLabels,
  financeSchema,
  type DecisionKind,
  type DecisionResult,
  type FinanceInputs,
  type FinanceKey,
} from './homeowner-finance';

/**
 * What-if analysis built only on the homeowner finance engine. Every number here is a re-run of
 * `ascent-homeowner-finance-2` with one entered assumption changed, or a threshold found by repeating that
 * arithmetic. Nothing forecasts a price, rent or rate, and nothing ranks fundamentally different choices.
 */
export const FINANCE_SENSITIVITY_VERSION = 'ascent-finance-sensitivity-1';

type Step = { mode: 'relative' | 'points' | 'months' | 'amount'; size: number; min: number; max: number };
const DOLLARS = { min: 0, max: 100_000_000 } as const;
/**
 * Disclosed review steps for one-assumption-at-a-time checks. A step asks how much an answer depends on an
 * assumption. Steps are not plausible ranges, quotes or forecasts, and they do not say which value is right.
 */
export const FINANCE_STEPS = {
  salePrice: { mode: 'relative', size: 0.05, ...DOLLARS },
  propertyValue: { mode: 'relative', size: 0.05, ...DOLLARS },
  mortgageBalance: { mode: 'relative', size: 0.05, ...DOLLARS },
  mortgageRate: { mode: 'points', size: 1, min: 0, max: 50 },
  commissionPercent: { mode: 'points', size: 1, min: 0, max: 25 },
  closingPercent: { mode: 'points', size: 0.5, min: 0, max: 25 },
  concessions: { mode: 'amount', size: 5000, ...DOLLARS },
  sellingMonths: { mode: 'months', size: 3, min: 0, max: 60 },
  monthlyTax: { mode: 'relative', size: 0.2, ...DOLLARS },
  monthlyInsurance: { mode: 'relative', size: 0.25, ...DOLLARS },
  monthlyHoa: { mode: 'relative', size: 0.2, ...DOLLARS },
  monthlyMaintenance: { mode: 'relative', size: 0.5, ...DOLLARS },
  monthlyCapex: { mode: 'relative', size: 0.5, ...DOLLARS },
  monthlyRent: { mode: 'relative', size: 0.1, ...DOLLARS },
  vacancyPercent: { mode: 'points', size: 5, min: 0, max: 100 },
  managementPercent: { mode: 'points', size: 4, min: 0, max: 100 },
  renovationCost: { mode: 'relative', size: 0.25, ...DOLLARS },
  renovatedSalePrice: { mode: 'relative', size: 0.05, ...DOLLARS },
  renovationMonths: { mode: 'months', size: 3, min: 0, max: 60 },
  refinanceRate: { mode: 'points', size: 0.5, min: 0, max: 50 },
  refinanceCosts: { mode: 'relative', size: 0.25, ...DOLLARS },
  purchasePrice: { mode: 'relative', size: 0.05, ...DOLLARS },
  purchaseRate: { mode: 'points', size: 1, min: 0, max: 50 },
  purchaseClosingCosts: { mode: 'relative', size: 0.25, ...DOLLARS },
  purchaseMonthlyCosts: { mode: 'relative', size: 0.2, ...DOLLARS },
  appreciationPercent: { mode: 'points', size: 2, min: -50, max: 50 },
  opportunityPercent: { mode: 'points', size: 2, min: -50, max: 50 },
} as const satisfies Partial<Record<FinanceKey, Step>>;
export type SteppedKey = keyof typeof FINANCE_STEPS;

export function stepText(key: SteppedKey) {
  const step: Step = FINANCE_STEPS[key];
  if (step.mode === 'relative') return `±${Math.round(step.size * 100)}%`;
  if (step.mode === 'months') return `±${step.size} months`;
  if (step.mode === 'amount') return `±$${step.size.toLocaleString('en-US')}`;
  return `±${step.size} point${step.size === 1 ? '' : 's'}`;
}

function shifted(value: number, step: Step, direction: -1 | 1) {
  const raw = step.mode === 'relative' ? value * (1 + direction * step.size) : value + direction * step.size;
  const rounded =
    step.mode === 'months' ? Math.round(raw) : step.mode === 'points' ? Number(raw.toFixed(4)) : cents(raw);
  return Math.min(step.max, Math.max(step.min, rounded));
}

/** Change in one choice's horizon net position; null when the changed inputs make that choice uncomputable. */
export type ChoiceEffect = { lower: number | null; higher: number | null; swing: number; unavailable: boolean };
export type SensitivityRow = {
  key: SteppedKey;
  label: string;
  step: string;
  base: number;
  lowerSetting: number;
  higherSetting: number;
  effects: Partial<Record<DecisionKind, ChoiceEffect>>;
};
export type ChoiceDriver = ChoiceEffect & { key: SteppedKey; label: string; step: string };
export type FinanceSensitivity = {
  version: string;
  horizonMonths: number;
  rows: SensitivityRow[];
  byChoice: { kind: DecisionKind; label: string; drivers: ChoiceDriver[] }[];
};

/**
 * One-assumption-at-a-time sensitivity of every computable choice. Each entered assumption with a disclosed
 * step is lowered and raised while everything else stays fixed; blank (unknown) assumptions are never filled in.
 */
export function financeSensitivity(raw: FinanceInputs): FinanceSensitivity {
  const inputs = financeSchema.parse(raw);
  const base = Object.fromEntries(decisionKinds.map(kind => [kind, evaluateDecision(inputs, kind)])) as Record<
    DecisionKind,
    DecisionResult
  >;
  const available = decisionKinds.filter(kind => base[kind].available && base[kind].netPosition !== null);
  const rows: SensitivityRow[] = [];
  for (const key of Object.keys(FINANCE_STEPS) as SteppedKey[]) {
    const value = inputs[key];
    if (value === null) continue;
    const step: Step = FINANCE_STEPS[key];
    const lowerSetting = shifted(value, step, -1),
      higherSetting = shifted(value, step, 1);
    if (lowerSetting === value && higherSetting === value) continue;
    // null: the setting equals the entered value; undefined: the combination is outside the engine's bounds.
    const variant = (setting: number) => {
      if (setting === value) return null;
      const parsed = financeSchema.safeParse({ ...inputs, [key]: setting });
      return parsed.success ? parsed.data : undefined;
    };
    const lowerInputs = variant(lowerSetting),
      higherInputs = variant(higherSetting);
    const effects: SensitivityRow['effects'] = {};
    for (const kind of available) {
      const effect = (changed: FinanceInputs | null | undefined) => {
        if (changed === null) return 0;
        if (changed === undefined) return null;
        const result = evaluateDecision(changed, kind);
        return result.available && result.netPosition !== null
          ? cents(result.netPosition - base[kind].netPosition!)
          : null;
      };
      const lower = effect(lowerInputs),
        higher = effect(higherInputs);
      effects[kind] = {
        lower,
        higher,
        swing: Math.max(Math.abs(lower ?? 0), Math.abs(higher ?? 0)),
        unavailable: lower === null || higher === null,
      };
    }
    rows.push({
      key,
      label: financeLabels[key],
      step: stepText(key),
      base: value,
      lowerSetting,
      higherSetting,
      effects,
    });
  }
  return {
    version: FINANCE_SENSITIVITY_VERSION,
    horizonMonths: inputs.horizonMonths,
    rows,
    byChoice: available.map(kind => ({
      kind,
      label: decisionLabels[kind],
      drivers: rows
        .map(row => ({ key: row.key, label: row.label, step: row.step, ...row.effects[kind]! }))
        .filter(driver => driver.swing > 0 || driver.unavailable)
        .sort(
          (a, b) =>
            b.swing - a.swing || Number(a.unavailable) - Number(b.unavailable) || a.label.localeCompare(b.label),
        ),
    })),
  };
}

export const HOLDING_PERIODS = [12, 36, 60, 120, 240] as const;
/** The same inputs re-run at several horizons; a sale outside a horizon makes that choice uncomputable there. */
export function holdingPeriodProfile(raw: FinanceInputs, horizons: readonly number[] = HOLDING_PERIODS) {
  const inputs = financeSchema.parse(raw);
  return horizons
    .filter(months => Number.isInteger(months) && months >= 1 && months <= 360)
    .map(months => {
      const changed = financeSchema.parse({ ...inputs, horizonMonths: months });
      return {
        horizonMonths: months,
        results: decisionKinds.map(kind => {
          const result = evaluateDecision(changed, kind);
          return { kind, available: result.available, netPosition: result.netPosition };
        }),
      };
    });
}

export type FinanceBreakEven = {
  id:
    | 'sale-price-vs-hold'
    | 'appreciation-hold-vs-sell'
    | 'rent-vs-sell'
    | 'vacancy-zero-cash-flow'
    | 'refinance-rate-vs-keep';
  label: string;
  status: 'found' | 'outside-range' | 'needs-inputs';
  value: number | null;
  unit: 'dollars' | 'dollars per month' | 'percent per year' | 'percent';
  explanation: string;
};

/** Bisection on a monotone deterministic function; null outputs mean a required input is missing. */
function solve(f: (x: number) => number | null, low: number, high: number, tolerance: number) {
  let fLow = f(low);
  const fHigh = f(high);
  if (fLow === null || fHigh === null) return { status: 'needs-inputs' as const, value: null };
  if (fLow === 0) return { status: 'found' as const, value: low };
  if (fHigh === 0) return { status: 'found' as const, value: high };
  if (Math.sign(fLow) === Math.sign(fHigh)) return { status: 'outside-range' as const, value: null };
  for (let i = 0; i < 200 && high - low > tolerance; i++) {
    const middle = (low + high) / 2,
      fMiddle = f(middle);
    if (fMiddle === null) return { status: 'needs-inputs' as const, value: null };
    if (fMiddle === 0) return { status: 'found' as const, value: middle };
    if (Math.sign(fMiddle) === Math.sign(fLow)) {
      low = middle;
      fLow = fMiddle;
    } else high = middle;
  }
  return { status: 'found' as const, value: (low + high) / 2 };
}

/**
 * Thresholds at which two choices produce the same horizon net position (or rental cash flow reaches zero),
 * found by re-running the engine. A threshold is arithmetic under the entered assumptions, never a forecast
 * and never a statement that one household choice is better.
 */
export function financeBreakEvens(raw: FinanceInputs): FinanceBreakEven[] {
  const inputs = financeSchema.parse(raw);
  const at = (kind: DecisionKind, key: FinanceKey, value: number) => {
    const parsed = financeSchema.safeParse({ ...inputs, [key]: value });
    if (!parsed.success) return null;
    const result = evaluateDecision(parsed.data, kind);
    return result.available ? result : null;
  };
  // Both choices are re-run at each trial value, so a threshold stays exact even if both depend on the input.
  const gap = (kind: DecisionKind, other: DecisionKind, key: FinanceKey) => (value: number) => {
    const first = at(kind, key, value),
      second = at(other, key, value);
    return first?.netPosition != null && second?.netPosition != null ? first.netPosition - second.netPosition : null;
  };
  const salePrice = solve(gap('sell', 'hold', 'salePrice'), 0, 100_000_000, 0.5);
  const appreciation = solve(gap('hold', 'sell', 'appreciationPercent'), -50, 50, 0.0005);
  const rent = solve(gap('rent', 'sell', 'monthlyRent'), 0, 1_000_000, 0.5);
  const vacancy = solve(value => at('rent', 'vacancyPercent', value)?.monthlyCashFlow ?? null, 0, 100, 0.0005);
  const refinance = solve(gap('refinance', 'hold', 'refinanceRate'), 0, 50, 0.0005);
  const dollars = (value: number | null) => (value === null ? null : Math.round(value));
  const rate = (value: number | null) => (value === null ? null : Number(value.toFixed(2)));
  return [
    {
      id: 'sale-price-vs-hold',
      label: 'Sale price at which selling matches continuing to own',
      ...salePrice,
      value: dollars(salePrice.value),
      unit: 'dollars',
      explanation:
        'At this sale price, selling and continuing to own end the comparison horizon with the same net position under your entered costs, debt and hypothetical changes.',
    },
    {
      id: 'appreciation-hold-vs-sell',
      label: 'Annual property change at which continuing to own matches selling',
      ...appreciation,
      value: rate(appreciation.value),
      unit: 'percent per year',
      explanation:
        'Continuing to own reaches the same horizon net position as selling on your entered timeline if the property changes by this much per year. A threshold to judge against your own expectations, not a forecast.',
    },
    {
      id: 'rent-vs-sell',
      label: 'Monthly rent at which renting matches selling',
      ...rent,
      value: dollars(rent.value),
      unit: 'dollars per month',
      explanation:
        'Gross monthly rent at which renting out the home and selling on your entered timeline end the horizon with the same net position, using your vacancy, management, ownership costs and debt. Replacement housing is not included.',
    },
    {
      id: 'vacancy-zero-cash-flow',
      label: 'Vacancy at which rental cash flow reaches zero',
      ...vacancy,
      value: rate(vacancy.value),
      unit: 'percent',
      explanation:
        'Above this vacancy rate, the entered rent no longer covers the payment, management and ownership costs each month.',
    },
    {
      id: 'refinance-rate-vs-keep',
      label: 'Refinance rate at which refinancing matches keeping the current loan',
      ...refinance,
      value: rate(refinance.value),
      unit: 'percent',
      explanation:
        'At this fixed rate, with your entered term, cash costs and cash out, refinancing ends the horizon with the same net position as keeping the current loan.',
    },
  ];
}
