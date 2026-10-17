import { createHash, verify as verifySignature } from 'node:crypto';
import { calculateCma, comparableExclusion, defaultAssumptions, distanceMiles } from './analytics';
import { engineFingerprint } from './valuation-safeguards';
import type { CmaAssumptions, ValuationProperty } from './types';

/**
 * Out-of-sample accuracy validation for Ascent's deterministic pricing engine.
 *
 * Every holdout sale is valued by the unchanged production `calculateCma` using only sales that closed
 * strictly before it, then compared with its recorded price. Parameters are fitted, selected and
 * calibrated on earlier, disjoint windows; the test window is scored once. Acceptance thresholds are part
 * of the protocol, so they are fingerprinted before any result exists and cannot move afterwards.
 */

export type ValidationSale = {
  saleId: string;
  parcelId: string;
  soldOn: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  condition: number;
  lat: number;
  lng: number;
  zip: string;
};

type SearchConfig = Pick<CmaAssumptions, 'maxDistanceMiles' | 'maxAgeDays' | 'maxSizeRatio'>;
type Window = { from: string; to: string };
export type AcceptanceCriterion = {
  id: string;
  label: string;
  /** Path into the primary variant's holdout metrics, or a paired comparison. */
  metric:
    | 'valuedShare'
    | 'mdape'
    | 'ppe10'
    | 'cod'
    | 'prd'
    | 'absMedianSignedError'
    | 'pairedMdapeDeltaUpper:baseline-median-ppsf'
    | 'pairedMdapeDeltaUpper:baseline-zip-median'
    | 'calibratedCoverage';
  min?: number;
  max?: number;
  basis: string;
};

export const validationProtocol = {
  id: 'ascent-valuation-validation-1',
  dataset: {
    id: 'king-county-wa-residential-sales-2014-2015',
    csvSha256: '14cfee54629fd2bee0d8f5cd28fce95a2c1afadb93a4f12e5862b865e58ad684',
    license: 'CC0-1.0',
    sourceId: 'king-county-public-record',
  },
  windows: {
    fit: { from: '2014-05-02', to: '2014-08-31' },
    select: { from: '2014-09-01', to: '2014-10-31' },
    calibrate: { from: '2014-11-01', to: '2014-12-31' },
    test: { from: '2015-01-01', to: '2015-05-27' },
  } satisfies Record<string, Window>,
  /** Input-quality screening only; nothing is removed because of its price or valuation error. */
  screening: { minBeds: 1, maxBeds: 12, minBaths: 0.5, minSqft: 300 },
  /** A home's own earlier sale is withheld so the test measures comparable-sales evidence alone. */
  excludeSameParcel: true,
  /** Valuation instant is the end of the day before the subject's recorded sale. */
  asOfOffsetMs: -1,
  fit: {
    neighbours: 5,
    search: { maxDistanceMiles: 1, maxAgeDays: 180, maxSizeRatio: 1.35 } satisfies SearchConfig,
    huberIterations: 3,
    huberK: 1.345,
  },
  selectionGrid: [0.5, 1, 2, 3].flatMap(maxDistanceMiles =>
    [90, 180].map(maxAgeDays => ({ maxDistanceMiles, maxAgeDays, maxSizeRatio: 1.35 })),
  ) satisfies SearchConfig[],
  selectionMinValuedShare: 0.9,
  interval: {
    target: 0.8,
    minTierSize: 50,
    tiers: [
      { id: 'sparse', maxComps: 2 },
      { id: 'moderate', maxComps: 9 },
      { id: 'dense', maxComps: null },
    ],
  },
  bootstrap: { resamples: 1000, seed: 20261017 },
  primaryVariant: 'locally-calibrated',
  acceptance: [
    {
      id: 'A1',
      label: 'Holdout sales valued',
      metric: 'valuedShare',
      min: 0.9,
      basis: 'Abstention is reported, not hidden; at least 90% of screened holdout sales must receive a valuation.',
    },
    {
      id: 'A2',
      label: 'Median absolute percentage error',
      metric: 'mdape',
      max: 0.1,
      basis:
        'Typical published off-market AVM accuracy is in the single digits to low teens; 10% is the pre-registered bar.',
    },
    {
      id: 'A3',
      label: 'Share within ±10% of sale price',
      metric: 'ppe10',
      min: 0.5,
      basis: 'Industry PPE10 convention: at least half of sales within ten percent.',
    },
    {
      id: 'A4',
      label: 'Coefficient of dispersion (COD)',
      metric: 'cod',
      max: 15,
      basis: 'IAAO Standard on Ratio Studies (2013), residential upper bound of 15.',
    },
    {
      id: 'A5',
      label: 'Price-related differential (PRD)',
      metric: 'prd',
      min: 0.98,
      max: 1.03,
      basis: 'IAAO Standard on Ratio Studies (2013) vertical-equity range 0.98–1.03.',
    },
    {
      id: 'A6',
      label: 'Absolute median signed error',
      metric: 'absMedianSignedError',
      max: 0.03,
      basis: 'Systematic over- or under-valuation must stay within ±3%.',
    },
    {
      id: 'A7',
      label: 'Beats median $/sqft of the same comparables',
      metric: 'pairedMdapeDeltaUpper:baseline-median-ppsf',
      max: 0,
      basis: 'Paired bootstrap 95% upper bound of the MdAPE difference must be below zero: adjustments must add value.',
    },
    {
      id: 'A8',
      label: 'Beats trailing ZIP median price',
      metric: 'pairedMdapeDeltaUpper:baseline-zip-median',
      max: 0,
      basis: 'Paired bootstrap 95% upper bound of the MdAPE difference must be below zero.',
    },
    {
      id: 'A9',
      label: 'Calibrated 80% interval coverage',
      metric: 'calibratedCoverage',
      min: 0.75,
      max: 0.85,
      basis: 'Out-of-sample coverage of the calibrated interval must land within five points of its 80% target.',
    },
  ] satisfies AcceptanceCriterion[],
} as const;
export type ValidationProtocol = typeof validationProtocol;

