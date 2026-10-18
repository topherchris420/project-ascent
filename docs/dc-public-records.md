# Pricing real DC homes from public records

`/dc` prices any single-family home in Washington, DC from District of Columbia open data (CC BY 4.0), with no account, MLS feed, live lookup or model request. It uses the same Pricing Studio as the fictional sample: range chart, comparable inspector, input sensitivity, seller plan, exclusions with reasons, practice entries, the arithmetic bridge and a report.

## Data

| File (in `src/datasets/dc/`) | Contents | Source |
| --- | --- | --- |
| `dc-residential-sales.csv.gz` | 10,174 assessor-qualified single-family recorded sales, Jan 2022 – Oct 2026 | Byte-identical copy of the snapshot the DC valuation validation scored; a unit test checks the SHA-256 against both the evidence copy and the published benchmark |
| `dc-residential-properties.csv.gz` | 92,142 single-family parcels with active street addresses, beds, baths, gross building area, assessor condition grade and years built/remodeled | CAMA Residential joined to active Address Points, same single-family rules as the sales file |

Both have provenance files with fetch time, source URLs, row counts, removals by rule and SHA-256. Owner names and mailing addresses are never requested. Attribution: *Contains District of Columbia open data licensed under CC BY 4.0. Joined and filtered by Ascent.* It appears in the studio, the source record, every report and the JSON export.

## How a home is priced

1. Search matches every typed word against active District addresses (common street abbreviations are expanded).
2. The server builds the subject from the parcel record and gathers recorded sales within 2 miles and 365 days before the sales snapshot, excluding the home's own sales. The wider candidate set lets "widen a filter" tests work.
3. The studio starts with the **DC-validated settings** (0.5 miles, 90 days, the fitted adjustment rates and trend). While the analysis is exactly that configuration, with nothing excluded, added or re-rated, it shows the published calibrated 80% range for the home's evidence tier and how often that tier's range held in the holdout. Any edit removes the calibrated range and says why.
4. Reports and JSON exports are rebuilt on the server from the parcel ID; the browser only supplies bounded scenario choices and labeled practice entries.

In a spread sample of 231 parcels, 222 could be priced with the validated settings; the rest had no qualifying sale within 0.5 miles and 90 days, and the studio says so.

## Limits

- Not MLS data: no listing history, active competition, days on market, concessions or photos.
- The assessor's condition grade is not an inspection, and the validated settings weigh it heavily (about $88,000 per grade point); the input-sensitivity chart shows this for every home.
- Assessor characteristics are current, not as of each sale. Recent sales take weeks to be recorded.
- This validated house model excludes condominiums, multi-unit buildings and multi-building lots. [DC condos](dc-condominiums.md) now have a separate unvalidated studio at `/dc/condos`; no house calibration is reused. [Maryland](maryland-public-records.md) has a separate reduced model for Montgomery and Prince George’s. Virginia awaits permission.
- The snapshot is static. Refresh it deliberately (below); a refreshed sales file changes the validated fingerprint and requires re-running the validation before the calibrated range can be shown.

## Refresh

```bash
python3 -I scripts/datasets/fetch-dc-properties.py src/datasets/dc/dc-residential-properties.csv.gz src/datasets/dc/dc-residential-properties.provenance.json
```

Only refresh the sales file together with a new validation run (`npm run validate:valuation -- --market dc`) and its review; otherwise the published accuracy would describe different data.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/dc/search?q=` | Up to eight matching addresses (100-character limit) |
| `GET /api/dc/property?parcel=` | Subject, nearby recorded sales, source, validated assumptions and snapshot dates |
| `GET /api/dc/report?parcel=&state=[&format=json]` | Server-rebuilt HTML report or replayable JSON decision |

All three are public, read only bundled files and set no cookies.
