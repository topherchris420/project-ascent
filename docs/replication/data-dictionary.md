# Data dictionary for replication

Every file an outside researcher needs to reproduce the published validation studies. All are in the repository; nothing requires an account or a key. Fingerprints are SHA-256 of the decompressed text, recorded in the provenance file beside each dataset and in each report.

## Studies and their files

| Protocol | Cohort and holdout | Report | Per-sale samples | Dataset |
| --- | --- | --- | --- | --- |
| `ascent-valuation-validation-dc-1` | DC single-family and rowhouses, Oct 2025 – Sep 2026 | `evidence/valuation-validation-dc.json` | `evidence/valuation-validation-dc-samples.csv.gz` | `evidence/datasets/dc-residential-sales.csv.gz` |
| `ascent-valuation-validation-1` | King County, WA, Jan – May 2015 | `evidence/valuation-validation.json` | `evidence/valuation-validation-samples.csv.gz` | `evidence/datasets/king-county-2014-2015.csv.gz` |
| `ascent-valuation-validation-maryland-1` | Montgomery and Prince George’s, Jul 2025 – Jun 2026 (original, failed) | `evidence/valuation-validation-maryland.json` | `evidence/valuation-validation-maryland-samples.csv.gz` | `evidence/datasets/maryland-sales.csv.gz` |
| `ascent-valuation-validation-maryland-2` | Same counties, revised model, Jul – Sep 2026 | `evidence/valuation-validation-maryland-v2.json` | `evidence/valuation-validation-maryland-v2-samples.csv.gz` | `evidence/datasets/maryland-sales.csv.gz` |
| `ascent-valuation-validation-dc-condos-1` | DC condominium units, Oct 2025 – Sep 2026 | `evidence/valuation-validation-dc-condos.json` | `evidence/valuation-validation-dc-condos-samples.csv.gz` | `src/datasets/dc-condos/dc-condo-sales.csv.gz` |
| `ascent-valuation-validation-maryland-external-1` | Anne Arundel, Baltimore County, Frederick, Howard, Jul 2025 – Jun 2026 (registered before download) | `evidence/valuation-validation-maryland-external.json` | `evidence/valuation-validation-maryland-external-samples.csv.gz` | `evidence/datasets/maryland-external-sales.csv.gz` |

The DC and Maryland sales files under `src/datasets/` are byte-identical copies the app reads; their fingerprints equal the evidence copies.

## Validation dataset CSV

One row per recorded sale, in the order the study reads them.

| Column | Meaning |
| --- | --- |
| `sale_id` | Unique sale identifier: market prefix, parcel and date |
| `parcel_id` | The property; sales of the same parcel share it, and a home’s own sales are never its comparables |
| `sold_on` | Recorded sale date, `YYYY-MM-DD` (UTC) |
| `price` | Recorded consideration in US dollars, positive |
| `beds`, `baths` | Bedrooms; bathrooms with each half bath as 0.5. Maryland files use 0 as a neutral placeholder: the source has no room counts and both room adjustments are disabled |
| `sqft` | Living area in square feet (DC: gross building area; condos: living area; Maryland: the state’s structure area) |
| `condition` | DC houses: assessor condition 1 Poor – 6 Excellent. King County: the county’s 1–5 condition. Maryland: assessor construction-quality grade 1 Low – 9 Superior, which is not interior condition. Absent from the condo file |
| `lat`, `lng` | WGS84 coordinates. DC: mean of the lot’s address points; condos: the building address; King County: rounded by its publisher |
| `zip` | Five-digit ZIP code, used by the ZIP-median baseline |

Record rules (which sales the importer kept and why, with counts) are in each provenance file: `removedBeforeValidation` (DC), `removedSales` and `removedProperties` (Maryland, condos).

## Per-sale samples CSV

One row per screened holdout sale, in the order valued. Everything in a report’s `holdout` section can be recomputed from this file and the report’s `protocol`.

| Column | Meaning |
| --- | --- |
| `sale_id`, `parcel_id`, `sold_on` | As in the dataset |
| `actual` | The recorded price the estimates are scored against |
| `comps` | Comparable sales the primary configuration used; sets the evidence tier |
| `estimate:shipped-defaults` | Engine estimate with general default settings; empty when the engine abstained |
| `estimate:locally-calibrated` | The primary configuration: fitted rates and selected filters |
| `estimate:baseline-median-ppsf` | Median $/sqft of the primary configuration’s eligible comparables × subject sqft |
| `estimate:baseline-zip-median` | Median recorded price in the subject’s ZIP over the prior 180 days |
| `envelope_low`, `envelope_high` | Lowest and highest adjusted comparable of the primary estimate (not a confidence interval) |
| `interval_low`, `interval_high`, `interval_tier` | The calibrated 80% interval and the evidence tier it came from (`sparse` 1–2 comparables, `moderate` 3–9, `dense` 10+) |

All amounts are whole dollars.

## Report JSON (`ascent-valuation-validation-report-1`)

| Field | Contents |
| --- | --- |
| `protocol`, `protocolDigest` | The complete protocol: windows, screening, fitting, selection grid, interval method, bootstrap seed, acceptance thresholds |
| `dataset` | Dataset fingerprint, rows read, rows kept by screening, removals by rule, sales per window |
| `engine` | Engine version and fingerprint |
| `fitted` | Fitted rates, number of fitting pairs, features clamped to zero |
| `selection` | Every grid option’s valued share and MdAPE on the selection window, and the option chosen |
| `variants` | The four configurations scored |
| `calibration` | Per-tier calibration counts and log-ratio bounds, and whether a tier borrowed pooled bounds |
| `holdout` | Per-variant metrics with bootstrap intervals, common-set metrics, paired comparisons, interval coverage and widths overall and by tier, and price quartiles |
| `acceptance`, `accepted` | Each criterion’s value, thresholds, verdict and stated basis; the overall verdict |
| `samples` | The samples file, its fingerprint and row count |
| `limitations` | The study’s stated limitations |
| `reportDigest` | Digest of everything above, as described in the [method specification](method-specification.md#11-digests-and-fingerprints) |

## Supplementary files

| File | Contents |
| --- | --- |
| `evidence/maryland-external-protocol-registration.json` | The external study’s registration, pushed before its data was downloaded: protocol template, supplement plan, fetch and analysis file digests, the only prior query |
| `evidence/maryland-external-data-lock.json` | Dataset fingerprints and per-window counts, committed before any valuation |
| `evidence/valuation-maryland-external-supplement.json` and `-samples.csv.gz` | Registered supplement: verdict-policy study (columns `verdict`, `review`), county slices, vertical-equity candidates and the transport of the shipped settings (`transport_*`) |
| `evidence/valuation-maryland-v2-sensitivity.json` and `-samples.csv.gz` | Maryland v2 re-run on all positive consideration |
| `evidence/valuation-maryland-counties.json` | County slices of the original Maryland study |
| `evidence/datasets/maryland-external-parcel-counties.csv.gz` | Parcel-to-county map for the external slices (`parcel_id`, `county`) |
| `evidence/*-protocol-registration.json` | Pre-scoring registrations for Maryland, Maryland v2 and DC condos |
| `evidence/valuation-attestations.json` | Per-report Ed25519 attestations (empty until a reviewer signs one) |
| `evidence/replications/` | Signed replication records and their assessments |
