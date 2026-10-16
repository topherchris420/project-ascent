# Project Ascent

Ascent is an independent real estate decision workspace. It includes persistent private workspaces, pricing calculations, clients, offers, transactions, grounded assistance, progressive access, configurable plans, and a national property ingestion fabric.

All bundled properties, people, offers, transactions, and outcomes are **fictional**. The default is a synthetic demonstration, not a live MLS application. Demonstration results do not establish live-market accuracy.

## Run locally

Requirements: Node.js 24.15+ and npm. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
cd C:\Users\chris\project-ascent
npm.cmd ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run dev
```

Open **http://localhost:3040**. The public page includes a live pricing card that runs the real engine on fictional data. Choose **Explore the working demo**, or create an account. Each demo/account has its own tenant and persistent SQLite database state. No credentials or manual verification are required to complete a synthetic CMA. Data persists in `.data/ascent.sqlite`; never commit this directory. Use PostgreSQL for production.

DMV is the initial reference market. The **Market region** selector switches to Austin using the same property and CMA interfaces. **National data fabric** shows record completeness, source rights, sync runs, and gaps. Existing Austin workflows and historical decisions are preserved.

**Properties → National provider research** connects the server-side RentCast adapter to address research, recorded-sale CMA, listing/AVM benchmarks, ZIP statistics, scenario arithmetic, the evidence assistant and printable reports. The default fixture path requires no key. Live RentCast requires `RENTCAST_API_KEY`, reviewed contractual entitlements and explicit request/spend limits; live acceptance is verified in DMV and San Antonio with seven actual requests under a ten-request application cap. The private local policy does not authorize production deployment. See [RentCast setup and boundaries](docs/rentcast-integration.md).

Local live-research access is stored only in the ignored `.data/rentcast-local-access.json`; keep that file private. The ordinary demo remains independent and makes no live requests. See [live acceptance evidence](evidence/rentcast-live-acceptance.json) and [remaining production work](docs/remaining-work.md).

## Useful workflows

- **Overview → This week:** every milestone, follow-up, offer expiry and listing check-in due in the next seven days, with overdue/urgent/soon countdowns.
- **Properties → Pricing studio:** search records, select comparables (excluded sales show why), inspect signed adjustments and assumptions, explore an asking price with deterministic pricing narration, save a frozen CMA, approve a recommendation, and open a client report or full-screen listing presentation that carries your seller-cost assumptions.
- **Market pulse → Weekly listing review:** record showings, second showings, offers and buyer feedback each week; Ascent reads the pattern into signals and seller options (hold, refresh, buyer credit, reposition) with the payment arithmetic shown.
- **Clients:** a stage/role pipeline board (or list) with phone, role and a lost stage; retain conversations, structured saved searches, inspectable inventory matches, deduplicated in-app alerts, saved homes and dated follow-up tasks that can be completed or reopened.
- **Offer room:** rank offers by term strength with every factor, formula and client-adjustable weight visible; compare price, credits, financing, conditions, and timing; draft and explicitly approve a counteroffer. Approval records a review; no offer or message is sent.
- **Transactions:** store private PDF/text documents; inspect source-page evidence and explicit counting assumptions for proposed contract dates. Conflicting anchors and ambiguous terms are held for manual review. Correct a proposed date with a reason, record review, and follow the source document from the milestone. Scanned-PDF OCR and holiday calendars are not connected. See [deadline review and limits](docs/contract-deadlines.md).
- **Ask Ascent:** retrieve authorized context and cited evidence; ask what is due this week, summarize a CMA for a seller meeting, rank offers, or draft an email/text that uses {placeholders} instead of client identities. Groq-first GPT-OSS routing uses configurable models, server-controlled read tools, structured paragraph references, explicit sharing and spend controls. Both 20B and 120B complete synthetic live smoke. Model explanations still require factual review; see [known quality limits](docs/ai-evaluation-review.md). Optional secondary OpenAI access is deliberate; unavailable or exhausted model capacity returns useful evidence mode.
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

- [Vercel Hobby setup](docs/vercel-hobby.md)
- [Architecture, security, APIs and deployment](docs/engineering.md)
- [Capability and limitation matrix](docs/capability-matrix.md)
- [Progressive access and adoption economics](docs/adoption-economics.md)
- [National property fabric](docs/national-fabric.md)
- [Domain and competitive validation targets](docs/competitive-advantage-validation.md)
- [Professional trust and portability](docs/professional-portability.md)
- [Groq-first inference architecture and privacy](docs/ai-architecture.md)
- [RentCast property-provider integration](docs/rentcast-integration.md)
- [Verification results](docs/verification-results.md)
- Database migrations: `migrations/`; source: `src/`; tests: `tests/`; measured Ascent artifacts: `evidence/`

Source repository: [topherchris420/project-ascent](https://github.com/topherchris420/project-ascent) (private). Deployment credentials remain unconfigured. The bounded private local RentCast workflow is verified; production provider rights, payment settlement, license-provider automation and PostgreSQL deployment remain unverified. Groq responses have been tested on synthetic evidence; production privacy, reliability and semantic quality still require validation.
