# Your Home Decision Brief

The brief is the first thing a homeowner sees after choosing a property in any studio: DC houses, Maryland homes, DC condos and the fictional sample. It answers seven questions in plain language and labels every figure with where it came from. It is built by `buildHomeDecisionBrief` (`src/lib/home-decision-brief.ts`, version `ascent-home-decision-brief-1`) and rendered by `HomeDecisionBriefPanel` (`src/components/home-decision-brief.tsx`). The professional evidence tables, settings and workbench follow it on the same page.

## Implementation map · October 21, 2026

The starting revision was `c4d316b` (PR #11). The audit read the studios, the frozen valuation engine and release gate, the homeowner finance engine, the passport and report, the validation framework and its published evidence. Everything below reuses those modules; nothing was rebuilt.

| Need | Available before | Extended | Still missing or blocked |
| --- | --- | --- | --- |
| One place to start | Pricing studio summary, decision drivers, seller plan, workbench | The brief, placed directly after the property summary | — |
| What the evidence suggests about value | Frozen `calculateCma` (fingerprint `fnv1a32-49f0c98b`), release gate, accuracy references | Verdict policy below; the calibrated range is shown only for the unmodified validated DC configuration | Maryland and condo calibrated intervals stay withheld: their studies did not pass every criterion |
| Supporting sales | Evidence table with weights and adjustments | The three most influential sales with record and calculation traces; counts of sales the rules ruled out and the homeowner excluded | Live listings, concessions |
| Reliability and currency | Release-gate checks, source observation dates | Plain-language checks, tier-matched holdout error where a study exists, collection dates and licenses | Recording-time availability of each sale |
| Missing facts | Missing-field indicators in exports | Market-specific facts (room counts in Maryland, condo floor, view, parking and HOA dues, interior condition, concessions, sales since the snapshot) with how to obtain each | — |
| What each choice means financially | `ascent-homeowner-finance-2`: six choices, payment and renovation break-evens | Exact one-input sensitivity, five break-evens solved by re-running the engine, holding-period profile (`src/lib/finance-sensitivity.ts`) | Taxes, replacement housing, inflation and loan qualification are excluded and say so |
| What moves each outcome | Valuation decision drivers | Financial drivers per choice; valuation settings that differ from the market's reference configuration | — |
| What to obtain before deciding | Seller plan | Up to eight prioritized next steps, each naming what it affects | — |
| A portable record | Evidence Passport, readable report, Decision Time Machine | The brief as a research record with an executive summary, under the existing privacy filter | Signed or authenticated exports, synchronization |
| Ask Ascent | Deterministic finance questions | Value and evidence questions answered only from the brief's own figures, with references | External model synthesis stays blocked pending independent review |
| Measured reliability | Five published studies, `--check` / `--verify`, attestations | An external Maryland study registered before its data was downloaded. It failed acceptance in four other counties, and its supplement supports the verdict policy ([results](valuation-validation.md#external-maryland-validation-four-counties-protocol-ascent-valuation-validation-maryland-external-1)) | Third-party attestation, prospective outcomes |
| Comprehension | — | [Usability protocol](usability-protocol.md) | Not yet run; no participants and no results |

## The seven questions

1. **What does the evidence suggest about value?** The verdict, the estimate when one is stated, the observed range of adjusted sales (never called a confidence interval), the calibrated range when it applies, and every reason the statement is limited or declined.
2. **Which sales support it?** The most influential recorded sales with their recorded price, adjusted price, weight, distance, age and largest adjustment.
3. **How reliable and current is the evidence?** The release-gate checks in plain words, the newest sale's age, the snapshot's collection dates and licenses, and the published holdout error for similar evidence where a study covers the market. The practice sample never borrows a real market's accuracy.
4. **Which facts about the home are missing?** What the records do not contain, why it matters and how to obtain it.
5. **What would each choice mean financially?** Net proceeds at closing, initial monthly cash flow, cash required, end equity and net position at the horizon for each computable choice, from the unchanged finance engine and the homeowner's own inputs. Choices are never ranked.
6. **Which assumptions move each outcome most?** Valuation drivers, fragile filters, the top financial drivers per choice, and which valuation settings the homeowner changed from the reference.
7. **What should you get before deciding?** Prioritized steps such as an appraisal when no value is stated, a payoff statement, a condo resale package, an inspection, quotes and rents.

Each figure carries traces of three kinds: **Record** (a recorded sale or public-record field), **Assumption** (a setting, the homeowner's input or a published study's fitted value) and **Calculation** (a deterministic engine output). References name the valuation and finance calculation hashes, the study digest and the snapshot fingerprints. The brief's checksum covers all of it.

## Verdict policy `ascent-brief-verdict-1`

Implemented once in `src/lib/valuation-verdict.ts`, shared by the brief and the external study that measures it.

- **Value not stated** when fewer than three eligible recorded sales remain (the release gate's own minimum) or the gate withholds the result. The headline reads "Not stated", the workbench stops treating the estimate as a value or sale price, the pricing strategy section labels its positions as working figures for a professional to review, not supported prices, and the readable report prints "Not stated". The sales and arithmetic stay visible.
- **Estimate with stated limits** when any gate check needs review (agreement of adjusted sales, size of adjustments, recency, the price-per-square-foot cross-check, outliers, engine integrity), or the data is fictional, the homeowner entered or excluded sales, rated condition themselves, edited settings, or the market's published study failed or does not exist.
- **Supported by the evidence** otherwise.

**Measured on untouched sales.** The external Maryland study registered two hypotheses about this policy before its data was downloaded, then assessed 18,337 valued holdout sales from four counties Ascent does not serve, exactly as the brief does. Both were supported. Sales whose value would not be stated had 16.76% median error against 12.02% for stated values (+4.74 points, 95% CI +3.10 to +5.57). Limited estimates had 13.10% against 8.98% for supported ones (+4.12 points, CI +3.64 to +4.49). Supported estimates were 21.6% of valued sales. That subgroup is descriptive, not an accuracy claim for any home, and the same study failed overall acceptance ([full results](valuation-validation.md#registered-supplement-ascent-valuation-supplement-maryland-external-1)). The outlier check fired often without separating accuracy; any change to the policy needs its own registration and an untouched holdout.

## Financial depth

`financeSensitivity` steps each input the homeowner actually entered by a disclosed amount (for example ±5% for prices, ±1 point for the mortgage rate, ±3 months for timing) and re-runs `evaluateDecision`, which is `compareDecisions`' own arithmetic without hashing. Unknown inputs are never stepped or guessed. `financeBreakEvens` solves five thresholds by bisection on the engine itself, re-running both choices at each trial value: the sale price at which selling matches continuing to own, the annual property change at which owning matches selling, the rent at which renting matches selling, the vacancy at which rental cash flow reaches zero, and the refinance rate at which refinancing matches keeping the loan. A threshold that needs missing inputs or lies outside a plausible range says so. `holdingPeriodProfile` re-runs every choice at 1, 3, 5, 10 and 20 years.

The Compare panel shows all three under the selected choice. What the comparison leaves out is stated above its table, not only in the method notes.

## Passport and report

`briefRecord` in `src/lib/homeowner-passport.ts` adds the brief to the Evidence Passport: executive summary, uncertainty, selected sales, sales ruled out and excluded, changed settings, reliability checks, missing facts and next steps. A public (default) record is rebuilt without the asking price, payoff or financial inputs, omits homeowner-written exclusion reasons, and omits the checksum because it covers private inputs. A test proves the public record cannot depend on them. The readable HTML report opens with the executive summary.

## Limits

- The brief explains deterministic calculations over a static public-record snapshot. It is not an appraisal, a live market feed, a forecast or advice, and it never ranks household choices.
- Verdicts describe evidence quality under fixed rules; a supported verdict is not a guarantee of accuracy for an individual home.
- Sensitivity steps are review checks, not plausible ranges or probabilities.
- No language model writes or changes any figure in the brief.
