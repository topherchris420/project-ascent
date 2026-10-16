# RentCast integration: implementation and validation

RentCast is the first working national commercial property-provider adapter. The account owner activated the Developer plan; the dedicated restricted key remains in the ignored server environment. Actual live acceptance used **7 of the 10 configured monthly requests**, exercised all four endpoints, retrieved DMV and San Antonio evidence, reproduced a 17-comparable recorded-sales CMA, compared the separate provider estimate, computed hypothetical proceeds and exported an authorized report. The provider dashboard independently showed 7 requests and zero errors. See [live acceptance](../evidence/rentcast-live-acceptance.json) and [setup scope](../evidence/rentcast-setup.json). This is developer acceptance on a small sample, not valuation accuracy, professional approval or verified nationwide completeness. No key value or raw live record is committed.

## Architecture and the working path

The existing application is extended, not replaced. In **Properties**, choose **National provider research**. The existing saved-workspace property explorer remains available. Provider research offers an explicitly selected synthetic or live environment; it never substitutes fixture data for a failed live query.

The server-only `PropertyDataProvider` interface supports `getProperty`, `searchProperties`, `getSaleListings`, `getComparables`, `getValuation`, `getMarketStatistics` and `getCoverage`. `RentCastProvider` implements the four documented endpoints. `FixturePropertyProvider` implements the same operations without network traffic. Future Bright MLS, MLS Grid, REdistribute and government providers can supply normalized objects through this boundary; no credentials or access to those services are implied. Existing RESO, assessor and Census fabric adapters remain intact.

| Endpoint | Verified query subset implemented | Preserved semantics |
| --- | --- | --- |
| `/properties` | Address, city/state, ZIP or coordinates/radius; property type/structure filters; saleDateRange; limit/offset/total count | Property characteristics, optional assessments/taxes and provider-recorded sale history |
| `/listings/sale` | Same bounded geographic selectors; Active/Inactive; price/daysOld; explicit pagination | Asking prices, observations and listing snapshots; inactive is not sold |
| `/avm/value` | Address or coordinate pair; property attributes; maxRadius/daysOld; compCount 5–25; lookupSubjectAttributes | Provider estimate/range and comparable **listings**, separate from recorded sales |
| `/markets` | ZIP, dataType=Sale, historyRange | ZIP-level asking-price/listing/DOM aggregates and available history; missing periods stay missing |

