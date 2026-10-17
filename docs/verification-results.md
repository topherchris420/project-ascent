# Verification results

Executed on this Windows ARM64 development machine with Node 24.19.0, October 15–16, 2026. These results describe this implementation and its fixtures, not a claim of production reliability or licensed market accuracy.

| Check | Actual result | Scope |
| --- | --- | --- |
| TypeScript | Pass | Strict project type checking, including scripts and routes |
| Unit/integration suite | **210/210 passed**; 6.27 s final runner duration | Real local SQLite persistence, authentication/roles/tenants, pricing, source rights, billing event mocks, migration, domain/AI/provider protocol fixtures; phase separation, paragraph references, known semantic regressions, local-only source policy, client follow-ups and inventory matching |
| Browser suite | **15/15 passed in the final combined run**, including the opt-in real cached-data workflow; approximately 1.2 min | Registration/login/logout, full professional demo, progressive access, DMV/Austin, Academy/support, CSV rollback/export, privacy races, provider fixture workflow, client criteria/alerts/follow-up continuity and mobile CMA; real cached data restored without new provider requests |
| Accessibility | **22/22 ordinary scanned configurations**, plus real-provider desktop/mobile, without detected violations or horizontal overflow | Axe WCAG 2 A/AA and 2.1 AA; 20 application views plus populated provider desktop/mobile. Automated checks are not complete accessibility certification |
| Production build | Pass | Next.js optimized compilation, type checking, prerendering and all route generation |
| Production HTTP smoke | Pass | Home 200, anonymous workspace/provider 401, missing production database 503 with safe configuration message, production CSP without unsafe-eval |
| Production dependency audit | Zero known advisories reported | `npm audit --omit=dev`; point-in-time registry check, not penetration testing |
| Client secret scan | No supplied Groq or RentCast credential value in 55 compiled client artifacts or 306 tracked files | `.next/static` JavaScript/JSON/maps; environment file ignored by Git |
| First-use acceptance | **4,055 ms** in the final recorded browser rerun | Automated local Explorer registration → pending verification → saved synthetic DMV CMA/report; not human onboarding research |
| Report HTTP | See timestamped report receipt | One local synthetic HTML request, not an SLA or competitive comparison |
| RentCast fixture workflow | Pass with **six fictional recorded-sale comparables** | Exact fixture address → records/assessment history → CMA → separate AVM benchmark → ZIP context → scenario → evidence assistant → report/cache reuse; **zero live RentCast calls** |
| Live RentCast workflow | **7 actual requests**, 17 admitted recorded-sale comparables with explicit 365-day assumption | All four endpoints; DMV and San Antonio. Provider dashboard independently showed 7/50 included requests and zero errors. CMA reproduced, separate AVM benchmark, scenario arithmetic, authorized report and deterministic explanation; wide comp dispersion, no accuracy claim |
| Domain fixture evaluation | **32/32 expected triage outcomes**; 11 practice-rule case sets pass | Internally authored English cases; no independent holdout, legal certification, expert agreement or live outcome validation |
| Offline AI evaluation | **9/9 software cases passed** | Authored mocked model responses; proves routing/validation behavior, not model quality or network speed |
| Live Groq full assistant | **3/3 final software smoke cases passed**: two model responses and one no-call safety hold | Final 20B: **1,154.165 ms**, 3,160 input / 384 output tokens, estimated **$0.0003522**. Final 120B: **3,191.801 ms**, 3,372 input / 1,111 output tokens, estimated **$0.0011724**. Synthetic evidence only; semantic-quality acceptance remains open |
| Live Groq minimal tool phase | **Succeeded** | One 20B read-only tool call, **463 ms**, 166 input / 38 output tokens; published-rate estimate **$0.00002385**, not an invoice. Model discovery returned both configured IDs |

The live evaluation's conservative cumulative accounting is **$0.06054915**, within the expanded, explicitly approved **$0.1099** ceiling. Final successful-path token arithmetic totals **$0.0015246**; cumulative accounting also includes full reserved amounts for failed requests with unknown usage. A persistent ledger prevents resetting this ceiling between runs. The original HTTP 400 was reproduced as `tool_use_failed`; separating retrieval and synthesis instructions restored the full path. Later citation-format experiments and a 120B structured-output failure are retained in the run archive, followed by the successful final run. These are not provider invoices, reliability estimates or competitive quality benchmarks. [Quality review and known semantic errors](ai-evaluation-review.md).

## October 16, 2026 decision-support update

