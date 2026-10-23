# Public-data network (DMV)

Ascent reads public property records for the District, Montgomery County and Prince George's County through source adapters. Each adapter has a permission record, a field allowlist and refresh limits. Records found after a validated snapshot are **shown and monitored, never priced**. The published accuracy studies scored the bundled snapshots, and only a new registered study can change that (`ASCENT_POLICY.refreshedRecordsInValuation = false`).

Code: [`src/lib/sources/registry.ts`](../src/lib/sources/registry.ts) holds the permission records, [`ingest.ts`](../src/lib/sources/ingest.ts) the pipeline, [`adapters.ts`](../src/lib/sources/adapters.ts) the sources, [`property-check.ts`](../src/lib/sources/property-check.ts) the per-home check, and [`evidence-timeline.ts`](../src/lib/evidence-timeline.ts) the Property Evidence Timeline. Tests: [`tests/public-sources.test.ts`](../tests/public-sources.test.ts).

## Phases

| Phase | Area | Status on October 22, 2026 |
| --- | --- | --- |
| A | District of Columbia | Live: sales, tax extract, building permits. Characteristics stay a bundled snapshot. |
| B | Montgomery and Prince George's | Live: Maryland SDAT assessments and transfers, Montgomery permits. **Prince George's permits are disabled**: no open license is stated. |
| C | Northern Virginia | **Not started.** Fairfax, Arlington and Loudoun are registered as disabled adapters. The [permission requests](data-permissions/virginia-requests.md) are drafted and unsent. |
| Regional | Whole metro area | FHFA purchase-only index (metro division, not a home) and FEMA flood zones. |

## Sources and permissions

A disabled source makes no request. Its adapter refuses to run, and the record names the permission it needs. No permission is inferred from a website being reachable, and nothing is scraped.

| Source | Phase | Status | License (checked) | Refresh limits | Limits, or the permission required |
| --- | --- | --- | --- | --- | --- |
| `dc-property-sales`: District Tax System Property Sales | A | enabled | CC BY 4.0 (2026-10-22) | daily republish; 12 h cache; ≤600 requests/h | Recordation lags closing by weeks. The current owner name is never requested. |
| `dc-tax-extract`: District ITSPE | A | enabled | CC BY 4.0 (2026-10-22) | periodic; 12 h cache; ≤600/h | Carries only the latest sale. Owner, mailing, mortgage company and homestead fields are never requested. |
| `dc-building-permits`: Department of Buildings | A | enabled | CC BY 4.0 (2026-10-22) | continuous; 12 h cache; ≤600/h | The current year is checked live; earlier years come from the bundled snapshot. A permit authorizes work and does not show it was finished. |
| `dc-cama-and-addresses`: CAMA and Address Points | A | enabled (bundled) | CC BY 4.0 (2026-10-22) | not refreshed live | Refreshing would change what the published studies scored, so it is manual and requires re-validation. |
| `md-sdat-assessments`: Maryland SDAT/MDP | B | enabled | Public domain (2026-10-22) | about monthly; 24 h cache; ≤300/h | Three most recent transfers per account. Grantor names and mailing addresses are never requested. |
| `montgomery-permits`: Montgomery DPS | B | enabled | Public domain (2026-10-22) | daily; 12 h cache; ≤300/h | Matched by exact address; a permit filed under a variant address is missed. |
| `prince-georges-permits` | B | **disabled** | No stated license | none | Needs a published open license, or written county permission covering display, monitoring and redistribution. |
| `fairfax-county-records` | C | **disabled** | Permission not received (2026-10-18) | none | Needs a written county reply naming the datasets, permitted uses, attribution, refresh limits and expiry. |
| `arlington-county-records` | C | **disabled** | Permission not received | none | As Fairfax. |
| `loudoun-county-records` | C | **disabled** | Permission not received | none | As Fairfax. |
| `fhfa-purchase-only-index` | regional | enabled | U.S. Government work (2026-10-22) | quarterly; 24 h cache; ≤20/h | Describes a whole metropolitan division, never one home. |
| `fema-flood-hazard`: National Flood Hazard Layer | regional | enabled | U.S. Government work (2026-10-22) | as maps take effect; 168 h cache; ≤300/h | Not an official flood determination. |

Every license record names the evidence checked and the date. Re-check a record before relying on it after that date. A source that changes its terms must be disabled in the registry first. `GET /api/sources` publishes the registry; `GET /api/mls/status` publishes the MLS Bridge status.

## How records are ingested

