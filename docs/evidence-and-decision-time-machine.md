# Evidence review and Decision Time Machine

Ascent aims to make consequential real estate work **explainable, reproducible and challengeable**, not merely to accumulate AI features.

## Evidence fitness (Pricing studio)

The evidence review panel uses the **same authorized CMA inputs** as the pricing studio. It discloses:
- count of eligible recorded closed sales and *effective* count after unequal weights;
- share held by the single dominant sale;
- adjusted comparable range divided by the weighted estimate;
- large gross adjustments, missing/review-required condition, sparse comps and missing provenance;
- synthetic evidence, unmodeled features and the fact that the observed range is **not calibrated**.

The 3-sales, effective count of 2, 60% concentration, 20% spread and 25% gross-adjustment checks are **explainable analyst review heuristics**, not fitted cutoffs, confidence probabilities, verified completeness or professional certification. The panel does not grant source access or introduce a new provider request. It must be fed by the same server-enforced and read-scoped records as the valuation.

## Decision Time Machine

On a property with a saved CMA, select a previous saved decision in Pricing studio. The panel compares that frozen result against **the current calculation for the same subject**, showing:
- estimate and envelope movements;
- eligible comparables entering/leaving the calculation;
- changed source facts on retained comparable IDs, if both analyses archived raw inputs;
- changed analyst assumptions, subject valuation facts, calculation version and as-of date;
- whether the complete calculation checksum is identical.

A difference in figures is **not** proof of a market change. It might result from analyst assumptions, newly available or corrected observations, or model code. A matching short checksum proves computation agreement under the checksum algorithm, not cryptographic authenticity. Run **Replay** on the archived snapshot to independently inspect whether it still recomputes. Missing historical inputs remain explicitly unknown; the UI does not guess why an older decision differs.

Source-use permissions apply before any comparison or report. A revoked or disallowed saved CMA must not be exposed through this screen even if archived locally.

## Competitive evaluation gates

Before advertising accuracy superiority over other software, independently recruit qualified agents, obtain lawful comparable datasets and freeze a paired time-split protocol. Compare valuation baseline accuracy (MAE/median absolute error), evidence comprehension, task completion, correction effort, fairness review, 95th-percentile latency, source freshness and provider total cost. Keep withheld and unsold cases in the denominator. Test across multiple jurisdictions and price bands. Declare all thresholds *before* observing holdout outcomes.

This release does **not** include county/MLS credentials, national listing coverage, predictive sale probabilities, third-party CRM synchronization, hosted operational acceptance or independent appraisal-grade validation. Such claims would require rights, prospective measurement, deployment operations and professional governance.
