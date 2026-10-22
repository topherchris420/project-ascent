# Method specification for reimplementation

This is the valuation method and validation procedure behind every published Ascent accuracy study, written so a researcher can reimplement them without reading the TypeScript. Each step names the code it describes. Where this text and the code disagree, the code is what produced the published numbers; please report the disagreement as a finding.

Code: `src/lib/analytics.ts` (`calculateCma`, `comparableExclusion`, `distanceMiles`, `defaultAssumptions`) and `src/lib/valuation-validation.ts` (protocols, screening, fitting, selection, calibration, holdout, metrics). The per-study parameters are the protocol objects in that file, embedded verbatim in each report under `protocol`.

## 1. Data

Each study reads one CSV (see the [data dictionary](data-dictionary.md)): `sale_id, parcel_id, sold_on, price, beds, baths, sqft, condition, lat, lng, zip`. The DC condo file has no `condition` column; its rows are read with condition 0, and the condition adjustment is disabled (`omittedFeatures: ['conditionValue']`). Maryland files carry the assessor's construction-quality grade (1–9) in `condition` and neutral zero room counts; both room adjustments are disabled (`omittedFeatures: ['bedroomValue', 'bathroomValue']`).

The SHA-256 of the decompressed CSV must equal `protocol.dataset.csvSha256` before anything runs. How each CSV was built from public records is in `scripts/datasets/*.py` and the provenance files beside each dataset.

**Screening** (`screenSales`), in file order: drop a repeated `sale_id`; drop beds outside `[minBeds, maxBeds]`, baths below `minBaths`, sqft below `minSqft`, and, where the protocol sets `minPrice`, price below it. Nothing is removed for its price level otherwise, or for any valuation result.

**Windows.** Each protocol has four disjoint, chronological windows on `sold_on` (inclusive): fit, select, calibrate, test.

## 2. Time and comparables

A sale dated `D` is valued at `D 00:00:00.000 UTC − 1 ms`: the end of the previous day. All dates are UTC; no local time zone is involved.

**Candidate pool** for a subject sale (`SaleIndex.near`): every screened sale with a date strictly before the subject's, no more than `maxAgeDays + 1` days earlier, from a different `parcel_id` (`excludeSameParcel: true`), inside a latitude/longitude box that contains the search radius. The grid index only speeds this up; it never decides eligibility. Candidates are listed in ascending `sale_id` order.

**Eligibility** (`comparableExclusion`), with `ageDays = (asOf − saleTime) / 86,400,000`:

- the comparable is a closed sale with a valid date and positive price, and finite beds, baths, sqft (non-zero) and coordinates; condition must be finite when the condition adjustment is active;
- `ageDays ≥ 0` and `ageDays ≤ maxAgeDays`;
- `distance ≤ maxDistanceMiles`, where distance is the haversine distance with a radius of 3,958.7613 miles: `h = sin²(Δφ/2) + cos φ₁ cos φ₂ sin²(Δλ/2)`, `d = 3958.7613 × 2 × atan2(√h, √max(0, 1 − h))`;
- `max(sqft_s, sqft_c) / min(sqft_s, sqft_c) ≤ maxSizeRatio`.

The subject record never carries a price.

## 3. The valuation engine (`calculateCma`)

Comparables are processed in ascending ID order as JavaScript's `String.prototype.localeCompare` sorts them (ICU root collation in official Node.js builds). For each eligible comparable with price `P`, adjustments are, each rounded to cents (`Number(x.toFixed(2))`):

| Adjustment | Amount |
| --- | --- |
| Living area | `(sqft_s − sqft_c) × sqftRate` |
| Bedrooms | `(beds_s − beds_c) × bedroomValue` |
| Bathrooms | `(baths_s − baths_c) × bathroomValue` |
| Condition (only when `conditionValue > 0`) | `(condition_s − condition_c) × conditionValue` |
| Time | `P × ((1 + monthlyTrend)^(ageDays / 30.4375) − 1)` |

`net` is the rounded sum, `gross` the rounded sum of absolute values, and `adjusted = round₂(P + net)`. A comparable whose adjusted price is not finite or not positive is excluded. If none remains, the engine abstains.

Each remaining comparable gets the raw weight

`w = 1 / ((1 + distance) × (1 + ageDays / 90) × (1 + 4 × |ln(sqft_s / sqft_c)|))`

using the unrounded distance and age. Weights are normalized to sum to 1. The **estimate** is `round₀(Σ adjusted × w)`; the observed **envelope** is `[floor(min adjusted), ceil(max adjusted)]`. The envelope is not a confidence interval.

**Rounding.** `toFixed` rounds the exact binary value half away from zero; `Math.round` (used by the baselines and intervals below) rounds halves toward positive infinity.