const DAY = 86_400_000;
const round = (value: number, digits: number) => Number(value.toFixed(digits));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Canonical JSON: sorted keys, undefined dropped, so digests do not depend on insertion order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
  return JSON.stringify(value) ?? 'null';
}
export const digestOf = (value: unknown) => `sha256-${sha256(canonicalJson(value))}`;
export const protocolDigest = (protocol: ValidationProtocol = validationProtocol) => digestOf(protocol);

const CSV_HEADER = 'sale_id,parcel_id,sold_on,price,beds,baths,sqft,condition,lat,lng,zip';
export function parseValidationCsv(text: string): ValidationSale[] {
  const lines = text.split('\n').filter(line => line.length);
  if (lines[0] !== CSV_HEADER) throw new Error('Validation CSV header does not match the expected columns.');
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== 11) throw new Error(`Validation CSV row ${index + 2} has ${cells.length} columns.`);
    const [saleId, parcelId, soldOn, ...rest] = cells;
    const [price, beds, baths, sqft, condition, lat, lng] = rest.slice(0, 7).map(Number);
    const sale = { saleId, parcelId, soldOn, price, beds, baths, sqft, condition, lat, lng, zip: rest[7] };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(soldOn) ||
      !Number.isFinite(Date.parse(`${soldOn}T00:00:00Z`)) ||
      ![price, beds, baths, sqft, condition, lat, lng].every(Number.isFinite) ||
      price <= 0
    )
      throw new Error(`Validation CSV row ${index + 2} contains an invalid value.`);
    return sale;
  });
}

const inWindow = (sale: ValidationSale, window: Window) => sale.soldOn >= window.from && sale.soldOn <= window.to;
const saleTime = (sale: ValidationSale) => Date.parse(`${sale.soldOn}T00:00:00.000Z`);
const asOfFor = (sale: ValidationSale) => new Date(saleTime(sale) + validationProtocol.asOfOffsetMs).toISOString();

function asComparable(sale: ValidationSale): ValuationProperty {
  return {
    id: sale.saleId,
    address: `Recorded sale ${sale.saleId}`,
    city: 'King County',
    state: 'WA',
    zip: sale.zip,
    lat: sale.lat,
    lng: sale.lng,
    beds: sale.beds,
    baths: sale.baths,
    sqft: sale.sqft,
    condition: sale.condition,
    status: 'sold',
    soldAt: `${sale.soldOn}T00:00:00.000Z`,
    soldPrice: sale.price,
    sourceId: validationProtocol.dataset.sourceId,
  };
}
/** The subject carries no price: the engine must not see the outcome it is scored against. */
function asSubject(sale: ValidationSale): ValuationProperty {
  const { status: _status, soldAt: _soldAt, soldPrice: _soldPrice, ...subject } = asComparable(sale);
  return { ...subject, id: `subject:${sale.saleId}` };
}

/** Grid index over recorded sales; a superset prefilter, with exact eligibility left to the engine. */
class SaleIndex {
  private readonly cells = new Map<string, number[]>();
  private static readonly CELL = 0.05;
  constructor(private readonly sales: ValidationSale[]) {
    sales.forEach((sale, index) => {
      const key = `${Math.floor(sale.lat / SaleIndex.CELL)}:${Math.floor(sale.lng / SaleIndex.CELL)}`;
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(index);
      else this.cells.set(key, [index]);
    });
  }
  near(subject: ValidationSale, search: SearchConfig): ValidationSale[] {
    const latSpan = (search.maxDistanceMiles / 68.7) * 1.02;
    const lngSpan = (search.maxDistanceMiles / (69.2 * Math.cos((subject.lat * Math.PI) / 180))) * 1.02;
    const before = saleTime(subject);
    const earliest = before - (search.maxAgeDays + 1) * DAY;
    const found: ValidationSale[] = [];
    for (
      let y = Math.floor((subject.lat - latSpan) / SaleIndex.CELL);
      y <= Math.floor((subject.lat + latSpan) / SaleIndex.CELL);
      y++
    )
      for (
        let x = Math.floor((subject.lng - lngSpan) / SaleIndex.CELL);
        x <= Math.floor((subject.lng + lngSpan) / SaleIndex.CELL);
        x++
      )
        for (const index of this.cells.get(`${y}:${x}`) ?? []) {
          const candidate = this.sales[index];
          const time = saleTime(candidate);
          if (time >= before || time < earliest) continue;
          if (validationProtocol.excludeSameParcel && candidate.parcelId === subject.parcelId) continue;
          found.push(candidate);
        }
    return found.sort((a, b) => (a.saleId < b.saleId ? -1 : 1));
  }
}

