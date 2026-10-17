# Pricing Studio: implementation and boundaries

The account-free `/demo` route is a complete practice pricing workflow. It does not depend on account infrastructure, query a property provider or call a model. The subject and all authored sales are explicitly fictional; sales a visitor adds are labeled as unverified user entries. It shares Ascent's deterministic engine, source labels, comparable inspector, range chart, input-sensitivity analysis, seller plan, contextual evidence answers, arithmetic comparison and script-free report renderer with the professional workspace.

## Working path

The studio is organized as four steps, each a page anchor with progress state.

1. **Review the evidence.** *Where the evidence sits* plots every adjusted sale on one price axis (marker size follows weight), with the weighted estimate, the observed adjusted range and the asking price under discussion. Selecting a sale on the chart opens it in the comparable inspector: sold versus adjusted value, dates, distance, living area, signed adjustments with formulas, weight formula and source metadata.
2. **Choose a strategy.** Conservative, balanced and aggressive anchors with explicit cost assumptions (negotiable commission, closing costs, concessions, payoff). *What each move nets the seller* compares the three anchors, the selected price, a reduction to the next search threshold below it and the same amount offered as a credit. A credit nets exactly `amount × (commission % + closing %)` less than an equal reduction, because percentage costs still apply to the higher contract price; the studio states that figure. A threshold note says when a price sits just above or just under a round-number search filter.
3. **Challenge the decision.** *Which input moves this price most?* recalculates the same frozen sales with one input changed at a time (adjustment rates ±20%, trend ±0.5 points per month, subject condition ±1 point, eligibility filters halved and doubled) and ranks inputs by the resulting change. A filter that leaves no eligible sale is reported as such, never as zero change. The visitor can then change the subject's condition rating, adjustment rates, the trend (entered as % per month) or eligibility filters, exclude a sale with a reason, or add up to three sales they know about. The original calculation stays frozen, and the arithmetic bridge reconciles each sale's contribution to the difference, including rounding.
4. **Open your report.** The HTML report carries the selected price, costs, payoff, the subject's condition rating when it is modeled, exclusion reasons, archived inputs, every comparable's source label and kind, and the source list. The JSON export replays. Both remain watermarked drafts.

Practice changes save in versioned device storage. Drafts saved before the condition and practice-entry fields existed still restore. Invalid older storage is explained, storage failures stay visible, and export offers an independent copy. This is not an authenticated backup or device synchronization. Zero eligible sales produces an actionable recovery state and removes the report action.

The public report endpoint validates bounded scenario inputs. It accepts the known fixture IDs plus at most three practice entries with bounded fields (address label up to 80 characters, price, date, beds, half-step baths, living area, condition 1–5, distance up to 25 miles). It cannot read a tenant, a provider cache or an arbitrary supplied property record. A practice entry has no geocoded address: its entered distance places it due north of the subject purely so the engine's distance weighting uses that distance. No map position or real parcel is implied, and the report says the location is an entered distance.

## Existing workspace

The authenticated Pricing Studio uses the same components on permission-scoped valuation evidence and is organized into four sections with a sticky section navigation:

| Section | Contents |
| --- | --- |
| Decide | Valuation card (estimate, observed range, eligible and set-aside sales, evidence date), asking-price scenario, pricing narration, seller plan |
| Evidence | Range chart linked to the comparable inspector, contextual pricing questions, evidence fitness |
| Challenge | Input sensitivity on the current selection, the comparable table with manual inclusion, the adjustment model and cautions |
| History | Decision Time Machine with per-sale arithmetic attribution against a saved CMA, saved snapshots with Replay, approval, client report and presentation; an explanatory empty state when nothing is saved yet |

The previous decorative range bar in the valuation card, which plotted no data, is replaced by real counts. The trend input reads as a percentage per month; the engine still stores the decimal rate, so saved snapshots are unaffected. The balanced anchor is labeled "Balanced" everywhere it is displayed; the engine key remains `moderate` so existing snapshots reproduce.

Navigation stores the task and selected property in the URL, supports Back/Forward, and restores the task after refresh. Signing out clears these selections and invalidates pending session responses. IDs in a URL never authorize access: all server tenant/source checks remain in force.

## Exact arithmetic

**Comparison bridge.** For a retained sale, adjusted-value effect is `old weight × (new adjusted value − old adjusted value)`. Weight effect is `(new weight − old weight) × (new adjusted value − previous estimate)`. Added sales contribute `new weight × (new adjusted value − previous estimate)`; removed sales contribute the negative old contribution around the same reference. Weights on each decision sum to one, so reference terms cancel. Contributions plus the explicit rounding reconciliation equal the difference between rounded estimates. This is an arithmetic decomposition, not an attribution of market causation.

**Input sensitivity.** Each row is an exact recalculation with one input changed and every other input, the frozen comparable set (including manual exclusions) and the analysis date held fixed (`decision-drivers.ts`). The steps are disclosed review steps, not an estimate of market uncertainty, and they do not say which setting is correct. A disabled condition adjustment stays disabled; no condition score is invented to test it.

**Seller plan.** Every row is `price × (1 − (commission % + closing %)) − concessions − credit`, assuming a sale at that price (`seller-plan.ts`). Search thresholds follow a disclosed round-number convention ($25,000 steps below $1M, $50,000 to $2M, $100,000 above), not measured buyer behavior. Nothing in the plan predicts buyer response, timing, appraisal outcome or which move will be needed; loan-program and appraisal limits on credits are not modeled.

Evidence Fitness flags missing or invalid source observation dates, observations after the analysis date and observations over 30 days old. The 30-day trigger is a disclosed analyst review heuristic, not a provider freshness contract. Current permission enforcement remains a server responsibility; this review panel does not grant rights or show a calibrated accuracy score.

## Deliberate limits

The sample passport identifies fictional facts, analyst assumptions, user entries and absent ownership, tax, permit, transfer-chain, concessions, listing-history and complete-inventory evidence. It does not fabricate those datasets or map fictional coordinates onto a real parcel. No source license, provider budget, external AI policy or model spending cap was changed. Asking-price narration does not assert faster attention or longer market time from scenario arithmetic; absent listing DOM is explicitly unknown. Historical asking-position outcomes (days on market or under-contract rates by how far a listing asked above its estimate) require licensed listing-chain data and are not shown.

Authenticated manual selections remain part of saved calculation inputs and the existing audit; the free-text exclusion-rationale editor and practice entries are available in the **public practice slice**, not a new licensed-source note or manual-comparable permission system. Professional report branding, dedicated accessible PDF rendering, verified local adjustment coefficients, new public-record integrations and operational hosted accounts remain separate work.

Run `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, then `node scripts/verify-public-production.mjs`. See the dated verification results for what actually ran and the independent comparison protocol for outcomes that remain unmeasured.
