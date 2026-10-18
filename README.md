<div align="center">

# ascent.

### Your home is more than a number. Understand the evidence behind it.

**A home estimate should begin a conversation, not end one.**

Ascent is a **free, open-source real estate intelligence tool built for homeowners**. Explore recorded sales, understand how a price was calculated, test the financial consequences of a decision, and take the reasoning with you.

No professional license. No subscription. No account required for the public pricing studios.

**[Explore DC homes](https://project-ascent-theta.vercel.app/dc)** · **[Explore Maryland homes](https://project-ascent-theta.vercel.app/maryland)** · **[Explore DC condos](https://project-ascent-theta.vercel.app/dc/condos)** · **[Try a fictional example](https://project-ascent-theta.vercel.app/demo)**

[My Home](https://project-ascent-theta.vercel.app/home) · [Published accuracy](https://project-ascent-theta.vercel.app/accuracy) · [Free-service promise](https://project-ascent-theta.vercel.app/free) · [Live application](https://project-ascent-theta.vercel.app/)

[![CI](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml)

</div>

---

## The question isn't just "What is my home worth?"

It's **why**, **compared with what**, and **what happens if I choose differently?**

Imagine you are considering selling. Someone gives you a number. Usually, that's where the explanation stops.

Ascent lets you investigate the number instead:

1. **See the sales.** Inspect the recorded comparable properties, their differences, their adjustments, and how much each one influences the estimate.
2. **Challenge the assumptions.** Test a different condition rating, exclude a questionable comparable with a reason, or explore another asking price.
3. **Explore the decision.** Examine illustrative selling proceeds and, with your own financial inputs, compare selling, holding, renting, renovating before sale, refinancing, or buying while keeping your current home.
4. **Keep the evidence.** Save a versioned Property Evidence Passport on your device, revisit changed assumptions, and export a report you can examine, print, or share.

You see **recorded facts, calculated estimates, your assumptions, and unknowns as different things**. Ascent does not present an adjusted-sale range as a statistical confidence interval or a scenario as a forecast.

## Find your starting point

| Your question | Where to go | Coverage and caution |
| --- | --- | --- |
| What supports the price of a DC house? | **[DC Pricing Studio](https://project-ascent-theta.vercel.app/dc)** | Eligible District single-family and rowhouse sales in a bounded public-record snapshot |
| What about my Maryland home? | **[Maryland Pricing Studio](https://project-ascent-theta.vercel.app/maryland)** | Montgomery and Prince George's counties; bedroom/bathroom details are not available in this source |
| How do DC condo prices compare? | **[DC Condo Studio](https://project-ascent-theta.vercel.app/dc/condos)** | Unit-level condo sales; the published condo accuracy study did **not** meet overall acceptance |
| Can I try this without a real address? | **[Interactive sample](https://project-ascent-theta.vercel.app/demo)** | Clearly fictional Arlington property; real pricing engine, illustrative evidence and assumptions |
| Where are my saved decisions? | **[My Home](https://project-ascent-theta.vercel.app/home)** | Saved in this browser on this device; no account synchronization |
| What if I manage clients or offers? | **[Workspace entry](https://project-ascent-theta.vercel.app/)** | Fictional workspace demo or an empty private workspace when account services are configured |

**Start with the public studios.** They work without a provider key, paid plan, or sign-in.

## Built for decisions, not just estimates

### 01 · Make the price explain itself

Inspect closed sales, distance, size, age, weighting, adjustments, exclusions, and source provenance. Explore sensitivity to individual inputs and compare asking-price scenarios. A changed assumption produces a changed calculation, not a hidden AI opinion.

### 02 · Follow the money

The homeowner workbench connects property evidence to **six deterministic ownership choices**:

- Sell now
- Continue owning
- Rent the property
- Renovate before selling
- Refinance
- Buy another home while retaining this one

Enter your own debt, rates, expenses, rents, and other assumptions. The workbench calculates applicable payment schedules, monthly cash flow, equity, cash requirements, and break-even comparisons. Missing inputs stay **unknown**; Ascent does not quietly manufacture your mortgage, tax bill, rent, or renovation costs.

These are **illustrative, pre-tax comparisons**, not financial advice or predictions. They exclude important household considerations including replacement housing, tax effects, loan qualification, and financing availability. The choices do not represent equivalent housing outcomes and are not ranked as the best option for you.

[How the homeowner workbench calculates and abstains](docs/homeowner-workbench.md)

### 03 · Remember what changed

A **Property Evidence Passport** brings the property's public evidence, your saved decisions, assumptions, and calculation versions into one reproducible history. Compare saved versions, see whether records or assumptions actually changed, and export a privacy-filtered JSON or standalone printable HTML report. Use your browser's Print command to save a PDF.

The **Decision Time Machine** distinguishes changed comparable evidence from changed homeowner assumptions. Its on-demand checks do **not** mean Ascent monitors the live market, fetches listings in the background, or sends price alerts.

### 04 · Ask for the explanation

**Ask Ascent** can explain the calculations and evidence in context. Core pricing and homeowner financial computations are deterministic; **AI does not set the home's price**. Optional Groq/OpenAI integrations are separately configured, and production external-model synthesis remains blocked pending independent review.

## Our accuracy is public. So are the misses.

An impressive-looking price is not proof of accuracy. Ascent publishes reproducible retrospective tests, including criteria the models failed.

| Market and model | Held-out sales | Median absolute percentage error | Estimates within ±10% of recorded sale price | Criteria met |
| --- | ---: | ---: | ---: | ---: |
| **DC single-family / rowhouses** | 2,254 | **9.98%** | 50.2% | **9/9**, several narrowly |
| **Maryland, revised model** | 2,812 | **9.52%** | 52.0% | **8/9**; price-related bias criterion failed |
| **DC condominiums** | 1,434 | **12.95%** | 41.16% | **4/9**; overall acceptance failed |

*Published internal holdout studies as of October 18, 2026. Median error describes a tested group, **not** the expected error of your individual home. These are not independently certified results, appraisals, or guarantees.*

A few distinctions matter:

- **DC houses:** Results depend on the exact validated configuration. Only that unmodified eligible configuration may display a calibrated interval; custom changes or insufficient evidence remove that claim. Several acceptance bars were met narrowly.
- **Maryland:** The revised study used a different holdout from an earlier failed model. Its improved headline number is **not** a like-for-like before/after comparison. One of nine criteria still fails; no current-home calibrated interval is released.
- **DC condos:** Five of nine acceptance criteria failed. Important building attributes such as HOA fees, floor, view, parking, and amenities are unmodeled. No calibrated interval is released.
- **All markets:** Public records may be delayed or incomplete. An adjusted comparable-price envelope is not automatically a calibrated probability interval.

**[Read the full results](https://project-ascent-theta.vercel.app/accuracy)** · [Methodology, protocols and historical findings](docs/valuation-validation.md) · [Latest release and validation gates](docs/production-readiness.md)

## What Ascent does not pretend to know

Ascent is **not a live MLS feed, licensed appraisal, brokerage, or automatic transaction agent**.

- Public address research currently covers qualifying **Washington, DC houses and condos** and **Montgomery / Prince George's County, Maryland** homes. It does not provide nationwide coverage.
- **Virginia public-record pricing is not available**. Written source-use permission remains unresolved. Neither an open-source license nor public website access creates MLS or provider redistribution rights.
- Listing status, concessions, property condition, renovations, title details, building characteristics, and other decisive facts can be missing.
- Seller scenarios do not predict buyer response, time on market, future prices, or renovation return on investment.
- Ascent does not autonomously message clients, make offers, sign contracts, or decide what someone should do.

Ascent is designed to make the **limits visible alongside the evidence**, not hide them in small print.

[DC source scope](docs/dc-public-records.md) · [Maryland source scope](docs/maryland-public-records.md) · [Condo model and limitations](docs/dc-condominiums.md) · [Homeowner-first roadmap](docs/homeowner-first.md)

## Your decisions stay yours

**My Home** stores private ownership inputs and Property Evidence Passports locally in your browser, not in an Ascent account. You explicitly save the additional financial inputs and history you want to keep. The storage supports up to **10 homes and 10 versions per home**, subject to browser limits.

- No account synchronization or encryption of browser storage is provided. Shared devices and cleared browser data matter.
- Privacy-filtered exports **exclude private finances and notes by default**; sharing them intentionally requires an explicit private export.
- Downloaded reports or JSON copies cannot be recalled once shared.
- Public pricing drafts separately autosave selected asking price, selling fees, and payoff in the browser. Additional ownership inputs are explicitly saved.
- Optional account-based workspaces have a separate data, authentication, and deployment model.

[Read the calculation and privacy boundaries](docs/homeowner-workbench.md) · [Account security and deployment requirements](docs/account-security.md)

## Free is a product decision

Ascent's public research, basic comparable analysis, reports, and core client, offer, and deadline workflows are committed to remaining **free**, with no subscription or payment card. There are no current paid plans or new subscription checkout.

Outside data services and hosted AI have their own costs, quotas, and permission requirements. If a configured limit is reached, the corresponding external request stops; Ascent does not charge you automatically. Free software does not guarantee unrestricted third-party data or perpetual hosted availability.

[Read the free-service promise](https://project-ascent-theta.vercel.app/free)

## Run Ascent locally

**Requirements:** Node.js **24.x** and npm.

```bash
git clone https://github.com/topherchris420/project-ascent.git
cd project-ascent
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3040**. In Windows PowerShell, replace the copy step with `Copy-Item .env.example .env.local`.

Bundled public-record studios, the fictional sample, and deterministic calculations do **not** require a RentCast, Groq, or OpenAI key. Local workspaces use SQLite under the ignored `.data/` directory. A production workspace needs properly configured PostgreSQL, migrations, account services, and security controls.

Keep `.env.local`, `.data/`, and provider credentials private. Optional integrations include authorized **RentCast** property research and separately gated **Groq/OpenAI** model-assisted workflows; keys must remain server-side.

[Engineering guide](docs/engineering.md) · [Provider configuration](docs/rentcast-integration.md) · [PostgreSQL setup](docs/postgres-connection.md) · [Vercel deployment](docs/vercel-hobby.md)

## Verify it. Improve it.

Ascent uses **Next.js 16, React 19, TypeScript, and Node.js 24**. Core code lives in `src/`, tests in `tests/`, database migrations in `migrations/`, and research/provenance documentation in `docs/` and `evidence/`.

```bash
npm run typecheck
npm test
npm run validate:valuation -- --check
npm run build
npm run test:e2e
```

Browser tests need Chromium installed and configured. CI additionally includes offline domain/AI checks and a disposable PostgreSQL restore drill; **check the actual run status** rather than treating the presence of tests as a certificate of production readiness.

**Contributions are welcome**, especially ones that improve homeowner comprehension, mobile accessibility, reproducible valuation, provenance, privacy, and authorized data coverage. Preserve the frozen evaluation history, source permissions, workspace isolation, and explicit unknowns. Do not improve a headline metric by concealing a failed test.

[Current CI](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml) · [Verification history](docs/verification-results.md) · [Capability matrix](docs/capability-matrix.md) · [Production readiness](docs/production-readiness.md)

## License

Ascent is released under the **[MIT License](LICENSE)**. You may use, study, modify, and distribute the software under its terms. **Third-party datasets, MLS content, APIs, and provider services retain their own rights and agreements**; MIT does not grant access to or redistribution rights for them.

---

<div align="center">

**The best real estate decision is one you can explain.**

[Open Ascent](https://project-ascent-theta.vercel.app/) · [Explore the evidence](https://project-ascent-theta.vercel.app/dc) · [Study the code](https://github.com/topherchris420/project-ascent)

</div>
