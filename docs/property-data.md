# Property data beyond the valuation inputs

October 22, 2026. The Home Decision Brief now shows what public records say about a home's structure, systems, renovations and building, and how current the sales snapshot is. **None of it changes an estimate.** These facts live in `StudioEvidence.facts`, never in the subject or comparable records the engine reads. The engine fingerprint (`fnv1a32-49f0c98b`), the validated sales files and every calculation hash are unchanged. A unit test computes the same calculation with and without the facts and requires identical hashes.

Using any of these facts in the model, for example adjusting for recent permits or the effective year built, would change the engine. That needs its own registered study and an untouched holdout first; none has been run.

## What was added

| Market | Recorded facts | Permits | Other |
| --- | --- | --- | --- |
| DC houses (92,142) | Structure type (92,135 homes), style, construction grade, effective year built (92,139), heating, central air, kitchens, fireplaces, exterior, roof, interior floors, lot size | 242,193 District permits since 2016. 63,837 houses have at least one, 31,737 have major work, and 20,908 have major work issued after the last recorded remodel, or after the build year when none is recorded | Each comparable sale shows its structure beside this home's |
| DC condos (51,340 units) | Condominium name (51,243 units in 3,035 condominiums), its residential and other units, rooms, effective year built, heating, central air, fireplaces | 22,040 permits on units and on 3,461 condominium record lots. 9,229 units have their own permits; 28,092 are in a building with permits | Floor inferred from the unit number for 33,511 units (287 penthouse labels), always marked as an inference. Each comparable shows whether it is in the same condominium |
| Montgomery County (242,162) | Dwelling type (462,345 Maryland homes), exterior construction, lot size (462,046), month the assessor last reviewed the record (462,229) | 65,618 county residential permits since 2016, matched to 50,000 homes. 40,732 have major work; 5,266 have major work not closed out | Final approval dates, declared costs |
| Prince George's County (220,185) | Same state facts as Montgomery | None. The county publishes permits without a stated open license | The brief says why no permits appear |

"Major work" means renovation or repair, additions, new construction and demolition. Electrical, plumbing and mechanical permits, exterior and site work (decks, fences, sheds, pools), minor postcard permits and Montgomery's final-approval-only applications are listed with their records but never counted as major. A record still in review or awaiting issuance is listed with its recorded status and never counted as work on the home.

## Sources and licenses

| Source | License | Fields requested |
| --- | --- | --- |
| District CAMA Residential (layer 25), Condominium CAMA (layer 24), Condo Relate (layer 52) | CC BY 4.0; evidence in each layer's `iteminfo?f=json` | Characteristics listed above; unit, regime, regime name and record lot from Condo Relate |
| District Department of Buildings permits, 2016–2026 (`FEEDS/DCRA`, one layer per year) | CC BY 4.0 | Permit number, issue date, type, subtype, status, lot |
| Maryland SDAT/MDP Real Property Assessments, hidden owner names (`ed4q-f8tm`) | Public Domain in its published metadata | Dwelling type, construction, land area and unit, last inspection month, and the condition field, kept only to count blanks |
| Montgomery County DPS Residential Permit (`m88u-pqki`) | Public Domain in its published metadata | Permit number, status, address parts, issue and final dates, declared value, work type, use |

Owner names, permit applicants, contractors, descriptions of work, fees and mailing addresses are never requested. The Maryland importer checks both licenses before it fetches anything and stops if either is no longer Public Domain. Each snapshot has a provenance file with its fetch time, source URLs, row counts, removals by rule and SHA-256 fingerprints. Runtime loading checks the fingerprints and row counts, as it does for the sales files.

| File | Rows | Provenance |
| --- | --- | --- |
| `src/datasets/dc/dc-residential-facts.csv.gz`, `dc-house-permits.csv.gz` | 92,142 · 242,193 | `dc-residential-facts.provenance.json` |
| `src/datasets/dc-condos/dc-condo-facts.csv.gz`, `dc-condo-permits.csv.gz` | 51,340 · 22,040 | `dc-condo-facts.provenance.json` |
| `src/datasets/maryland/maryland-facts.csv.gz`, `montgomery-permits.csv.gz` | 462,347 · 65,618 | `maryland-facts.provenance.json` |

The District importer filters one permit stream for houses and condominiums, so both provenance files carry the same removal counts: 232,357 permits on lots outside the snapshots, 1,089 of other kinds (signs, elevators, tenant layouts, shoring and the like) and 919 canceled, withdrawn or revoked. In Montgomery, 71,392 permits were fetched; 5,409 matched no covered home, 361 had an unreadable address and 4 matched more than one home.

The District importer also measured how far the live assessor record has moved since the October 17 parcel snapshot. 194 covered houses now differ in a characteristic the valuation reads: 114 remodel years, 74 living areas, 49 condition grades, 47 bath counts and 20 bedroom counts. The valuation keeps using the snapshot; the counts are published in the provenance file.

## How the brief uses them