- **Four dates, kept apart.** Each observation carries `transaction` (the sale or contract), `recorded` (the deed date, where the source publishes it), `effective` (a permit's issue date, an assessment's date or an index quarter's end) and `published` (when the source last modified it). It also carries `observed`, the time Ascent fetched it. The registry documents which field supplies each date, or says that the source does not publish it. A blank value stays unknown and never becomes zero.
- **Identity and fingerprints.** Identity comes from content (parcel, date and book/page, or a permit number), never from row numbers. The fingerprint is a SHA-256 hash over identity, values and the substantive dates, excluding publication and fetch times. A republished row keeps its fingerprint; a corrected price or status changes it.
- **Duplicates and conflicts.** A duplicate with the same fingerprint is counted once. Two rows with the same identity but different content are both kept and reported as a conflict, never silently merged. The timeline shows the conflict on the event.
- **Validation.** Rows are checked against the field allowlist and identifier patterns. Invalid rows are counted by reason, and identities are resolved only to covered homes.
- **Bounded and polite.** Each adapter has a minimum interval between requests, a page size and page cap (hitting the cap gives a `partial` result), a timeout and retries with backoff. A 4xx response is not retried, and an ArcGIS error inside a 200 response is treated as an error. There is also an hourly per-process ceiling (excess requests are `deferred`) and a per-home cache.
- **Manifests.** Every run produces a manifest with source, status, counts, errors, invalid-by-reason, conflicts and a reproducible content digest. A rerun against unchanged content reproduces the digest.
- **Failure isolation.** One source failing leaves the others' results intact. The failure is reported, and nothing is filled in.

## Refresh runbook

```powershell
npm.cmd run sources:refresh              # writes evidence/ingestion/<date>.json
npm.cmd run sources:refresh -- --check   # re-runs and reports whether each source still returns the recorded content
npm.cmd run sources:refresh -- --dry-run # runs and prints without writing
```

The refresh never changes a snapshot, a fingerprint or an estimate. A `--check` that differs means the live source changed, which is expected; record a new dated run rather than editing an old one.

## Data-quality metrics (run of October 22, 2026)

From [`evidence/ingestion/2026-10-22.json`](../evidence/ingestion/2026-10-22.json). `--check` reproduced all three sources the same day.

| Source | Status | Received | Valid | Invalid by reason | Field completeness | Duplicates | Conflicts | Covered homes | Unresolved | Newest transaction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DC property sales after the snapshot | complete | 64 | 64 | none | 100% | 0 | 0 | 48 | 16 | Oct 14, 2026 (8 days old) |
| Maryland SDAT transfers after the snapshot | complete | 0 | 0 | none | n/a | 0 | 0 | 0 | 0 | none yet |
| FHFA index, Washington metro division | complete | 14,200 | 142 | 14,058 other areas | n/a | 0 | 0 | n/a | n/a | n/a |

An unresolved identity is a lot outside Ascent's covered homes (commercial, multi-unit, outside the counties, or filtered when the snapshot was built). It is not necessarily an error.

## Validation protocols are unchanged

The frozen valuation studies, their datasets and fingerprints are untouched: `npm run validate:valuation -- --check` passes. The external Maryland study still fails acceptance and is still shown as failed. Refreshed records cannot reach a study or an estimate. Using them would need a new protocol, registered before the data exists. See [valuation validation](valuation-validation.md) and [remaining work](remaining-work.md).

## Property Watchtower

Watching is opt-in, per home, and stays in the browser (`ascent.watchtower.v1`).

- **Schedule.** There is no background process. A watched home is checked when the homeowner opens it, at most every 12 hours. Server responses are shared through the 12-hour per-home cache, so a check can reflect records up to 12 hours old. A watch not successfully checked for 72 hours shows as stale.
- **Quotas.** Up to 10 watches per device and 20 checks per device per day. The server also limits live checks to 30 a minute per client address when `TRUST_PROXY=true` (120 a minute in one shared bucket otherwise), on top of the per-source hourly ceilings.
- **Change detection.**
  - The first check records a baseline and sends no notifications.
  - Later checks compare fingerprints. Each event's id is deterministic, so the same change is never reported twice.
  - A record is reported removed only when the check that would have listed it completed.
  - A source outage is reported once as unavailable, and once again when the source answers. It is never shown as a change in the home.
- **Never a value change.** Every notification says it is not a change to the estimate. A watch shows freshness, the last successful check, the next check and its own check history.
- **Controls.** Pause, delete (with its history) and export.
- **Email is not available.** It needs an account-based server-side watch, a configured email provider and recorded consent. None is built, so notifications are in-app only.
