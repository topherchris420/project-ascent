# Engineering, APIs and deployment

Ascent is a working independent implementation. Bundled records and evaluation outcomes are fictional. Production integrations are opt-in and require independent authorization. This document describes implemented boundaries, not a claim that a production deployment or MLS contract has been validated.

## Stack and boundaries

The October 17 Pricing Studio slice is documented in [pricing-studio.md](pricing-studio.md). `/demo` is prerenderable and account-free. `/api/demo/report` is a stateless, bounded **fictional-only** export path with no database or provider import. Existing authenticated report and workspace routes retain tenant and current-source-use enforcement. The public entry defers the larger workspace bundle; async Next.js 16 cookies/search parameters preserve sessions and invitation handoff without treating a cookie's presence as authentication.

Next.js 16 App Router, React, strict TypeScript, Zod, `pg`, and Node 24 SQLite. The workspace is a client component; all authentication, database operations, files, external providers, billing and review credentials stay in Node route handlers. Lucide icons, original vector house illustrations and custom responsive CSS avoid third-party font, tile or image requests. Custom CSS is used instead of Tailwind/shadcn to keep the standalone reference compact; there is no design-system dependency to configure.

Pure calculation modules run on the client for immediate exploration and again on the server when a decision is saved. A client estimate never authorizes a write. A saved CMA contains model version, explicit assumptions, admitted/excluded comparables, signed feature adjustments, normalized weights, dates, source IDs, an input snapshot and a stable checksum. The checksum is for reproducibility, not cryptographic authenticity. Audit events use a separate SHA-256 hash chain.

The paired-feature adjustment model uses assumed marginal area/bed/bath/condition values and an explicit optional monthly trend. These values are not learned coefficients. The empirical range is the minimum/maximum adjusted observation, not a confidence interval. Counterfactual pricing assumes a sale at the entered price and computes costs; it does not predict demand, sale probability or timing. Offer comparisons use contractual arithmetic and recorded conditions, without invented closing reliability scores.

## Persistence and isolation

Local SQLite initializes automatically, enables foreign keys/WAL, serializes writes, and keeps state under `.data/`. PostgreSQL uses tenant-keyed workspaces, private document bytes, PostGIS geography points, authentication/session registries, durable rate counters, webhook receipts and invitations. Apply the supplied versioned migrations with a migration identity. The application must use a separate non-superuser, non-BYPASSRLS identity. Tenant transactions set `app.tenant_id` locally; tenant tables enable and force row-level security. App startup checks those protections rather than silently accepting a privileged database credential.

Workspace data is JSON/JSONB with optimistic version checks and row locks. This makes the demonstration and bounded professional workflows coherent and transactional. A full national corpus requires partitioned canonical/property/version storage, queue-backed ingestion and load testing; the current workspace aggregate is not a demonstrated nationwide storage scale. Geographic query projections have a GiST index and use `ST_DWithin` on PostGIS, with a haversine fallback locally.

Passwords use independently salted scrypt. Sessions are opaque random tokens stored only as hashes; cookies are HttpOnly/SameSite and Secure in production. Mutation handlers enforce exact origin and reject cross-site requests. Inputs are bounded and validated, and rate limits persist in the database. Users belong to a tenant; owner/agent/viewer roles govern administration and workflow approvals. Licensed-data eligibility and subscription capacity are separate checks. Never grant direct client access to the server database credential.

PDF/text uploads are bounded to 4 MB with a separate multipart-body bound, validate signatures/types, and are served as downloads after authorization. Browser validation avoids sending oversized files. Production file bytes use AES-256-GCM with a server-configured 32-byte key. Local demo storage can remain unencrypted when no key is set. Text/PDF date proposals retain source-page evidence and reviewed corrections; scanned-PDF OCR, decoder isolation, antivirus/quarantine scanning and external signing are launch follow-ups. Document retention uses upload age; evidence metadata remains in the audit history. A hash chain is not immutable storage against a database administrator.

## Progressive access and billing

Explorer access is immediate. Core synthetic property research, deterministic CMA, clients, offer comparisons, transaction tracking and reports remain free. Verification submissions persist as pending while unrelated work continues. Trusted review requires a different service credential, source evidence, the current submission ID and a bounded expiry. Current verification is workspace-owner-level; individual-agent and brokerage eligibility must be implemented for contracts requiring it.

Free/pro/team/enterprise definitions read independent configuration for seats and model/data allowances. No final paid prices are embedded. Stripe checkout/portal only open with configured keys and approved recurring Price IDs. Entitlements change through authenticated, signature-verified subscription webhooks, with durable receipt deduplication, event ordering, customer binding, period checks and fail-closed unknown prices. Checkout success navigation alone never grants a paid plan. Past-due/canceled plans fall back to free without deleting workspace history.

Monthly usage reservations are tenant-atomic. Provider token counts support operator-configured cost estimates; these are not invoices and exclude unconfigured licensing, fixed hosting and support costs. One-time invitation tokens are hashed, expire, reserve seats, and cannot move an existing account out of its private workspace. Email delivery is not enabled; the owner shares the private invitation link.

## National fabric

The canonical schema separates identity/geography, optional property facts, field provenance, quality explanations, versions, source rights, grants, synchronization runs and quarantine. DMV and Austin both use the same registry, adapters and analytical engine. Region registration is configuration; an adapter maps explicit source fields into canonical facts. County-qualified parcel IDs and conservative address/geographic matching prevent cross-jurisdiction collisions. Ambiguous matches, stale conflicting versions and cross-source fact conflicts are quarantined rather than silently merged.

