> Historical planning document. Current policy: core Ascent features remain free permanently, new checkout is disabled, and paid definitions are retained only for historical compatibility. See [current readiness and free-service scope](production-readiness.md).

# Adoption, professional access and sustainable economics

Research checked October 15, 2026. Dollar amounts below are USD. Vendor references are published prices, not account-specific quotes or observed bills. Commercial scenarios are explicitly hypothetical; no successor launch price has been selected or hard-coded into the product.

## Adoption proposition

Keep a permanent useful free core: property exploration in clearly marked synthetic data, reproducible basic CMA calculations, pricing arithmetic, saved decision history, client/offer/transaction continuity and useful exports. Limit external-cost services rather than imposing a payment gate before someone can understand a CMA. Never represent free synthetic records as live coverage.

Charging less than an existing tool is insufficient differentiation. RPR's property data and reports are included with eligible NAR membership dues at no additional usage charge. Cloud CMA says it may already be included with an agent's MLS membership; its pricing link led to a dynamic checkout whose exact price was not retrievable, so no price is asserted. [NAR RPR overview](https://www.nar.realtor/realtors-property-resource-rpr/what-is-rpr), [RPR eligibility and listing access](https://blog.narrpr.com/support/what-is-rpr/), [Cloud CMA official product and pricing link](https://cloudcma.com/real-estate-agents).

For a different category reference, Follow Up Boss lists Grow at $69 per user/month on monthly billing or $58 per user/month on annual billing, plus applicable tax; calling is a separate add-on on that tier. Its monthly Pro package is $499 for ten users. This demonstrates established pricing for workflow and team utility, not that Ascent matches its service or should use those prices. [Follow Up Boss official pricing](https://www.followupboss.com/pricing).

The testable adoption hypothesis is that a professional will retain a tool that makes the next decision easier: inspect why a comp matters, change assumptions without losing evidence, compare two offer structures, and carry the accepted terms into reviewed deadlines. The first session should demonstrate one complete, understandable decision before asking for payment, MLS credentials or a long organization profile. Actual product superiority is not established; code tests and synthetic demos cannot show retained use or improved customer outcomes.

## Progressive onboarding and independent access decisions

| Stage | User can do | Prompt only when relevant | Access decision |
|---|---|---|---|
| Explore | Open an isolated fictional workspace, inspect property/CMA, change a price scenario and view provenance. | A short sample-data explanation. | Synthetic explorer access. |
| Save continuity | Keep clients, offers, reports and transaction notes in the private workspace. | Create/sign into an account before durable professional work; a demo session is already isolated per tenant. | Account authentication and workspace role. |
| Request licensed data | Continue all free core work while submitting professional details. | State/jurisdiction, license number, legal name; explain the pending status inline. | Authoritative license review. |
| Connect a source | Use only the provider's permitted geography, fields and purposes. | Provider/feed entitlement, contract and membership information when that feed is requested. | Separate source grant with provenance and expiry. |
| Increase external capacity | Choose larger model/query allowances or team capacity after seeing useful work. | Show configured offer and allowances; no published amount if the operator has not configured it. | Billing/usage entitlements. |
| Collaborate | Invite intended members with roles and continuity. | Invite only when sharing is needed. | Organization membership and role, separately from license and billing. |

A payment, NAR membership, state license, brokerage affiliation and MLS data license are different facts. None implies all the others. Pending/rejected/expired verification must preserve explorer and deterministic core access. A paid plan must not silently manufacture professional verification or provider rights. Likewise, professional verification should not require purchase.

Current implementation stores the requesting workspace owner's verification in `workspace.platform.verification`. It is **workspace-level verification**, not independent certification of every invited agent. Before activating a provider that requires individual eligibility, add per-member professional records and enforce that provider's actual membership rules. Do not market the current team roster as proof every member is licensed.

## Legitimate license verification investigation

| Authority | What the official source establishes | Integration boundary |
|---|---|---|
| District of Columbia DLCP | Its Quick Services page links occupational/professional license lookup and a professional verification request. [Official DLCP services](https://dlcp.dc.gov/page/quick-services). | Human review entry point. An openly documented automation contract was not established in this investigation. |
| Maryland MREC | The commission publishes a License Search link. [Maryland Real Estate Commission](https://labor.maryland.gov/license/mrec/). | Human review; no public API or permission to scrape assumed. |
| Virginia DPOR | Official license lookup and public-record access exist. The records policy lists license number, classification, status and expiration among public factors, and describes electronic regulator-list requests. [DPOR lookup](https://www.dpor.virginia.gov/LicenseLookup), [DPOR records policy](https://www.dpor.virginia.gov/RecordsandDocuments). | Public availability does not itself establish automated API rights, refresh SLA or sufficient identity matching. |
| ARELLO / SourceRE | A commercial verification web service exists for participating jurisdictions; jurisdiction-provided records are distinct from NAR records, which ARELLO says are excluded from its API. [ARELLO service scope](https://www.arello.com/Information.cfm). | Purchase/authorize a feed and confirm jurisdiction/allowed use. It is not universal US coverage. |
| ARELLO developer contract | SourceRE documents an HTTPS form-encoded POST Search API with bearer feed token, jurisdiction and license/name parameters; search scores indicate match strength. [Official SourceRE ARELLO API documentation](https://docs.sourceredb.com/). | No feed/token was supplied, so this build sends no requests and does not enable an automated verifier. A fuzzy match score alone must never approve professional access. |

The ARELLO pricing page describes monthly subscriptions but did not expose a numeric tariff in the retrievable page; its developer documentation describes per-jurisdiction plans. Obtain a current quote for required coverage and rights rather than inventing a verification cost. [ARELLO pricing](https://www.arello.com/Pricing.cfm), [feed-plan documentation](https://docs.sourceredb.com/).

The implemented submission form accepts US state/DC/territory codes for a review request. This input coverage is **not a claim that every jurisdiction has an automated integration**. Where an authoritative lookup is unavailable or inconclusive, the status remains pending and the reviewer records what additional evidence is needed. No scraping, captcha bypass, guessed license formats, public test credentials or external paid calls are used.

Before enabling automatic approval, an authorized provider integration must be tested against its real contract: exact license/jurisdiction, legal-name identity match, active professional classification, restrictions, expiration, source timestamp and unambiguous result. Ambiguity, stale records, unavailable sources and provider failure should go to human review. Verification expiry must reflect both source expiry and a review freshness policy; it must not extend a license's validity.

## Implemented verification API and reviewer workflow

`GET /api/verification` requires an authenticated workspace session and returns:

```json
{
  "verification": { "status": "unsubmitted" },
  "accessLevel": "explorer",
  "provider": { "mode": "manual", "automated": false, "status": "not_configured", "message": "..." },
  "sources": [{ "state": "VA", "label": "...", "url": "https://www.dpor.virginia.gov/LicenseLookup", "access": "..." }],
  "message": "Core tools remain available while review is pending..."
}
```

`POST /api/verification` requires the authenticated workspace owner and the same-origin write checks. Its strict JSON input is:

```json
{ "state": "VA", "licenseNumber": "NUMBER-AS-ISSUED", "legalName": "Legal name on record" }
```

It persists `pending`, `submissionId`, `submittedBy`, `submittedAt` and submitted fields, appends an audit event, and returns HTTP 202 with the GET response shape. It performs input safety validation only, **not license validation**. Duplicate identical pending requests reuse the submission ID. An unchanged currently verified request preserves its review. Changed details require a new pending review; stale approval attempts cannot approve that replacement.

The reviewer first checks the current submission against authoritative records outside the application, confirms identity/status/classification/restrictions and records a source reference. After obtaining actual evidence, a trusted backend operator calls `POST /api/verification/review` with a server-only `Authorization: Bearer <VERIFICATION_REVIEW_SECRET>` header. Configure a random service secret of at least 32 characters outside the browser; never put it in a `NEXT_PUBLIC_` variable or give it to ordinary workspace owners. A browser session is not review authority. The endpoint rejects review when the service credential is unconfigured or invalid.

Review JSON:

```json
{
  "tenantId": "target-workspace-uuid",
  "submissionId": "current-pending-submission-uuid",
  "status": "verified",
  "reviewedBy": "trusted-operator-identifier",
  "evidence": [{ "url": "https://official-source.example/record", "reference": "Authoritative record reference and review basis" }],
  "expiresAt": "valid-future-ISO-timestamp-within-366-days",
  "reason": "Optional concise review notes"
}
```

The placeholder values above are documentation, not a usable approval request or purported real record. Use actual authoritative evidence and a real expiry no later than the license's expiry. HTTPS evidence URLs and a nonempty source reference are required. Verification grants expire within 366 days and cannot be replayed against a different submission; the system does not fetch evidence URLs or establish their accuracy for the reviewer. A rejection requires a reason and source evidence. An authorized reviewer can reject a previously verified submission to revoke access. Review does not change billing or create provider grants.

Missing reviewer/source/expiry metadata and expired grants produce an effective expired/explorer state. Every decision is audit logged without copying service secrets into audit details. The API retains the submitted license information within its private tenant workspace. Production operations should restrict reviewer-service access and retain license-review data only as long as its legitimate purpose requires; no new identity-document upload is required for this flow.

Verification is asynchronous as a durable state machine; there is currently no provider worker or guaranteed review completion time. The pending record survives requests/restarts through existing workspace persistence. A human service review advances it. The API does not show a fabricated progress percentage, completion estimate or automatic success.

Six integration/security tests cover input validation, durable pending state and tenant isolation, idempotency, free CMA while pending, owner-only submissions, credential-only review, expiry/evidence rules, stale submissions, replay rejection, revocation, authentication, CSRF and billing independence. Tests use synthetic records and local temporary databases; no external validation call is made. `npm.cmd exec -- tsx --test tests/verification.test.ts` passed 6/6; TypeScript checking also passed during this change.

## Sustainable packaging hypothesis

| Package | Sustainable value | Cost boundary |
|---|---|---|
| Permanent Free Explorer | Useful deterministic CMA, saved work, client/offer/transaction tools and sample research. | Bounded external-model and data-query allowances; no paid feed promised without rights and budget. |
| Professional | Higher external-model capacity, larger approved-source workflows and ongoing listing review utility. | Configured provider/model allowances with transparent usage; paid rights remain separate. |
| Brokerage Team | Seats, roles, shared continuity and administrative utility. | Capacity follows actual enabled seats and usage; protect tenant boundaries. |
| Enterprise / association | Negotiated deployment, integration, support and licensed coverage. | Contractual source costs, regional rights, operational SLAs and capacity expressly priced. |

These are packaging choices, not published tariffs. Billing price IDs and displayed labels are operator-configurable. An unconfigured paid offer should say so and should not fabricate a checkout price. Show recurring terms and allowances before checkout; never upgrade, contact a client or change a price automatically. Do not remove a user's evidence history or exports to force conversion.

Possible channels are broker-led pilots, association/MLS distribution where permitted, and sharing useful reviewed reports. Test the complete decision workflow against tools agents already receive with dues. Do not count a synthetic session or free account as an acquired paying customer. Referrals from real client outcomes require permission and evidence; this build has no claimed customer wins.

## Published cost reference points

| Cost | Official source checked | Interpretation |
|---|---|---|
| Hosting | Vercel Pro lists $20/month with $20 included usage credit; usage/resources, seats, region and terms matter. Hobby is described as personal/noncommercial. [Vercel pricing](https://vercel.com/pricing). | A small commercial deployment reference, not the cost of a national platform. Do not sum included credits again as extra required spend. |
| Managed PostgreSQL option | Supabase Pro starts at $25/month; paid plans include $10 compute credit and bill compute/resources beyond included levels. [Supabase pricing](https://supabase.com/pricing). | An illustrative managed database floor. The application uses its existing PostgreSQL adapter; no Supabase account has been provisioned. |
| Domestic card payments | Stripe lists 2.9% + $0.30 per successful domestic-card transaction. Additional products, international cards, currency conversion and other fees can apply. [Stripe pricing](https://stripe.com/pricing). | Use actual chosen payment/billing contract. The model below includes this payment fee only, not all subscription-management fees. |
| Model inference | Official OpenAI pricing separates input, output, cache and service tiers, with tool charges where applicable. [OpenAI API pricing](https://developers.openai.com/api/docs/pricing). | The model ID and operator rates must match the configured provider. Use actual token usage when available and distinguish estimates from invoices. Deterministic core work needs no model call. |
| Licensed feeds / verification | Regional MLS/provider rights, fields, retention, use, identity coverage and refresh obligations require actual provider terms. ARELLO exposes a contractual service, not a verified free API. [ARELLO service plans](https://docs.sourceredb.com/). | Unknown until quoted and licensed. Do not assume a public national dataset covers active listings or every county's transfer prices. |
| Other operations | Email, object storage, backups, logs, geocoding, monitoring, security review, customer support, review labor and taxes depend on actual usage and agreements. | Not measured in this workspace; reserve explicitly and replace assumptions with observed bills. |

The $45 combination of the cited hosting and managed-database entry prices is only a small base reference. It excludes production redundancy, additional usage, licenses, support, email, observability, security and staffing. It is not a claim that the complete product costs $45/month to operate.

## Hypothetical contribution model

Use `N` monthly active workspaces, paid share `p`, hypothetical average monthly paid revenue `A`, free-variable cost `cF`, paid-variable cost `cP`, fixed operations `F`, review labor `V` and provider cost `D`:

```text
Gross revenue = N × p × A
Domestic card fees = N × p × (0.029 × A + 0.30)
Operating cost = N × (1 − p) × cF + N × p × cP + F + V + D
Contribution = gross revenue − card fees − operating cost
```

This is contribution before salaries beyond specified review labor, sales/marketing, tax, refunds, chargebacks, all additional billing fees and profit requirements. It is not a forecast, price recommendation or provider quote.

For a reproducible sensitivity example only, assume **1,000 active workspaces, A=$25, cF=$0.15, cP=$3, F=$250, V=$100 and D=$200/month**. Every one of these figures is a hypothetical operating assumption, not an observed customer or vendor expense. The $200 provider allowance is particularly speculative and must not be treated as adequate for national MLS rights. Review labor here means 50 new reviews/month × four minutes/review × $30/hour.

| Hypothetical paid share | Paid workspaces | Gross revenue | Card fees | Operating cost | Contribution before excluded costs |
|---|---:|---:|---:|---:|---:|
| 2% | 20 | $500 | $20.50 | $757 | −$277.50 |
| 4% | 40 | $1,000 | $41 | $814 | $145 |
| 8% | 80 | $2,000 | $82 | $928 | $990 |

At these assumptions the mathematical break-even paid share is about 3.31%, before excluded costs. At 4%, raising the hypothetical provider expense from $200 to $2,000 changes contribution from +$145 to −$1,655; the implied break-even paid share rises to about 11.83%. Thus national-data costs must be contracted and budgeted per geography/use rather than subsidized blindly by a nominal plan fee.

Model cost should be computed as `(input_tokens × input_rate + output_tokens × output_rate) / 1,000,000`, adding actual applicable cache/tool/service charges. For a **hypothetical** rate of $2 input/$10 output per million and 4,000 input/1,000 output tokens, one request costs $0.018 before other charges. This is rate arithmetic, not a claim that any currently selected model has that rate. At a planning reserve of $0.02/request, 20 fully used free calls already cost $0.40, exceeding the example $0.15 total free-variable-cost assumption. Saturated usage must therefore be stress-tested; average inactive accounts cannot justify an unlimited expensive free service.

Protect free utility by keeping calculations, evidence views and exports deterministic; use the model only for optional language/context tasks. Enforce monthly external-call allowances, output budgets and request concurrency, cache only when source rights allow, and reserve budget before the call. Reconcile provider tokens and estimates, preserve a usable evidence-only response when capacity is exhausted, and never label an estimated token cost as a customer charge or provider invoice. Current configuration/usage controls are a foundation, not proof that a spend target has been achieved.

## Evidence to collect before setting prices or claiming adoption

Measure first useful task completion, time to inspect a CMA, save-to-return rate, four-week retention, useful reports exported, verified-source activation, review completion/error rate, external inference cost per completed task, support minutes and paid conversion by acquisition cohort. Define events without recording client messages or sensitive property/client details in analytics. Compare matched tasks with existing tools; never optimize for raw model-call count or notification volume.

Treat cohorts by geography, available data rights, organization size and acquisition channel. Account for seasonality, trial duration and right-censoring. Measure paid retention and contribution on actual usage rather than assuming conversion is durable. Early research should test whether the combined evidence/history/workflow benefit is strong enough when a professional already has RPR or an MLS-included CMA tool.

Remaining commercialization blockers are current licensed-feed/verification quotes and contracts, configured deployment and payments, provider-cost reconciliation, reviewer operations, independent per-member eligibility where required, user-tested onboarding and observed retention/conversion. No numbers in this document assert those blockers have been resolved.
