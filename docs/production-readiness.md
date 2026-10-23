# Production readiness checkpoint

October 18, 2026. These changes reduce specific gaps. They do **not** establish professional production readiness or independent certification.

| Priority | Implemented and measured | Remaining release dependency |
| --- | --- | --- |
| Homeowner workbench | Shared public-studio dashboard, six deterministic financial choices, browser-local profiles, versioned evidence passports, privacy-filtered reports/JSON, contextual deterministic explanations and on-demand record comparisons. [Implementation and exact boundaries](homeowner-workbench.md). | Device storage is not cloud synchronization or encrypted storage. Household replacement housing, tax effects and loan qualification remain outside these scenarios. New feeds, background refresh/delivery and independently reviewed accuracy remain separate gates. |
| Maryland | Separately registered v2, frozen before scoring; original failed report untouched. July–September 2026: 2,812 sales, 94.13% valued, 9.52% median error versus 10.20% untuned; 8/9 criteria. Quality coefficient $63,889, below the predeclared $75,000 cap. | PRD 1.04218 still fails 0.98–1.03. Three-month window and recording lag. No calibrated ranges. Independent replication and a longer prospective holdout remain. |
| DC condos | Separate condo-only fit, selection, calibration and holdout. 1,434 sales, 96.23% valued, 12.95% median error; 4/9 criteria. Published failed results; fitted defaults, unknown condition kept disabled. | Fails median error, PPE10, COD, PRD and improvement over median $/sqft. No calibrated ranges. Building-correlated outcomes and unmodeled HOA/floor/view/parking limit the study. |
| CI | GitHub Actions on every PR and master push: Node 24, typecheck, unit/integration tests, committed valuation evidence checks, offline domain/AI checks, production build, Chromium browser suite and synthetic PostgreSQL dump/restore. Actions pinned to exact reviewed release commits; read-only token, no production secrets. | A workflow file is not proof a run passed. See the actual GitHub Actions run for the pushed commit. Required branch checks need repository policy configuration. |
| Account security | One-use 30-minute reset tokens stored hashed; encrypted mail outbox; trusted configured origin; generic responses; account/IP throttling; sessions revoked after reset. Authenticator MFA, encrypted secrets, setup expiry, replay prevention, eight one-use hashed recovery codes, all sessions revoked at enrollment. Production owner/agent sessions require completed MFA. | Apply migration 004 with a migration identity and grant its four tables to the restricted runtime role before releasing account routes. Configure verified recovery-email delivery and exercise it on the deployed origin. Email ownership verification, device management and independent security review remain. |
| Operations and data | Disposable PostgreSQL restore drill covers all migrations, encrypted document recovery, restored sessions/MFA recovery and forced tenant isolation. Existing permission, expiry, export, retention and AI source gates remain tested. [Operating requirements](operations-and-compliance.md). | Configure and verify actual provider backups, retention, keys and restore access. Run an isolated restoration from an authorized production backup and record the measured RPO/RTO. Never infer licensed rights from public visibility. |
| AI | Production model synthesis fails closed until the versioned independent-review record names approved models, two independent reviewers, a report digest and unexpired approval. Deterministic assistance remains available. | No independent human accuracy review exists. Offline mocked checks and prior live smoke are engineering evidence, not semantic accuracy certification. [Review plan](ai-independent-review.md). |
| Free service | Public free-service promise at `/free`; permanently free public research/basic CMA/reports/client/offer/deadline workflows. No new checkout, even with old Stripe prices configured. Only Free Explorer is offered in billing UI/API. | External providers and hosting have costs and limits. Legacy subscription reconciliation and customer cleanup remain for historical records; those definitions are not current paid offers. |

## October 21, 2026 checkpoint: Home Decision Brief and external validation