Query and response fields were checked against official [property records](https://developers.rentcast.io/reference/property-records), [property schema](https://developers.rentcast.io/reference/property-data-schema), [sale listings](https://developers.rentcast.io/reference/sale-listings), [valuation](https://developers.rentcast.io/reference/value-estimate) and [market statistics](https://developers.rentcast.io/reference/market-statistics) documentation on October 15, 2026. The application intentionally implements a bounded subset, not every advanced range or multi-value expression.

The client fixes the origin to `https://api.rentcast.io/v1`, authenticates with `X-Api-Key`, prohibits redirects, validates schemas and bounds response size. It always adds the documented `suppressLogging=true` query parameter. Owner names, owner mailing information and listing contacts are discarded. The key is kept in a JavaScript private field on the server and is never returned in status, error or audit output. See the detailed [transport contract](rentcast-client.md) and [official security guidance](https://developers.rentcast.io/reference/security).

## Local demonstration

1. Start the application with `npm.cmd run dev` and open `http://localhost:3040`.
2. Register or enter an isolated demo, then open Properties → National provider research.
3. Keep **synthetic fixtures** selected. Retrieve `4821 Example Ridge Road, Arlington, VA 22207`.
4. Inspect characteristics, fictional recorded-sale history, assessments and tax history.
5. Explicitly request recent recorded sales, the valuation benchmark, listing comparables and ZIP statistics.
6. Acknowledge unknown condition and explicitly omit its adjustment, then calculate and preserve the independent CMA.
7. Inspect individual adjustments/exclusions, change the hypothetical sale price, ask for an evidence explanation and export the report.

The browser acceptance test verifies six eligible fictional recorded sales, an independent reproducible calculation, an AVM reference shown separately, ZIP aggregates, scenario arithmetic, a cited evidence response, a clearly watermarked report and cache reuse. It makes zero RentCast network requests. [Recorded browser artifact](../evidence/rentcast-browser-acceptance.json).

## Enable live access

Use a dedicated authorized RentCast API key in the ignored `.env.local` file for local development or the deployment secret manager in production. Never use a `NEXT_PUBLIC_` key or commit an environment file. Set `RENTCAST_API_KEY`, `PROPERTY_PROVIDER_ENABLED=true`, and positive approved values for `PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD` and `PROPERTY_PROVIDER_MONTHLY_BUDGET_USD`. The values are conservative per-attempt reserves and a cap, not a guessed provider tariff.

Configure `PROPERTY_PROVIDER_POLICY_JSON` using an actual reviewed agreement, reviewer/reference, current effective dates, allowed uses, retention and cache policy. The example in `.env.example` is a template, not an approval. The intended consumer/commercial use must be reviewed against the [RentCast API terms](https://www.rentcast.io/terms-api). Display/storage permissions do not automatically establish external AI rights, contractual reporting obligations, individual data rights or every intended downstream use. Professional/legal review remains an external dependency.

An independent trusted operator must also issue the tenant a provider grant using the existing `POST /api/fabric/grants` flow: owner session, same-origin request and a separate `x-data-grant-review-secret` matching `DATA_GRANT_REVIEW_SECRET`. Use `providerId: rentcast`, `regionIds: [us]`, permitted uses and the actual agreement/reference/expiry. The `us` value is a national provider-entitlement scope; it never asserts national MLS access. Revocation uses the existing grant ID. Both current policy and grant are checked before fetching, after transport, on cache access and on export.

RentCast data remains labeled licensed-provider data. A reviewed contract can allow Explorer research without professional verification; this explicit exception is restricted to the RentCast adapter and does not weaken MLS verification gates. Payment cannot manufacture provider grants. A policy requiring professional verification still enforces it.

## Cost, cache and operational behavior

RentCast documents 50 included Developer requests, overages after the allowance, and no provider-side hard request cap. Billing cycles follow the account renewal date. Verify the actual account and remaining allowance before enabling live calls. [Official billing guidance](https://developers.rentcast.io/reference/billing-and-pricing).

The October 15 local dashboard showed the Developer plan at $0/month with 50 included requests and $0.20 for each overage request; activation required a card and API terms acceptance. The local application is initially capped at **10 live requests/month** across the configured key, with matching per-user/tenant caps and concurrency one. A $0.20 per-attempt reserve and $2 monthly reserve conservatively enforce that cap; they are **not charges** for included requests. Other applications using this account can consume its included allowance. Private local development is now enabled for one granted validation tenant. A documented technical internal-use assessment is explicitly not legal review; its local-only policy and retained source metadata fail closed in production. Other tenants receive no automatic provider grant. Merely changing the research selector makes no API request; the fictional fixture address is cleared before live entry.

Ascent uses atomic application-wide counters bound to the configured key, plus tenant and user monthly limits, a global conservative spend reserve, controlled concurrency, expiring request leases, identical-request coalescing and tenant-scoped authorized caches. Cache and fixture/live keys are separate. Budget alerts begin at the configured warning percentage. Status exposes counts, conservative estimated reserves and measured request outcomes/latencies without query text. Reserves round upward to cents and are retained on failed/uncertain attempts; this can stop requests earlier than actual provider billing.

There are zero automatic retries and zero automatic pagination or paid health probes. A user may explicitly retry, subject to the same reservations and caps. Every additional page is separately bounded and metered. The client supports at most 100 records per page; the application service currently restricts pages to 50, offsets to 1000 and geographic radii to 25 miles. Timeouts default to eight seconds, bounded to fifteen. Provider failures return structured codes and preserve already authorized stored evidence. No UI render or assistant message triggers a new RentCast request.

The counters observe this application only; they cannot measure external activity using the same key. Application calendar-month windows are not automatically synchronized with the provider's renewal date. Fixed subscription charges, tax and outside-key usage are not included in these reserves. Use a dedicated key, reconcile the provider dashboard and adjust the application cap for the **remaining** real billing allowance. Do not call these controls a guarantee of the provider's total bill.

Expired/revoked normalized caches are physically pruned on provider access and scheduled maintenance. Frozen decision snapshots have their own exact source expiry and grant binding; expired rights hide outputs without silently rewriting decision history. Complete provider-mandated deletion across snapshots, archives and backups remains a production retention task; withholding access is not physical deletion of every historical copy.

## Valuation, quality and AI boundaries

The existing `calculateCma` engine consumes normalized minimal valuation facts. Missing condition remains absent. The user must expressly choose `conditionValue=0` omission; a fabricated condition rating, listing date or DOM is never inserted. Comparables require an actual provider-recorded positive sale price and date, eligible geography/age/size and compatible known property type. Asking prices, assessments, inactive listings and AVM values cannot become recorded sale evidence. Non-disclosure states may not support a usable closed-sale CMA.

Each saved result retains exact inputs, assumptions, admitted/excluded evidence, source references and a reproducibility checksum. Normalization gaps stay separate from the hashed calculation. Provider-reported facts still require professional verification. The current provider-derived observation IDs are scoped to an evidence bundle; cross-provider national entity resolution and full listing-chain reconciliation are not demonstrated by this slice.

ZIP statistics never imply neighborhood precision or closed-sale absorption. Provider AVM intervals remain provider claims, not locally calibrated confidence. Pricing scenarios assume a sale at the chosen price and perform deterministic cost arithmetic; they do not predict sale probability, time or outcome.

The Groq-first assistant can retrieve normalized, currently authorized cached evidence and frozen CMA results through application-controlled read tools. It cannot fetch new provider data, change authoritative state or approve recommendations. **External inference is blocked when licensed provider records are present**, regardless of a generic AI-sharing flag. Source-specific AI-use review, contractual authorization and additional redaction controls must be implemented before sharing real RentCast evidence with Groq. Synthetic evidence may exercise the model path when configured. No successful live RentCast-to-Groq transfer is claimed.

## Validation and remaining production work

Run `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:e2e -- tests/e2e/provider.spec.ts` and `npm.cmd run build`. Tests cover the transport, normalization, missing data, recorded-sale eligibility, denied rights, CSRF, cross-tenant quotas, shared spend/concurrency, cache revocation/expiry, retained grant binding, reproducibility and the full fixture browser workflow. See [verification results](verification-results.md) for final executed totals.

Before production: replace the private local-use policy with appropriately reviewed production rights, reconcile actual billing/refresh/field availability, apply and test PostgreSQL/PostGIS with the real restricted role, exercise revocation/deletion and backups, obtain required legal/professional participation, and load-test the bounded cache/lease implementation. The provider currently powers research/CMA/market/report evidence; incomplete provider property records are not fabricated into full listing objects for the existing offer and transaction selectors. Richer canonical projection, complete listing histories, additional source adapters and portable source-aware transaction references remain next steps.

## Actual live acceptance and reproduction

The first bounded DMV query returned 50 property records. With the default 180-day comparable window, no subject in this page had at least three eligible comparables. No price or date was invented and no automatic wider paid query was made. An explicit **365-day** assumption on the same cache admitted 17 recorded-sale comparables. Its adjusted range was wide ($810,780?$2,437,720 around a $1,801,612 weighted estimate), so this is evidence of a working calculation, not a reliable appraisal or accepted pricing recommendation. The separate RentCast estimate was $1,728,000. There is no observed sale outcome against which to judge either estimate.

Seven real requests cover the bounded DMV property search, address record, AVM with five listing comparables, ten active listings, DMV ZIP statistics, the published San Antonio documentation sample and its ZIP statistics. The final successful acceptance reused the initial DMV page, so its run reports six new calls and seven cumulative. No second AVM request was bought merely to display its already returned comparables. Failed analytical preflight used no additional provider request.

The research interface shows current policy/grant readiness, user/tenant/shared remaining allowance, conservative reserves and measured transport outcomes. Status checks do not contact RentCast. Full property records take precedence over sparse AVM subject records, with missing and conflicting checked fields visible. Saved provider CMAs restore after navigation; comparable age/distance and trend are explicit editable analyst assumptions.

The documented local assessment is in [rentcast-local-use-review.md](rentcast-local-use-review.md). To repeat setup intentionally, run `node --env-file=.env.local --import tsx scripts/configure-rentcast-local.ts --scope=local-development`. It grants only the private validation workspace and makes no provider request. Inspect counters without network with `node --env-file=.env.local --import tsx scripts/rentcast-local-status.ts`. Run live acceptance only deliberately: `node --env-file=.env.local --import tsx scripts/accept-rentcast-live.ts --live --max-sale-age-days=365`; cached requests are reused, but expired caches can consume the remaining allowance. Do not raise the configured cap to force a test to pass.

The optional browser test `tests/e2e/live-cached-provider.spec.ts` requires `ASCENT_VERIFY_CACHED_LIVE=true` and current private local access/cache files. It selects real stored evidence, restores its saved CMA, asks for a deterministic explanation and checks the report without making a provider POST. Its screenshots remain ignored because they contain real records. Ordinary CI tests remain synthetic/mocked and require no account credentials.
