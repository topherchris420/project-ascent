> October 18 follow-up: [current production-readiness checkpoint](production-readiness.md). Maryland v2 and DC condo results are now published separately; both fail acceptance and keep calibrated ranges disabled. The original Maryland failure below is preserved.

# Valuation accuracy validation and production safeguards

Most residential pricing tools publish no error rate. Ascent publishes one for its home market, Washington, DC, measured out of sample on the District's own recorded sales against thresholds set before scoring. A second market, King County, WA, is published alongside it, including the criteria it missed. Anyone can reproduce either result byte for byte.

## Maryland: Montgomery and Prince George’s (protocol `ascent-valuation-validation-maryland-1`)

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

[Source rules, missing features, registration and reproduction](maryland-public-records.md). Virginia awaits written permission; DC condos are available with unmeasured accuracy and uncalibrated ranges.

## Washington, DC (protocol `ascent-valuation-validation-dc-1`)

Holdout: **2,254 assessor-qualified single-family and rowhouse sales recorded in the District of Columbia, 1 Oct 2025 – 30 Sep 2026.** None of these prices was available to the engine when it valued them. Source: the District's Tax System Property Sales, CAMA Residential and Address Points layers (CC BY 4.0), snapshotted 17 Oct 2026. Provenance and every record-removal count are in [`evidence/datasets/dc-residential-sales.provenance.json`](../evidence/datasets/dc-residential-sales.provenance.json).

| Configuration | Valued | MdAPE (95% CI) | Within ±10% (95% CI) | Within ±20% | COD | PRD |
| --- | --- | --- | --- | --- | --- | --- |
| **Ascent, DC-validated configuration** (primary) | 93.3% | **9.98%** (9.42–10.63) | 50.2% (48.1–52.2) | 77.6% | 13.9 | 1.029 |
| Ascent, shipped defaults (untuned) | 100% | 16.3% (15.3–17.2) | 33.5% | 58.8% | 21.3 | 1.112 |
| Baseline: median $/sqft of the same comps | 93.3% | 14.1% (13.3–14.6) | 36.7% | 65.1% | 19.2 | 1.045 |
| Baseline: trailing 180-day ZIP median | 99.9% | 22.7% (22.0–24.1) | 23.8% | 44.9% | 29.4 | 1.225 |

Paired bootstrap (1,000 seeded resamples), primary minus baseline MdAPE: **−4.1 points** against median $/sqft of the same comparables (95% CI −4.8 to −3.2; the engine is closer on 65.4% of sales) and **−12.4 points** against the ZIP median (CI −13.6 to −11.2; closer on 74.0%). The shipped defaults are *worse* than median $/sqft in DC (+1.7 points, CI +0.8 to +2.8), so the validated configuration matters here. The app offers it in one click for DC subjects.

**Validated configuration** (fitted only on Jul 2022 – Jun 2024 sales by paired-sales least squares; search filters chosen on Jul–Dec 2024): $233.79 per sq ft, $24,456 per bedroom, $40,058 per bathroom, $87,947 per condition grade, +0.207% per month, comparables within 0.5 mile, 90 days and a 1.35 size ratio.

Intervals: the observed adjusted-comp envelope contained 64.1% of sales. The **calibrated 80% interval contained 76.7%**. By evidence tier, it held 78.1% with 1–2 comparables (median error 13.2%), 79.2% with 3–9 (9.9%) and 71.2% with 10 or more (8.9%). Dense-evidence intervals ran narrow in the holdout year.

### Pre-registered criteria: 9 of 9 met, three of them narrowly

| | Criterion | Threshold | Measured | |
| --- | --- | --- | --- | --- |
| A1 | Holdout sales valued | ≥ 90% | 93.3% | met |
| A2 | Median absolute percentage error | ≤ 10% | 9.98% | met, **narrowly** |
| A3 | Share within ±10% | ≥ 50% | 50.2% | met, **narrowly** |
| A4 | Coefficient of dispersion (IAAO residential) | ≤ 15 | 13.9 | met |
| A5 | Price-related differential (IAAO) | 0.98–1.03 | 1.0295 | met, **narrowly** |
| A6 | Absolute median bias | ≤ 3% | 1.7% | met |
| A7 | Beats median $/sqft (paired 95% upper bound < 0) | < 0 | −3.2 pts | met |
| A8 | Beats trailing ZIP median | < 0 | −11.2 pts | met |
| A9 | Calibrated 80% interval coverage | 75–85% | 76.7% | met |