After adding the public landing page, weekly agenda, listing check-ins, term-strength offer ranking, client pipeline, contract-date reading (text and text-based PDF), pricing narration, listing-description studio and the rebuilt client report/presentation:

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Unit/integration suite | **232/232 passed**, including `decision-support.test.ts` and `contract-dates.test.ts` |
| Browser suite | **16 passed, 1 skipped** (the opt-in live cached-data test), including `decision-support.spec.ts` with axe checks on the new views |
| Accessibility scan | **22/22 configurations without detected violations or horizontal overflow** after raising the global type scale (no text below 10px) |
| Production build | Pass |

All new figures are deterministic arithmetic on entered or fictional data. Offer term strength ranks entered terms by stated weights and is not a closing probability; listing-review thresholds are broker rules of thumb; computed contract dates show their rule and still require professional approval. No live provider or model requests were made by these checks.

## October 16, 2026 contract-evidence update

Continued from the updated 232-test application without replacing its landing page, reporting, listing reviews, offer ranking or other workflows. The completed slice strengthens the existing document-to-deadline workflow.

| Check | Executed result and scope |
| --- | --- |
| Unit/integration suite | **245/245 passed**; 13 additional regression cases, preserving the existing scenarios |
| Contract coverage | Separate/missing/conflicting anchors, inconsistent counts, ambiguous direction, forward/backward weekday arithmetic, normalized page evidence, two-page PDF extraction, textless pages/truncation, unchanged original bytes, authorization before/after decoding, review/correction persistence and structured audit privacy |
| Browser suite | **17 passed, 1 skipped**, approximately **1.4 minutes**; the skipped case is the opt-in live RentCast cache test, not a failed workflow |
| New browser acceptance | Conflicting terms are held; a synthetic inspection deadline is explicitly reviewed, corrected with a reason and restored after reload; the private original download works. Final deadline/main-workflow rerun: **5/5 passed in 57.5 s**, including a check that synthetic source IDs never become broken document links |
| New accessibility checks | Desktop review form and 390px mobile transaction/document view: no axe WCAG 2 A/AA or 2.1 AA violations detected; mobile horizontal-overflow check passed. These states are not comprehensive accessibility certification |
| TypeScript and build | Strict type check and optimized Next.js build passed |
| Formatting | Prettier check passed for all source/test files changed by this slice |
| Credential scan | No supplied Groq/RentCast value in **55 compiled browser artifacts** or **306 tracked files**; `.env.local` remains ignored. The tracked-source scan excludes untracked additions |
| Provider costs | These tests use synthetic documents, stored/synthetic property fixtures and deterministic assistant mode. **No new paid RentCast or Groq request was made**; caps were not raised |

Evidence: [desktop review](../evidence/ascent-deadline-review-desktop.png), [mobile review](../evidence/ascent-deadline-review-mobile.png), [workflow and limitations](contract-deadlines.md). These results do not establish legal correctness, OCR completeness, expert agreement, production decoder isolation, or independently validated market accuracy. PDFs without usable text require manual review; business-day arithmetic is a disclosed weekday-only estimate with no holiday or extension calendar. Existing saved proposals remain unchanged and can lack new evidence metadata.

## October 16, 2026 Hobby deployment and Ascent branding update

| Check | Actual result |
| --- | --- |
| Unit/integration suite | **253/253 passed**; eight new deployment/upload tests, including exact 4 MB acceptance, one-byte excess, declared/chunked body rejection, private legacy-file handling, configuration validation and pool bounds |
| Full browser suite | **18 passed, 1 skipped**, approximately **2.2 minutes**. Optional real-cache test remains opt-in; no new live provider requests |
| New upload browser workflow | Oversize selection triggers a useful error and **zero upload requests**; replacing it with a small synthetic contract succeeds and clears the error |
| Optimized production build | Passed; homepage remains statically rendered. Node 24 and 60-second API ceilings configured; once-daily cron replaces the incompatible six-hour schedule |
| Public setup acceptance | Optimized local server on port 3041: HTTP 200, setup message, disabled account actions, interactive pricing example, **zero browser API requests** and no page errors |
| Accessibility | **22/22 application configurations**, plus optimized setup desktop/mobile: no axe WCAG 2 A/AA or 2.1 AA violations detected and no horizontal overflow |
| Configuration preflight | Correctly exits nonzero for the current missing hosted database, HTTPS origin and document-encryption key; no database or paid provider call performed |
| Domain evaluation | **32/32 authored triage outcomes**, 11 rule case sets pass; regenerated scope uses Ascent's own validation framework, not external product claims |
| Browser credential check | No supplied Groq/RentCast value in **55 compiled client artifacts** |
| Server trace check | **35 server trace manifests** inspected; zero private local-data, evidence, test or test-output files included. This is not a real Vercel bundle acceptance |
| Product independence | Legacy product references removed from current source/docs; reference-site captures and superseded screenshots excluded from the current tracked assets. Ascent calculations and workflows retained; existing Git history was not rewritten |