export function screenSales(sales: ValidationSale[]) {
  const { minBeds, maxBeds, minBaths, minSqft } = validationProtocol.screening;
  const kept: ValidationSale[] = [];
  const removed: Record<string, number> = { bedrooms: 0, bathrooms: 0, livingArea: 0, duplicateSale: 0 };
  const seen = new Set<string>();
  for (const sale of sales) {
    if (seen.has(sale.saleId)) removed.duplicateSale++;
    else if (sale.beds < minBeds || sale.beds > maxBeds) removed.bedrooms++;
    else if (sale.baths < minBaths) removed.bathrooms++;
    else if (sale.sqft < minSqft) removed.livingArea++;
    else kept.push(sale);
    seen.add(sale.saleId);
  }
  return { kept, removed };
}

/** Solve A x = b by Gaussian elimination with partial pivoting; returns null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export type FittedRates = Pick<
  CmaAssumptions,
  'sqftRate' | 'bedroomValue' | 'bathroomValue' | 'conditionValue' | 'monthlyTrend'
> & {
  pairs: number;
  clampedToZero: string[];
};
/**
 * Paired-sales least squares: for each fit-window sale and its nearest earlier neighbours, regress the
 * price difference on feature differences. Rows are scaled by the comparable's price (a percentage-error
 * fit) and Huber-reweighted so a handful of estates cannot set the market's rates. Feature rates are
 * constrained to be non-negative, as the engine requires; the monthly trend may be negative.
 */
export function fitAdjustmentRates(sales: ValidationSale[], index: SaleIndexLike, window: Window): FittedRates {
  const { neighbours, search, huberIterations, huberK } = validationProtocol.fit;
  const rows: { x: number[]; y: number; scale: number }[] = [];
  for (const sale of sales.filter(item => inWindow(item, window))) {
    const subject = asSubject(sale);
    const asOf = saleTime(sale) + validationProtocol.asOfOffsetMs;
    const eligible = index
      .near(sale, search)
      .filter(candidate => inWindow(candidate, window))
      .filter(
        candidate => !comparableExclusion(subject, asComparable(candidate), { ...search, conditionValue: 1 }, asOf),
      )
      .map(candidate => ({ candidate, distance: distanceMiles(sale, candidate) }))
      .sort((a, b) => a.distance - b.distance || (a.candidate.saleId < b.candidate.saleId ? -1 : 1))
      .slice(0, neighbours);
    for (const { candidate } of eligible) {
      const months = (asOf - saleTime(candidate)) / DAY / 30.4375;
      rows.push({
        x: [
          sale.sqft - candidate.sqft,
          sale.beds - candidate.beds,
          sale.baths - candidate.baths,
          sale.condition - candidate.condition,
          candidate.price * months,
        ],
        y: sale.price - candidate.price,
        scale: candidate.price,
      });
    }
  }
  const names = ['sqftRate', 'bedroomValue', 'bathroomValue', 'conditionValue', 'monthlyTrend'] as const;
  let active = [0, 1, 2, 3, 4];
  let coefficients = [0, 0, 0, 0, 0];
  const clamped: string[] = [];
  const fit = (weights: number[]) => {
    const k = active.length;
    const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const xty = new Array<number>(k).fill(0);
    rows.forEach((row, r) => {
      const w = weights[r] / row.scale ** 2;
      for (let i = 0; i < k; i++) {
        xty[i] += w * row.x[active[i]] * row.y;
        for (let j = 0; j < k; j++) xtx[i][j] += w * row.x[active[i]] * row.x[active[j]];
      }
    });
    const solution = solve(xtx, xty);
    if (!solution) throw new Error('Paired-sales design is singular; the fit window lacks feature variation.');
    const next = [0, 0, 0, 0, 0];
    active.forEach((feature, i) => (next[feature] = solution[i]));
    return next;
  };
  let weights = rows.map(() => 1);
  for (let iteration = 0; iteration <= huberIterations; iteration++) {
    // Active-set non-negativity: drop the most negative feature rate and refit until all are admissible.
    for (;;) {
      coefficients = fit(weights);
      const negative = active.filter(feature => feature < 4 && coefficients[feature] < 0);
      if (!negative.length) break;
      const worst = negative.reduce((a, b) => (coefficients[a] < coefficients[b] ? a : b));
      active = active.filter(feature => feature !== worst);
      if (!clamped.includes(names[worst])) clamped.push(names[worst]);
    }
    if (iteration === huberIterations) break;
    const residuals = rows.map(
      row => (row.y - row.x.reduce((sum, value, i) => sum + value * coefficients[i], 0)) / row.scale,
    );
    const spread = medianOf(residuals.map(Math.abs)) / 0.6745 || 1;
    weights = residuals.map(residual => {
      const z = Math.abs(residual) / spread;
      return z <= huberK ? 1 : huberK / z;
    });
  }
  return {
    sqftRate: round(Math.max(0, coefficients[0]), 2),
    bedroomValue: round(Math.max(0, coefficients[1]), 0),
    bathroomValue: round(Math.max(0, coefficients[2]), 0),
    conditionValue: round(Math.max(0, coefficients[3]), 0),
    monthlyTrend: round(Math.min(0.05, Math.max(-0.05, coefficients[4])), 5),
    pairs: rows.length,
    clampedToZero: clamped.sort(),
  };
}
type SaleIndexLike = Pick<SaleIndex, 'near'>;
export const createSaleIndex = (sales: ValidationSale[]): SaleIndexLike => new SaleIndex(sales);

