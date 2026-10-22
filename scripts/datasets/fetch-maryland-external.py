"""Fetch the owner-free SDAT/MDP snapshot for the pre-registered external Maryland test.

Usage: python -I scripts/datasets/fetch-maryland-external.py
Counties: Anne Arundel, Baltimore County, Frederick and Howard. Same public-domain dataset (ed4q-f8tm),
fields, helpers and record rules as fetch-maryland.py, which this imports unchanged; only the county list
and a statewide coordinate check differ. Ascent serves no properties here, so only the sales, a
parcel-to-county map and provenance are written, all to evidence/datasets/.
"""
import collections
import datetime
import importlib.util
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve()
_spec = importlib.util.spec_from_file_location('fetch_maryland', HERE.with_name('fetch-maryland.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
FIELDS, query, write_csv = base.FIELDS, base.query, base.write_csv

COUNTIES = {'ANNE': 'Anne Arundel', 'BACO': 'Baltimore County', 'FRED': 'Frederick', 'HOWA': 'Howard'}
# Maryland's extent with a small margin. The base script's box covers only Montgomery and Prince George's.
LAT, LNG = (37.85, 39.76), (-79.52, -75.02)


def main():
    fetched = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    codes = ','.join(f"'{code}'" for code in COUNTIES)
    where = f"{FIELDS['county']} in ({codes})"
    counts = query({'$select': f"{FIELDS['use']} as use,{FIELDS['units']} as units,count(*) as n",
                    '$where': where, '$group': f"{FIELDS['use']},{FIELDS['units']}"})
    qualified = where + f" AND {FIELDS['use']} in ('Residential (R)','Town House (TH)') AND {FIELDS['units']}=1"
    expected = int(query({'$select': 'count(*) as n', '$where': qualified})[0]['n'])
    properties, sales, seen = {}, [], set()
    removed_properties, removed_sales = collections.Counter(), collections.Counter()
    offset = 0
    while offset < expected:
        batch = query({'$select': ','.join(f'{field} as {alias}' for alias, field in FIELDS.items()),
                       '$where': qualified, '$order': FIELDS['parcel'], '$limit': 10000, '$offset': offset})
        if not batch:
            raise RuntimeError(f'Incomplete snapshot: {offset}/{expected}')
        offset += len(batch)
        print(f'Properties fetched {offset}/{expected}', flush=True)
        for row in batch:
            parcel = row['parcel']
            grade_match = re.search(r'\(([1-9])\)$', row.get('grade', ''))
            sqft = int(float(row.get('sqft') or 0))
            lat, lng = float(row.get('lat') or 0), float(row.get('lng') or 0)
            built = int(row.get('built', '0')) if row.get('built', '').isdigit() else 0
            address, zip_code = row.get('address', '').strip(), row.get('zip', '')[:5]
            reason = ('duplicateParcel' if parcel in seen else
                      'missingAddress' if not address or not re.match(r'\d', address) else
                      'missingZip' if not re.fullmatch(r'\d{5}', zip_code) else
                      'invalidLocation' if not (LAT[0] < lat < LAT[1] and LNG[0] < lng < LNG[1]) else
                      'missingGrade' if not grade_match else
                      'smallOrMissingStructure' if sqft < 300 else None)
            seen.add(parcel)
            if reason:
                removed_properties[reason] += 1
                continue
            grade = int(grade_match[1])
            properties[parcel] = row['county']
            for segment in (1, 2, 3):
                day = row.get(f'date{segment}', '').replace('.', '-')
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or day < base.SINCE:
                    removed_sales['missingDateOrBefore2020'] += 1
                    continue
                try:
                    datetime.date.fromisoformat(day)
                except ValueError:
                    removed_sales['invalidDate'] += 1
                    continue
                price = float(row.get(f'price{segment}') or 0)
                if row.get(f'convey{segment}') != 'Private arms-length transfer, Improved (1)':
                    removed_sales['notPrivateArmsLengthImproved'] += 1
                elif price <= 0:
                    removed_sales['nonpositiveConsideration'] += 1
                elif built >= int(day[:4]):
                    removed_sales['characteristicsMayPostdateSale'] += 1
                elif day >= fetched[:10]:
                    removed_sales['sameDayOrFuture'] += 1
                else:
                    # Rooms are unavailable. Zero is an INTERNAL arithmetic sentinel, never an observed count.
                    sales.append([f'md-{parcel}-{day}', parcel, day, round(price), 0, 0, sqft, grade,
                                  f'{lat:.6f}', f'{lng:.6f}', zip_code])
    end_count = int(query({'$select': 'count(*) as n', '$where': qualified})[0]['n'])
    if offset != expected or end_count != expected:
        raise RuntimeError('Source row count changed during snapshot; rerun rather than publish partial data.')
    # Remove ALL conflicting duplicate recordings, not whichever price happens to sort first.
    grouped = collections.defaultdict(list)
    for sale in sales:
        grouped[sale[0]].append(sale)
    out = []
    for group in grouped.values():
        if len({tuple(sale) for sale in group}) > 1:
            removed_sales['conflictingDuplicateRecording'] += len(group)
        else:
            out.append(group[0])
            removed_sales['duplicateRecording'] += len(group) - 1
    sales = sorted(out, key=lambda sale: (sale[2], sale[0]))
    months = collections.defaultdict(collections.Counter)
    for sale in sales:
        months[properties[sale[1]]][sale[2][:7]] += 1
    parcels = sorted({sale[1] for sale in sales})
    evidence = HERE.parents[2] / 'evidence/datasets'
    sales_sha = write_csv(evidence / 'maryland-external-sales.csv.gz',
        ['sale_id', 'parcel_id', 'sold_on', 'price', 'beds', 'baths', 'sqft', 'condition', 'lat', 'lng', 'zip'], sales)
    counties_sha = write_csv(evidence / 'maryland-external-parcel-counties.csv.gz',
        ['parcel_id', 'county'], [[parcel, properties[parcel]] for parcel in parcels])
    provenance = {
        'datasetId': 'maryland-anne-arundel-baltimore-frederick-howard', 'fetchedAt': fetched,
        'publisher': 'Maryland SDAT and Maryland Department of Planning', 'license': 'Public Domain',
        'source': 'https://opendata.maryland.gov/d/ed4q-f8tm',
        'metadata': 'https://opendata.maryland.gov/api/views/ed4q-f8tm.json',
        'attribution': 'Maryland SDAT/MDP public-domain real property assessments (ed4q-f8tm), filtered and transformed by Ascent.',
        'fieldsRequested': FIELDS, 'countyCodes': COUNTIES,
        'locationBounds': {'latitude': LAT, 'longitude': LNG},
        'sourceRows': sum(int(row['n']) for row in counts), 'sourceUseAndUnitsCounts': counts,
        'singleUnitResidentialRows': expected, 'properties': len(properties), 'rows': len(sales),
        'parcelsWithSales': len(parcels),
        'removedProperties': dict(removed_properties), 'removedSales': dict(removed_sales),
        'csvSha256': sales_sha, 'parcelCountiesCsvSha256': counties_sha,
        'fingerprintBasis': 'SHA-256 of decompressed CSV bytes',
        'firstSale': sales[0][2], 'lastSale': sales[-1][2],
        'monthlySalesByCounty': {code: dict(sorted(counter.items())) for code, counter in sorted(months.items())},
        'gradeScale': 'SDAT dwelling QUALITY grade: Low (1), Economy (2), Below Average (3), Average (4), Above Average (5), Good (6), Very Good (7), Excellent (8), Superior (9). Not condition or inspection.',
        'missingFeatures': ['bedrooms', 'bathrooms'],
        'internalEncoding': 'beds=baths=0 are neutral arithmetic sentinels for unavailable counts, not observed zero rooms. Both rates are fixed to zero. condition carries the ordered quality grade, not interior condition.',
        'limitations': [
            'Only the latest three transfers retained per current parcel; older transaction history is incomplete and survivorship biased.',
            'Current assessor characteristics, not historical sale-time characteristics; build-year screening cannot remove unrecorded renovations.',
            'Structure area is the state SQFTSTRC field; not a verified MLS living-area measurement.',
            'No listing history, concessions, bedrooms, bathrooms, interior condition, owner names or mailing addresses.',
            'Snapshot is static; recording and upstream updates lag closing. These counties are not all of Maryland.',
        ],
    }
    (evidence / 'maryland-external.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: provenance[key] for key in ['properties', 'rows', 'csvSha256', 'parcelCountiesCsvSha256']}, indent=2))


if __name__ == '__main__':
    main()
