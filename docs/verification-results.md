# Verification results

Executed on this Windows ARM64 development machine with Node 24.19.0, October 15–16, 2026. These results describe this implementation and its fixtures, not a comparison against an authenticated Homesolo product or licensed market outcomes.

| Check | Actual result | Scope |
| --- | --- | --- |
| TypeScript | Pass | Strict project type checking, including scripts and routes |
| Unit/integration suite | **188/188 passed**; 4.75 s final runner duration | Real local SQLite persistence, authentication/roles/tenants, pricing, source rights, billing event mocks, migration, domain/AI/provider protocol fixtures |
| Browser suite | **12/12 passed**; approximately 1.1 min | Registration/login/logout, full professional demo, progressive access, DMV/Austin, Academy/support, CSV rollback/export, privacy races, provider fixture workflow and mobile CMA |
| Accessibility | **22/22 scanned view configurations without detected violations or horizontal overflow** | Axe WCAG 2 A/AA and 2.1 AA; 20 application views plus populated provider desktop/mobile. Automated checks are not complete accessibility certification |
| Production build | Pass | Next.js optimized compilation, type checking, prerendering and all route generation |
| Production HTTP smoke | Pass | Home 200, anonymous workspace/provider 401, missing production database 503 with safe configuration message, production CSP without unsafe-eval |
| Production dependency audit | Zero known advisories reported | `npm audit --omit=dev`; point-in-time registry check, not penetration testing |
| Client secret scan | No supplied Groq credential value in 55 compiled client artifacts | `.next/static` JavaScript/JSON/maps; environment file ignored by Git |
| First-use acceptance | **7,423 ms** in the final recorded run | Automated local Explorer registration → pending verification → saved synthetic DMV CMA/report; not human onboarding research |
| Report HTTP | **22 ms** in one recorded local request | Synthetic HTML generation, not an SLA or competitive comparison |
| RentCast workflow | Pass with **six fictional recorded-sale comparables** | Exact fixture address → records/assessment history → CMA → separate AVM benchmark → ZIP context → scenario → evidence assistant → report/cache reuse; **zero live RentCast calls** |
| Domain fixture evaluation | **32/32 expected triage outcomes**; 11 practice-rule case sets pass | Internally authored English cases; no independent holdout, legal certification, expert agreement or live outcome validation |
| Offline AI evaluation | **9/9 software cases passed** | Authored mocked model responses; proves routing/validation behavior, not model quality or network speed |
| Live Groq full assistant | **Failed positive smoke: HTTP 400**; safe evidence fallback | One 20B request, about 661 ms; provider tokens unreported. Error cause was not retained in the first attempt. No successful complete model answer claimed |
| Live Groq minimal tool phase | **Succeeded** | One 20B read-only tool call, **463 ms**, 166 input / 38 output tokens; published-rate estimate **$0.00002385**, not an invoice. Model discovery returned both configured IDs |

The live evaluation's conservative cumulative reservation is **$0.0099**, within the stated $0.01 cap. A persistent cumulative evaluation ledger prevents silently resetting that limit on subsequent runs. Additional full-path diagnosis requires a separately approved test allowance. No 120B inference, live final strict-schema synthesis or competitive model-quality benchmark has been verified. The minimal diagnostic is not a replacement for those evaluations.

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

## Evidence

- [Browser provider acceptance](../evidence/rentcast-browser-acceptance.json)
- [Onboarding acceptance](../evidence/onboarding-acceptance.json)
- [Geographic acceptance](../evidence/geographic-acceptance.json)
- [Migration acceptance](../evidence/migration-browser-acceptance.json)
- [Accessibility scan](../evidence/accessibility-results.json)
- [Production launch/configuration smoke](../evidence/production-smoke.json)
- [Computation benchmarks](../evidence/benchmark-results.json)
- [Domain cases](../evidence/domain-evaluation.json)
- [Offline AI results](../evidence/ai-evaluation.mock.json)
- [Failed complete live AI smoke](../evidence/ai-evaluation.live.json)
- [Successful minimal live diagnostic](../evidence/ai-evaluation.live-diagnostic.json)
- [REA reconstruction evidence](evidence-ledger.md)

## What remains unverified

No RentCast key, authorized production PostgreSQL connection, deployed Vercel project, real Stripe sandbox account, license-verification feed, MLS contract, actual expert participation or destination Git remote was supplied. RentCast tests use invented fixtures/mocked HTTP, not recorded live responses. Source contracts, full retention/deletion across backups, per-member professional eligibility, email verification/recovery/MFA, distributed ingestion scale and operational incident/backup procedures remain production gates. [Prioritized remaining work](remaining-work.md).

No real property outcome, customer, endorsement, causal time saving, voluntary retention or superiority over Homesolo is claimed. The working local application is a substantial production-oriented foundation with documented live-data, operational and AI-validation blockers.