function medianOf(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function quantileOf(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
}

export type ValuationRow = {
  saleId: string;
  parcelId: string;
  soldOn: string;
  actual: number;
  /** Comparable sales the primary engine configuration admitted; drives the evidence tier. */
  comps: number;
  estimates: Record<string, number | null>;
  envelope: { low: number; high: number } | null;
  interval?: { low: number; high: number; tier: string };
};

export type EngineVariant = { id: string; label: string; assumptions: CmaAssumptions };
const BASELINES = ['baseline-median-ppsf', 'baseline-zip-median'] as const;

/** Value one sale with each engine variant and the two naive baselines, using only earlier evidence. */
export function valueSale(
  sale: ValidationSale,
  index: SaleIndexLike,
  variants: EngineVariant[],
  primaryId: string,
  zipHistory: Map<string, ValidationSale[]>,
): ValuationRow {
  const subject = asSubject(sale);
  const asOf = asOfFor(sale);
  const estimates: ValuationRow['estimates'] = {};
  let comps = 0;
  let envelope: ValuationRow['envelope'] = null;
  let primaryEligible: ValuationProperty[] = [];
  for (const variant of variants) {
    const eligible = index
      .near(sale, variant.assumptions)
      .map(asComparable)
      .filter(candidate => !comparableExclusion(subject, candidate, variant.assumptions, Date.parse(asOf)));
    if (variant.id === primaryId) primaryEligible = eligible;
    if (!eligible.length) {
      estimates[variant.id] = null;
      continue;
    }
    const result = calculateCma(subject, eligible, variant.assumptions, asOf);
    estimates[variant.id] = result.estimate;
    if (variant.id === primaryId) {
      comps = result.comps.length;
      envelope = { low: result.low, high: result.high };
    }
  }
  estimates['baseline-median-ppsf'] = primaryEligible.length
    ? Math.round(medianOf(primaryEligible.map(comp => comp.soldPrice! / comp.sqft)) * sale.sqft)
    : null;
  const before = saleTime(sale);
  const zipSales = (zipHistory.get(sale.zip) ?? []).filter(item => {
    const time = saleTime(item);
    return time < before && time >= before - 180 * DAY && item.parcelId !== sale.parcelId;
  });
  estimates['baseline-zip-median'] = zipSales.length ? Math.round(medianOf(zipSales.map(item => item.price))) : null;
  return {
    saleId: sale.saleId,
    parcelId: sale.parcelId,
    soldOn: sale.soldOn,
    actual: sale.price,
    comps,
    estimates,
    envelope,
  };
}

export type RatioMetrics = {
  n: number;
  mdape: number;
  mape: number;
  ppe5: number;
  ppe10: number;
  ppe20: number;
  medianRatio: number;
  medianSignedError: number;
  cod: number;
  prd: number;
};
/** IAAO-style ratio study on estimate/sale ratios. */
export function ratioMetrics(pairs: { estimate: number; actual: number }[]): RatioMetrics {
  const n = pairs.length;
  if (!n)
    return {
      n: 0,
      mdape: NaN,
      mape: NaN,
      ppe5: NaN,
      ppe10: NaN,
      ppe20: NaN,
      medianRatio: NaN,
      medianSignedError: NaN,
      cod: NaN,
      prd: NaN,
    };
  const ratios = pairs.map(pair => pair.estimate / pair.actual);
  const ape = ratios.map(ratio => Math.abs(ratio - 1));
  const medianRatio = medianOf(ratios);
  const meanRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / n;
  const weighted =
    pairs.reduce((sum, pair) => sum + pair.estimate, 0) / pairs.reduce((sum, pair) => sum + pair.actual, 0);
  const within = (limit: number) => ape.filter(value => value <= limit + 1e-12).length / n;
  return {
    n,
    mdape: round(medianOf(ape), 6),
    mape: round(ape.reduce((sum, value) => sum + value, 0) / n, 6),
    ppe5: round(within(0.05), 6),
    ppe10: round(within(0.1), 6),
    ppe20: round(within(0.2), 6),
    medianRatio: round(medianRatio, 6),
    medianSignedError: round(medianRatio - 1, 6),
    cod: round((100 * (ratios.reduce((sum, ratio) => sum + Math.abs(ratio - medianRatio), 0) / n)) / medianRatio, 4),
    prd: round(meanRatio / weighted, 6),
  };
}

/** Deterministic PRNG (mulberry32) so bootstrap intervals reproduce exactly. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bootstrapIndices(n: number, resamples: number, seed: number): Uint32Array[] {
  const random = prng(seed);
  return Array.from({ length: resamples }, () => {
    const sample = new Uint32Array(n);
    for (let i = 0; i < n; i++) sample[i] = Math.floor(random() * n);
    return sample;
  });
}

type Calibration = {
  target: number;
  tiers: {
    id: string;
    maxComps: number | null;
    n: number;
    lowerLogRatio: number;
    upperLogRatio: number;
    pooled: boolean;
  }[];
};
const tierFor = (comps: number) =>
  validationProtocol.interval.tiers.find(tier => comps <= (tier.maxComps ?? Infinity))!.id;
/**
 * Split-conformal (Mondrian by evidence tier) interval on log(actual / estimate). With n calibration
 * residuals the finite-sample order statistics ⌊(n+1)α/2⌋ and ⌈(n+1)(1−α/2)⌉ give at least the
 * target coverage for exchangeable future sales. Sparse tiers borrow the pooled quantiles.
 */
export function calibrateIntervals(rows: ValuationRow[], primaryId: string): Calibration {
  const { target, minTierSize, tiers } = validationProtocol.interval;
  const alpha = 1 - target;
  const residualsFor = (subset: ValuationRow[]) =>
    subset.map(row => Math.log(row.actual / row.estimates[primaryId]!)).sort((a, b) => a - b);
  const bounds = (sorted: number[]) => {
    const n = sorted.length;
    // Tolerance absorbs binary rounding, e.g. (1 − 0.8) / 2 = 0.0999…, which would otherwise shift a rank.
    const lower = Math.max(1, Math.floor((n + 1) * (alpha / 2) + 1e-9));
    const upper = Math.min(n, Math.ceil((n + 1) * (1 - alpha / 2) - 1e-9));
    return { lowerLogRatio: round(sorted[lower - 1], 6), upperLogRatio: round(sorted[upper - 1], 6) };
  };
  const valued = rows.filter(row => row.estimates[primaryId] !== null);
  if (!valued.length) throw new Error('No calibration-window valuations; intervals cannot be calibrated.');
  const pooled = bounds(residualsFor(valued));
  return {
    target,
    tiers: tiers.map(tier => {
      const members = valued.filter(row => tierFor(row.comps) === tier.id);
      return {
        id: tier.id,
        maxComps: tier.maxComps,
        n: members.length,
        ...(members.length >= minTierSize ? bounds(residualsFor(members)) : pooled),
        pooled: members.length < minTierSize,
      };
    }),
  };
}
export function applyCalibration(estimate: number, comps: number, calibration: Calibration) {
  const tier = calibration.tiers.find(item => comps <= (item.maxComps ?? Infinity))!;
  return {
    low: Math.round(estimate * Math.exp(tier.lowerLogRatio)),
    high: Math.round(estimate * Math.exp(tier.upperLogRatio)),
    tier: tier.id,
  };
}

const pairsFor = (rows: ValuationRow[], id: string) =>
  rows.filter(row => row.estimates[id] !== null).map(row => ({ estimate: row.estimates[id]!, actual: row.actual }));

export type ValidationReport = {
  schema: 'ascent-valuation-validation-report-1';
  protocol: ValidationProtocol;
  protocolDigest: string;
  dataset: {
    csvSha256: string;
    rows: number;
    screened: number;
    removed: Record<string, number>;
    windows: Record<string, { sales: number }>;
  };
  engine: { version: string; fingerprint: string };
  fitted: FittedRates;
  selection: { candidates: { search: SearchConfig; valuedShare: number; mdape: number }[]; chosen: SearchConfig };
  variants: { id: string; label: string; assumptions: CmaAssumptions | null }[];
  calibration: Calibration;
  holdout: {
    window: Window;
    screenedSales: number;
    perVariant: Record<
      string,
      { valuedShare: number; metrics: RatioMetrics; mdapeCi95: [number, number]; ppe10Ci95: [number, number] }
    >;
    commonSet: { n: number; perVariant: Record<string, RatioMetrics> };
    paired: {
      variant: string;
      baseline: string;
      n: number;
      mdapeDelta: number;
      ci95: [number, number];
      winRate: number;
    }[];
    intervals: {
      envelopeCoverage: number;
      envelopeMedianWidth: number;
      calibratedCoverage: number;
      calibratedMedianWidth: number;
      byTier: { tier: string; n: number; coverage: number; medianWidth: number | null; mdape: number | null }[];
    };
    byPriceBand: { band: string; from: number; to: number | null; n: number; metrics: RatioMetrics }[];
  };
  acceptance: {
    id: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    passed: boolean;
    basis: string;
  }[];
  accepted: boolean;
  samples: { file: string; sha256: string; rows: number };
  limitations: string[];
  reportDigest: string;
};

const percentileCi = (values: number[]): [number, number] => {
  const sorted = [...values].sort((a, b) => a - b);
  return [round(quantileOf(sorted, 0.025), 6), round(quantileOf(sorted, 0.975), 6)];
};

/** Samples CSV: one row per screened holdout sale, everything needed to recompute every holdout metric. */
export function samplesCsv(rows: ValuationRow[], variantIds: string[]): string {
  const header = [
    'sale_id',
    'parcel_id',
    'sold_on',
    'actual',
    'comps',
    ...variantIds.map(id => `estimate:${id}`),
    'envelope_low',
    'envelope_high',
    'interval_low',
    'interval_high',
    'interval_tier',
  ];
  const body = rows.map(row =>
    [
      row.saleId,
      row.parcelId,
      row.soldOn,
      row.actual,
      row.comps,
      ...variantIds.map(id => row.estimates[id] ?? ''),
      row.envelope?.low ?? '',
      row.envelope?.high ?? '',
      row.interval?.low ?? '',
      row.interval?.high ?? '',
      row.interval?.tier ?? '',
    ].join(','),
  );
  return [header.join(','), ...body].join('\n') + '\n';
}

export type ValidationRun = { report: ValidationReport; samples: string };
export type ValidationOptions = {
  samplesFile?: string;
  onProgress?: (stage: string, done: number, total: number) => void;
};

export function runValuationValidation(csvText: string, options: ValidationOptions = {}): ValidationRun {
  const protocol = validationProtocol;
  const csvSha256 = sha256(csvText);
  if (csvSha256 !== protocol.dataset.csvSha256)
    throw new Error(`Dataset fingerprint ${csvSha256} does not match the protocol's ${protocol.dataset.csvSha256}.`);
  const all = parseValidationCsv(csvText);
  const { kept, removed } = screenSales(all);
  const index = new SaleIndex(kept);
  const progress = options.onProgress ?? (() => undefined);
  const windowSales = Object.fromEntries(
    Object.entries(protocol.windows).map(([name, window]) => [name, kept.filter(sale => inWindow(sale, window))]),
  ) as Record<keyof typeof protocol.windows, ValidationSale[]>;

  // 1. Fit adjustment rates on the fit window only.
  progress('fit', 0, 1);
  const fitted = fitAdjustmentRates(kept, index, protocol.windows.fit);
  const rates = {
    sqftRate: fitted.sqftRate,
    bedroomValue: fitted.bedroomValue,
    bathroomValue: fitted.bathroomValue,
    conditionValue: fitted.conditionValue,
    monthlyTrend: fitted.monthlyTrend,
  };

  const zipHistory = new Map<string, ValidationSale[]>();
  for (const sale of kept) zipHistory.set(sale.zip, [...(zipHistory.get(sale.zip) ?? []), sale]);

  // 2. Choose search filters on the selection window (lowest MdAPE among configurations valuing ≥ 90%).
  const candidates = protocol.selectionGrid.map((search, i) => {
    const variant = {
      id: 'candidate',
      label: 'candidate',
      assumptions: { ...defaultAssumptions, ...rates, ...search },
    };
    const rows = windowSales.select.map(sale => valueSale(sale, index, [variant], 'candidate', zipHistory));
    progress('select', i + 1, protocol.selectionGrid.length);
    const pairs = pairsFor(rows, 'candidate');
    return { search, valuedShare: round(pairs.length / rows.length, 6), mdape: ratioMetrics(pairs).mdape };
  });
  const admissible = candidates.filter(candidate => candidate.valuedShare >= protocol.selectionMinValuedShare);
  const chosen = (admissible.length ? admissible : candidates).reduce((best, candidate) =>
    candidate.mdape < best.mdape ? candidate : best,
  ).search;

  const variants: EngineVariant[] = [
    {
      id: 'shipped-defaults',
      label: 'Engine with shipped default assumptions (untuned)',
      assumptions: { ...defaultAssumptions },
    },
    {
      id: 'locally-calibrated',
      label: 'Engine with locally fitted rates and selected search filters',
      assumptions: { ...defaultAssumptions, ...rates, ...chosen },
    },
  ];
  const primaryId = protocol.primaryVariant;

  // 3. Calibrate the interval on the calibration window.
  const calibrationRows = windowSales.calibrate.map((sale, i) => {
    if (i % 250 === 0) progress('calibrate', i, windowSales.calibrate.length);
    return valueSale(
      sale,
      index,
      variants.filter(variant => variant.id === primaryId),
      primaryId,
      zipHistory,
    );
  });
  const calibration = calibrateIntervals(calibrationRows, primaryId);

  // 4. Score the holdout once.
  const rows = windowSales.test.map((sale, i) => {
    if (i % 250 === 0) progress('test', i, windowSales.test.length);
    const row = valueSale(sale, index, variants, primaryId, zipHistory);
    const estimate = row.estimates[primaryId];
    if (estimate !== null) row.interval = applyCalibration(estimate, row.comps, calibration);
    return row;
  });
  const variantIds = [...variants.map(variant => variant.id), ...BASELINES];
  const resamples = protocol.bootstrap.resamples;
  const perVariant: ValidationReport['holdout']['perVariant'] = {};
  variantIds.forEach((id, offset) => {
    const pairs = pairsFor(rows, id);
    const draws = bootstrapIndices(pairs.length, resamples, protocol.bootstrap.seed + offset);
    const mdapes: number[] = [];
    const ppe10s: number[] = [];
    for (const draw of draws) {
      const ape = Array.from(draw, i => Math.abs(pairs[i].estimate / pairs[i].actual - 1));
      mdapes.push(medianOf(ape));
      ppe10s.push(ape.filter(value => value <= 0.1 + 1e-12).length / ape.length);
    }
    perVariant[id] = {
      valuedShare: round(pairs.length / rows.length, 6),
      metrics: ratioMetrics(pairs),
      mdapeCi95: percentileCi(mdapes),
      ppe10Ci95: percentileCi(ppe10s),
    };
  });
  const common = rows.filter(row => variantIds.every(id => row.estimates[id] !== null));
  const paired = variants.flatMap((variant, v) =>
    BASELINES.map((baseline, b) => {
      const subset = rows.filter(row => row.estimates[variant.id] !== null && row.estimates[baseline] !== null);
      const ape = (row: ValuationRow, id: string) => Math.abs(row.estimates[id]! / row.actual - 1);
      const deltaFor = (sample: ArrayLike<number>) =>
        medianOf(Array.from(sample, i => ape(subset[i], variant.id))) -
        medianOf(Array.from(sample, i => ape(subset[i], baseline)));
      const deltas = bootstrapIndices(subset.length, resamples, protocol.bootstrap.seed + 100 + v * 10 + b).map(
        deltaFor,
      );
      return {
        variant: variant.id,
        baseline,
        n: subset.length,
        mdapeDelta: round(deltaFor(subset.map((_, i) => i)), 6),
        ci95: percentileCi(deltas),
        winRate: round(
          subset.filter(row => ape(row, variant.id) < ape(row, baseline)).length / (subset.length || 1),
          6,
        ),
      };
    }),
  );
  const primaryRows = rows.filter(row => row.estimates[primaryId] !== null);
  const covered = (row: ValuationRow, range: { low: number; high: number } | null | undefined) =>
    !!range && row.actual >= range.low && row.actual <= range.high;
  const width = (row: ValuationRow, range: { low: number; high: number } | null | undefined) =>
    range ? (range.high - range.low) / row.estimates[primaryId]! : NaN;
  const share = (subset: ValuationRow[], test: (row: ValuationRow) => boolean) =>
    round(subset.filter(test).length / (subset.length || 1), 6);
  const intervals = {
    envelopeCoverage: share(primaryRows, row => covered(row, row.envelope)),
    envelopeMedianWidth: round(medianOf(primaryRows.map(row => width(row, row.envelope))), 6),
    calibratedCoverage: share(primaryRows, row => covered(row, row.interval)),
    calibratedMedianWidth: round(medianOf(primaryRows.map(row => width(row, row.interval))), 6),
    byTier: protocol.interval.tiers.map(tier => {
      const members = primaryRows.filter(row => row.interval?.tier === tier.id);
      return {
        tier: tier.id,
        n: members.length,
        coverage: share(members, row => covered(row, row.interval)),
        medianWidth: members.length ? round(medianOf(members.map(row => width(row, row.interval))), 6) : null,
        mdape: members.length ? ratioMetrics(pairsFor(members, primaryId)).mdape : null,
      };
    }),
  };
  const sortedActual = rows.map(row => row.actual).sort((a, b) => a - b);
  const cuts = [0, 0.25, 0.5, 0.75].map(q => quantileOf(sortedActual, q));
  const byPriceBand = cuts.map((from, i) => {
    const to = i < 3 ? cuts[i + 1] : null;
    const members = primaryRows.filter(row => row.actual >= from && (to === null || row.actual < to));
    return {
      band: `Q${i + 1}`,
      from: Math.round(from),
      to: to === null ? null : Math.round(to),
      n: members.length,
      metrics: ratioMetrics(pairsFor(members, primaryId)),
    };
  });
  const primary = perVariant[primaryId];
  const metricValue = (metric: AcceptanceCriterion['metric']): number => {
    if (metric === 'valuedShare') return primary.valuedShare;
    if (metric === 'absMedianSignedError') return round(Math.abs(primary.metrics.medianSignedError), 6);
    if (metric === 'calibratedCoverage') return intervals.calibratedCoverage;
    if (metric.startsWith('pairedMdapeDeltaUpper:'))
      return paired.find(item => item.variant === primaryId && item.baseline === metric.split(':')[1])!.ci95[1];
    return primary.metrics[metric as 'mdape' | 'ppe10' | 'cod' | 'prd'];
  };
  const acceptance = protocol.acceptance.map(criterion => {
    const value = metricValue(criterion.metric);
    const min = 'min' in criterion ? criterion.min : undefined;
    const max = 'max' in criterion ? criterion.max : undefined;
    return {
      id: criterion.id,
      label: criterion.label,
      value,
      min,
      max,
      passed: Number.isFinite(value) && (min === undefined || value >= min) && (max === undefined || value <= max),
      basis: criterion.basis,
    };
  });
  const samples = samplesCsv(rows, variantIds);
  const fingerprint = engineFingerprint();
  const report: Omit<ValidationReport, 'reportDigest'> = {
    schema: 'ascent-valuation-validation-report-1',
    protocol,
    protocolDigest: protocolDigest(protocol),
    dataset: {
      csvSha256,
      rows: all.length,
      screened: kept.length,
      removed,
      windows: Object.fromEntries(Object.entries(windowSales).map(([name, sales]) => [name, { sales: sales.length }])),
    },
    engine: fingerprint,
    fitted,
    selection: { candidates, chosen },
    variants: [
      ...variants.map(({ id, label, assumptions }) => ({ id, label, assumptions })),
      {
        id: 'baseline-median-ppsf',
        label: 'Median $/sqft of the primary configuration’s comparables × subject sqft',
        assumptions: null,
      },
      {
        id: 'baseline-zip-median',
        label: 'Median recorded price in the same ZIP over the prior 180 days',
        assumptions: null,
      },
    ],
    calibration,
    holdout: {
      window: protocol.windows.test,
      screenedSales: rows.length,
      perVariant,
      commonSet: {
        n: common.length,
        perVariant: Object.fromEntries(variantIds.map(id => [id, ratioMetrics(pairsFor(common, id))])),
      },
      paired,
      intervals,
      byPriceBand,
    },
    acceptance,
    accepted: acceptance.every(item => item.passed),
    samples: {
      file: options.samplesFile ?? 'valuation-validation-samples.csv',
      sha256: sha256(samples),
      rows: rows.length,
    },
    limitations: [
      'One county (King County, Washington) and one period (May 2014 – May 2015). Accuracy in other markets or years is unmeasured until the same protocol is run on their recorded sales.',
      'Only living area, bedrooms, bathrooms, condition, location and sale date are used. View, waterfront, construction grade, lot and renovations are deliberately not modeled, matching the production engine.',
      'Recorded prices are not screened for non-arm’s-length transfers, concessions or data-entry errors; all screened sales are scored, including outliers.',
      'A home’s own prior sale is withheld from its comparables; the production engine can use it when it is supplied as a separate record.',
      'Calibrated intervals assume future sales resemble the calibration window; they apply only to this market, period and configuration.',
    ],
  };
  return { report: { ...report, reportDigest: digestOf(report) }, samples };
}

export type VerificationCheck = { label: string; passed: boolean; detail: string };
/**
 * Independent re-derivation from the published samples. This deliberately does not call `ratioMetrics`
 * or the bootstrap helpers: it reparses the CSV and recomputes headline figures with separate code, so
 * an error in one implementation shows up as a disagreement rather than being repeated.
 */
export function verifyValidationReport(report: ValidationReport, samplesText: string): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const check = (label: string, passed: boolean, detail: string) => checks.push({ label, passed, detail });
  const { reportDigest, ...body } = report;
  const recomputedDigest = digestOf(body);
  check('Report digest', recomputedDigest === reportDigest, `${reportDigest} claimed; ${recomputedDigest} recomputed.`);
  check(
    'Protocol digest',
    protocolDigest(report.protocol) === report.protocolDigest,
    'Protocol and acceptance thresholds are unchanged since the report was produced.',
  );
  check(
    'Protocol matches this build',
    protocolDigest() === report.protocolDigest,
    'The report was produced under the protocol this code declares.',
  );
  const samplesHash = sha256(samplesText);
  check(
    'Samples fingerprint',
    samplesHash === report.samples.sha256,
    `${report.samples.sha256} claimed; ${samplesHash} recomputed.`,
  );
  const engine = engineFingerprint();
  check(
    'Engine fingerprint',
    engine.fingerprint === report.engine.fingerprint,
    `Report engine ${report.engine.fingerprint}; this build ${engine.fingerprint}.`,
  );

  const [headerLine, ...lines] = samplesText.trim().split('\n');
  const header = headerLine.split(',');
  const col = (name: string) => header.indexOf(name);
  const table = lines.map(line => line.split(','));
  const actualAt = col('actual');
  for (const [id, claimed] of Object.entries(report.holdout.perVariant)) {
    const at = col(`estimate:${id}`);
    const errors: number[] = [];
    let estimateSum = 0;
    let actualSum = 0;
    let ratioSum = 0;
    const ratios: number[] = [];
    for (const cells of table) {
      if (cells[at] === '') continue;
      const estimate = Number(cells[at]);
      const actual = Number(cells[actualAt]);
      const ratio = estimate / actual;
      ratios.push(ratio);
      errors.push(Math.abs(ratio - 1));
      estimateSum += estimate;
      actualSum += actual;
      ratioSum += ratio;
    }
    errors.sort((a, b) => a - b);
    ratios.sort((a, b) => a - b);
    const mid = (values: number[]) =>
      values.length % 2
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
    const mdape = mid(errors);
    const ppe10 = errors.filter(error => error <= 0.1 + 1e-12).length / errors.length;
    const medRatio = mid(ratios);
    let deviation = 0;
    for (const ratio of ratios) deviation += Math.abs(ratio - medRatio);
    const cod = (100 * deviation) / ratios.length / medRatio;
    const prd = ratioSum / ratios.length / (estimateSum / actualSum);
    const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
    check(
      `Recomputed ${id}`,
      errors.length === claimed.metrics.n &&
        close(mdape, claimed.metrics.mdape, 1e-6) &&
        close(ppe10, claimed.metrics.ppe10, 1e-6) &&
        close(cod, claimed.metrics.cod, 1e-4) &&
        close(prd, claimed.metrics.prd, 1e-6),
      `n ${errors.length}, MdAPE ${(mdape * 100).toFixed(2)}%, PPE10 ${(ppe10 * 100).toFixed(1)}%, COD ${cod.toFixed(2)}, PRD ${prd.toFixed(3)}.`,
    );
  }
  const lowAt = col('interval_low');
  const highAt = col('interval_high');
  const withInterval = table.filter(cells => cells[lowAt] !== '');
  const inside = withInterval.filter(
    cells => Number(cells[actualAt]) >= Number(cells[lowAt]) && Number(cells[actualAt]) <= Number(cells[highAt]),
  ).length;
  const coverage = inside / (withInterval.length || 1);
  check(
    'Recomputed calibrated coverage',
    Math.abs(coverage - report.holdout.intervals.calibratedCoverage) <= 1e-6,
    `${(coverage * 100).toFixed(1)}% of ${withInterval.length} holdout sales inside the calibrated interval.`,
  );
  const acceptanceConsistent = report.acceptance.every(
    item =>
      item.passed ===
      ((item.min === undefined || item.value >= item.min) && (item.max === undefined || item.value <= item.max)),
  );
  check(
    'Acceptance verdicts',
    acceptanceConsistent && report.accepted === report.acceptance.every(item => item.passed),
    'Each pass/fail verdict follows from its value and pre-registered threshold.',
  );
  return checks;
}

/** A third party's signed statement about one exact report digest. */
export type ValidationAttestation = {
  reviewer: string;
  publicKeyPem: string;
  reportDigest: string;
  statement: string;
  signedAt: string;
  signature: string;
};
export const attestationMessage = (
  attestation: Pick<ValidationAttestation, 'reportDigest' | 'statement' | 'signedAt'>,
) => `ascent-valuation-attestation-v1\n${attestation.reportDigest}\n${attestation.statement}\n${attestation.signedAt}`;
export function verifyAttestation(attestation: ValidationAttestation, reportDigest: string): VerificationCheck {
  const label = `Attestation by ${attestation.reviewer}`;
  if (attestation.reportDigest !== reportDigest)
    return { label, passed: false, detail: 'Signed a different report digest.' };
  try {
    const passed = verifySignature(
      null,
      Buffer.from(attestationMessage(attestation)),
      attestation.publicKeyPem,
      Buffer.from(attestation.signature, 'base64'),
    );
    return {
      label,
      passed,
      detail: passed ? 'Ed25519 signature verifies against the stated public key.' : 'Signature does not verify.',
    };
  } catch {
    return { label, passed: false, detail: 'Public key or signature is malformed.' };
  }
}
