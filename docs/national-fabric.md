# National data fabric

The fabric is an extensible ingestion and authorization layer. It does **not** provide nationwide MLS coverage. The working defaults are explicitly fictional Washington-area (DC/MD/VA configuration; nine Arlington fixture records) and Austin (the original twelve fixture records) environments. The selected default is DMV. Switching regions retains existing clients, offers, transactions and frozen CMAs, while the UI filters its active property set by region and data mode.

## Data model and matching

`Workspace.fabric` stores canonical partial property facts, source policies, provenance, revision checksums/changed fields, ingest runs and quarantine metadata. Missing facts stay missing. Completeness scores count required supplied fields; they are not accuracy or confidence estimates. A record becomes an analytical `Property` only when all required fields exist, including an explicit condition score and closing facts for a sold record. Assessed value is never treated as a sale price.

Matching first uses county-qualified parcel identifiers and unit. The fallback requires the same county, normalized address, unit, state and coordinates within an explicitly declared 0.015-mile policy. Ambiguous collisions and conflicting cross-source facts are quarantined. Synthetic and authorized records occupy separate identity partitions. Repeated payloads are idempotent; a changed same-source record requires a newer observation and leaves a revision trail. Quarantine stores reasons/checksums, not a second copy of raw customer payloads.

Region configuration is a registry: add a `RegionConfig` through `registerRegion`, configure source mappings and applicable rights, and reuse the existing analytical engine. `regionalAssumptions` supplies transparent analyst defaults; these are hypothetical inputs, not locally fitted coefficients. New jurisdictions inherit the disclosed base defaults unless explicitly configured.

## Supported adapters

- [RESO JSON](https://transport.reso.org/proposals/web-api-core/): explicit listing fields and a bounded `value` array. The optional `AscentConditionScore` is a local normalized extension, not a claimed RESO standard field.
- Assessor/open-data JSON: explicit county/parcel, address, geography and supplied structural facts. Each provider needs a reviewed mapping and license. The [DC open-data catalog](https://opendata.dc.gov/) is a documentation entry point, not an active connected feed.
- [Census geographic matches](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html): parses an explicitly supplied county/address match. Interpolated coordinates do not establish parcel ownership, property existence or value.

## API and persistence

`GET /api/fabric` lazily persists defaults and returns `{workspace, fabric, regions, selectedRegion, coverage, access, adapters, integrationStatus}`. `POST /api/fabric` accepts `selectRegion`, `syncDemo`, or configured `syncProvider` with `regionId` and, for the latter, `providerId`. Writes require an owner/agent session and same-origin protection. Successful source projections also update the tenant geographic index.

`POST /api/fabric/grants` requires an owner session **and** the separate trusted operator `x-data-grant-review-secret`. A provider grant records contract reference, permitted regions/uses, reviewer and expiry. Subscription payment never grants data rights. Restricted ingestion requires an independently reviewed, unexpired professional credential and a separate current provider grant. Export permission is checked independently.

Read scoping rechecks source policies, grants, credential expiry and retention without modifying durable history. Saved CMA conclusions and every archived input require current valuation permission in addition to the requested research/export permission; research access alone may expose raw research facts without exposing derived valuations. It removes inaccessible property facts, dependent workflows, raw CMA snapshots, and graph labels. Unstructured legacy licensed sources fail closed. If untracked free text might contain inaccessible source facts, the scoped view withholds it; the unedited durable audit chain is withheld instead of falsifying its hashes. Authorized frozen reports remain reproducible after current property removal.

## Operator configuration

Live access defaults off. Configure server-only `FABRIC_SOURCE_JSON`, `FABRIC_PROVIDER_URL`, `FABRIC_ALLOWED_HOSTS`, and any required `FABRIC_PROVIDER_TOKEN`, then explicitly enable `FABRIC_LIVE_ENABLED=true` only after validating the contract, authorization/read paths, and retention operations. Source JSON declares provider/region IDs, adapter, refresh policy, allowed uses, export permission, retention and any license expiry; see `.env.example`. Tokens and endpoints are never supplied by browser requests or discovered through credential probes.

Transport permits an explicit HTTPS hostname allowlist, disallows credentials/local literal destinations and redirects, and bounds requests to ten seconds, five megabytes and 1,000 records. It ingests only the first JSON page and reports an incomplete-coverage warning when `@odata.nextLink` exists. An observation timestamp records receipt, not proof that a listing itself is current.

Automatic synchronization also defaults off: set `FABRIC_SCHEDULED_SYNC=true` with live enablement and a valid `CRON_SECRET` to let `/api/jobs/market` invoke the same pipeline before stored-evidence monitoring. Fresh sources are skipped using their declared refresh policy. Failures preserve prior records and are recorded. No external calls were used to validate these paths; tests use controlled responses.

## Remaining operational work

No actual MLS/provider credentials, national inventory, real-market calibration or live SLA are supplied. Additional provider mappings, pagination/backfill, distributed scheduling/leases, retry policy, per-provider monitoring and provider-specific contract review remain. Read retention is enforced; physical deletion of expired canonical revisions and backups still needs a contract-specific purge job. PostgreSQL production behavior and live provider endpoints must be validated in their deployment environment. Fixture and local timing tests do not establish market accuracy or validated outcome improvements.
