# Hosted PostgreSQL connection

Ascent is connected locally to a dedicated `ascent` database in a separate Neon project on the existing account's Free plan. The project is in AWS US East 1 (N. Virginia), running PostgreSQL 18 with PostGIS. Anna's project, tables, roles and connection settings were not modified. No paid plan was enabled.

All three numbered migrations were applied using the administrator connection. The application uses a separate non-owner `ascent_app` login without superuser, BYPASSRLS, role administration, database creation or schema creation. Its transaction-pool connection uses certificate-verified TLS. Six tenant tables have enabled and forced RLS; every tenant transaction uses a transaction-local tenant setting. Document encryption uses a stable, privately stored key.

## Local and Vercel configuration

The workstation's ignored `.env.local` now loads the PostgreSQL runtime connection and encryption configuration. The ignored `.env.postgres.local` contains the five server-side database/deployment values prepared for transfer to Vercel: `DATABASE_URL`, `PGSSL`, `PG_POOL_MAX`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`. The application does not load the administrator URL. Keep these private files out of Git and preserve the document encryption key in a secure backup.

Vercel environment configuration and public deployment are **not completed** by this database setup. Add the private runtime values to the intended Vercel environment and set `APP_ORIGIN` to that deployment's exact HTTPS origin. The workstation's HTTP development origin is not a production value. Follow [Vercel setup](vercel-hobby.md), redeploy, and verify the actual deployed workflows. No property-provider rights or inference budgets were expanded.

The previous local SQLite file remains intact. Existing SQLite accounts, documents, provider grants and licensed caches were not copied into the new database. A reviewed data migration is separate from connecting new storage.

## Executed acceptance

Run `npm.cmd run verify:postgres -- --database=ascent` with the restricted runtime environment. The [sanitized receipt](../evidence/postgres-acceptance.json) records six passing checks against the hosted database: role/RLS/PostGIS preflight, registration and session lifecycle, cross-tenant read/write denial and pool-context reset, spatial search and concurrent client edits, encrypted document storage and unapproved extracted dates, and reproducible saved CMA/scenario/evidence/report workflows. Its two disposable synthetic accounts were removed successfully.

Browser registration was independently confirmed in the PostgreSQL authentication registry. Browser tests use fictional property records and deterministic evidence assistance; they do not establish licensed-data coverage, professional valuation accuracy or live AI quality. See [latest verification results](verification-results.md).

Connection testing exposed an interface timing problem: a pending region change left the previous market's actions available. Market changes now show a loading state, withhold stale page actions and reject a response belonging to a previous session. A delayed-response browser regression verifies that an Austin selection leads to a Texas CMA, while the same interfaces still work in the DMV.

Remaining operational work includes backup/restore and encryption-key recovery drills, exhaustive PostgreSQL tests for invitation/billing/API-key lifecycle policies, capacity/load testing, monitoring and deployment-specific acceptance. These checks are not a production security certification.
