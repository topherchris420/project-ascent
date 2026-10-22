# Homeowner decision workbench

## October 22: guided financial setup

Compare Decisions now starts with a choice selector and an actionable input checklist. Each item opens the financial assumptions and focuses its field, including on mobile and with a keyboard. The checklist uses the existing engine's missing-input results, so a zero mortgage balance is distinct from an unknown balance, and a sale outside the chosen horizon requests a timing review. Optional cash reserves remain explicitly unknown even when a scenario can be calculated.

Fields identify validation errors inline and link to them from an error summary. Recovery also works from Ask Ascent or Reports & History, and the selected decision survives invalid inputs and panel changes. Readiness only means the calculation has the inputs it needs; it does not verify the assumptions or recommend a choice. Financial formulas, storage formats and data sources are unchanged.

Verification: all 407 unit tests, TypeScript checking and the production build pass. Focused browser coverage checks the guided flow at 1440px and 390px, keyboard focus, zero versus unknown, timeline conflicts, error recovery, and accessibility with axe.

## Repository audit and implementation map · October 18, 2026

The starting revision is `a574e4c` on master. The audit inventoried all tracked application, test, documentation, migration, dataset and historical evidence files; inspected the public routes, authenticated API boundaries, calculation modules and provider contracts; and read the README, AGENTS, engineering, product, valuation, evidence-history and production-readiness material. Historical reports and datasets remain immutable inputs to this work.

| Need | Existing implementation | Extension |
| --- | --- | --- |
| Property research | `PricingStudio`, DC/condo/Maryland adapters and account-free APIs | Embed a homeowner workbench in the same studio, with the current authorized evidence |
| Financial choices | `simulatePricing`, seller plan, studio cost assumptions | Shared selling arithmetic plus a versioned, pure six-choice financial engine; missing inputs abstain |
| Private ownership inputs | Studio device drafts; authenticated workspace aggregates | Explicit browser-only homeowner profiles; additional ownership fields stay on the device. Existing pricing drafts autosave selected price, fees and payoff; an explicitly opened pricing report submits those bounded choices to its stateless route |
| Evidence/history | `CmaResult.inputSnapshot`, checksums, replay, `compareCmaDecisions`, arithmetic attribution | Versioned public-evidence passports, scenario snapshots and exact field changes |
| Ask Ascent | Deterministic pricing questions; gated Groq/OpenAI orchestration | Deterministic scenario explanations in the current studio; independent AI gate unchanged |
| Monitoring | Authorized fabric freshness/ingestion and workspace monitor | On-demand differences against a saved public-evidence snapshot, including corrections; no fabricated periodic alerts |
| Valuation research | Frozen chronological protocols, Huber robust paired fits, selection/calibration windows and five published studies | Preserve algorithms, fingerprints, failed results and interval safeguards; verify existing results |
| Security/rights | Tenant RLS, MFA/recovery, scoped export, independently reviewed provider grants | Keep the new local passport limited to bundled public sources and the labeled fictional sample; reject licensed records |

The largest useful gap was ownership arithmetic connected to the property currently on screen. Rebuilding ingestion, valuation or professional workspace interfaces would duplicate working infrastructure. No new Virginia, permit, hazard, rental or tax feeds are authorized/configured here. Tax amounts, insurance, rent, debt and renovation assumptions must come from the homeowner. No independent AI approval exists. Maryland v2 fails PRD; DC condos fail five criteria. Those are release constraints, not missing UI features.

MIT remains the software license; source licenses remain separate.

## Delivered behavior

The public DC, Maryland, condo and fictional studios share `HomeownerWorkbench`. It reuses the active property and valuation and links existing selling choices rather than starting another valuation engine. `/home` lists saved profiles. Property history uses only qualified transfers already present in the authorized snapshots; an absent transfer is unknown, not proof that a property never sold. DC loading now verifies both CSV fingerprints, the validated sales fingerprint, row counts and unique identifiers before serving records. The frozen datasets and historical research files are unchanged.

`homeowner-finance.ts` validates nullable inputs with Zod and computes fixed-rate monthly amortization, six choices, cash flow, equity, ownership costs, sale proceeds, rental/renovation/payment break-even and a cash reserve requirement across the horizon. `selling-costs.ts` is shared with existing `simulatePricing`; the original seller rounding is preserved. Every comparison carries its engine version, complete inputs, monthly rows, limits and reproducibility checksum. Unknown inputs abstain from the affected comparison. Immediate sale proceeds can still be available when a hypothetical cash return is missing.

Net position compounds signed cash flows at the explicitly assumed cash return, then adds end equity after modeled exit costs. It represents incremental resources, excluding starting cash. Negative flows represent required contributions and their opportunity cost; this does not authorize or model an unspecified borrowing facility. Cash required separately measures the largest cumulative deficit using month-end flows, without crediting investment earnings. Renovation break-even matches the sell scenario after entered delays, fees, carrying costs, debt and time value. Refinance payment break-even is labeled as a payment-only check; term and equity changes remain visible in the full comparison.

Financial engine version 2 corrects two pre-release review findings: a renovation's hypothetical improved value enters the trajectory only at its entered completion month, and rental management fees appear in accumulated ownership costs as well as net cash flow. Version-1 snapshots are retained with their original hashes and summaries; the version/hash replay check distinguishes them from corrected recalculations. These fixes do not change the property valuation engine or its studies.

