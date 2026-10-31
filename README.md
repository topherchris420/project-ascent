<div align="center">

# ascent.

### Your home is more than a number. Your decisions deserve the evidence.

**Research the market. Understand your options. Make a decision you can explain.**

Ascent is a **free, open-source home decision studio** for buyers, homeowners and sellers in **Washington, DC and Montgomery / Prince George's counties, Maryland**. Explore recorded sales, check homebuyer assistance rules, inspect the evidence behind a home estimate, and compare the financial consequences of your next move.

**Start with public tools. No account, payment card or professional license required.**

**[Explore Ascent](https://project-ascent-theta.vercel.app/)** · **[Search recorded sales](https://project-ascent-theta.vercel.app/sales)** · **[Check buyer assistance](https://project-ascent-theta.vercel.app/programs)** · **[Try the interactive demo](https://project-ascent-theta.vercel.app/demo)**

[Find your home](https://project-ascent-theta.vercel.app/#find-home) · [See accuracy studies, including failures](https://project-ascent-theta.vercel.app/accuracy) · [Read the free-service promise](https://project-ascent-theta.vercel.app/free)

[![CI](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-24344d.svg)](LICENSE) [![Node.js 24](https://img.shields.io/badge/Node.js-24.x-24344d.svg)](package.json)

<a href="docs/media/more-than-a-number.mp4"><img src="docs/media/more-than-a-number-poster.jpg" width="300" alt="Watch More Than a Number, a 58-second film about Ascent"></a>

**[Watch *More Than a Number*](docs/media/more-than-a-number.mp4)** · 58-second film · sample home is fictional

</div>

---

> **The principle:** A recorded fact is not an assumption. An assumption is not an estimate. An estimate is not a guarantee. And an unknown should stay unknown.

## Start here: choose a question

You don't need to learn the whole platform. Pick the question that brought you here.

| Your question | Open this free tool | What you get |
| --- | --- | --- |
| **What have homes actually sold for?** | [Recorded-sales search](https://project-ascent-theta.vercel.app/sales) | Search historical DC and Maryland sales in plain English; see the filters applied, price distributions and source dates. **Not active listings.** |
| **Could homebuyer assistance help me?** | [Homebuyer program screener](https://project-ascent-theta.vercel.app/programs) | Check your answers against 10 published DC and Maryland programs. Results are **not an eligibility determination**. |
| **What supports this home's estimated value?** | [Find a covered home](https://project-ascent-theta.vercel.app/#find-home) | Review recorded comparable sales, adjustments, missing information and the Home Decision Brief. |
| **Should I sell, stay, rent or refinance?** | [Interactive fictional demo](https://project-ascent-theta.vercel.app/demo) | Change financial assumptions, examine different choices and see why conclusions change. Fictional home; real calculation methods. |
| **How would competing offers affect my finances?** | [My Home / Homeowner OS](https://project-ascent-theta.vercel.app/home) | Compare offer terms and closing costs, review deadlines and prepare a private handoff. Start with a covered property. |
| **Can I trust the valuation studies?** | [Published accuracy and limitations](https://project-ascent-theta.vercel.app/accuracy) | Inspect study sizes, evaluation criteria, recorded failures and what has **not** been independently verified. |

### A first visit in three steps

1. **Explore the market.** Try [recorded-sales search](https://project-ascent-theta.vercel.app/sales) with `2 bed condos in 20009 under $700k in the last 6 months`. Read back the applied filters and the snapshot date.
2. **Test a decision.** Open the [fictional demo](https://project-ascent-theta.vercel.app/demo), inspect the supporting sales, change one assumption and see the calculation respond.
3. **Keep or challenge the evidence.** Open a real covered home, explore the Home Decision Brief, then save or export a Property Evidence Passport. Public research works without signing in.

**Coverage matters:** these tools use public records and published rules for supported DC and Maryland areas. They do not search current MLS listings, approve assistance, produce an appraisal or replace professional advice. See [the boundaries](#limits-that-matter).

**Jump to:** [Capabilities](#what-ascent-actually-does) · [How calculations work](#how-the-evidence-flows) · [Validation](#published-accuracy-including-failures) · [Free commitment](#free-is-part-of-the-design) · [Privacy](#privacy-and-ownership) · [Run locally](#run-it-locally) · [Contribute](#contribute-to-the-evidence)

## What Ascent actually does

Ascent is designed for a homeowner asking more than *“What is my house worth?”* It also asks: *Compared with which sales? Under which assumptions? How trustworthy is the evidence? What changes if I sell, stay or rent?*

| Capability | What you can investigate | Important boundary |
| --- | --- | --- |
| **Recorded-sales search** | Natural-language filters over 118,868 historical DC and Maryland sales; counts, distributions and linked property pages | These are recorded transactions, **not live homes for sale**; unsupported filters are disclosed |
| **Homebuyer program screener** | Compare entered details with 10 DC and Maryland assistance programs; each published rule marked met, unmet or unknown | Screening is not approval; funding, lender and administrator requirements must be verified |
| **Home Decision Brief** | Seven plain-language answers about value, supporting sales, reliability, freshness, missing facts, choices, sensitivities and next steps | If evidence is inadequate, the answer is **Not stated**, not a made-up figure |
| **Explainable pricing** | Closed comparable sales, adjustments, weights, exclusions, source records, price and condition sensitivity | Adjusted-sale ranges are **not** automatically calibrated confidence intervals |
| **Homeowner Workbench** | Six ownership choices, cash flow, debt, equity, cash requirements and break-even points | User-supplied inputs; **illustrative, pre-tax arithmetic**, not forecasts |
| **Property Evidence Passport** | Save versions of evidence, assumptions, decisions and calculations; compare changes and export JSON or printable HTML | Private copies require care; browser storage is not encrypted or synced |
| **Ask Ascent** | Ask questions grounded in the brief's figures, calculations and source references | **AI does not set a home's price**; external model synthesis is gated |
| **Offer Lab and closing costs** | Compare up to six offers, seller proceeds or buyer cash to close, deadlines, transfer/recordation taxes and seller-credit limits | Tax estimates and loan assumptions need professional confirmation; no offer ranking or closing prediction |
| **Homeowner OS** | Property timeline, public-record watch, offer comparisons, decisions, transaction planning and selective agent sharing | Public functions are account-free; private transaction-room services require configured accounts |

### Research before you commit

The [sales search](https://project-ascent-theta.vercel.app/sales) uses a dated, provenance-checked snapshot of **118,868 recorded transactions**, not an MLS feed. Its records currently reach **October 7, 2026** in DC and **September 24, 2026** in Maryland. It reads each search back as explicit filters and says which requests the data cannot answer, such as interior renovations, schools or active listings.

The [buyer program screener](https://project-ascent-theta.vercel.app/programs) checks **10 published programs** across DC, Montgomery County and Prince George's County. It shows which requirements appear satisfied, unsatisfied or unknown, with administrator links. It does not submit applications, store answers or promise eligibility. Published rules were checked **October 30, 2026** and can change.

**[Search sales](https://project-ascent-theta.vercel.app/sales)** · **[Explore buyer assistance](https://project-ascent-theta.vercel.app/programs)** · [Current implementation notes](docs/remaining-work.md#october-30-free-homeowner-tools-for-searching-sales-buyer-programs-and-closing-taxes)

### Make a number explain itself

A comparable is not simply a dot on a map. See which recorded sales qualified, what differs from the subject property, the explicit adjustments made, the weight each sale receives, and why a sale was excluded. Change a condition assumption, remove a questionable comparable with a reason, or examine another asking price. The calculation changes visibly; it is not replaced by an opaque AI opinion.

The **Home Decision Brief** puts conclusions before technical tables, but never hides their foundations. It separates **recorded fact**, **your assumption**, **computed figure**, and **unknown**. With fewer than three eligible recorded sales, or where release checks withhold a result, it declines to state a value. Additional public property facts, including permitted work and record freshness, are contextual information and do not silently alter the price model.

[Brief methodology](docs/home-decision-brief.md) · [Pricing design](docs/pricing-studio.md) · [Property data and freshness](docs/property-data.md)

### Follow the financial consequences

The workbench compares six choices **without ranking them**: **sell now**, **continue owning**, **rent out**, **renovate then sell**, **refinance**, or **buy another home while retaining this one**. You supply financing, costs, rent and other inputs. Missing figures remain unknown.

It shows 1-, 3-, 5-, 10- and 20-year calculations, tests one input at a time, and solves five break-even questions: selling versus holding price, property-value change, rent versus sale, zero-cash-flow vacancy and refinance rate versus keeping the current loan. These are calculations **conditional on your assumptions**, not predictions of home appreciation, loan eligibility, buyer behavior or renovation returns.

The choices do not imply equivalent housing outcomes. Taxes, replacement housing, financing availability and other personal circumstances are excluded from the core comparison.

[How the workbench calculates and abstains](docs/homeowner-workbench.md)

### Keep the history, not just the result

A **Property Evidence Passport** preserves the selected and excluded sales, changed inputs, checks, missing facts, report versions and next steps. The **Decision Time Machine** distinguishes changes in recorded comparable evidence from changes in your own assumptions.

Export a privacy-filtered JSON record or standalone HTML report and print it to PDF from your browser. On-demand evidence comparisons are **not** background listing searches or price alerts.

[Evidence history and replay](docs/evidence-and-decision-time-machine.md) · [Backup and restore](docs/homeowner-backups.md)

### A home has a workflow, not just a price

From a covered property's studio or **My Home**, open the **Homeowner OS** at `/home/{market}/{parcel}`.

| Area | Purpose |
| --- | --- |
| **My Property** | Read the brief and a dated property evidence timeline for recorded sales, permits, assessments, tax and flood information |
| **Market Watch** | Opt into browser-local checks of public records and newer nearby sales; checks occur when you use Ascent, not in the background |
| **Compare Offers** | Examine up to six offers, missing terms, cash-to-close or seller proceeds, dates, sensitivities and printable comparisons |
| **My Decisions** | Revisit the six-choice workbench and saved decision versions |
| **Transaction Room** | Manage milestones, deadlines, encrypted server documents, inspection items and notes in a private account workspace |
| **Share With My Agent** | Download a selective packet or use expiring, revocable invitations for chosen room content |

Offer analysis presents financial and term differences, **not a recommended winning offer, legal interpretation or predicted closing probability**. Unknown acceptance dates remain unknown, and conflicting dates are checked before calendar export. An MLS Bridge exists in code but remains **disabled without an agreement**.

[Homeowner OS and feature boundaries](docs/homeowner-os.md) · [Public-data permissions and refresh](docs/public-data-network.md) · [Account-security requirements](docs/account-security.md)

## How the evidence flows

```mermaid
flowchart TD
    A["Recorded public sales<br/>and property records"] --> B["Source provenance<br/>and eligibility rules"]
    B --> C["Comparable analysis<br/>and validation gates"]
    C --> D{"Enough support<br/>to state a value?"}
    D -->|Yes| E["Home Decision Brief<br/>value + limitations"]
    D -->|No| F["Not stated<br/>missing evidence explained"]
    E --> G["Homeowner scenarios<br/>your own inputs"]
    F --> G
    G --> H["Evidence Passport<br/>versioned, exportable record"]
```

**The pricing engine and homeowner financial calculations are deterministic.** Explaining evidence and computing a number are separate responsibilities. Records are shown with their provenance and date; uncertainties and failed checks travel with the result rather than disappearing between screens.

[Technical architecture](docs/engineering.md) · [AI architecture and gates](docs/ai-architecture.md)

## Published accuracy, including failures

**Do not mistake a plausible price for a validated price.** Ascent publishes retrospective, reproducible internal tests, including models that did not meet their acceptance criteria.

| Market / test | Held-out sales | Median absolute percentage error | Within ±10% of recorded price | Criteria met |
| --- | ---: | ---: | ---: | --- |
| **DC single-family and rowhouses** | 2,254 | **9.98%** | 50.2% | **9/9**; several narrow passes |
| **Montgomery + Prince George's, revised model** | 2,812 | **9.52%** | 52.0% | **8/9**; price-related bias failed |
| **DC condominiums** | 1,434 | **12.95%** | 41.16% | **4/9**; overall acceptance failed |
| **External Maryland study: four unserved counties** | 19,039 | **12.26%** | 42.49% | **5/9**; overall acceptance failed |

*Published internal holdout results as of October 21, 2026. Median error describes the group tested, **not** the likely error for any particular property. These are not independently certified results, appraisals or guarantees.*

What those numbers **do and do not** mean:

- **DC houses:** Only the unmodified, eligible validated configuration may show a calibrated interval. Custom assumptions or insufficient evidence remove that claim. Several criteria were met narrowly.
- **Maryland:** The revised model used a **different holdout** than the original failed study; the headline change is not a like-for-like improvement comparison. The price-related bias criterion still fails. No calibrated current-home interval is released.
- **DC condos:** Overall acceptance failed, and key building features such as HOA costs, floor, view, parking and amenities are not modeled. No calibrated interval is released.
- **Four-county external test:** The protocol was registered before those additional Maryland data were downloaded. Acceptance failed, so Ascent does not claim coverage there. The registered supplementary study supported both Home Decision Brief verdict-policy hypotheses: withheld cases had 16.8% median error, limited cases 13.1%, and supported cases 9.0%.
- **All studies:** Public records can lag, observed sales can be correlated, and an adjusted comparable-price envelope is not by itself a probability interval. **No independent replication has been completed.**

The [independent replication kit](docs/independent-replication.md) invites outside quantitative researchers to re-derive all published reports, inspect the protocols, evaluate methodological weaknesses and publish findings, including unfavorable ones. The [homeowner comprehension study](docs/usability/README.md) is registered but has **no participants or outcomes yet**.

**[Read the full accuracy report](https://project-ascent-theta.vercel.app/accuracy)** · [Validation methods and historical results](docs/valuation-validation.md) · [Release gates](docs/production-readiness.md)

## Limits that matter

Ascent is **not** an appraisal, brokerage, live MLS feed, tax or legal adviser, or autonomous transaction agent.

- **Geography:** Public address-based pricing covers eligible Washington, DC houses and condos, plus homes in Montgomery and Prince George's counties in Maryland. It is **not nationwide**. Virginia public-record pricing is unavailable pending written source-use permission.
- **Recorded sales are not listings:** The free search shows completed, recorded transactions from dated snapshots, not active, pending or newly listed homes. An MLS agreement is not in place.
- **Program and closing-cost checks are not approvals or quotes:** Program administrators and lenders decide eligibility; tax exemptions, contract allocations and settlement costs require professional verification.
- **What records cannot tell you:** Interior condition, concessions, title, current listings, unpermitted work, condo dues and reserves, and other decision-critical facts may be missing. A recorded permit does not prove work was completed. DC and Montgomery permit data are contextual, not direct price adjustments.
- **When the model declines:** Fewer than three eligible sales, or applicable release-gate failures, cause a **Not stated** value verdict. A withheld estimate stays withheld in the brief, offers, reports and sharing.
- **What a scenario is not:** Seller proceeds and ownership scenarios do not predict market response, timing, appreciation or returns. The app does not rank homeowner choices.
- **Source rights:** Public visibility and this repository's MIT license do **not** authorize redistribution of third-party MLS, vendor or restricted data. External providers need their own credentials, rights and review.

The goal is **inspectable uncertainty**, not manufactured confidence.

[DC coverage](docs/dc-public-records.md) · [Maryland coverage](docs/maryland-public-records.md) · [Condominium limitations](docs/dc-condominiums.md) · [Source and use permissions](docs/public-data-network.md)

## Privacy and ownership

For the public studios, **My Home** stores saved property decisions and additional financial inputs **in your browser**. You can save up to **10 homes and 10 versions per home**, subject to browser limits. This is not encrypted browser storage or cloud synchronization.

- **Back up and restore:** Export a private backup and preview restoration on another device. The backup contains **unencrypted** finances and notes; protect it. Exports made for reference are not automatically restorable backups.
- **Share deliberately:** Privacy-filtered JSON and HTML reports exclude private finances and notes by default. Choose a private export only when you intend to include them. Once a download is shared, it cannot be recalled.
- **Understand device risks:** Clearing browser data can erase local work. Anyone with access to a shared browser profile may access saved data. Export before deleting a home or switching devices.
- **Know the separate boundary:** Optional account-backed transaction rooms use server-side identity, encryption, tenant isolation and deployment requirements. Their security depends on correct production configuration.

[Browser storage and calculations](docs/homeowner-workbench.md) · [Backup design](docs/homeowner-backups.md) · [Production account security](docs/account-security.md)

## Free is part of the design

**Free is a product commitment, not a limited-time beta.** Public recorded-sales research, buyer-program screening, basic comparable analysis, homeowner decision tools, reports, and core client, offer and deadline workflows are committed to staying **free**, without a payment card or subscription. There are no current paid plans or new subscription checkout.

That promise covers Ascent's public and core tools; it does **not** make third-party MLS access, external data licenses, hosting or optional models cost-free. Those providers have independent costs, permissions and quotas. Ascent will not silently charge you when a provider limit is reached, and an open-source license does not guarantee permanent hosted availability.

[Read the free-service promise](https://project-ascent-theta.vercel.app/free)

## Run it locally

**Requirements:** Node.js **24.x** and npm.

```bash
git clone https://github.com/topherchris420/project-ascent.git
cd project-ascent
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3040**. For Windows PowerShell, use `Copy-Item .env.example .env.local` in place of `cp`.

The bundled DC/Maryland studios, fictional demo and deterministic calculations do **not** need RentCast, Groq or OpenAI keys. Local workspaces use SQLite under the ignored `.data/` directory. A production account workspace requires PostgreSQL, migrations, configured account services and the documented security controls.

**Never commit** `.env.local`, `.data/` or provider credentials. Optional RentCast research and gated Groq/OpenAI integrations require authorized, server-side configuration.

[Engineering setup](docs/engineering.md) · [Provider integration](docs/rentcast-integration.md) · [PostgreSQL](docs/postgres-connection.md) · [Vercel deployment](docs/vercel-hobby.md)

## Verify the work

Ascent uses **Next.js 16, React 19, TypeScript and Node.js 24**. The calculation and data paths are testable without depending on a hosted AI model.

```bash
npm run typecheck
npm test
npm run validate:valuation -- --check
npm run build
npm run test:e2e
npm run replicate -- --quick
```

The browser suite requires Playwright Chromium to be installed and configured. CI also exercises offline domain and AI checks and a disposable PostgreSQL restore drill. **The existence of a test or workflow is not proof that the latest run passed or that deployment is production-ready.**

| Where to look | What you will find |
| --- | --- |
| `src/app/` and `src/components/` | Next.js routes and homeowner interface |
| `src/lib/` | Pricing, decision logic, provenance, account and data-service boundaries |
| `src/datasets/` and `evidence/` | Bundled research inputs and documented validation evidence |
| `migrations/` | Versioned database changes |
| `tests/` and `scripts/` | Automated checks, data tooling and reproducibility commands |
| `docs/` | Specifications, methods, permissions, threat boundaries and open work |

[Current CI](https://github.com/topherchris420/project-ascent/actions/workflows/ci.yml) · [Verification results](docs/verification-results.md) · [Capability matrix](docs/capability-matrix.md) · [Production-readiness checklist](docs/production-readiness.md)

## Contribute to the evidence

Contributions are welcome, especially in homeowner clarity, accessibility, documentation, reliable public-data provenance, permission-aware integrations, deterministic financial modeling and reproducible evaluation.

Two particularly valuable contributions need **independent people**, not another feature:

1. **[Replicate the valuation studies](docs/independent-replication.md).** Reproduce the figures, question the methodology and publish a signed assessment. Unfavorable findings are welcome.
2. **[Participate in or facilitate the homeowner comprehension study](docs/usability/README.md).** Help test whether real homeowners can distinguish estimates, assumptions, missing facts and risks. The study has not yet produced participant results.

Please preserve frozen evaluation records, dataset/source permissions, tenant isolation, privacy defaults and visible abstentions. Improve the model by testing it, not by hiding a failed metric. For substantial changes, open an [issue](https://github.com/topherchris420/project-ascent/issues) to discuss the evidence and expected behavior.

## Documentation map

| Topic | Primary reference |
| --- | --- |
| Product experience and homeowner reasoning | [Home Decision Brief](docs/home-decision-brief.md) · [Homeowner OS](docs/homeowner-os.md) |
| Estimation and historical validation | [Valuation validation](docs/valuation-validation.md) · [Independent replication](docs/independent-replication.md) |
| Property sources, permitted uses and freshness | [Property data](docs/property-data.md) · [Public-data network](docs/public-data-network.md) |
| Financial calculations and local history | [Homeowner Workbench](docs/homeowner-workbench.md) · [Backups](docs/homeowner-backups.md) |
| Engineering and security | [Engineering](docs/engineering.md) · [Account security](docs/account-security.md) |
| Evidence of completion and remaining gaps | [Verification results](docs/verification-results.md) · [Production readiness](docs/production-readiness.md) |

## License

Released under the **[MIT License](LICENSE)**. You can use, inspect, modify and distribute Ascent's code under its terms. **Third-party datasets, MLS content, API responses and services keep their own licensing, access and redistribution rules.**

---

<div align="center">

### The best real estate decision is one you can explain.

**[Open Ascent](https://project-ascent-theta.vercel.app/)** · **[Search sales](https://project-ascent-theta.vercel.app/sales)** · **[Check buyer programs](https://project-ascent-theta.vercel.app/programs)** · **[Inspect the evidence](https://project-ascent-theta.vercel.app/accuracy)**

<sub>Open source. Evidence first. Your decision remains yours.</sub>

</div>
