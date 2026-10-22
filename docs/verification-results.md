# Verification results

## October 21, 2026 — Home Decision Brief, financial depth and external validation

Branch `feat/home-decision-brief` from `c4d316b` (PR #11); master had not moved when this was checked.

- **Type checking passes; 407/407 logic tests pass.** The tests cover the brief's verdict policy, traces, missing facts, settings changes and checksums; the finance sensitivity, break-evens and holding periods against the unchanged engine; the passport's public brief record (a test proves it cannot depend on the asking price, payoff or financial inputs); and the external study's analysis on synthetic data, including the compression and price-noise cases.
- **The complete browser suite passes: 68 cases, with the existing opt-in cached-live provider case skipped** (12.7 minutes in Chrome). It includes eight brief cases (1440, 390 and 320 pixels; DC, Maryland, condo and the sample; the declined state; Ask Ascent references), the new /accuracy check at 1440 and 390 pixels, and the workbench, pricing, backup and search suites. Axe WCAG A/AA checks and page-overflow checks pass in every exercised brief, what-if and accuracy view.
- **The evidence check passes for all six experiments.** The five earlier report digests are unchanged. For the external study, `--check` also verifies the registration, data lock, supplement digest and samples, and re-derives the verdict-policy, county and transport results. A deliberately altered supplement figure failed the check (exit 1); the file was then restored byte for byte.
- **Offline evaluations pass**: domain, 32/32 safety and 11/11 rule cases; AI, 9/9 mocked cases with zero live provider requests.
- **The optimized production build passes**: 58 pages generated, with /accuracy prerendered as static content and no build warnings.
- **Screenshots inspected** at 1440, 390 and 320 pixels: the brief, the financial drivers table (which previously hid its amounts off-screen on phones) and /accuracy. New evidence: [brief, desktop](../evidence/ascent-home-decision-brief-1440.png), [brief, mobile](../evidence/ascent-home-decision-brief-390.png), [financial what-if, mobile](../evidence/ascent-finance-whatif-390.png), [external study on /accuracy, mobile](../evidence/ascent-accuracy-external-390.png).

Not established by these checks: comprehension (the [protocol](usability-protocol.md) has not been run), independent replication of any study, production account security, and CI on the final commit. Read CI from the pull request. Two local issues are recorded rather than hidden. Playwright's 120-second server start timed out while the valuation scoring ran on the same laptop; the suite passed against a pre-started server with the same isolated settings. Commit `9d8f9c6` briefly broke type checking; `9d81656` fixed it.

## October 19, 2026 — homeowner search recovery and safer saved history

Integrated with `3dbeae2` (PR #10), retaining its shared address search, indexed public-record lookup, and property-first studios. This follow-up adds example-address shortcuts, explicit clearing, immediate stale-response invalidation, a 30-second request deadline, partial-failure recovery, mobile navigation, and confirmation before deleting local home history.

- **367/367 logic tests pass**, including the updated address-index and metadata coverage. Type checking, changed-file formatting, and the optimized production build pass.
- **17/17 selected browser cases pass against the local production build**: shared search and metadata (5), homeowner entry (2), mobile navigation/search recovery (6), and homeowner decisions/history (4). DC, Maryland, and condo routes open real bundled evidence without an account. The browser suite includes malformed responses, delayed replies after clearing, a stalled market, retry, cancellation, and storage-write failure.
- Axe WCAG A/AA checks pass in the exercised desktop/mobile flows, including the deletion dialog. Navigation is checked at 320 and 390 pixels. The mobile search results and navigation screenshots were visually inspected.
- `validate:valuation -- --check` reproduces the published evidence checks. No valuation formula, source snapshot, or accuracy claim is changed by this follow-up.
- Earlier checks against the pre-update development checkout encountered cold-compilation timeouts for Maryland. The integrated production build passes the real Maryland search-to-analysis flow with the existing 15-second result assertions. Production account setup, independent accuracy validation, and remote deployment status are outside these local checks.

## October 18, 2026 — homeowner decision workbench

- Installed the locked dependencies with `npm ci`; typecheck and optimized production build pass. Unit/integration acceptance covers mortgage reconciliation, six choices, missing-input abstention, delayed sales, rental/renovation/refinance break-even, reserve deficits, private export filtering, snapshot checksums, source corrections and cohort-specific accuracy references. The pre-review suite passed 357 cases; financial version 2 adds regression cases for renovation completion timing and management-fee totals. Read the final commit's CI for its executed count.
- The complete local browser suite passes **44 cases with one existing opt-in cached-live provider case skipped**. Desktop/mobile homeowner acceptance covers all six calculations, saved versions, two-version comparison, explanations, local deletion, quota failure, filtered JSON and standalone report accessibility. The first full run had two timeouts during concurrent CPU-heavy model reproduction; the subsequent complete run passed the unchanged assertions. No meaningful test was disabled or its timeout extended.
- The published evidence check passes all five experiments. Full Maryland v2 and condo `--verify` runs reproduce the exact report digests and **every per-sale estimate**. Maryland: `sha256-1c420bbcfa8218b63bca9d49fad4d892955e224f74c37c346a80780036a721a3`; condos: `sha256-06e88b2bfbcf2ae8f999398c36c1f1d5d512364a578c8d92240df5e5489eaeb6`. No model or frozen dataset changed, and no accuracy improvement is claimed.
- Offline domain checks pass all 32 safety cases and 11 rule cases. Offline AI checks pass 9/9 mocked cases with zero live provider requests. The independent AI production review remains pending.
- Screenshots at 1440 and 390 pixels were visually inspected. Browser acceptance checks no page overflow, no page exceptions and no Axe WCAG A/AA violations. New private profiles remain device-local; these checks do not establish account synchronization, encryption of browser storage or independent financial/adoption validation.
- New and substantially edited files pass formatting. Whole-file checks on `landing.tsx` and `analytics.ts` retain pre-existing formatting warnings, confirmed against their untouched master versions; unrelated formatting was preserved. Test-generated rewrites of historical evidence are excluded from this delivery.

See [the audited implementation and its limits](homeowner-workbench.md). CI, the PostgreSQL restore drill and deployment status should be read from the exact pull request/commit checks; local browser results are not production account-security acceptance.

## October 18, 2026 — revised studies and readiness safeguards

| Check | Actual result |
| --- | --- |
| Pre-scoring registration | Commit `81b7090` pushed before either new holdout was scored. Original Maryland report, samples and benchmark unchanged. |
| Maryland v2 | 2,812 previously unscored Jul–Sep 2026 sales, 94.13% valued; **9.52% MdAPE**, 52.0% PPE10, COD 14.8234, PRD 1.04218; **8/9 criteria**. PRD fails; no calibrated range released. Quality coefficient $63,889. |
| Maryland sensitivity | Frozen fit/search/calibration; all positive consideration in subjects/history, no refitting. Same 2,812 subjects, 9.52% median error, PRD 1.04204; still fails. County slices descriptive only. |
| DC condos | Separate condo-only protocol: 1,434 subjects, 96.23% valued, **12.95% MdAPE**, 41.16% PPE10, COD 17.751, PRD 1.05513; **4/9 criteria**. No house calibration reused or calibrated condo range released. |
| Report verification | All five experiments pass independent metric/digest/benchmark checks. Separate full Maryland v2 and condo reruns reproduce both report digests and every per-sale estimate exactly. No parameters were changed after scoring. |
| GitHub CI | [Extended-safeguard run](https://github.com/topherchris420/project-ascent/actions/runs/39139015461) passed all three jobs on `a8cfb3d`: **337 tests**, typecheck, five evidence checks, offline domain/AI checks, build, **39 browser cases passed / 1 explicit cached-live case skipped**, real disposable PostgreSQL dump/restore. Actions run on every PR/master push. |
| PostgreSQL restoration | All migrations, restricted runtime role, forced RLS, encrypted document decryption, tenant isolation, restored sessions, MFA/recovery replay, encrypted reset-mail outbox with mocked delivery, one-use password reset/session revocation/MFA preservation, and production AI review gate pass. Synthetic local data only; no production backup or recovery email. |
| Affected local browser flows | 6/6 pass: MFA setup and recovery, reset fragment clearing, Maryland and condos at 1440/390 px; Axe checks pass. New public accuracy/free pages both render at 390 px without overflow, console exceptions or Axe violations; screenshots inspected. |
| Live public endpoints | Deployed Maryland and condo reports return 200 and match their new report digests; `accepted:false`, no calibrated interval. Condo `measured:true`. `/accuracy` and `/free` return 200. No private account/database flow was exercised on production. |
| Operator handoff | Owner will configure migration 004/runtime grants and verified sender separately. Production email delivery and real production restore remain unverified. External licensing permissions and independently reviewed model accuracy are not supplied by CI. |

See [production-readiness checkpoint](production-readiness.md), [account setup](account-security.md), [operations and compliance](operations-and-compliance.md) and [independent AI review](ai-independent-review.md). Ordinary tests made zero paid inference/property requests. Offline AI passed 9/9 mocked cases; this is not independent semantic accuracy evidence.


## October 18, 2026 — Maryland and DC condo coverage

| Check | Result |
| --- | --- |
| Maryland frozen holdout | 12,831 sales, Jul 2025–Jun 2026; **13.85% median error**, 39.20% within ±10%; **4 of 9 criteria met**. Failed criteria and worse performance than untuned settings are published. Protocol was committed before scoring. |
| Independent validation checks | All three reports pass digest, protocol, engine, sample-metric, acceptance-verdict and in-app benchmark verification. County slices are independently recomputed in tests. |
| DC full re-run | Exact published report `sha256-d4acbe70…` and every per-sale estimate reproduced. Pure date caching and abstention handling do not change the house result. |
| Maryland reproduction scope | One completed scoring run plus separate metric/digest re-derivation; a second full `--verify --market maryland` run was **not** performed. The command is available for independent reproduction. |
| Tests and types | **330/330 tests pass**, typecheck passes. |
| Browser flows | **16 distinct selected cases pass after the report-bound fix**: Maryland and condos at desktop/mobile, existing DC houses, sample studio and recovery. The combined run initially passed 15/16; both Maryland cases passed on the subsequent run. |
| Accessibility and visual inspection | Zero Axe WCAG2A/AA/2.1AA violations and no horizontal overflow in selected desktop/mobile pricing flows; desktop Maryland, its public accuracy card and mobile condo screens visually inspected. |
| Production build and packaging | `next build --webpack` passes. All six new API route traces contain their required bundled property, sale and provenance files. |
| Built-app HTTP checks | Homepage, `/maryland`, `/dc/condos`, both search/property/report flows return 200. Maryland exports its failed 4/9 verdict; condo exports `measured=false`; neither exports a calibrated interval. No cookies set by those public APIs. |
| Formatting | Changed TypeScript/TSX files pass. A whole-repository formatting check reports pre-existing issues in unrelated files; those were left unchanged. |

Evidence: [production checks](../evidence/public-coverage-verification.json), [Maryland test and limitations](maryland-public-records.md), [condo source and limits](dc-condominiums.md), [unsent Virginia requests](data-permissions/virginia-requests.md). Virginia remains permission-gated.

## Earlier checks

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

## October 17, 2026 Pricing Studio continuation

Executed on the same Windows ARM64 machine (Node 24.19.0, installed Chrome) against the local development server, which loads the private `.env.local` and therefore uses the dedicated hosted Neon PostgreSQL database for workspace tests. No RentCast or Groq request was made; browser tests force deterministic assistant mode.

| Check | Actual result | Scope |
| --- | --- | --- |
| TypeScript | Pass | Strict project type check |
| Unit/integration suite | **283/283 passed** | Adds input-sensitivity recalculation, filter-empties-set handling, search thresholds, seller-plan and credit-penalty arithmetic, labeled assistant statements and the guarantee that labels are not sent to the model provider |
| Browser suite | **27 passed, 1 skipped** (opt-in live cached-provider test), **2.9 min** | Includes the four-step practice studio at 1440, 768 and 390 px: range chart to inspector, seller plan, input sensitivity, condition change (exact −$14,000 per point on the sample), user-entered sale labeled through to the report, axe scans and overflow checks |
| Accessibility scan | **22/22 configurations**, 0 axe WCAG 2 A/AA or 2.1 AA violations, no horizontal overflow | Workspace views desktop/mobile, including the restructured Pricing Studio. Automated checks are not full accessibility certification |
| Production build | Pass; `/demo` statically prerendered | Optimized Next.js build |
| Optimized public smoke | `/` 200, `/demo` 200, practice report 200, invalid practice state 400, anonymous workspace 401, demo sign-in 503 without a database (no SQLite fallback) | Local production server with account storage deliberately unset; [receipt](../evidence/pricing-production-smoke.json) |
| Credential scan | 0 matches in **63** compiled client artifacts and **257** tracked files; separate scan of all 57 pending changed files found none of six configured secret values | Bounded checks, not a security audit |

Scripted timings, sample size one per viewport, local development server with uncontrolled compile warmth (these are automated checks, not human task times):

| Measure | Target | 1440 px | 768 px | 390 px |
| --- | --- | --- | --- | --- |
| Landing → first studio result | 30 s | 1.73 s | 1.78 s | 1.73 s |
| Landing → full scripted decision (inspect, strategy, challenge, exclusion, added sale, costs, question) → report open | 120 s | 5.56 s | 4.85 s | 5.67 s |

The separate workspace onboarding acceptance (registration → pending verification → saved fictional CMA and report) recorded **6,265 ms**. Golden arithmetic tests found no critical arithmetic errors; tested tenant paths found no cross-tenant access. These automated checks do not establish customer satisfaction or adoption.

Corrections found during this cycle: the account-free entry did not read the demo sign-in response body on success, so Chromium held the request open and "network idle" never arrived; the page-by-page accessibility script timed out on it. The body is now always read and the scan completes. A development-server hot reload once dropped the dynamically loaded workspace stylesheet; a restart restored it and the production build bundles it. Playwright captures taller than the viewport showed the off-screen skip link mid-page; its real position was verified at −60 px. No failing test was removed or weakened.

## October 17, 2026 hosted production configuration

The owner set five production variables in Vercel with a local script that prints no values: `DATABASE_URL` (the restricted, pooled, `verify-full` runtime role on the dedicated Neon database), a newly generated production `APP_ENCRYPTION_KEY` and `CRON_SECRET` (not the development values), `PGSSL` and `APP_ORIGIN=https://project-ascent-theta.vercel.app`. The three secrets are stored as Vercel sensitive variables. Before configuration, `check:deploy --database` passed against that role: connectivity, restricted runtime identity, six forced RLS tables and PostGIS. Production (master `4c66ee6`) was redeployed by the owner.

| Check on `https://project-ascent-theta.vercel.app` | Result |
| --- | --- |
| Account availability | Setup notice gone; workspace actions enabled |
| Safety responses | Anonymous workspace 401; cross-origin demo request 403; scheduled job without its secret 401 |
| Demo workflow (headless Chrome, no credentials) | Demo opened (4.96 s first run, 1.24 s second); CMA saved; client report 200 with fictional watermark; snapshot present after reload; sign-out returns workspace 401; zero page errors |
| Runtime errors | None reported by Vercel in the hour after deployment |

After configuration, the owner ran `npm run verify:postgres -- --database=ascent` against the production database: **6/6 checks passed** (restricted role, forced RLS, migrations and PostGIS; registration and session authentication; RLS denial of cross-tenant reads, writes and unscoped access; PostGIS search and concurrent edits; encrypted documents and reviewed dates; reproducible saved CMA, scenarios, evidence assistant and report export), with cleanup passed. This exercises the application code against the hosted database from the workstation; registration and password sign-in through the deployed pages still need one manual check. Local development and browser tests use the same database as production; their tenants are fictional and isolated by row-level security, but a separate production database or branch remains the cleaner arrangement. The second production domain, `v0-vers3dynamics-ascent.vercel.app`, rejects sign-in because only the `APP_ORIGIN` origin is trusted.

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

## October 17, 2026 Washington, DC validation

Executed in a Linux cloud container with Node 22.22.0. Details are in [valuation validation](valuation-validation.md#washington-dc-protocol-ascent-valuation-validation-dc-1).

| Check | Result |
| --- | --- |
| DC data snapshot | 45,425 District recorded sales since Jan 2022 → **10,174** assessor-qualified single-unit residential sales after documented record rules (CC BY 4.0; owner names never downloaded). CSV `sha256 eebe4719…` |
| DC out-of-sample accuracy | 2,254 recorded sales (Oct 2025 – Sep 2026) scored once under `ascent-valuation-validation-dc-1`: **MdAPE 9.98%** (95% CI 9.42–10.63), PPE10 50.2% (48.1–52.2), COD 13.9, PRD 1.0295, median bias +1.7%, calibrated 80% coverage 76.7%. **9 of 9 pre-registered criteria met; A2, A3 and A5 narrowly.** Report `sha256-d4acbe70…` |
| DC baseline comparison | Beats median $/sqft of the same comparables by 4.1 MdAPE points (paired 95% upper bound −3.2) and the trailing ZIP median by 12.4 points. Untuned shipped defaults: 16.3%, worse than median $/sqft |
| Independent re-derivation (`--check`, both markets) | **24/24** checks pass (12 per market) |
| Full DC re-run (`--verify --market dc`) | **Pass**: report digest and all 2,254 per-sale estimates reproduced byte for byte in 61 s (14/14 checks) |
| King County report | Unchanged: protocol digest and report `sha256-11e488db…` still verify after the multi-market refactor |
| Unit/integration suite | **294/294 passed**, including market-aware gate, DC calibrated-interval and frozen-protocol tests |
| Browser suite (affected specs) | **10/10 passed** |
| Accessibility | **22/22 configurations**, zero Axe violations, no horizontal overflow |
| Production build and typecheck | Pass |

## October 17, 2026 DC public records and validation review

Run in a separate worktree on local SQLite (no production database writes), Windows ARM64, Node 24.19.0, installed Chrome.

| Check | Actual result |
| --- | --- |
| Validation review before merge (PR #6) | `--check` passes both markets; `--verify --market dc` reproduced the DC report and every per-sale estimate byte for byte in 76 s; engine fingerprint `fnv1a32-49f0c98b` unchanged on master |
| DC data integrity | Runtime sales file SHA-256 equals the evidence copy and the published benchmark (`eebe4719…`); parcels file matches its provenance (92,142 rows) |
| DC coverage sample | 222 of 231 evenly spaced parcels priced with the validated settings; 9 had no qualifying sale within 0.5 mi and 90 days |
| Unit/integration suite | **321/321 passed**, including `dc-public-records.test.ts` (search, own-sale exclusion, radius/age/as-of bounds, calibrated range only when unmodified, server-rebuilt reports, replay) |
| Browser suite | **29 passed, 1 opt-in skipped**, 2.6 min, including the DC flow at 1440 and 390 px (search, calibrated range, edit removes it, report attribution, reload, reset, back button, axe, overflow) |
| Production build | Pass; DC routes' server traces include all four dataset and provenance files |
| Optimized smoke | `/dc` 200; DC search 200 (699 ms including the one-time data load); property 200 (14 ms); unknown parcel 404; report 200 (58 ms); existing routes unchanged; 0 credential matches in 69 compiled artifacts |

One onboarding test failed once on a cold development server: the click arrived before React attached handlers. It passed in isolation; the test now waits for the page to settle before clicking. No assertion was removed.

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
