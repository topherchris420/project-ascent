# Ascent on Vercel Hobby

The application includes a Hobby-compatible deployment profile for personal, non-commercial use. Vercel's [Hobby terms](https://vercel.com/docs/plans/hobby) do not permit a commercial service on that plan. This profile does not provision hosting, a database or data rights, and it does not imply that a live deployment has been validated.

## What changed

- Node is pinned to `24.x`; Vercel supports this runtime. Install/build remain `npm ci` / `npm run build`.
- The authenticated market-review job runs once daily at `0 9 * * *` (09:00 UTC). Hobby invocation may occur within the hour; this is not a precise contractual reminder service. [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- API routes request a 60-second execution ceiling. This is an application limit below current Hobby Fluid Compute limits, not a promise that every workflow finishes within it. Keep unattended workloads small; larger ingestion/tenant populations need durable batching and leases.
- Uploads allow **4,000,000 bytes (4 MB)**, with a separate **4,064,000-byte multipart body cap**, below the host's 4.5 MB request/response limit. Browser checks reject oversize files before a request; the API separately validates actual bytes and declared/chunked body size. No new storage service is required for these bounded uploads. [Function limits](https://vercel.com/docs/functions/limitations).
- Older documents above the direct-transfer limit remain stored; Vercel downloads return an explanatory 413 instead of attempting an oversized response. An administrator must retrieve them through an appropriately authorized storage/download path. They are not silently truncated or deleted.
- Production PostgreSQL pools default to **two connections per instance**, with an 8-second acquisition timeout, 10-second idle timeout and no process hold for idle clients. `PG_POOL_MAX` accepts 1–20; this is not a global concurrency guarantee. Use a hosted transaction-pool connection and locate the deployment near the database. Existing `BEGIN` / tenant-local setting / `COMMIT` isolation remains in place.
- Next.js server traces exclude private local data, test outputs and evidence. `.vercelignore` also excludes these files from CLI uploads. App evidence remains in Git where appropriate; private files remain ignored.
- Without valid production account configuration, the public pricing example renders immediately and account/demo buttons are disabled with a setup message. Configuration checks do not connect to the database or consume provider requests. The CLI probe below verifies more than configuration presence.

## Connect the backend

1. Import the private GitHub repository into Vercel. Choose the existing root, Next.js and Node 24. Use `master` as the production branch. Do not deploy a local SQLite database.
2. Provision a hosted PostgreSQL database with PostGIS. Apply the three numbered migrations with a separate migration identity. Follow [database role/grant instructions](../migrations/README.md): the application role must not own/disable tenant protections or have superuser/BYPASSRLS. Prefer the provider's transaction pool endpoint for `DATABASE_URL`.
3. Add these server-side environment variables in Vercel, using the correct Production/Preview environment. [Environment settings](https://vercel.com/docs/environment-variables).

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Hosted database/pool URL for the restricted runtime identity |
| `APP_ORIGIN` | Recommended: exact HTTPS site origin, e.g. `https://your-project.vercel.app`, without a trailing slash or path. If absent, Ascent can use the deployment-owned `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` that Vercel provides. |
| `APP_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes; keep it stable and securely backed up |
| `CRON_SECRET` | Independently generated random secret of at least 32 characters |
| `PGSSL` | `require` where required by the database provider; configure certificate-verified TLS |
| `PG_POOL_MAX` | Optional; `2` is the production default |

Keep the privileged migration URL off the runtime. Never use `NEXT_PUBLIC_` for secrets. Do not copy the local-development provider policy to production. Do not blindly reuse a production origin in a preview deployment: mutation origin checks intentionally require the current site's exact origin. New environment settings require a new deployment.

### If demo and sign-in are unavailable

The landing page intentionally requires a working account backend for private demo workspaces and sign-in. **A publicly visible landing page does not mean the database is ready.** Verify these production settings in Vercel, not in a committed file:

1. `DATABASE_URL`: the deployed app's restricted, TLS-enabled PostgreSQL connection string with all migrations applied.
2. `APP_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes. Save the original key securely so existing documents stay decryptable.
3. `APP_ORIGIN`: the exact public HTTPS origin, or leave it unset only if Vercel supplies `VERCEL_URL` or `VERCEL_PROJECT_PRODUCTION_URL`. Never derive allowed origins from request headers.

Set the values for the deployment's **Production** environment, redeploy, and then verify demo creation, registration, sign-in, sign-out, and tenant isolation. `CRON_SECRET` protects scheduled jobs, while RentCast, Groq, and Stripe are optional; none is necessary for the fictional demo. If the website still shows a setup warning, run the private `check:deploy` command below and inspect only its field status, not the secret values.

When account storage is not configured, the homepage now keeps **Sign in** navigable and routes **Try the interactive pricing demo** to its real client-side calculator instead of showing a dead button. This fallback does not create an account or replace the database-backed workspace.

4. Check configuration from a private terminal using the same environment. The command reports field names and status, never credential values:

```powershell
npm.cmd run check:deploy
npm.cmd run check:deploy -- --database
```

The first command is offline. The optional `--database` probe makes database reads under production safeguards, checking connectivity, a restricted runtime role, all six enabled/forced tenant RLS tables and PostGIS. It performs no migrations or provider/inference requests. It is not a substitute for real registration, cross-tenant, upload and concurrency acceptance on the deployed database. Missing required configuration or a failed requested probe exits nonzero. Optional-feature warnings do not prevent deterministic workflows.

For the opt-in application/database acceptance workflow, run `npm.cmd run verify:postgres -- --database=ascent` against the dedicated database with the restricted runtime credentials and document encryption key. See [scope and cleanup behavior](../migrations/README.md#sharing-an-existing-postgresql-service-safely). This check does not require the final site origin and does not consume RentCast or Groq quota.

5. Deploy. Confirm the Vercel access/protection settings permit your intended personal testers, then verify registration/login/logout, private workspace persistence, CMA save/report, small-document upload/review/download and cross-tenant access. Test the daily route with the configured Bearer secret; never put that secret in a URL or browser code. The public pricing example remains usable before account storage is configured.

## Optional features and budgets

Groq synthesis requires a server key, explicit per-question/daily/monthly budgets and approved sharing configuration. Otherwise evidence mode remains usable. RentCast requires its server key, reviewed production policy, current tenant grants and shared request/spend limits. Local-only grants fail closed in production. Keys and local access files are not uploaded by Git. No budget is automatically increased for deployment, and renders or ordinary assistant messages do not trigger property-provider requests.

Stripe is unnecessary for personal exploration. Enabling paid plans requires a hosting plan permitting commercial use plus independently configured Stripe prices, keys and verified webhook acceptance. Hosting compatibility does not establish real-estate licensing, data entitlement, or commercial readiness.

## Validation boundary

The local suite exercises upload byte/body boundaries, tenant privacy, legacy download handling, production configuration checks and pool settings. Browser coverage verifies that oversize selection makes no upload request and that a smaller retry succeeds. A separate local optimized-server smoke verifies the unconfigured public pricing example and disabled account controls. Hosted Neon PostgreSQL acceptance now passes with a restricted role, forced tenant policies, verified TLS and PostGIS; [connection scope](postgres-connection.md) and [actual verification results](verification-results.md) distinguish this from public deployment. Vercel environment configuration and actual deployed acceptance remain pending.
