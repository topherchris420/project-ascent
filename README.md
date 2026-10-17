<div align="center">

# Ascent

### Price with proof. Close with confidence.

**An independent real estate decision workspace built around evidence, not black boxes.**

From the first comparable sale to the final closing milestone, Ascent helps you understand the numbers, explain the tradeoffs, and keep the human in control.

[**Explore the live pricing example ↗**](https://project-ascent-theta.vercel.app/) · [Explore the code](https://github.com/topherchris420/project-ascent) · [How it works](#how-ascent-works) · [Run locally](#run-it-yourself)

**Deterministic pricing · Cited evidence · Human-approved decisions · Portable records**

</div>

---

## Real estate is full of consequential decisions. The reasoning shouldn't be hidden.

A listing price is more than a number. Behind it are comparable sales, adjustments, assumptions, market conditions, and a conversation with a real person who deserves to know *why*.

Ascent brings those pieces into one coherent workspace. Instead of handing you an unexplained recommendation, it opens up the calculation: **which sales counted, which didn't, what changed, and what the evidence can actually support.**

And it doesn't stop at pricing. Clients, offers, transaction deadlines, saved reports, and evidence-aware assistance all connect to the same decision trail.

> **The principle:** AI can help explain a decision. It shouldn't secretly make the decision for you.

## Try it first

**[Launch Ascent →](https://project-ascent-theta.vercel.app/)**

The public site includes a **working, interactive pricing example** using a clearly fictional home in Arlington, Virginia. Explore conservative, moderate, and aggressive asking-price positions, adjust the slider, and open **Show the math** to inspect the comparable sales and signed adjustments.

The sample uses Ascent's actual deterministic pricing engine, **not a generated image or fabricated AI answer**. Its properties and prices are illustrative, not real market research.

**Two ways in, with different honesty rules.** *Explore the working demo* opens an isolated, persistent workspace preloaded with a clearly fictional fixture (frozen in time so its deadlines stay meaningful). *Create an account* opens a workspace that starts **empty on purpose**: no invented properties, people, offers or transactions. Evidence arrives only through authorized imports, your own entries, a configured property-data provider, or an explicit, audited choice to load the labeled practice fixture.

**Current hosted access:** The public pricing example is always available. If hosted account services are still being configured, the site says so and the workspace buttons stay out of reach until setup is complete. For an independent workspace, [run Ascent locally](#run-it-yourself).

## What can you do with Ascent?

| Workspace | What it helps you do |
| --- | --- |
| **Pricing studio** | Inspect closed-sale comps, change feature adjustments, exclude unsuitable sales, explore list prices, and save reproducible comparative market analyses (CMAs). |
| **Seller presentations** | Turn reviewed pricing work into a printable report, three-position recommendation, and transparent seller-proceeds scenario. |
| **Market pulse** | Record weekly showings, buyer feedback, offers, and listing changes; examine evidence-linked next-step options. |
| **Clients** | Track contacts, stages, saved searches, inventory matches, conversations, and follow-up tasks in a private workspace. |
| **Offer room** | Compare price, credits, financing, contingencies, timing, and configurable term-strength weights. Draft counters without automatically sending them. |
| **Transactions** | Keep milestones and private documents together; review proposed dates against cited source text before accepting them. |
| **Ask Ascent** | Ask about existing workspace evidence, summarize a CMA, review upcoming tasks, and draft messages with record references. |
| **Data fabric** | Inspect property sources, freshness, record completeness, usage permissions, ingestion runs, and unresolved conflicts. |
| **Portability & teams** | Preview and reconcile CSV imports, export supported records, manage workspace roles, and track approvals. |

These are implemented workflows with different verification and production-readiness levels. The [capability matrix](docs/capability-matrix.md) distinguishes tested behavior from gaps and planned integrations.

## How Ascent works

### 01 · Price the evidence

Start with a subject property and comparable **recorded closed sales**. Ascent applies explicit adjustments for living area, bedrooms, bathrooms, condition, and an optional time trend. Distance, recency, and size similarity affect weights. Excluded comps have reasons.

The result is a weighted estimate and an **observed adjusted-comp range**, not a statistical confidence interval or an appraisal.

### 02 · Explore the decision

Move among conservative, moderate, and aggressive list positions. Change the price and inspect how it relates to the adjusted comps. Edit commission, closing-cost, concession, and payoff assumptions to understand a *hypothetical* seller net.

The scenario calculator does **not** predict that a buyer will pay the selected price or that a listing will sell faster.

### 03 · Inspect evidence fitness and changing decisions

The Pricing studio now exposes **reviewable evidence sufficiency**: effective sample size, weight concentration, adjusted-sale dispersion, source identity and explicit model omissions. These are analyst review heuristics, not a claimed prediction of error. The **Decision Time Machine** compares a saved CMA with today's calculation, showing which sale records entered or left, what source facts and assumptions changed, and how the valuation moved. It cannot assert market causation. [Inspect the methodology](docs/evidence-and-decision-time-machine.md).

### 04 · Keep the reasoning

Save a frozen CMA containing inputs, comp decisions, adjustments, source references, calculation version, and a reproducibility checksum. Build a seller-facing report without silently recomputing yesterday's decision using tomorrow's data.

Any saved snapshot can be **replayed**: Ascent recomputes it from the evidence it archived at save time, checks that the archive still matches its own checksum, and reports either *Reproduced* or exactly where the replay departs. Replay reads the archive only; changing today's records never changes the verdict.

### 05 · Continue the work

Carry that context into client notes, listing reviews, offer comparisons, counter drafts, transaction milestones, and an evidence-linked decision graph. Significant approvals are explicit; **Ascent does not send a client message, accept an offer, or execute a contract for you.**

### 06 · Ask, inspect, decide

Ask Ascent draws on authorized workspace records. Deterministic evidence mode works without a language-model key; optional model synthesis can help explain or draft. Source references, privacy controls, and human review remain important: a citation can identify a record without guaranteeing every sentence is correct.

## What makes it different?

**The math is inspectable.** Pricing calculations are deterministic, with visible assumptions and signed adjustments. Model-generated prose does not set valuation figures.

**The history is reproducible.** A saved analysis freezes the evidence and computation that produced it, and a one-click replay proves it still recomputes to the same checksum. The checksum supports replay and detects accidental drift; it is not cryptographic proof against a determined adversary.

**The user remains the decision-maker.** Suggestions and drafts stop short of consequential actions. A review is recorded instead of quietly sending or signing something.

**Data has a provenance trail.** Property facts retain their source, time, quality explanation, and applicable rights. Conflicts can be quarantined rather than resolved by guesswork.

**Your work can leave the product.** Supported CSV/JSON exports and previewed imports reduce dependence on a single interface or vendor.

**Access is designed to be progressive.** Free exploration is separate from professional verification, provider entitlements, optional AI budgets, and paid-plan configuration.

## Run it yourself

Requires **Node.js 24.x (24.15+ recommended)** and npm.

```bash
git clone https://github.com/topherchris420/project-ascent.git
cd project-ascent
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3040**.

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp` if preferred, and `npm.cmd` in place of `npm` if script execution is blocked.

Choose **Explore the working demo** for a fixture-filled practice workspace, or **Create an account** for a workspace that starts empty and fills only with evidence you bring in (the overview offers three honest starting points: provider research, a previewed import, or the labeled practice fixture). Local SQLite data is stored in the ignored `.data/ascent.sqlite`; keep `.data/` and `.env.local` private. No external property-data key or AI key is required to explore the synthetic demo and deterministic workflows.

**Production is different:** production uses PostgreSQL with tenant isolation, appropriate encryption/configuration, and an authorized deployment. Do not deploy the local SQLite setup as a customer service. See [architecture and security](docs/engineering.md), [PostgreSQL setup](docs/postgres-connection.md), and [Vercel guidance](docs/vercel-hobby.md).

### Optional integrations

| Service | Purpose | Important boundary |
| --- | --- | --- |
| **RentCast** | Server-side property research, recorded-sale comparisons, listing/AVM context, and ZIP statistics | Requires a key, appropriate contractual rights, reviewed grants, and request/spend limits. **Not an MLS feed.** |
| **Groq** | Optional GPT-OSS synthesis and drafting grounded in authorized records | Requires a key, explicit sharing controls, model budgets, and factual review. |
| **OpenAI** | Optional secondary model integration | Disabled unless deliberately configured and authorized. |
| **Stripe** | Configurable subscription checkout and lifecycle | Requires actual price IDs, keys, webhook configuration, and production acceptance. |

Provider credentials belong **server-side only**. Never put keys in client code or commit them. See [RentCast boundaries](docs/rentcast-integration.md) and [AI architecture](docs/ai-architecture.md).

## Built for people who want to inspect the system

Ascent uses **Next.js 16, React 19, TypeScript, Zod, Node.js 24, local SQLite, and production PostgreSQL/PostGIS**. Pricing logic can run instantly in the UI and is recomputed server-side before a result is saved. Workspace authorization, database writes, provider calls, and optional model requests stay on the server.

A useful map for contributors:

| Where | What lives there |
| --- | --- |
| `src/` | Application, pricing, workspace, APIs, and UI |
| `migrations/` | Versioned PostgreSQL schema and tenant protections |
| `tests/` | Unit, integration, and browser coverage |
| `scripts/` | Benchmarks, evaluations, migrations, and deployment checks |
| `evidence/` | Recorded synthetic and bounded integration-verification artifacts |
| `docs/` | Architecture, provider rights, operations, limitations, and validation |

### Verify a change

```bash
npm run typecheck
npm test
npm run test:e2e
npm run benchmark
npm run evaluate:domain
npm run evaluate:ai
npm run build
```

Playwright requires Chrome or an appropriately configured `CHROME_PATH`. Not all checks are equivalent: synthetic benchmarks, provider smoke tests, and production acceptance answer different questions. Review [verification results](docs/verification-results.md) before interpreting performance or accuracy.

## Contributing and open-source status

Ascent is intended to be **open-source, inspectable, and extendable**. Useful contributions include accessibility improvements, reproducibility checks, privacy boundaries, import/export adapters for authorized data, better uncertainty communication, and careful domain tests.

For now, **check repository visibility and licensing before treating the source as openly reusable**. GitHub currently reports this repository as *private*, and an open-source license file was not found at the repository root during this README update. Public access to the web app alone does not grant an open-source code license. The maintainer should make the repository public and add an explicit `LICENSE` file to complete that transition.

Once those are in place, open an issue describing a proposed change, its evidence, and any data-rights implications before substantial work. Please do not submit copied proprietary MLS data, private client records, access tokens, or third-party code without reuse permission.

## Trust, limitations, and what's next

Ascent deliberately makes a distinction between **software that runs** and **claims that have been validated in the real world**:

- **Demo data is fictional, and only the demo has it.** The public pricing example and the demonstration workspace are illustrative and labeled synthetic on every screen. A new private account contains nothing until its owner adds evidence; fixture records enter it only by an explicit, audited request.
- **No MLS rights are bundled.** RentCast is a separate property-data provider. Any live source requires its own permissions and appropriate professional eligibility.
- **No appraisal or legal opinion is produced.** CMA calculations and date extraction are decision aids requiring qualified review. Scanned-document OCR and comprehensive holiday calendars are not available.
- **No proven predictive accuracy or business outcome is claimed.** Adjusted-comp ranges, offer scores, scenario calculations, and synthetic outcomes are not calibrated future-sale probabilities.
- **Model output is not a substitute for evidence.** Cited AI explanations can still be wrong. External model use must respect data-sharing restrictions.
- **Production readiness is still being established.** Hosted database acceptance and bounded integration checks are documented; deployment configuration, provider rights, payment settlement, reliability, and operational security still have outstanding gates.

For the exact state of the project, read the [capability matrix](docs/capability-matrix.md), [verification results](docs/verification-results.md), and [remaining production work](docs/remaining-work.md).

---

<div align="center">

### Better decisions deserve visible reasoning.

A real estate workspace where the evidence survives the conversation.

[**Explore Ascent ↗**](https://project-ascent-theta.vercel.app/) · [Read the engineering notes](docs/engineering.md)

**Ascent · Real estate, reasoned.**

</div>
