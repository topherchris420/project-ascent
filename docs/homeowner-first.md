# Ascent for homeowners

**Mission:** Give ordinary homeowners access to inspectable real estate intelligence without an account, professional license or subscription.

The homeowner should never have to accept a number they cannot understand. Pricing evidence and its limitations come before optional professional workflows.

## Available now

| Homeowner task | Current route | Important limitation |
| --- | --- | --- |
| Understand a DC house's price | [DC studio](https://project-ascent-theta.vercel.app/dc) | Eligible houses only; public-record snapshot, not live listings |
| Explore a Maryland home | [Maryland studio](https://project-ascent-theta.vercel.app/maryland) | Montgomery and Prince George's counties; limited attributes and no calibrated range |
| Examine a DC condo | [Condo studio](https://project-ascent-theta.vercel.app/dc/condos) | Experimental condo model did not meet published acceptance criteria |
| Test an asking price | [Fictional sample](https://project-ascent-theta.vercel.app/demo) | Illustrative price and cost scenarios, not sale or buyer-response forecasts |
| Review accuracy | [Published studies](https://project-ascent-theta.vercel.app/accuracy) | Internally reproducible retrospective results, not independent certification |
| Keep an explanation | Printable reports and JSON export | Browser-local draft unless a configured private workspace is used |

## One address box and fast search · October 18, 2026

A homeowner no longer has to choose a market before typing. The homepage and `/home` have one address box. It queries the DC house, DC condo and Maryland searches in parallel, shows matches grouped by market as each answers, and opens the matching studio at `?parcel=`. An address outside coverage gets an explanation of what is covered (with a specific note for Virginia addresses) and a link to the fictional sample. If every search fails, the box offers a retry rather than claiming there is no match.

Search was slow enough to feel broken. Measured on the development laptop (arm64 Node 24), over 2,005 recorded queries:

| Search | Before | After |
| --- | --- | --- |
| Maryland, per query | 738 ms | 1.6 ms |
| DC houses, per query | 150 ms | 0.3 ms |
| DC condos, per query | 99 ms | 0.4 ms |
| Maryland records loaded for a linked home | 10.4 s | 2.7–5.3 s (varies run to run) |

Every query returned exactly the same homes in the same order; `tests/address-search.test.ts` keeps the original implementations as references. It compares normalization on every bundled DC, condo and Maryland address plus 5,000 generated edge cases, and compares search results on real queries. What changed: a word index replaces re-splitting every address on every keystroke, a quote-free CSV fast path replaces character-by-character parsing, the trailing city/state pattern is applied to the address tail only, and the index is built on first search rather than when a linked home is priced. Studios and the address box ask their search route to load records as the page opens (`POST /api/{market}/search`, answered immediately, with the work done after the reply), so the index is usually ready by the time an address is typed. These are local measurements, not Vercel cold-start measurements.

Once a real home is chosen, its address is the page heading and the estimate sits beside it; the market introduction follows as a short context line. On a 390-pixel phone the estimate now appears on the first screen instead of about 1,100 pixels down. The fictional sample keeps its full introduction.

The site now serves an icon, a home-screen icon, a web manifest, a link-preview image, `robots.txt` (APIs and account pages excluded) and a sitemap of the public pages. Absolute URLs use `APP_ORIGIN`, then Vercel's production host.

## Experience principles

1. Use homeowner questions, not professional jargon, as entry points.
2. Show actual comparables, assumptions, exclusions, source dates and limitations before implying confidence.
3. Separate recorded facts, adjustable scenarios and unknowns. Never label an observed adjusted-sale range a confidence interval.
4. Keep public studios available without login, provider key, professional verification or payment.
5. Preserve optional professional workflows without making them the default homeowner journey.
6. Respect source permissions. An MIT software license does not grant MLS data redistribution rights.

## Next, not yet shipped

- Observe homeowners completing real analyses on desktop and mobile. Measure report completion and comprehension.
- Evaluate homeowner comprehension of the delivered financial workbench, including debt, sale fees, cash requirements and the exclusions from scenario comparisons. [Implementation and limits](homeowner-workbench.md).
- Investigate authorized live listing sources and expose freshness indicators before making live-market claims.
- Seek independent valuation and usability evaluation that includes homeowner interpretation of estimates.

**Not supported yet:** nationwide address search, live MLS parity, renovation ROI forecasts, six-month home-price forecasts, professional endorsement or independently verified customer adoption.

## Homeowner workbench

All public studios now connect their current evidence to ownership inputs, six deterministic financial scenarios, contextual decision explanations and local Property Evidence Passports. `/home` lists saved device profiles. Version comparison extends the existing Decision Time Machine; on-demand monitoring distinguishes record changes from hypothetical financial edits. Source collection timestamps alone do not produce a property alert. The fictional sample offers explicit illustrative financial inputs; supported real properties never silently receive example mortgage, insurance, rent or tax values.

See [production readiness](production-readiness.md) and [valuation methodology](valuation-validation.md) for current release and accuracy gates.
