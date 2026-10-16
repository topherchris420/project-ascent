# Project Ascent

An independent, working real estate decision workspace reconstructed from Homesolo's public evidence. It includes persistent private workspaces, pricing calculations, clients, offers, transactions, grounded assistance, progressive access, configurable plans, and a national property ingestion fabric.

All bundled properties, people, offers, transactions, and outcomes are **fictional**. The default is a synthetic demonstration, not a live MLS application. Public demo appearance does not establish authenticated Homesolo behavior. Competitive accuracy superiority has not been established.

## Run locally

Requirements: Node.js 24.15+ and npm. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
cd C:\Users\chris\project-ascent
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open **http://localhost:3040**. Choose **Explore the working demo**, or create an account. Each demo/account has its own tenant and persistent SQLite database state. No credentials or manual verification are required to complete a synthetic CMA. Data persists in `.data/ascent.sqlite`; never commit this directory. Use PostgreSQL for production.

DMV is the initial reference market. The **Market region** selector switches to Austin using the same property and CMA interfaces. **National data fabric** shows record completeness, source rights, sync runs, and gaps. Existing Austin workflows and historical decisions are preserved.

**Properties → National provider research** connects the server-side RentCast adapter to address research, recorded-sale CMA, listing/AVM benchmarks, ZIP statistics, scenario arithmetic, the evidence assistant and printable reports. The default fixture path requires no key. Live RentCast requires `RENTCAST_API_KEY`, reviewed contractual entitlements and explicit request/spend limits; it has not been live-tested without credentials. See [RentCast setup and boundaries](docs/rentcast-integration.md).

## Useful workflows

- **Properties → Pricing studio:** search records, select comparables, inspect signed adjustments and assumptions, explore an asking price, save a frozen CMA, approve a recommendation, and open a printable client report.
- **Clients:** create profiles and retain conversations and saved searches.
- **Offer room:** compare price, credits, financing, conditions, and timing; draft and explicitly approve a counteroffer. Approval records a review; no offer or message is sent.
- **Transactions:** store private PDF/text documents, extract explicit ISO dates from text, review proposed deadlines, and track milestones. PDF OCR is not connected.
- **Ask Ascent:** retrieve authorized context and cited evidence. Groq-first GPT-OSS routing uses configurable models, server-controlled read tools, structured paragraph references, explicit sharing and spend controls. Both 20B and 120B complete synthetic live smoke. Model explanations still require factual review; see [known quality limits](docs/ai-evaluation-review.md). Optional secondary OpenAI access is deliberate; unavailable or exhausted model capacity returns useful evidence mode.
- **Access & verification:** submit credentials asynchronously without interrupting free exploration. A trusted reviewer, independent of the user session, checks authoritative evidence.
- **Plans & usage / Brokerage team:** configurable freemium allowances, Stripe checkout/portal/webhooks when configured, and one-time team invitations. Payment never grants MLS rights.
- **Outcomes lab / Decision graph:** inspect retrospective error calculations and source-linked relationships. Synthetic outcomes verify plumbing, not market accuracy.
- **Domain intelligence / Offer room:** evaluate versioned practices, interacting contingencies and party-specific tradeoffs; distinguish facts, arithmetic, assumptions, uncertainty and professional decisions. Built-in practices are unreviewed, not legal requirements.
- **Professional academy:** complete tasks through actual saved, inspected and reviewed work; create private support, training and independent review requests. No external expert or response promise is implied.
- **Import & portability:** preview authorized CSV records, resolve conflicts, explicitly confirm, export standard records and roll back unchanged imports. Compare declared assumptions on identical frozen evidence.
- **Improvement lab / AI operations:** opt into aggregate workflow signals, configure stable reversible variations, record prioritization assumptions, and inspect model budgets, token estimates, latency and errors without logging prompts or customer text.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run benchmark
npm.cmd run evaluate:domain
npm.cmd run evaluate:ai
npm.cmd run build
```

Playwright uses an installed Chrome by default on this workstation. Set `CHROME_PATH` elsewhere. Browser tests start the local app if needed. Benchmarks measure synthetic/local calculations only. See [verification results](docs/verification-results.md) for the actual final run, scope, and remaining blockers.

## Engineering and evidence

- [REA reconstruction specification](docs/reconstruction.md) and [evidence ledger](docs/evidence-ledger.md)
- [Architecture, security, APIs and deployment](docs/engineering.md)
- [Capability and limitation matrix](docs/capability-matrix.md)
- [Progressive access and adoption economics](docs/adoption-economics.md)
- [National property fabric](docs/national-fabric.md)
- [Domain and competitive validation targets](docs/competitive-advantage-validation.md)
- [Professional trust and portability](docs/professional-portability.md)
- [Groq-first inference architecture and privacy](docs/ai-architecture.md)
- [RentCast property-provider integration](docs/rentcast-integration.md)
- [Verification results](docs/verification-results.md)
- Database migrations: `migrations/`; source: `src/`; tests: `tests/`; retained REA evidence and measured artifacts: `evidence/`

This repository has no configured deployment credentials or authorized destination remote. Nothing modifies Homesolo production. Live MLS/RentCast access, payment settlement, license-provider automation and PostgreSQL deployment remain unverified. Groq responses have been tested on synthetic evidence; production privacy, reliability and semantic quality still require validation.