**Read the passes honestly.** The 95% intervals for median error (9.4–10.6%) and for the share within ±10% (48.1–52.2%) both include values on the wrong side of the bar. PRD sits 0.0005 under its limit. These are passes on this holdout, not passes with statistical margin. The pattern behind PRD is the same as in King County: homes above $1.5M were under-valued by a median 5.8% (MdAPE 13.6%), and the lowest-price quartile (under $682k) was over-valued by 3.8% (MdAPE 11.2%). Mid-market homes ($682k–$1.5M) were tightest, at 7.5–8.9% median error.

**Why DC is a meaningful local test.** This holdout uses the District's own deed records and assessor characteristics, and scores every qualified sale in the period. No sale was dropped for its price or for how well it was valued.

### DC record rules, decided before any valuation ran

From 45,425 recorded sales since January 2022 (counts in the provenance file):

- 16,849 not assessor-qualified (the District's arm's-length determination);
- 12,137 not single-family residential in CAMA (condominiums, commercial and similar);
- 1,981 bundled multi-parcel transfers (one deed price shared by several lots);
- 1,958 multi-unit buildings and 10 multi-building lots;
- 2,252 sales in or before a recorded build or remodel year (current assessor characteristics may postdate those sales);
- 62 with no address point; 2 missing characteristics.

That leaves 10,174 sales. The protocol's screening then removed 4 with implausible bedroom counts and 1 with no bathroom. Owner names were never downloaded.

## Second market: King County, WA (protocol `ascent-valuation-validation-1`)

Holdout: **6,975 recorded residential sales, King County, Washington, 1 Jan – 27 May 2015.** None of these prices was available to the engine when it valued them.

| Configuration | Valued | MdAPE (95% CI) | Within ±10% | Within ±20% | COD | PRD |
| --- | --- | --- | --- | --- | --- | --- |
| **Ascent, locally calibrated** (primary) | 95.5% | **10.6%** (10.3–10.9) | 47.8% | 75.1% | 15.2 | 1.040 |
| Ascent, shipped defaults (untuned) | 99.9% | 11.6% (11.2–11.9) | 44.1% | 72.2% | 16.5 | 1.061 |
| Baseline: median $/sqft of the same comps | 95.5% | 11.3% (11.0–11.6) | 45.2% | 74.1% | 15.7 | 1.037 |
| Baseline: trailing 180-day ZIP median | 100% | 20.2% (19.7–20.9) | 26.7% | 49.6% | 26.9 | 1.151 |

Paired bootstrap (1,000 seeded resamples), primary minus baseline MdAPE: **−0.70 points** against median $/sqft (95% CI −1.03 to −0.44; it wins on 54.9% of sales) and **−9.4 points** against the ZIP median (CI −10.0 to −8.7; it wins on 70.3%). The shipped defaults do *not* beat median $/sqft (+0.09 points, CI −0.31 to +0.42). Untuned assumptions add no measurable value over a plain $/sqft rule, and that is what local calibration fixes.

Intervals: the observed adjusted-comp envelope, which the product has always labeled "not a confidence interval", contained 71.7% of sales. The new **calibrated 80% interval contained 77.5%** (sparse evidence 81.4%, moderate 77.8%, dense 76.3%). Median error by evidence tier: 15.7% for 1–2 comparables, 10.9% for 3–9, 9.6% for 10 or more.

Every figure here is read from [`evidence/valuation-validation.json`](../evidence/valuation-validation.json).

### King County pre-registered criteria: 5 of 9 met

| | Criterion | Threshold | Measured | |
| --- | --- | --- | --- | --- |
| A1 | Holdout sales valued | ≥ 90% | 95.5% | met |
| A2 | Median absolute percentage error | ≤ 10% | 10.57% | **missed** |
| A3 | Share within ±10% | ≥ 50% | 47.8% | **missed** |
| A4 | Coefficient of dispersion (IAAO residential) | ≤ 15 | 15.25 | **missed** |
| A5 | Price-related differential (IAAO) | 0.98–1.03 | 1.040 | **missed** |
| A6 | Absolute median bias | ≤ 3% | 0.17% | met |
| A7 | Beats median $/sqft (paired 95% upper bound < 0) | < 0 | −0.44 pts | met |
| A8 | Beats trailing ZIP median | < 0 | −8.7 pts | met |
| A9 | Calibrated 80% interval coverage | 75–85% | 77.5% | met |