1. **What the public records show** (question 4, before the missing facts). It lists the recorded facts, the eight most recent permits with their kind, status and dates, and what the permit statuses mean in that source. The condition grade in that list says it is used in the estimate; nothing else is.
2. **What the records do not show.** The condition item names the newest major permit issued after the last recorded remodel year, so the homeowner knows the recorded grade may predate the work. In Montgomery, major work that was never closed out gets its own item and a next step to check the county record. For condos, the floor drops out of the missing list when it can be inferred, and the inference's caveat is shown.
3. **Comparable sales.** Each leading sale lists recorded differences: its structure against this home's, the same or a different condominium, and major permitted work in the three years before it sold, which may mean it sold in better condition than its records show. The notes never adjust a price.
4. **Reliability.** The answer reports how many newer qualifying sales the live source held when last checked. The page shows the newest recorded sale's age on the day it is viewed.

The facts are part of the brief's checksum and of the Evidence Passport's brief record. The readable report prints them. Saved passports keep the home's own facts but drop the per-comparable notes, which the studio recomputes. The facts add 1–3% to a typical saved version, and about 9% for a unit in the condominium with the most permits; the nearby sales a version already carries take most of the device storage.

### Rules

| Signal | Rule |
| --- | --- |
| Work since the record | A major permit issued in a year after the last recorded remodel year, or the build year when no remodel is recorded. Maryland's state records carry no remodel year, so the comparison is with the build year and the text says so |
| Not closed out | Montgomery only. Major work with no final approval date that is expired, under a stop-work order, or issued more than 730 days before the data date. A stop-work record that also carries a final approval is not flagged; its text mentions both |
| District close-out | Never flagged. Of the District's major permits on covered houses, 22% are recorded as completed, 45% still as issued and 33% as expired, because the records often leave finished work open when no final inspection was recorded. Status alone does not show whether work was done, and the brief says so |
| Work before a comparable's sale | The most recent major permit issued in the three years before the sale date |
| Condo floor | Three- or four-digit unit numbers of 100 or more give the floor in their leading digits (616 → 6, 1203 → 12); `PH` units are penthouses; anything else stays unknown. Always shown as an inference, with a note that building numbering can differ |

## Freshness

Policy `ascent-data-freshness-1` (`src/lib/data-freshness.ts`). The newest recorded sale is **current** up to 45 days old, because recording lags closing by weeks, **aging** to 120 days, and **out of date** beyond that: 120 days is the release gate's own recency limit. The age is computed in the browser when the page is viewed, so it never enters a checksummed brief.

`scripts/datasets/probe-freshness.py` asks the live sources how many qualifying sales of covered homes are dated after each snapshot's newest sale. It requests parcel identifiers and dates only, never prices, so nothing about a later sale can reach an estimate. Late recordings dated before the snapshot's newest sale are not counted, so the counts are a floor. The October 22 probe found:

| Market | Snapshot's newest sale | Newer qualifying sales |
| --- | --- | --- |
| DC houses | 2026-10-07 | 31 |
| DC condos | 2026-10-07 | 7 |
| Montgomery and Prince George's | 2026-09-24 | 0; the state source was last updated 2026-10-06 |

These counts measure the gap; they do not close it. No authorized live sales or listing feed is configured. Folding newer sales into the snapshots would change the validated fingerprints, so it needs a new registered protocol before any accuracy claim (see Refresh).

## What is still missing

- **Interior condition.** No public source records it. Maryland's condition field is blank for 464,075 of 464,125 returned records, so condition stays unavailable there. District condition is the assessor's grade, not an inspection.
- **Condominium finances and features.** HOA dues, reserves, special assessments, view, deeded parking and amenities are not in these records. The resale package remains the source.
- **Prince George's permits.** Not used until the county states an open license.
- **Older and unpermitted work.** Permits before 2016 are not loaded, and unpermitted work never appears in any source.
- **Address-matching misses.** Montgomery permits filed under a different address form are missed, and addresses shared by more than one covered home are skipped.
- **Fresher sales.** Measured above, not supplied.

## Refresh

Facts, permits and the freshness probe never reach the engine, so they can be refreshed without re-running the validation:

```bash
python3 -I scripts/datasets/fetch-dc-facts.py
python3 -I scripts/datasets/fetch-maryland-facts.py
python3 -I scripts/datasets/probe-freshness.py
npm test
```

The sources are live, so each run produces new fingerprints and provenance; commit the data and provenance files together. The facts importers read the parcel and sales snapshots only to decide which homes are covered, and never change them. Refreshing a **sales** snapshot is different: it changes the validated fingerprint and needs a new registered protocol and holdout, as described in [DC public records](dc-public-records.md#refresh) and [Maryland public records](maryland-public-records.md#reproduction-and-routes).

## Checks

`tests/property-facts.test.ts` covers permit classification and statuses, floor inference, renovation and close-out signals, comparable notes, provenance row counts, identical calculation hashes with and without facts, each market's brief, passport storage and the report, and the freshness policy's boundaries. `tests/e2e/property-facts.spec.ts` opens a DC house, a DC condo, a Montgomery home and a Prince George's home at phone width and checks the recorded facts, the missing facts, the freshness line, sale notes and automated accessibility.