The first combined browser attempt overlapped a client development refresh and reset the deadline page to Overview; the unchanged deadline assertions passed on focused and final full reruns. The new upload test initially matched both the application alert and Next.js's route announcer; it now targets the actual error. Setup-smoke locator/context mistakes were fixed without weakening its interactive, privacy or accessibility assertions. No failing test was removed.

Evidence: [optimized setup acceptance](../evidence/hobby-setup-acceptance.json), [desktop](../evidence/ascent-hobby-setup-desktop.png), [mobile](../evidence/ascent-hobby-setup-mobile.png), [Hobby setup](vercel-hobby.md). This verifies local optimized behavior and configured limits, **not a successful Vercel deployment or production PostgreSQL acceptance**. The provider spending caps and private credentials remain unchanged. Vercel Hobby permits personal, non-commercial use; commercial operation requires an appropriate hosting plan.

## October 16, 2026 hosted PostgreSQL connection

The workstation now uses a dedicated `ascent` database in a separate Neon Free-plan project, with PostgreSQL 18/PostGIS, a restricted non-owner runtime login and certificate-verified pooled TLS. All three migrations were applied using the administrator identity. Anna's project was not modified. Private runtime configuration is excluded from Git and deployment uploads; the previous SQLite data remains intact and was not imported.

| Check | Executed result and boundary |
| --- | --- |
| Hosted PostgreSQL acceptance | **6/6 passed**: restricted role/forced RLS/PostGIS; registration/session lifecycle; cross-tenant reads/writes and pooled tenant reset; spatial search/concurrent edits; encrypted documents/unapproved dates; reproducible JSONB CMA, scenarios, evidence assistance and report export. The two disposable accounts were removed |
| Browser storage confirmation | Browser-created synthetic registration independently found in the PostgreSQL registry; this is not a SQLite-only browser run |
| Final browser suite | **19 passed, 1 skipped**, approximately **2.2 minutes**, against the locally served app connected to hosted PostgreSQL. The cached live RentCast case remains intentionally opt-in |
| New delayed-market regression | A held region request displays a loading state and withholds stale property actions; after completion, the saved CMA's identity, address and Texas state match the selected Austin property |
| Unit/integration suite | **253/253 passed**; existing SQLite/unit scenarios retained |
| TypeScript / optimized build | Both passed |
| Credential and trace checks | Six configured secret strings absent from **58 compiled browser artifacts**; **35 server traces** contain no private env-file paths or excluded local artifacts. Source/history scan also reported no findings; these are bounded checks, not security certification |
| Data and costs | Synthetic browser fixtures and deterministic evidence mode; **no new RentCast or Groq calls**, no budget expansion and no paid Neon plan enabled |
| Deployment boundary | Vercel environment setup, exact HTTPS origin and public deployment remain pending. Backup/restore, key recovery, capacity and exhaustive invitation/billing/API-key lifecycle policy acceptance remain operational work |

Cloud latency exposed a pending-region interface problem and timing assumptions in existing tests. The application now withholds stale page actions during market changes and clears old save confirmations. Geographic and client-alert tests wait for the actual successful save response before reading persisted state; geographic evidence also verifies the saved CMA's ID, address and state. An initial new-test selector incorrectly referenced Overview while on Properties and was corrected. No failing assertion or test was deleted; the final full suite passes.

Evidence: [hosted acceptance receipt](../evidence/postgres-acceptance.json), [credential/trace scan](../evidence/postgres-deployment-scan.json), [onboarding](../evidence/onboarding-acceptance.json), [DMV and Austin](../evidence/geographic-acceptance.json), [connection setup and limitations](postgres-connection.md).

## October 17, 2026 valuation validation and production safeguards

Executed in a Linux cloud container with Node 22.22.0. Details are in [valuation validation](valuation-validation.md).

| Check | Result |
| --- | --- |
| Out-of-sample valuation accuracy | 6,975 recorded King County, WA sales (Jan–May 2015) scored once under protocol `ascent-valuation-validation-1`: **MdAPE 10.6%** (95% CI 10.3–10.9), PPE10 47.8%, COD 15.2, PRD 1.040, median bias −0.17%, calibrated 80% interval coverage 77.5%. **5 of 9 pre-registered criteria met** (MdAPE, PPE10, COD and PRD missed). Report `sha256-11e488db…` |
| Baseline comparison | Beats trailing ZIP median by 9.4 MdAPE points and median $/sqft of the same comparables by 0.7 points (paired bootstrap 95% upper bounds −8.7 and −0.44). The untuned shipped defaults do not beat median $/sqft |
| Independent re-derivation (`--check`) | All 12 checks pass: report, protocol, sample and engine digests; metrics recomputed from per-sale samples by separate code; acceptance verdicts; in-app benchmark derivation |
| Full re-run (`--verify`) | **Pass**: report digest and all 6,975 per-sale estimates reproduced byte for byte in 187 s (14/14 checks) |
| Third-party attestation | **None recorded yet**; Ed25519 mechanism tested |
| Unit/integration suite | **286/286 passed**, including 19 new validation, release-gate, drift, health and approval-gate tests |
| Browser suite (affected specs) | **10/10 passed**: workspace, decision-support, adoption and Hobby specs, including approve-from-snapshot |
| Accessibility | **22/22 configurations**, zero Axe violations, no horizontal overflow (includes the new landing accuracy section) |
| Production build and typecheck | Pass; `/api/health` route generated |

