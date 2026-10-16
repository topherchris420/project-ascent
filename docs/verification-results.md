# Verification results

Executed on this Windows ARM64 development machine with Node 24.19.0, October 15–16, 2026. These results describe this implementation and its fixtures, not a comparison against an authenticated Homesolo product or licensed market outcomes.

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
- [REA reconstruction evidence](evidence-ledger.md)

## What remains unverified

A restricted RentCast key and active owner subscription now support the verified private local workflow. Seven requests remain counted under the ten-request cap; UI renders, assistant questions and cached-data browser verification made no additional property requests. The local technical policy/grant is not production legal approval and cannot authorize production source reads. No authorized production PostgreSQL connection, deployed Vercel project, real Stripe sandbox account, license-verification feed, MLS contract, actual expert participation or destination Git remote was supplied. Ordinary RentCast tests use invented fixtures/mocked HTTP. The separate live service/browser receipts document actual provider data; raw records, private access details and real-data screenshots remain ignored. Source contracts, full retention/deletion across backups, per-member professional eligibility, email verification/recovery/MFA, distributed ingestion scale and operational incident/backup procedures remain production gates. [Prioritized remaining work](remaining-work.md).

No real property outcome, customer, endorsement, causal time saving, voluntary retention or superiority over Homesolo is claimed. The working local application is a substantial production-oriented foundation with documented live-data, operational and AI-validation blockers.

## Corrections made in this verification cycle

A new client browser test initially used the wrong Save-button label and was corrected without removing its workflow assertions. The real cached-data test first exposed verbose select names and then a mobile scrollable-table keyboard-focus violation. Concise accessible names and focusable evidence-table containers corrected both; the same cached live test subsequently passed on desktop/mobile with zero new requests. Full property-record observations now take precedence over AVM subject stubs, and checked conflicting fields remain visible. Known comparable-count, median-method and lot/floor confusions now cause deterministic assistant fallback; these bounded tests do not establish general factual grounding.

The final combined run also covers provider-first workspace initialization: missing synthetic DMV projections are repaired through the existing canonical pipeline without replacing prior clients, CMA IDs or licensed provider caches. A regression verifies the repair is idempotent, and browser handoff confirmed nine DMV demo properties alongside preserved live research. Workspace/source labels now distinguish bundled fictional examples from licensed research.