**What the misses mean.** Overall bias is negligible, but errors are not uniform across price bands. The PRD of 1.04 is regressivity: the lowest-price quartile is over-valued by a median 5.1%, and the top quartile is under-valued by 6.1%. A COD just above 15 and an MdAPE half a point above 10% follow from what the engine leaves out: view, waterfront, construction grade, lot and renovation. That is a deliberate scope limit of the production model, not a flaw in the test. The misses stand. The thresholds were fixed in code before the holdout was scored, they are covered by the protocol digest, and they will not be moved for this protocol.

## Why the test is hard to game, and what it is not

The data and the re-derivation are independent of Ascent; the people who ran the test are not. Until an outside reviewer attests a run (point 8), treat these results as reproducible internal validation, not third-party certification. The headline DC figures also apply only to the DC-calibrated settings: the general default settings had a 16.3% median error on the same holdout.

1. **Independent data.** Both datasets are government-recorded transactions that Ascent's authors did not create, select or edit, and no shipped default was tuned on either. DC comes directly from the District's open data portal under CC BY 4.0. King County is redistributed under CC0 by an unaffiliated university group (DOI [10.57967/hf/8015](https://doi.org/10.57967/hf/8015)). Fingerprints are in `evidence/datasets/*.provenance.json`.
2. **No look-ahead.** Each sale is valued at the end of the day *before* its recorded date. Only sales that closed strictly earlier qualify, and the home's own earlier sales are withheld. The subject record carries no price at all. A unit test plants a same-day, a later and a same-parcel sale at an absurd price and proves none of them is used.
3. **Disjoint, ordered windows.** Adjustment rates are fitted first (paired-sales least squares, Huber-reweighted, non-negative feature rates). Search radius and age are chosen next from an eight-option grid. The interval is calibrated after that (split-conformal, Mondrian by evidence tier). The holdout is scored once. DC: fit Jul 2022 – Jun 2024, select Jul – Dec 2024, calibrate Jan – Sep 2025, test Oct 2025 – Sep 2026. King County: May – Aug 2014, Sep – Oct 2014, Nov – Dec 2014, Jan – May 2015.
4. **Pre-registration.** Each market's protocol (windows, screening, seeds, acceptance thresholds) is one constant in `src/lib/valuation-validation.ts`, and its SHA-256 digest is recorded in the report. Changing any threshold changes the digest, and verification fails. The DC protocol was declared after King County's result was public, so it deliberately reuses King County's method and all nine bars unchanged; a unit test enforces that. Its windows were set from monthly sale volume alone, before any DC valuation was run. The King County protocol is frozen, and a unit test pins its published digest.
5. **Unchanged production engine.** Every estimate comes from the same `calculateCma` the app runs. A frozen engine fingerprint (`fnv1a32-49f0c98b`) is part of both reports. The running app re-checks it, so a later engine change cannot silently inherit these accuracy claims.
6. **Screening is about record quality, never outcome.** No sale is removed for its price or its error. DC's record rules use the District's own qualification flag and data-integrity conditions, listed above. King County removed 17 records with 0 or more than 12 bedrooms, or 0 bathrooms; its most expensive record ($7.7M) is kept like every other.
7. **Separate re-derivation.** `verifyValidationReport` re-parses the published per-sale samples and recomputes MdAPE, PPE10, COD, PRD and coverage with code that shares nothing with the metric functions. It also checks every digest (including that the embedded protocol is the one this build declares) and every pass/fail verdict.
8. **Third-party attestation.** A reviewer who reproduces a run can sign its exact report digest with their own Ed25519 key. Signatures are stored in `evidence/valuation-attestations.json` and checked on every `--check`. **No third-party attestation has been recorded yet.** Until one is, the claims are reproducible but not yet externally attested.

## Reproduce it

```bash
npm run validate:valuation -- --check                 # seconds: both markets' digests, samples, re-derived metrics
npm run validate:valuation -- --verify --market dc    # ~1 minute: full DC re-run, must match byte for byte
npm run validate:valuation -- --verify --market king-county   # ~3 minutes
python3 -I scripts/datasets/fetch-dc-sales.py out.csv.gz out.json   # fresh DC snapshot (new fingerprint: the source is live)
```

To attest as a reviewer: `openssl genpkey -algorithm ed25519 -out reviewer.pem`, then `npm run validate:valuation -- --attest --market dc --key reviewer.pem --reviewer "Name, Organization"`. Publish your public key somewhere you control so others can tie it to you.

To validate another market, add a recorded-sales CSV, then declare a new protocol (new id, dataset fingerprint, missing features and windows) *before* running it. Never edit an existing protocol after its holdout has been scored. [Maryland’s pooled Montgomery/Prince George’s test](maryland-public-records.md) follows the same nine bars with absent room adjustments disabled. Virginia awaits permission. DC condos are available with unmeasured accuracy and no calibrated range.

## Limitations

- **Markets and periods.** DC houses (Oct 2025 – Sep 2026), King County (Jan – May 2015), and the separately published pooled Montgomery/Prince George’s model (Jul 2025 – Jun 2026). Maryland displays an uncalibrated envelope pending separate county validation; its pooled result does not validate all Maryland. Virginia and DC condos have no accuracy validation. Condo markers prevent inheritance of the DC house interval. Elsewhere a calibrated interval requires the subject’s actual tested market, property cohort and exact configuration.
- **DC characteristics are current, not as of each sale.** Sales up to a recorded build or remodel year are removed, but unrecorded renovations remain and add error.
- **Narrow DC passes.** Three DC criteria pass by margins smaller than their sampling uncertainty (see above). A future DC holdout could miss them.
- **Calibration drift.** Coverage ran slightly under target in both markets (DC 76.7%, King County 77.5%), most for dense evidence in DC (71.2%). Exchangeability is an assumption, not a guarantee.
- A home's own prior sale is withheld here. That isolates comparable-sales skill, but it differs from a real workflow, where a professional may use it.
- **One correctness fix after King County's first run:** binary rounding in the conformal order-statistic index. A unit test caught it, and it changes no published figure; the re-run reproduced report `sha256-11e488db…` exactly. One verifier hardening during the DC work: the protocol check now also compares the protocol object embedded in a report. No report changed.

## Production safeguards

`src/lib/valuation-safeguards.ts` turns the evidence into operating controls. None of them changes an estimate. Each decides whether a professional may approve the estimate unaided, must acknowledge named concerns first, or cannot release it at all.

**Release gate** (policy `ascent-valuation-safeguards-1`). It runs when a CMA is saved and runs again at approval time.

| Check | Effect | Rule |
| --- | --- | --- |
| Operator release switch | **block** | `ASCENT_VALUATION_RELEASE=disabled` (optional `ASCENT_VALUATION_RELEASE_REASON`) pauses approval everywhere; calculation stays available |
| Result is internally consistent | **block** | Positive, finite estimate inside its own range, at least one comparable |
| Engine matches validated build | review | Runtime fingerprint must equal the benchmark's |
| Enough comparable sales | review | ≥ 3 (holdout error is 15.7% with 1–2) |
| Adjusted sales agree | review | Weighted coefficient of variation ≤ 15% |
| Adjustments stay proportionate | review | Weighted gross adjustment ≤ 25% of sale price |
| Recent evidence | review | Newest comparable ≤ 120 days old |
| Agrees with a simple independent check | review | Within 15% of median $/sqft × subject sqft |
| No anomalous sales | review | No comparable more than 3.5 robust (MAD) deviations from median $/sqft |
| Measured accuracy reference | context | Tier-matched holdout error for the subject's own validated market. A DC subject analysed on the exact DC-validated configuration also gets its calibrated 80% interval. An unvalidated location is told so plainly |

Approval of a `review` result requires `acknowledgeReview: true`. The approver's id, the gate decision and the acknowledged check ids are stored on the CMA and written to the hash-linked audit trail. A `withhold` result cannot be approved.

**Accuracy drift monitor.** `assessAccuracyDrift` compares a workspace's own frozen-forecast outcomes with the DC benchmark once at least 30 exist. It flags degradation when median error is both more than double the benchmark and at least 5 points above it, or when median bias exceeds ±5%. The status appears in the Outcomes lab.

**Validated configuration in the studio.** For a subject in a validated market, the pricing studio offers "Use Washington, DC-validated" (or the King County equivalent). It loads the exact fitted rates and search filters, and analyses saved on them carry the calibrated interval. Editing any value leaves the validated configuration, and the studio says so.

**Health endpoint.** `GET /api/health` runs the engine self-test, reads the release switch, validation verdict, origin configuration and a 2-second-bounded storage probe. It returns `ok`, `degraded` (HTTP 200) or `unavailable` (HTTP 503). It never includes connection strings, keys, tenant identifiers or dependency error text, and results are cached for 10 seconds per instance so unauthenticated probes cannot load the database.