The deterministic decision questions explain the current calculations, compare rent/sell, quantify a $25,000 price reduction, identify missing inputs and expose renovation break-even. Editable explanations can be exported. They make no external inference call and do not change the existing Groq configuration, source-use policy, independent review manifest or private workspace assistant.

`homeowner-passport.ts` preserves public inputs, studio choices, private financial assumptions, homeowner improvements/disputes, expected calculation versions/hashes and frozen scenario summaries. Reload validates bounded storage, property identity and snapshot checksums. History compares two saved versions or a saved version with the current draft, using `compareCmaDecisions` only when the saved valuation hashes still reproduce. A new code version cannot silently claim historical reproduction. A checksum detects accidental alteration; it is not a signature or authentication mechanism.

Saved financial comparisons show each choice's frozen net position and the dollar change in net position/monthly cash flow. Different horizons and calculation versions are labeled rather than treated as equivalent experiments. Ask Ascent can narrate the selected saved decision against current calculations; unavailable outcomes remain unknown. Historical financial outputs are compared as saved, without silently rerunning them under a new engine.

Sharing is explicit. Default exports contain public evidence and its valuation, excluding private debt, costs, scenario results, improvements, disputes and private calculation fingerprints. A user-entered comparable or condition rating withholds the default valuation output; an explicit private export can include it. Only the bundled public sources and authored fictional sample can enter this local path; licensed providers retain their existing authenticated and permission-scoped export routes. No public share link, uploaded document or notification service is introduced. Downloaded copies cannot be revoked.

The standalone HTML report uses exactly the same privacy filter as JSON, escapes all supplied text, has a restrictive content policy and loads no external assets. Browser Print can save it as PDF; no server PDF service is added. A public cohort's published acceptance result, missed criteria, holdout window and report digest are frozen with the snapshot and carried into both formats. Fictional records do not receive an accuracy claim, and condos cannot inherit a DC house reference. Edited settings are explicitly distinguished from the study configuration. No calibrated interval is newly released by the passport.

Each exported record has its source, applicable license, collection time, missing-field indicators, quality explanations and provenance IDs. Property and sales collection dates remain separate, with the respective frozen CSV SHA-256 fingerprints. Unknown source observation times remain null; a closing date is an event date, not a manufactured collection timestamp. Added practice records are marked unverified and use the decision's save time as their snapshot collection time.

Monitoring is an on-demand comparison when a saved home is opened. Actual property/sale corrections and source-permission metadata changes are reviewable. Collection timestamps, saving time and unchanged data do not create property alerts. Financial-assumption changes appear in history separately. Preferences are saved explicitly. This does not refresh a source, promise periodic delivery or create live listing inventory.

## October 21: what moves each choice, and the Home Decision Brief

The [Home Decision Brief](home-decision-brief.md) now opens every studio and draws its financial answers from this workbench. The financial engine (`ascent-homeowner-finance-2`) is unchanged. `finance-sensitivity.ts` (`ascent-finance-sensitivity-1`) only re-runs it:

- **Drivers.** Each input the homeowner entered is stepped down and up by a disclosed review step (for example ±5% for prices, ±1 point for the mortgage rate, ±3 months for timing) while every other input stays as entered. Unknown inputs are never stepped. Compare shows the six largest movers for the selected choice.
- **Holding periods.** Every computable choice at 1, 3, 5, 10 and 20 years with the same inputs. A period that ends before an entered sale or renovation is marked not computable rather than extrapolated.
- **Break-evens.** Five thresholds solved by bisection on the engine itself, re-running both choices at each trial value. A threshold that needs a missing input, or does not exist within a plausible range, says which.

Exclusions (replacement housing, taxes, inflation, loan qualification) are now stated above the comparison table, not only in the method notes. When the brief declines to state a value, the estimate no longer fills the sale price or property value.

## Limits and release dependencies

- No cloud synchronization or encryption of browser storage. Shared browser access and clearing site data matter. Ten homes/ten versions and a four-million-character bound keep storage finite; quota errors preserve the draft and never report a false save.
- Existing pricing drafts autosave selected price, fees and payoff. Existing public pricing reports submit these explicitly selected choices in their bounded stateless request. Additional ownership inputs and notes are neither put into URLs nor sent to a server by the workbench. Filtered passport exports are generated locally.
- Financial figures are assumptions and pre-tax arithmetic. Replacement housing, housing utility, capital-gains/income tax, deductions, liens, payoff fees, cost/rent inflation, qualification and bridge/construction financing are excluded. The choices do not provide equivalent housing. Rates and renovation prices are not fetched or forecast.
- Tax, insurance, rental, permit, hazard and title completeness are unavailable without authorized new evidence. Existing public refresh scripts and provider/fabric permission controls remain the ingestion boundary. Virginia permission requests remain unsent; no Virginia data is ingested.
- Published valuation performance is unchanged. The current implementation already uses robust Huber-reweighted fitting, ordered selection/calibration and deterministic baselines. No new candidate was promoted or accuracy improvement claimed from already-inspected holdouts. DC houses retain their existing exact-configuration safeguards; Maryland PRD and condo acceptance failures remain. Further model selection needs a newly registered untouched/prospective cohort and independent replication.
- Production account migrations, recovery email acceptance, backup operations, source grants and independent AI reviewers remain the separate gates documented in production readiness. This local homeowner slice does not certify those systems.