## Reproduce

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run audit:a11y
npm.cmd run benchmark
npm.cmd run evaluate:domain
npm.cmd run evaluate:ai
npm.cmd run build
```

The ordinary test suite and offline evaluations make no paid inference/property requests. Browser tests explicitly select deterministic assistant mode. Live evaluation is a separate opt-in command requiring a supplied server key, explicit sharing/budget configuration and an approved cumulative `--max-usd` ceiling. Do not include `.env.local` in source control or reports.

After building, `node --env-file=.env.local scripts/verify-build.mjs` checks compiled browser artifacts for the supplied Groq credential without printing it. Add `--repository` to check tracked source/evidence and verify the local environment file is ignored. With a local production server running and PostgreSQL deliberately unconfigured, add `--production-http` to reproduce the fail-closed HTTP smoke. This optional smoke is specific to that unconfigured environment; it is not a production database acceptance test.

## Evidence

- [Live RentCast service acceptance](../evidence/rentcast-live-acceptance.json)
- [Real cached-data browser acceptance](../evidence/rentcast-live-browser.json)
- [Synthetic browser provider acceptance](../evidence/rentcast-browser-acceptance.json)
- [Onboarding acceptance](../evidence/onboarding-acceptance.json)
- [Geographic acceptance](../evidence/geographic-acceptance.json)
- [Migration acceptance](../evidence/migration-browser-acceptance.json)
- [Accessibility scan](../evidence/accessibility-results.json)
- [Production launch/configuration smoke](../evidence/production-smoke.json)
- [Compiled browser credential scan](../evidence/build-artifact-scan.json)
- [Computation benchmarks](../evidence/benchmark-results.json)
- [Domain cases](../evidence/domain-evaluation.json)
- [Offline AI results](../evidence/ai-evaluation.mock.json)
- [Final complete live AI smoke](../evidence/ai-evaluation.live.json)
- [Archived live attempts](../evidence/ai-evaluations/)
- [Cumulative evaluation accounting](../evidence/ai-evaluation-spend.json)
- [Successful minimal live diagnostic](../evidence/ai-evaluation.live-diagnostic.json)

## What remains unverified

A restricted RentCast key and active owner subscription now support the verified private local workflow. Seven requests remain counted under the ten-request cap; UI renders, assistant questions and cached-data browser verification made no additional property requests. The local technical policy/grant is not production legal approval and cannot authorize production source reads. No authorized production PostgreSQL connection, deployed Vercel project, real Stripe sandbox account, license-verification feed, MLS contract, actual expert participation or destination Git remote was supplied. Ordinary RentCast tests use invented fixtures/mocked HTTP. The separate live service/browser receipts document actual provider data; raw records, private access details and real-data screenshots remain ignored. Source contracts, full retention/deletion across backups, per-member professional eligibility, email verification/recovery/MFA, distributed ingestion scale and operational incident/backup procedures remain production gates. [Prioritized remaining work](remaining-work.md).

No real property outcome, customer, endorsement, causal time saving, voluntary retention or independently validated competitive superiority is claimed. The working local application is a substantial production-oriented foundation with documented live-data, operational and AI-validation blockers.

## Corrections made in this verification cycle

A new client browser test initially used the wrong Save-button label and was corrected without removing its workflow assertions. The real cached-data test first exposed verbose select names and then a mobile scrollable-table keyboard-focus violation. Concise accessible names and focusable evidence-table containers corrected both; the same cached live test subsequently passed on desktop/mobile with zero new requests. Full property-record observations now take precedence over AVM subject stubs, and checked conflicting fields remain visible. Known comparable-count, median-method and lot/floor confusions now cause deterministic assistant fallback; these bounded tests do not establish general factual grounding.

The final combined run also covers provider-first workspace initialization: missing synthetic DMV projections are repaired through the existing canonical pipeline without replacing prior clients, CMA IDs or licensed provider caches. A regression verifies the repair is idempotent, and browser handoff confirmed nine DMV demo properties alongside preserved live research. Workspace/source labels now distinguish bundled fictional examples from licensed research.