**Numerical tolerance for reimplementations.** Summation order (the collation above) and last-bit differences between math libraries (`pow`, `sin`, `cos`, `atan2`) can move a result by a few units in the last place. After rounding, a faithful reimplementation should match almost every published per-sale estimate exactly and the rest within $1. Larger differences are findings.

## 4. Baselines (`valueSale`)

- **Median $/sqft of the same comparables:** the median of `price / sqft` over the primary configuration's eligible comparables (the eligible pool before the engine's non-positive-adjustment exclusion), times the subject's sqft, then `Math.round`. It abstains when that pool is empty.
- **Trailing ZIP median:** the median recorded price of screened sales in the subject's ZIP whose date is strictly before the subject's and no more than 180 days earlier, excluding the subject's parcel, then `Math.round`. It abstains when there are none.

The median of an even count is the mean of the two middle values.

## 5. Fitting the adjustment rates (`fitAdjustmentRates`)

For each fit-window sale, take up to `fit.neighbours` (5) of the nearest earlier fit-window sales that pass eligibility under `fit.search` (1 mile, 180 days, 1.35 size ratio, condition required). Order them by distance, then `sale_id` in code-unit order. Each pair gives one regression row:

- `x = [Δsqft, Δbeds, Δbaths, Δcondition, P_c × months]` where `Δ` is subject minus comparable and `months = (asOf − saleTime_c) / 86,400,000 / 30.4375`;
- `y = P_s − P_c`, with scale `P_c`.

The coefficients `β` (sqftRate, bedroomValue, bathroomValue, conditionValue, monthlyTrend) minimize `Σ wᵣ ((yᵣ − xᵣ·β) / P_c)²` by solving the weighted normal equations (Gaussian elimination with partial pivoting; a pivot below 1e-12 means the design is singular and the study stops).

- **Omitted features** (per protocol) are fixed at 0 and never fitted.
- **Quality cap** (`fit.maxQualityAdjustment`, Maryland v2 and the external study): if the condition coefficient exceeds the cap, it is fixed at the cap and the rest refitted.
- **Non-negativity:** while any active feature rate other than the trend is negative, the most negative is fixed at 0, recorded in `clampedToZero`, and the rest refitted. A feature fixed this way stays fixed for the remaining iterations.
- **Huber reweighting:** start with all weights 1. The fit-and-reweight cycle runs `huberIterations + 1` times (4); each cycle refits until the constraints above hold, then computes scaled residuals `rᵣ = (yᵣ − xᵣ·β) / P_c`, `spread = median(|r|) / 0.6745` (1 if that is 0), and new weights `wᵣ = 1` if `|rᵣ| / spread ≤ 1.345`, else `1.345 / (|rᵣ| / spread)`. The coefficients of the last cycle are kept.

Reported rates: sqftRate `max(0, β₀)` to cents; bedroom, bathroom and condition rates `max(0, β)` to whole dollars; monthlyTrend clamped to `[−0.05, 0.05]` and rounded to 5 decimals.

## 6. Choosing the search filters

Each of the eight `selectionGrid` options (radius 0.5, 1, 2 or 3 miles × 90 or 180 days, size ratio 1.35) values every selection-window sale with the fitted rates. An option is admissible if it values at least `selectionMinValuedShare` (90%) of them. The admissible option with the lowest MdAPE wins; ties keep the earlier grid entry. If none is admissible, the lowest MdAPE overall wins.

## 7. Variants scored on the holdout

| Variant | Assumptions |
| --- | --- |
| `shipped-defaults` | sqftRate 110, bedroomValue 12,000, bathroomValue 15,000, conditionValue 14,000, monthlyTrend 0, 3 miles, 180 days, size ratio 1.35; omitted features set to 0 |
| `locally-calibrated` (primary) | the defaults overridden by the fitted rates and the chosen filters |
| `baseline-median-ppsf`, `baseline-zip-median` | section 4 |

Every test-window sale is valued once by each. The comparable count and envelope come from the primary variant.

## 8. Calibrated interval (`calibrateIntervals`)

Value the calibration window with the primary variant. For each valued sale, the residual is `ln(actual / estimate)`. Evidence tiers by comparable count: sparse ≤ 2, moderate 3–9, dense ≥ 10. With target coverage 0.8 (`α = 0.2`) and `n` sorted residuals in a tier, the bounds are the order statistics

`k_lo = max(1, ⌊(n + 1) α/2 + 1e-9⌋)`, `k_hi = min(n, ⌈(n + 1)(1 − α/2) − 1e-9⌉)`,

