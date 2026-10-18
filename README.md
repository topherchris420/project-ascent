<div align="center">

# Ascent

### Know the price. Show the why.

A real estate workspace that keeps the evidence behind the decision.

**[Analyze a DC home](https://project-ascent-theta.vercel.app/dc) · [Try the sample](https://project-ascent-theta.vercel.app/demo) · [Open Ascent](https://project-ascent-theta.vercel.app/)**

No account needed for either pricing studio.

</div>

---

A seller asks, **“Why this price?”** Ascent gives you the working: comparable sales, adjustments, assumptions and a report you can explain.

## Start with one decision

| You want to… | Start here |
| --- | --- |
| Analyze a real home | **[DC Pricing Studio](https://project-ascent-theta.vercel.app/dc)** — search covered single-family homes in District public records. No address in mind? Try the example address. |
| Learn by doing | **[Fictional sample](https://project-ascent-theta.vercel.app/demo)** — explore an Arlington example using the actual pricing engine. |
| Work through a deal | **[Workspace demo](https://project-ascent-theta.vercel.app/)** — choose **Explore the working demo** for fictional clients, offers and deadlines. |
| Bring your own evidence | Choose **Create an account** on the homepage. Your workspace starts empty. |

Hosted workspaces require configured account services. Both public studios work independently.

## See it. Challenge it. Keep it.

1. **See the evidence.** Inspect each closed sale, its adjustments and its contribution to the estimate.
2. **Test a price.** Compare pricing positions and seller proceeds under your chosen cost assumptions.
3. **Challenge the reasoning.** Change a condition rating, adjust a rate, or exclude a sale with a reason. Added sales are marked unverified. Reset to the original analysis; undo the reset if you change your mind.
4. **Keep the decision.** Open a printable report or export JSON with the calculation, sources and assumptions. Drafts save in this browser on this device.

The calculation is deterministic. AI does not set the price. An adjusted-sale range describes the comparable evidence; it is not automatically a confidence interval.

## Carry the reasoning through the deal

The private workspace connects pricing snapshots, client notes, saved searches, offer comparisons and transaction milestones. **Ask Ascent** explains the record on screen, separating facts, calculations, assumptions and unknowns. Drafts and approvals stay with the user.

Saved pricing analyses freeze their inputs. Replay them later, or use the **Decision Time Machine** to see which evidence and assumptions changed. Supported CSV/JSON exports keep your work portable.

[Explore the workflows](docs/capability-matrix.md) · [How decision replay works](docs/evidence-and-decision-time-machine.md)

## Useful evidence. Visible limits.

The published DC evaluation reports **10.0% median error across 2,254 held-out sales**, with **50.2% within ±10%** of the recorded price. These results apply to the DC-validated settings and evaluation period; some acceptance thresholds were met narrowly. They do not guarantee an individual property's price.

- The DC studio uses **District public records, CC BY 4.0**. Recent sales may lag; interior condition, concessions and MLS listing history are missing.
- Public analysis covers eligible **DC single-family homes**. Condos, multi-unit buildings, Maryland and Virginia are outside its measured scope.
- The sample and workspace demo are fictional. Optional licensed providers require their own configuration and permissions; no MLS access is bundled.
- Reports are decision aids requiring review, **not appraisals**. Ascent does not send client messages, accept offers or sign contracts.

[DC data and coverage](docs/dc-public-records.md) · [Full validation and misses](docs/valuation-validation.md) · [Production readiness](docs/remaining-work.md)

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

Optional integrations: **RentCast** for authorized property research, **Groq/OpenAI** for model-assisted explanations, and **Stripe** for configured subscriptions. Credentials stay on the server.

[Engineering](docs/engineering.md) · [PostgreSQL](docs/postgres-connection.md) · [Vercel](docs/vercel-hobby.md) · [Provider setup](docs/rentcast-integration.md)

## Develop and verify

Next.js 16 · React 19 · TypeScript · Node.js 24

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests need Chrome configured with `CHROME_PATH`. See [verification results](docs/verification-results.md) for evaluation commands and the distinction between fixture tests and production acceptance.

Application code lives in `src/`, migrations in `migrations/`, tests in `tests/`, and research and operational notes in `docs/`. Contributions should preserve reproducibility, accessible interactions, source rights and workspace isolation. Check repository access and licensing before reusing the source; the repository does not currently include an open-source license.

---

**Ascent · Real estate, reasoned.**