RESO JSON, assessor/open-data, and Census geographic-link parsers operate on supplied payloads. A generic bounded provider transport requires a server-configured HTTPS URL, explicit allowed hostname, timeout, JSON size bound and redirect rejection. There is no automatic discovery of private credentials or nationwide MLS rights. County assessments and interpolated Census coordinates are not substitutes for verified sales or parcel ownership. Incomplete records remain available to the fabric inspector while analytic projection refuses missing required facts.

Sources carry permitted uses, export rights, retention/expiry and freshness expectations. Restricted sources require both current verified credentials and a separately reviewed provider/region/use grant. Paying cannot supply either right. Live ingestion is off by default and must remain off until the actual contract, field mappings, member eligibility and deployment controls are validated. Synthetic fixture synchronization is operational without those credentials. Monitoring of stored evidence never changes a listing price or sends a client message.

## Contextual assistant

Evidence mode retrieves authorized records, computes valuation/offer/market results, cites identifiers, and identifies missing inputs without an external model. Optional OpenAI Responses orchestration uses structured output and bounded read-only tools, validates citation IDs, sets `store:false`, and falls back on provider or output failure. Model synthesis is labeled as judgment; citation identity checks do not prove semantic support. It cannot send communications, accept offers, change prices or execute transactions. External model sharing requires deliberate server configuration and the applicable source rights. Inspect the integration's current sharing controls before enabling it for personal or licensed data.

## API inventory

All session endpoints use same-origin cookies and no-store responses. Writes require a matching Origin. Error responses include a safe message; Zod failures include field issue paths.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register`, `/login`, `/demo`, `/logout` | Account/session lifecycle; isolated persistent demo |
| `GET /api/workspace` | Authorized workspace and actor |
| `GET /api/properties?q=&status=&maxPrice=&lat=&lng=&radiusMiles=` | Property filters and geographic query |
| `POST /api/actions` | Typed CMA/client/search/offer/draft/transaction/milestone/outcome/retention operations |
| `POST /api/assistant` | Contextual question and authorized read-only tool orchestration |
| `POST /api/documents`, `GET /api/documents/:id` | Private multipart upload/download |
| `GET /api/report?cmaId=` | Printable CMA; professional review status and source references |
| `GET/POST /api/verification` | Pending credential review without blocking Explorer |
| `POST /api/verification/review` | Service-authenticated authoritative review |
| `GET/POST /api/billing`, `POST /api/billing/webhook` | Plans, metering, Stripe sessions, signed lifecycle |
| `GET/POST /api/team`, `POST /api/team/accept` | Scoped membership and expiring invitation redemption |
| `GET/POST /api/fabric`, `POST /api/fabric/grants` | Coverage, configured ingestion, region selection and independent operator-reviewed rights |
| `GET /api/jobs/market` | Bearer-protected scheduled evidence review; no external actions |

`POST /api/actions` names include `saveCma`, `approveCma`, `saveClient`, `addClientNote`, `saveSearch`, `saveOffer`, `draftCounter`, `approveDraft`, `saveTransaction`, `toggleMilestone`, `addMilestone`, `approveExtractedDate`, `markAlertRead`, `runMonitor`, `recordOutcome`, `updateSettings`, and `purgeExpiredDocuments`. See `src/lib/service.ts` for the input schemas. Approval records professional review; it never transmits a legal instrument.

## Deployment

1. Provision PostgreSQL with PostGIS, TLS, backups and a separate migration identity. Use a server-side connection pool appropriate to your host.
2. Set `MIGRATION_DATABASE_URL` and run `npm run db:migrate`. Grant the restricted app identity only the required table privileges, without schema CREATE, superuser or BYPASSRLS. Rotate/remove migration credentials from the runtime.
3. Set `DATABASE_URL`, exact HTTPS `APP_ORIGIN`, `APP_ENCRYPTION_KEY` and a random `CRON_SECRET` in the deployment's encrypted settings. Set `PGSSL=require` when required by the provider, and only trust proxy headers for a known deployment proxy.
4. On Vercel select Node 24.x. `vercel.json` supplies framework/build configuration, 60-second API ceilings and a once-daily Hobby-compatible scheduled route. The scheduler must supply `Authorization: Bearer <CRON_SECRET>`. Run `npm run check:deploy -- --database` against the configured staging environment. See [Hobby setup and limits](vercel-hobby.md). Build with `npm ci` and `npm run build`.
5. Configure Stripe recurring prices/customer portal and webhook events `customer.subscription.created`, `.updated`, `.deleted`, first in test mode. Set the webhook signing secret. Configure optional model/verification/data integrations independently after reviewing rights and retention.
6. Run the automated suite against an isolated staging database and authorized provider sandboxes. Test backup/restore, key rotation, concurrency, source revocation, membership changes and privacy deletion before real customer use.

Production deliberately refuses SQLite fallback. No production migration, paid transaction or deployment has been executed with real service credentials in this build. Bounded private local RentCast acceptance and synthetic Groq inference are documented in [actual verification](verification-results.md). The local demo remains usable without external credentials.

Primary implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Node SQLite](https://nodejs.org/api/sqlite.html), [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [Stripe webhook verification](https://docs.stripe.com/webhooks/signature), [RESO Web API Core](https://transport.reso.org/proposals/web-api-core/). Adoption and cost sources are linked in [adoption economics](adoption-economics.md).