each rounded to 6 decimals. A tier with fewer than `minTierSize` (50) sales uses the bounds from all valued calibration sales pooled. A holdout sale's interval is `[Math.round(estimate × e^lower), Math.round(estimate × e^upper)]` for its tier. This is split-conformal prediction, Mondrian by tier; its coverage guarantee assumes exchangeable sales.

## 9. Holdout metrics (`ratioMetrics`)

For a set of valued sales with ratios `rᵢ = estimateᵢ / actualᵢ` and absolute errors `eᵢ = |rᵢ − 1|`:

| Metric | Definition | Rounding |
| --- | --- | --- |
| `mdape` | median of `e` | 6 decimals |
| `mape` | mean of `e` | 6 |
| `ppe5`, `ppe10`, `ppe20` | share with `e ≤ limit + 1e-12` | 6 |
| `medianRatio` | median of `r` | 6 |
| `medianSignedError` | `median(r) − 1`, from the unrounded median | 6 |
| `cod` | `100 × mean(|r − median(r)|) / median(r)` | 4 |
| `prd` | `mean(r) / (Σ estimate / Σ actual)` | 6 |

Sums run left to right in file order. `valuedShare` is valued sales divided by screened holdout sales.

**Bootstrap.** Variants in the order `shipped-defaults, locally-calibrated, baseline-median-ppsf, baseline-zip-median` take offsets 0–3. Each resamples its valued sales 1,000 times with replacement using mulberry32 seeded with `bootstrap.seed + offset`; draw `i` of a resample is index `⌊u × n⌋`, `u` the generator's next value in `[0, 1)`. The 95% intervals for MdAPE and PPE10 are the 2.5th and 97.5th percentiles by linear interpolation between order statistics, rounded to 6 decimals. mulberry32 is spelled out in `scripts/replication/rederive.py` (`bootstrap_draws`).

**Paired comparisons.** For engine variant `v` (0 shipped-defaults, 1 locally-calibrated) and baseline `b` (0 median $/sqft, 1 ZIP median), take the sales both valued. `mdapeDelta = MdAPE_v − MdAPE_b`; its interval bootstraps that subset with seed `bootstrap.seed + 100 + 10v + b`; `winRate` is the share where the variant's absolute error is strictly smaller.

**Common set:** the sales every variant valued, with each variant's metrics on them.

**Intervals:** over primary-valued sales, the share whose actual price lies within the envelope and within the calibrated interval (inclusive), and the median widths divided by the estimate, overall and by tier, with each tier's MdAPE.

**Price bands:** quartile cuts at the 0, 25th, 50th and 75th percentiles (linear interpolation) of every screened holdout sale's price; band `i` holds primary-valued sales with price in `[cutᵢ, cutᵢ₊₁)`, the last unbounded; band edges are reported with `Math.round`.

## 10. Acceptance

Nine criteria, identical in every study, each a threshold on one value: A1 valued share ≥ 0.90; A2 MdAPE ≤ 0.10; A3 PPE10 ≥ 0.50; A4 COD ≤ 15; A5 0.98 ≤ PRD ≤ 1.03; A6 |median signed error| ≤ 0.03 (from the rounded median signed error); A7 the upper 95% bound of the paired MdAPE difference against median $/sqft ≤ 0; A8 the same against the ZIP median; A9 0.75 ≤ calibrated coverage ≤ 0.85. A study is accepted only if all nine pass. The thresholds are inside the protocol, so they are covered by its digest.

The protocols describe A7 and A8 as an upper bound "below zero"; the code compares `value ≤ max` with `max: 0`, so an upper bound of exactly 0 would pass. No published study has an upper bound of exactly 0.

## 11. Digests and fingerprints

- **Report and protocol digests:** `sha256-` + SHA-256 of canonical JSON of the object (the report without its `reportDigest`): keys sorted by UTF-16 code units at every level, no whitespace, numbers and strings exactly as `JSON.stringify` writes them, `undefined` members dropped. `scripts/replication/rederive.py` reproduces this byte for byte in Python.
- **Samples and dataset fingerprints:** SHA-256 of the decompressed CSV text. Gzip bytes are not the fingerprint, because they differ between zlib builds.
- **Engine fingerprint** (`fnv1a32-49f0c98b` in every report): the `calculationHash` of one fixed three-comparable valuation (`engineFingerprint` in `src/lib/valuation-safeguards.ts`). It changes if any engine arithmetic changes. It is FNV-1a 32-bit over a canonical serialization whose keys are sorted with `localeCompare`, so it also depends on the runtime's collation, though no estimate does.

## 12. What the samples files do not contain

Only holdout sales are published per sale. Fit-window pairs, selection-window valuations and calibration residuals are reproduced by re-running (`npm run validate:valuation -- --verify --market <id>`) or by your reimplementation; their summaries are in each report (`fitted`, `selection`, `calibration`).