| Priority | Implemented and measured | Remaining release dependency |
| --- | --- | --- |
| Home Decision Brief | Seven-question brief in every studio, each figure traced to a record, an assumption or a calculation; verdict policy `ascent-brief-verdict-1` states no value below three eligible sales or when the release checks withhold the result; Ask Ascent answers value and evidence questions from the brief with references; brief carried into the passport, privacy-filtered by default. [Implementation map and limits](home-decision-brief.md). | Comprehension is untested: the [usability protocol](usability-protocol.md) has not been run and has no participants or results. |
| Financial depth | Exact one-input sensitivity, five engine-solved break-evens and a 1–20 year holding profile over the unchanged finance engine; exclusions shown above the comparison. | Taxes, replacement housing, inflation and loan qualification remain outside the arithmetic. |
| External validation | Registered and pushed before download, data locked before valuation, scored once: four counties Ascent does not serve, 19,039 holdout sales, 12.26% median error, 5/9 criteria, acceptance failed. The registered supplement supports both verdict-policy hypotheses; neither vertical-equity recalibration passed. [Results](valuation-validation.md#external-maryland-validation-four-counties-protocol-ascent-valuation-validation-maryland-external-1). | The method is not supported beyond Montgomery and Prince George's. No calibrated range is released in Maryland. A prospective holdout and independent replication remain. |

## October 22, 2026 checkpoint: replication, comprehension and property records

| Priority | Implemented and measured | Remaining release dependency |
| --- | --- | --- |
| Independent replication | Replication brief, rubric, method specification and data dictionary; `npm run replicate`; an exact standard-library Python re-derivation that reproduced all six reports, digests and bootstrap intervals included; a signed record format checked on every `--check` and shown on the accuracy page. [Brief](independent-replication.md). | No outside researcher has reproduced any result or assessed the method. Every accuracy figure remains internal validation. |
| Homeowner comprehension | Protocol `ascent-usability-brief-1` registered with a digest; fixed study pages that never touch device storage; facilitator materials; generated answer key; analysis with Wilson intervals; browser pre-flight passing. [Study kit](usability/README.md). | No participant has completed a session. No comprehension claim is possible until 12–16 homeowners have, and the results are published. |
| Property records | Assessor facts for 92,142 DC houses, 51,340 condo units and 462,347 Maryland homes; 242,193 DC house permits, 22,040 condo unit and building permits, 65,618 Montgomery permits; condominium names and units; an inferred condo floor, always labeled; comparable-sale notes; a freshness policy and a dated probe of newer sales. All shown in the brief; none reaches the estimate. [Sources, rules and coverage](property-data.md). | No interior condition, condo dues or reserves in any public source. Prince George's permits lack a license. Fresher sales need a new registered protocol or a licensed feed. Using the new facts in the model needs its own registered study. |

## October 22, 2026: offer workflow hardening

The Offer Lab now supports validated, previewed restoration of existing private exports for the same home, with explicit replacement and failure-safe persistence. Imported calculations are discarded and recomputed under current evidence restrictions. Relative deadlines no longer fall back to today when acceptance is unknown; invalid calendar dates are rejected, contradictory timelines appear in the brief, and one selected offer can be downloaded as tentative calendar review markers. [Behavior and limits](homeowner-os.md#offer-portability-and-calendar-handoff).

These changes improve continuity and handoff for a homeowner's real workflow. They do not establish MLS access, independent valuation validation, customer adoption or contract review. No new external service, paid data source or account is required.

Local verification: 508 unit/integration tests passed, valuation evidence checks passed, TypeScript and the production build passed. The three new browser scenarios and the existing Compare Offers workflow passed; mobile coverage includes an axe accessibility scan, 390-pixel layout, wrong-home rejection and a simulated storage-quota failure. The accessibility check exposed a non-focusable scrolling comparison table, which is now labeled and keyboard-focusable. Calendar file contents were checked in tests; import behavior in individual calendar products has not been tested. Full repository browser and PostgreSQL restore suites remain CI checks.

## Honest evaluation boundaries

The new Maryland holdout is **previously unscored**, not prospectively collected: its records were already in the bundled snapshot, and counts and interface examples had been inspected. The original failed holdout was available during development. Commit `81b7090` registers the new windows, screening, coefficient cap, unchanged acceptance bars and sensitivity before either new study ran.

V2 imposes a $50,000 minimum consideration in all primary windows and comparable pools, without looking at residuals. It separately reruns the frozen fit/search/calibration on all positive consideration. That sensitivity has the same 2,812 test subjects (none below $50,000 in these three months) and a slightly different historical comp pool: 9.52% median error, COD 14.80, PRD 1.04204. It does not rescue the failed PRD bar. The original low-value transfers and extreme dispersion remain in v1, unchanged.

Descriptive primary county slices: Montgomery 1,733 subjects / 1,634 valued / 9.56% median error; Prince George’s 1,079 / 1,013 / 9.46%. These are not separately selected, calibrated or accepted county models.

Actual customer adoption, sustained use and professional outcomes are not demonstrated by the published software checks. No external permission request or client communication was sent.

## Reproduce

```text
npm ci
npm run typecheck
npm test
npm run validate:valuation -- --check
npm run validate:valuation -- --verify --market dc-condos
npm run validate:valuation -- --verify --market maryland-v2
npx tsx scripts/maryland-v2-sensitivity.ts
npm run evaluate:domain
npm run evaluate:ai
npm run test:e2e
npm run build
```

Use Node 24. Ordinary browser tests create a temporary SQLite database and encryption key, clear live provider credentials, and cannot use local production settings. The expressly opt-in cached-live test keeps its separate workflow. PostgreSQL restore acceptance requires a disposable loopback PostGIS server and the guarded command documented below.

## Executed verification

The [first complete CI run](https://github.com/topherchris420/project-ascent/actions/runs/39138635331) passed all three jobs on commit `4ca46cb`: 337 unit/integration tests, evidence checks for five experiments, offline domain/AI checks, production build, full browser suite and a real synthetic PostgreSQL dump/restore. A follow-up extends PostgreSQL acceptance to recovery-mail restoration and password reset, and requires MFA enrollment for legacy integration owners. Check the final commit’s CI run for those additions. Local affected browser tests passed 6/6 (desktop/mobile Maryland and condos, authenticator enrollment and reset-link handling). Condo `--verify` reproduced the report digest and every held-out estimate exactly. No external expert review, real recovery email or production restore was performed.

The [extended-safeguard CI run](https://github.com/topherchris420/project-ascent/actions/runs/39139015461) also passed all three jobs on `a8cfb3d`, including recovery-mail restoration and password reset under production PostgreSQL safeguards. Both new valuation experiments now reproduce their exact report digests and every per-sale estimate under full `--verify` reruns. Live public report endpoints match these digests and continue to withhold calibrated ranges. The owner chose to configure production migration/grants and verified email delivery separately.
