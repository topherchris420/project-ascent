<div align="center">

[![CI](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml)

# Ascent

### Real estate intelligence belongs to homeowners.

**You should never have to accept a number you cannot understand.**

Ascent is free, open-source real estate intelligence for homeowners and anyone who wants to see the evidence behind a price. Explore comparable sales, challenge assumptions, test a scenario, and keep a report you can explain. Public pricing requires no account or professional license.

**[DC homes](https://project-ascent-theta.vercel.app/dc) · [Maryland homes](https://project-ascent-theta.vercel.app/maryland) · [DC condos](https://project-ascent-theta.vercel.app/dc/condos) · [Try the sample](https://project-ascent-theta.vercel.app/demo)**

[Published accuracy](https://project-ascent-theta.vercel.app/accuracy) · [Our free-service promise](https://project-ascent-theta.vercel.app/free)

No account needed for the public pricing studios.

**[My Home](https://project-ascent-theta.vercel.app/home)** keeps browser-local property profiles and decision history. Open any supported studio to compare selling, continuing ownership, renting, renovating before sale, refinancing, or buying while retaining the current home. Entered debt, costs and rent remain assumptions; missing inputs stay unknown. [Calculation and privacy boundaries](docs/homeowner-workbench.md).

</div>

---

A homeowner asks, **“Why this price?”** Ascent gives them the working: comparable sales, adjustments, assumptions and a report they can challenge. It complements professional advice; it is not an appraisal or a live MLS feed.

## Made for the people who own the homes

- **Find the evidence.** Search eligible DC houses, Montgomery and Prince George’s County homes, or DC condos, each with explicit limits.
- **Understand the number.** Inspect recorded comparable sales, adjustments, weights and assumptions.
- **Explore a choice.** Change an asking price or cost assumption and compare illustrative outcomes, not predicted sale prices.
- **Compare ownership decisions.** Model fixed-rate debt, monthly cash flow, equity, cash reserves, break-even thresholds and hypothetical property changes across six choices. Financial calculations run locally and never call an external model.
- **Keep a Property Evidence Passport.** Explicitly save private ownership profiles and versioned decisions on this device, compare exact evidence/assumption changes, and export privacy-filtered JSON or a standalone printable report. Use browser Print to save a PDF. On-demand monitoring reports actual snapshot differences; an unchanged dataset creates no market alert.
- **Keep the reasoning.** Print a report or export source-aware analysis to discuss with someone you trust.
- **Know what is missing.** Public records are snapshots. Live listings, concessions, building attributes and interior condition may be absent.

Homeowners can use the public studios without an account. Existing client, offer and transaction tools remain in configured private workspaces for people who need them.

Homeowner profiles are browser-local, with up to ten homes and ten versions per home subject to storage limits. They do not synchronize with an account. Pricing drafts already autosave selected price, selling fees and payoff; additional ownership fields require an explicit save. Shared devices can expose stored information. Financial comparisons exclude replacement housing, tax effects and loan qualification, and do not rank which choice is best for a household. Sharing exports omit private finances and notes by default; downloaded copies cannot be revoked.

**Product principle: The homeowner should never have to accept a number they cannot understand.**

[Homeowner-first product direction](docs/homeowner-first.md) · [Published accuracy](https://project-ascent-theta.vercel.app/accuracy) · [Free-service promise](https://project-ascent-theta.vercel.app/free)

## Start with one decision

| You want to… | Start here |
| --- | --- |
| Analyze a real home | **[DC Pricing Studio](https://project-ascent-theta.vercel.app/dc)** — search covered single-family homes in District public records. No address in mind? Try the example address. |
| Analyze a Maryland home | **[Maryland studio](https://project-ascent-theta.vercel.app/maryland)** — Montgomery and Prince George’s homes. Uses area, construction-quality grade, location, and sale timing; bedroom/bathroom data is unavailable. Revised accuracy: 9.52% median error, with one of nine criteria unmet. |
| Analyze a DC condo | **[Condo studio](https://project-ascent-theta.vercel.app/dc/condos)** — unit-level DC records and condo-only comparables. A separate test reports 12.95% median error and four of nine criteria met; no calibrated interval is offered. |
| Learn by doing | **[Fictional sample](https://project-ascent-theta.vercel.app/demo)** — explore an Arlington example using the actual pricing engine. |
| Work through a deal | **[Workspace demo](https://project-ascent-theta.vercel.app/)** — choose **Explore the working demo** for fictional clients, offers and deadlines. |
| Bring your own evidence | Choose **Create an account** on the homepage. Your workspace starts empty. |

Hosted workspaces require configured account services. The public studios work independently.

## See it. Challenge it. Keep it.

1. **See the evidence.** Inspect each closed sale, its adjustments, and its contribution to the estimate.
2. **Test a price.** Compare pricing positions and seller proceeds under your chosen cost assumptions.
3. **Challenge the reasoning.** Change a condition rating, adjust a rate, or exclude a sale with a reason. Added sales are marked unverified. Reset to the original analysis; undo the reset if you change your mind.
4. **Keep the decision.** Open a printable report or export JSON with the calculation, sources, and assumptions. Drafts save in this browser on this device.

The calculation is deterministic. AI does not set the price. An adjusted-sale range describes the comparable evidence; it is not automatically a confidence interval.

## Carry the reasoning through the deal

The private workspace connects pricing snapshots, client notes, saved searches, offer comparisons, and transaction milestones. **Ask Ascent** explains the record on screen, separating facts, calculations, assumptions, and unknowns. Drafts and approvals stay with the user.

Saved pricing analyses freeze their inputs. Replay them later, or use the **Decision Time Machine** to see which evidence and assumptions changed. Supported CSV/JSON exports keep your work portable.

[Explore the workflows](docs/capability-matrix.md) · [How decision replay works](docs/evidence-and-decision-time-machine.md)

## Free, by design

**Ascent's core workflows stay free.** Public-record research, basic comparable analysis, reports, clients, offers, and deadline workflows require no subscription or payment card. The public pricing studios do not require an account.

[Read the free-service promise](https://project-ascent-theta.vercel.app/free). External AI and property providers have costs, quotas, and sometimes separate permission requirements. Reaching a limit stops those calls; it does not trigger a charge. Deterministic analysis remains available. Ascent does not currently offer paid plans or new subscription checkout.

## Published accuracy: results and limitations

These are **internal, reproducible retrospective evaluations**, not independent certification, appraisals, or guarantees for an individual property. Median error is the median absolute percentage difference between an estimate and the recorded sale price, calculated on the valued holdout sales.

| Pricing population | Held-out sales | Median error | Within ±10% | Acceptance criteria |
| --- | ---: | ---: | ---: | --- |
| **DC single-family homes** | 2,254 | **9.98%** | 50.2% | **9/9 met**, several narrowly |
| **Maryland, revised model** (Montgomery + Prince George’s) | 2,812 | **9.52%** | 52.0% | **8/9 met**, price-related bias failed |
| **DC condominiums** | 1,434 | **12.95%** | 41.16% | **4/9 met**, overall acceptance failed |

**Important distinctions:**

- **DC houses:** Only the unmodified DC-validated settings can display a calibrated range. Adjustments or missing evidence remove that claim. District recorded sales may lag; public records omit MLS listing history and concessions.
- **Maryland:** The revised study uses a different July–September 2026 holdout from the **original failed study** (13.85% median error on 12,831 sales, 4/9 criteria). These figures are **not a like-for-like before/after accuracy comparison**. Construction-quality grade is not inspected condition; bedroom and bathroom fields are absent. No current-home calibrated range is released.
- **DC condos:** A condo-specific model was tested, but five criteria failed. Building-level effects and HOA fees, floor, views, parking, amenities, and interior condition remain unmodeled. No current-home calibrated range is released.
- **Coverage and rights:** Public studios use bounded DC and two-county Maryland snapshots, not live MLS inventory. Virginia remains unavailable pending written source-use permission; [permission requests are drafted but unsent](docs/data-permissions/virginia-requests.md).
- **Scope:** Fictional sample/workspace data is labeled as such. Reports support human decisions, **not appraisals**. Ascent does not send messages, accept offers, or sign contracts on behalf of users.

**[Explore every published experiment](https://project-ascent-theta.vercel.app/accuracy)** · [Detailed valuation methodology and original results](docs/valuation-validation.md) · [Latest experimental and release gates](docs/production-readiness.md) · [Data coverage](docs/dc-public-records.md)

## Run locally

Requires **Node.js 24.x** and npm.

```bash
git clone https://github.com/topherchris420/project-ascent.git
cd project-ascent
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3040**. On PowerShell, use `Copy-Item .env.example .env.local` if needed.

No provider or model key is required for the bundled public records, fictional sample or deterministic workflows. Local workspaces use SQLite in `.data/`; production requires PostgreSQL and deployment configuration. Keep `.env.local` and `.data/` private.

Optional integrations: **RentCast** for authorized property research, and **Groq/OpenAI** for model-assisted explanations. Credentials stay on the server.

[Engineering](docs/engineering.md) · [PostgreSQL](docs/postgres-connection.md) · [Vercel](docs/vercel-hobby.md) · [Provider setup](docs/rentcast-integration.md)

## Verify and contribute

Next.js 16 · React 19 · TypeScript · Node.js 24

```bash
npm run typecheck
npm test
npm run validate:valuation -- --check
npm run build
npm run test:e2e
```

GitHub Actions runs these checks, offline domain/AI checks, Chromium browser workflows, and a disposable PostgreSQL backup/restore drill on pull requests and pushes to master. **[Check the current CI results](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml)**. A passing synthetic test suite is not a production security or accuracy certification.

### Accounts, AI, and production setup

- Public pricing studios run from bundled records without a provider/model key. Local workspaces use SQLite in the ignored data directory. Production requires PostgreSQL, reviewed migrations, and restricted runtime permissions.
- Account recovery and authenticator MFA are implemented; hosted rollout still requires migration 004, appropriate database grants, configured recovery email, and end-to-end acceptance on the deployed origin.
- **Ask Ascent** has deterministic evidence explanations. Production external-model synthesis is currently held behind a pending independent AI review; supplying a Groq or OpenAI key alone does not enable approved production model responses.
- Provider access, MLS agreements, data retention, privacy operations, and deployment-specific safeguards remain separate release requirements. Actual customer adoption and outcomes have not been established.

[Production readiness](docs/production-readiness.md) · [Account-security deployment](docs/account-security.md) · [AI review status](docs/ai-independent-review.md) · [Complete verification history](docs/verification-results.md) · [Engineering](docs/engineering.md)

Application code is in `src/`, migrations in `migrations/`, tests in `tests/`, and methodology in `docs/`. Contributions should preserve reproducibility, accessible interactions, source-use permissions, and workspace isolation. Browser tests require a configured Chromium installation; see the verification guide for local setup.

## License

Project Ascent is open source under the [MIT License](LICENSE). You may use, modify, distribute and commercially use the software subject to the license's notice requirements. Third-party data, content, and services retain their own licenses and terms; the MIT License does not grant MLS access or external data rights.

---

**Ascent · Real estate intelligence for the people who own the homes.**
