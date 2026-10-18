# DC condominium pricing

`/dc/condos` is a separate account-free studio for residential condo units. It searches by building address and unit number, uses **condo sales only**, and preserves the unit's parcel identity through the report and JSON export. `/dc` continues to use the unchanged single-family snapshots and published house validation.

**Condo accuracy has not been measured.** The house holdout does not validate condos. The UI, report, source attribution and JSON all say so, and no calibrated interval is shown. A condo marker on frozen valuation inputs prevents the release safeguards from automatically applying the DC house benchmark, even if someone supplies the house adjustment rates.

## Public data

District open data, licensed under CC BY 4.0:

- [Condominium CAMA, layer 24](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/24): unit SSL, recorded bedrooms, full/half baths, living area, years built/remodeled and residential use codes 16/17.
- [Condo Relate, layer 52](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/52): unit SSL, unit label and Master Address Repository ID only. Owner and mailing-address fields are never requested.
- [Address Points](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Location_WebMercator/FeatureServer/0): active building addresses marked `HAS_CONDO=Y`, coordinates, ZIP and MAR ID. Coordinates identify the building address, not the unit floor.
- [Tax System Property Sales](https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/57): qualified positive recorded transfers since January 2022; never asking prices or assessments.

Each layer's `iteminfo?f=json` provides the licensing evidence, linked in the bundled provenance. Attribution is carried into the source record, studio and exports.

The snapshot contains **51,340 searchable units** and **8,470 qualified transfers**, recorded through 2026-10-07. Snapshot started 2026-10-18T08:21:21Z.

Only one CAMA row and one unambiguous unit/building address per SSL are admitted. Studios with zero recorded bedrooms are retained; missing bathrooms and living area below 200 square feet are excluded. Co-ops, commercial and combined-unit use codes, ambiguous addresses and unmatched units are excluded. Sales in or before the recorded build/remodel year are excluded. Same-day equal-price qualified transfers are conservatively withheld as potentially shared deed prices; this can also remove unrelated closings. Every removal count is published.

The importer is `scripts/datasets/fetch-dc-condos.py`. Compressed snapshots and provenance live in `src/datasets/dc-condos/`. Both CSV fingerprints and row counts are checked at runtime. The house files and their validation fingerprint are not changed.

## Model and limits

The engine uses general **untuned** assumptions for size, room counts, distance and recency. **Condominium CAMA has no condition field.** It remains missing and its adjustment is fixed to zero. Condition controls are hidden; request validation rejects an attempt to enable the adjustment. An added practice record also retains unknown condition.

Sales are gathered within 3 miles and the previous 365 days, with the unit's own sales excluded. The default engine filters then apply 3 miles, 180 days and a 1.35 size ratio. These are disclosed starting assumptions, not condo-calibrated choices. Filter edits, exclusions, labeled practice entries, seller-cost scenarios and server-rebuilt reports use the same studio as houses.

Unmodeled differences include floor, view, parking rights, HOA dues, reserves, special assessments, amenities and interior condition. Current assessor characteristics are not reconstructed as of each historical closing. Recording and source updates lag closings. This is neither an appraisal nor MLS data.

## Before calibrated condo ranges

Declare a condo-specific protocol and untouched chronological holdout, including studio and building-level strata, before scoring. Run the same acceptance criteria, publish every miss, evaluate shared-building dependence and fees/amenity omissions, and calibrate only a configuration and property cohort actually tested. No DC single-family result or pooled Maryland result substitutes for that work.

## Routes and checks

`GET /api/dc-condos/search?q=`, `/property?parcel=` and `/report?parcel=&state=[&format=json]` are public and use only bundled records. Search and scenario bounds match the house routes. Reports preserve the condo marker, unknown condition, source hashes and explicit `validation.measured=false`; a replay recomputes the archived arithmetic without borrowing an accuracy claim.

Tests cover unit identity, studio apartments, condo-only comparables, own/future-sale exclusion, missing condition, report replay, rejected condition adjustments, no inherited house interval, desktop/mobile search, reports and automated accessibility.
