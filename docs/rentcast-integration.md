# RentCast integration: implementation and validation

RentCast is the first implemented national commercial property-provider adapter. No RentCast key was supplied, so **no live RentCast request or real-address acceptance test was performed**. The complete application workflow has been exercised with fictional, schema-shaped fixtures. This does not establish live coverage, data accuracy, current billing, provider reliability or competitive superiority.

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

Before production: configure the real account/key and reviewed terms, validate an authorized real address and two distinct markets, reconcile actual billing/refresh/field availability, apply and test PostgreSQL/PostGIS with the real restricted role, exercise revocation/deletion and backups, obtain required legal/professional participation, and load-test the bounded cache/lease implementation. The provider currently powers research/CMA/market/report evidence; incomplete provider property records are not fabricated into full listing objects for the existing offer and transaction selectors. Richer canonical projection, complete listing histories, additional source adapters and portable source-aware transaction references remain next steps.
