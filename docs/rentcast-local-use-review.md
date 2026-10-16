# RentCast local development use assessment

Reviewed October 16, 2026 by Codex as a technical implementation assessment, **not qualified legal review**. The account owner activated the Developer API subscription and requested live integration with a maximum of 10 application requests per month.

The current [API License section 1](https://www.rentcast.io/terms-api) expressly permits internal research, reference, analytics, quality control and necessary internal storage. Section 2 prohibits access-control circumvention, unreasonable load, unauthorized scraping and unsolicited commercial email. Third-party rights and applicable laws continue to apply. This assessment supports bounded, private local development only; it is not a declaration of compliance for a public commercial deployment.

Local configuration is limited to one private validation tenant, the four previously restricted endpoints, research/valuation/ZIP-market analysis and private report exports. It excludes owner/contact fields, unsolicited outreach, consumer eligibility decisions, MLS access and external AI processing of real records. A 30-day configuration expiry, 24-hour normalized-data retention and 60-minute cache are conservative application choices, not provider-required retention periods. Deletion requests and third-party restrictions may supersede them.

The local policy has `deploymentScope: local-development` and is rejected under `NODE_ENV=production`. Production requires a separately reviewed policy, actual tenant entitlements, legal/privacy review and a tested retention/deletion process. Other tenants receive no automatic grant from this setup.

The live acceptance runner uses the same authorization, atomic usage reservations, cache and normalization as the application. It never bypasses those controls, never exports raw response bodies to evidence files and never sends licensed records to Groq. Recorded request counts are application observations, not provider invoices.
