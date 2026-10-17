# Valuation accuracy validation and production safeguards

Most residential pricing tools publish no error rate. Ascent publishes one, measured out of sample on recorded public sales, against thresholds set before scoring. The result includes the criteria it missed, and anyone can reproduce it byte for byte.

## Headline result (protocol `ascent-valuation-validation-1`)

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

### Pre-registered criteria: 5 of 9 met

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

## Why this counts as independent validation

1. **Independent data.** The records are government-recorded transactions, redistributed under CC0 by an unaffiliated university group (DOI [10.57967/hf/8015](https://doi.org/10.57967/hf/8015)). Ascent's authors did not create, select or edit any of them. No shipped default was tuned on them. Provenance and fingerprints are in [`evidence/datasets/king-county-2014-2015.provenance.json`](../evidence/datasets/king-county-2014-2015.provenance.json).
2. **No look-ahead.** Each sale is valued at the end of the day *before* its recorded date. Only sales that closed strictly earlier qualify, and the home's own earlier sales are withheld. The subject record carries no price at all. A unit test plants a same-day, a later and a same-parcel sale at an absurd price and proves none of them is used.
3. **Disjoint, ordered windows.** Adjustment rates are fitted on May–Aug 2014 (paired-sales least squares, Huber-reweighted, non-negative feature rates). Search radius and age are chosen on Sep–Oct 2014 from an eight-option grid. The interval is calibrated on Nov–Dec 2014 (split-conformal, Mondrian by evidence tier). Jan–May 2015 is scored once.
4. **Pre-registration.** Protocol, windows, screening rules, seeds and acceptance thresholds are one constant (`validationProtocol` in `src/lib/valuation-validation.ts`). Its SHA-256 digest is recorded in the report. Changing any threshold changes the digest, and verification fails.
5. **Unchanged production engine.** Every estimate comes from the same `calculateCma` the app runs. A frozen engine fingerprint (`fnv1a32-49f0c98b`) is part of the report. The running app re-checks it, so a later engine change cannot silently inherit this accuracy claim.
6. **Screening is about record quality, never outcome.** 17 records with 0 or more than 12 bedrooms, or 0 bathrooms, are removed and counted in the report. No sale is removed for its price or its error; the most expensive record in the file ($7.7M) is kept like every other.
7. **Separate re-derivation.** `verifyValidationReport` re-parses the published per-sale samples and recomputes MdAPE, PPE10, COD, PRD and coverage with code that shares nothing with the metric functions. It also checks every digest and every pass/fail verdict.
8. **Third-party attestation.** A reviewer who reproduces the run can sign the exact report digest with their own Ed25519 key. Signatures are stored in `evidence/valuation-attestations.json` and checked on every `--check`. **No third-party attestation has been recorded yet.** Until one is, the claim is reproducible but not yet externally attested.

## Reproduce it

```bash
npm run validate:valuation -- --check    # seconds: digests, samples, re-derived metrics, attestations
npm run validate:valuation -- --verify   # ~3 minutes: full re-run, must match byte for byte
npm run validate:valuation               # regenerate evidence (only after an intentional engine change)
```

To attest as a reviewer: `openssl genpkey -algorithm ed25519 -out reviewer.pem`, then `npm run validate:valuation -- --attest --key reviewer.pem --reviewer "Name, Organization"`. Publish your public key somewhere you control so others can tie it to you.

To validate another market, add a CC0 or licensed recorded-sales CSV in the same columns, then declare a new protocol (new id, dataset fingerprint and windows) *before* running it. Never edit an existing protocol after its holdout has been scored.

## Limitations

- **One market and one period.** This says nothing about accuracy in DC, Austin or any other market, or in other years. In the app, the calibrated interval is applied only to the validation market. Elsewhere the range remains an uncalibrated envelope, and the release gate says so.
- Recorded prices are not screened for non-arm's-length transfers or concessions.
- Calibration coverage drifted slightly low (77.5% against an 80% target) as prices rose through spring 2015. Exchangeability is an assumption, not a guarantee.
- A home's own prior sale is withheld here. That isolates comparable-sales skill, but it differs from a real workflow, where a professional may use it.
- One correctness fix was made after the first run: binary rounding in the conformal order-statistic index. A unit test caught it. It changes no published figure; the re-run reproduced report `sha256-11e488db…` exactly.

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
| Measured accuracy reference | context | Tier-matched holdout error and interval, labeled with the market it was measured in |

Approval of a `review` result requires `acknowledgeReview: true`. The approver's id, the gate decision and the acknowledged check ids are stored on the CMA and written to the hash-linked audit trail. A `withhold` result cannot be approved.

**Accuracy drift monitor.** `assessAccuracyDrift` compares a workspace's own frozen-forecast outcomes with the benchmark once at least 30 exist. It flags degradation when median error is both more than double the benchmark and at least 5 points above it, or when median bias exceeds ±5%. The status appears in the Outcomes lab.

**Health endpoint.** `GET /api/health` runs the engine self-test, reads the release switch, validation verdict, origin configuration and a 2-second-bounded storage probe. It returns `ok`, `degraded` (HTTP 200) or `unavailable` (HTTP 503). It never includes connection strings, keys, tenant identifiers or dependency error text, and results are cached for 10 seconds per instance so unauthenticated probes cannot load the database.
