# Maryland public-record pricing: Montgomery and Prince George’s

`/maryland` searches covered single-unit homes and townhouses in these two counties and prices them with the existing deterministic engine. No account, property-provider key, MLS feed, model request or live county lookup is involved. Virginia remains unavailable pending written permission; [four unsent requests](data-permissions/virginia-requests.md) are ready for the maintainer to send.

## Source and record rules

The state’s [Maryland Real Property Assessments — Hidden Property Owner Names](https://opendata.maryland.gov/d/ed4q-f8tm) is published by SDAT/MDP and labeled **Public Domain** in its [metadata](https://opendata.maryland.gov/api/views/ed4q-f8tm.json). This implementation uses that state source only. It does not treat access to a county portal as a reuse license.

The October 18, 2026 snapshot contains **462,347 searchable properties** and **100,432 transfers since January 2020** after screening. The importer requests only parcel identifiers, property addresses and city/ZIP, county, coordinates, structure area, quality grade, year built and three sale date/consideration/conveyance fields. It never requests owner names, grantor names or mailing addresses.

Property rules are Montgomery (`MONT`) or Prince George’s (`PRIN`), land use Residential (`R`) or Town House (`TH`), exactly one dwelling unit, a usable street address and ZIP, mapped coordinates, structure area of at least 300 square feet and a known quality grade from 1 to 9. Sales must have a valid date, positive consideration and the state’s **Private arms-length transfer, Improved (1)** conveyance code. Transfers in or before the current build year, same-day/future dates, non-arm’s-length and multi-parcel conveyance codes are excluded. Identical duplicate recordings are collapsed; all conflicting duplicates are removed. No sale is removed for its model error or price level.

Counts by rule, source field names, source row counts and SHA-256 fingerprints are in `src/datasets/maryland/maryland.provenance.json`, copied to `evidence/datasets/`. The runtime sales file is byte-identical to the one scored by validation. Runtime loading checks both CSV hashes and requires the sales hash to match the published benchmark.

## What the model knows

It prices on **structure area, construction quality grade, location and sale timing only**. Bedrooms and bathrooms are absent from this public dataset. Both adjustment rates are fixed to zero; the UI and report say **unavailable**. The engine’s required numeric room slots use explicitly marked neutral zero sentinels, not observations or invented room counts. The state schema and calculation wrapper reject attempts to enable room adjustments or insert room counts into this reduced model.

The frozen fit produced $5.94 per square foot, $409,518 per quality-grade point and +0.843% monthly trend, with a selected 0.5-mile/180-day search. These are regression coefficients, not professionally established adjustments. The very large grade coefficient and worse holdout error are exposed, not clipped or replaced after scoring. A sale rejected for a nonpositive adjusted value is shown with that engine reason in the studio and report; the unvalued subject remains in the test denominator.

SDAT quality grades run Low (1), Economy (2), Below Average (3), Average (4), Above Average (5), Good (6), Very Good (7), Excellent (8), Superior (9). The engine’s legacy `condition` slot carries this grade with `ratingKind: quality-grade`; labels and reports identify it as construction quality. **It does not measure interior condition, renovations or an inspection.** Structure area is the state’s `SQFTSTRC`, not a verified MLS living-area measurement.

The server gathers earlier recorded sales within 3 miles and 365 days before the snapshot, excluding the subject’s own parcel. The studio starts at the settings fitted and selected by the Maryland protocol. Users can inspect, exclude, change grade/rates, test seller proceeds, add labeled unverified entries and export server-rebuilt reports or replayable JSON. The displayed range remains an **uncalibrated adjusted-comparable envelope**; the test’s calibrated-interval coverage is published as a test result, not presented as an assurance for a current home. No Maryland calibration is applied automatically to arbitrary Maryland workspace properties.

## Accuracy test

Protocol `ascent-valuation-validation-maryland-1` was committed in `a5a0249` before the first scoring run. Registration digest: `sha256-1db8867bf3d88493f43cdb9d43ba6807e03d814f7de463a449c42e1ba5e00cea`. The dataset, four disjoint windows, missing room features and **all nine unchanged DC acceptance thresholds** were fixed before scoring:

| Stage | Window |
| --- | --- |
| Fit adjustment rates | Jan 2021 – Dec 2023 |
| Select comparable filters | Jan – Jun 2024 |
| Calibrate test intervals | Jul 2024 – Jun 2025 |
| Score holdout | Jul 2025 – Jun 2026 |

Each subject’s price is withheld; only strictly earlier transfers from other parcels qualify as comparables or ZIP-baseline evidence. Fitting omits the two unavailable room features rather than estimating their coefficients. The selection grid, robust paired-sales fitting, seeded bootstrap, evidence tiers, interval method and acceptance bars otherwise match DC. The production price calculation is unchanged.

**Did not meet the acceptance criteria: 4 of 9 criteria met.** Holdout: **12,831 sales**, July 2025–June 2026. Primary median absolute percentage error **13.85%**, with **39.20%** within ±10%.

| Configuration | Valued | Median error (95% CI) | Within ±10% | COD | PRD |
| --- | --- | --- | --- | --- | --- |
| Maryland-fitted (primary) | 93.63% | 13.85% (13.47%–14.16%) | 39.20% | 9913.84 | 98.7943 |
| Untuned, room adjustments disabled | 99.84% | 10.15% (9.92%–10.37%) | 49.36% | 9047.82 | 92.3296 |
| Median $/sqft, raw eligible pool | 93.73% | 10.74% (10.48%–10.95%) | 47.19% | 9710.65 | 97.5863 |
| Trailing ZIP median | 99.94% | 18.18% (17.78%–18.52%) | 30.42% | 6466.24 | 70.3293 |

| Criterion | Threshold | Measured | Verdict |
| --- | --- | --- | --- |
| A1 · Holdout sales valued | ≥ 90.00% | 93.63% | Met |
| A2 · Median absolute percentage error | ≤ 10.00% | 13.85% | **Missed** |
| A3 · Share within ±10% of sale price | ≥ 50.00% | 39.20% | **Missed** |
| A4 · Coefficient of dispersion (COD) | ≤ 15.0000 | 9913.8413 | **Missed** |
| A5 · Price-related differential (PRD) | 0.9800–1.0300 | 98.7943 | **Missed** |
| A6 · Absolute median signed error | ≤ 3.00% | 1.58% | Met |
| A7 · Beats median $/sqft of the same comparables | Paired 95% upper bound below 0 | 3.49 percentage points | **Missed** |
| A8 · Beats trailing ZIP median price | Paired 95% upper bound below 0 | -3.20 percentage points | Met |
| A9 · Calibrated 80% interval coverage | 75.00%–85.00% | 79.39% | Met |

The calibrated 80% **test** interval contained 79.39% of valued sales. The observed comp envelope contained 67.01%. Neither is displayed as a calibrated current-home interval in Maryland.

| County | Holdout sales | Valued | Median error | Within ±10% |
| --- | --- | --- | --- | --- |
| Montgomery | 7,465 | 94.60% | 14.06% | 38.57% |
| Prince George’s | 5,366 | 92.28% | 13.47% | 40.08% |

These county slices use the same pooled model, without separate county fitting or acceptance claims. The protocol and all thresholds remain unchanged. Report digest: `sha256-483c1495df5e049b49f5a0cb614995ed219b11e4c11452f651d10b5a572f5523`. The complete report, per-sale samples and source fingerprints are committed under `evidence/`; independent metric re-derivation is available through `--check`.


The $/sqft baseline uses the same raw eligible sale pool, including sales the engine may subsequently reject for nonpositive adjusted values. Such rejection of every adjusted comp is an abstention, retained in the denominator. A runner edge case found during Maryland filter selection, before holdout scoring, was repaired to count these abstentions without changing data, protocol or thresholds. Pure date parsing is cached for the larger dataset; DC’s full report and samples still reproduce exactly.

The result is published in the homepage accuracy section, `/maryland`, printable reports and JSON exports, with all misses intact. County figures are descriptive slices of the same pooled holdout; they are not separately tuned models or independent acceptance claims.

## Limits

**Read the failures directly:** the fitted model is worse than the untuned settings on this holdout. Five retained transfers have consideration of $1,000 or less (including $1 and $10 records) despite the state’s private arms-length improved classification. Their extreme valuation ratios contribute to the very large COD/PRD failures. These records were retained under the frozen positive-consideration rule. Do not interpret the source’s classification as proof that every record is an ordinary full-value market sale. A different screening/model rule must be declared and tested on a new untouched holdout, rather than cleaning this published result after seeing its errors.

- **Incomplete history:** the state retains only the latest three transfers per current parcel. Older sale history is incomplete and subject to survivorship bias. This is a backtest on retained records, not a full deed-history reconstruction.
- **Current characteristics:** quality and area describe the current assessor record. Build-year screening cannot remove unrecorded renovations or reconstruct characteristics at each historical closing.
- **Recording availability:** chronology uses sale dates. Exact recording/publication times are unavailable, so an earlier closing is not proof it was already publicly visible on the historical analysis date.
- **Scope:** these two counties, single-unit residential and townhouses only. No condominiums, other Maryland counties, Virginia, listing history, concessions, lot features or inspected interior condition.
- **Static snapshot:** source updates and recordings lag closings; the newest months may be incomplete. The holdout ends June 2026 to allow for lag. A new snapshot changes the fingerprint and requires a new protocol and holdout before new accuracy claims.
- **Internal validation:** reproducible results, not independent certification, an appraisal or a promise of future accuracy. No outside attestation has been received.

## Reproduction and routes

```bash
npm run validate:valuation -- --check --market maryland
npm run validate:valuation -- --verify --market maryland
npx tsx scripts/summarize-maryland.ts
```

The county summary is derived from the published per-sale samples and property-to-county map, tied to the exact report digest, and copied byte-for-byte to `src/lib/valuation-maryland-counties.json` for display. Unit tests independently recompute each county’s median error and share within ±10%.

For a deliberate **new** snapshot, run `python -I scripts/datasets/fetch-maryland.py`; the source is live and later bytes will differ. Do not overwrite the published protocol after scoring. Register a new version with a new untouched holdout and publish both outcomes.

| Route | Purpose |
| --- | --- |
| `GET /api/maryland/search?q=` | Up to eight matching addresses; 100-character query limit |
| `GET /api/maryland/property?parcel=` | Subject and nearby recorded transfers; no asking or assessed value used as sale price |
| `GET /api/maryland/report?parcel=&state=[&format=json]` | Bounded scenario, rebuilt on the server, printable HTML or replayable JSON |

All are public, read only bundled files and set no cookies. Request paths and parcel IDs are bounded; supplied scenario state cannot replace source facts, activate missing room adjustments or submit a fabricated calibrated range.
