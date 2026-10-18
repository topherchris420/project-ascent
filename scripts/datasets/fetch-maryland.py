"""Fetch a minimal, owner-free SDAT/MDP snapshot for Montgomery and Prince George's.

Usage: python -I scripts/datasets/fetch-maryland.py
Only public-domain dataset ed4q-f8tm is used. No county website is scraped.
Rules are fixed before valuation; every rejected property/sale is counted.
"""
import collections
import csv
import datetime
import gzip
import hashlib
import io
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
API = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json'
SINCE = '2020-01-01'
FIELDS = {
    'parcel': 'account_id_mdp_field_acctid',
    'county': 'jurisdiction_code_mdp_field_jurscode',
    'address': 'mdp_street_address_mdp_field_address',
    'city': 'mdp_street_address_city_mdp_field_city',
    'zip': 'mdp_street_address_zip_code_mdp_field_zipcode',
    'lat': 'mdp_latitude_mdp_field_digycord_converted_to_wgs84',
    'lng': 'mdp_longitude_mdp_field_digxcord_converted_to_wgs84',
    'use': 'land_use_code_mdp_field_lu_desclu_sdat_field_50',
    'units': 'c_a_m_a_system_data_number_of_dwelling_units_mdp_field_bldg_units_sdat_field_239',
    'grade': 'c_a_m_a_system_data_dwelling_grade_code_and_description_mdp_field_strugrad_strudesc_sdat_field_230',
    'built': 'c_a_m_a_system_data_year_built_yyyy_mdp_field_yearblt_sdat_field_235',
    'sqft': 'c_a_m_a_system_data_structure_area_sq_ft_mdp_field_sqftstrc_sdat_field_241',
}
for segment, offset in [(1, 0), (2, 20), (3, 40)]:
    FIELDS[f'date{segment}'] = ('sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89'
                              if segment == 1 else f'sales_segment_{segment}_transfer_date_yyyy_mm_dd_sdat_field_{89 + offset}')
    FIELDS[f'price{segment}'] = ('sales_segment_1_consideration_mdp_field_considr1_sdat_field_90'
                               if segment == 1 else f'sales_segment_{segment}_consideration_sdat_field_{90 + offset}')
    FIELDS[f'convey{segment}'] = ('sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87'
                                if segment == 1 else f'sales_segment_{segment}_how_conveyed_ind_sdat_field_{87 + offset}')


def query(params):
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Ascent public-record research/1.0', 'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)


def write_csv(path, header, rows):
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
    text = buffer.getvalue().encode('utf-8')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as target:
        with gzip.GzipFile(filename='', mode='wb', fileobj=target, mtime=0, compresslevel=9) as handle:
            handle.write(text)
    return hashlib.sha256(text).hexdigest()


def main():
    fetched = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    where = f"{FIELDS['county']} in ('MONT','PRIN')"
    counts = query({'$select': f"{FIELDS['use']} as use,{FIELDS['units']} as units,count(*) as n",
                    '$where': where, '$group': f"{FIELDS['use']},{FIELDS['units']}"})
    qualified = where + f" AND {FIELDS['use']} in ('Residential (R)','Town House (TH)') AND {FIELDS['units']}=1"
    expected = int(query({'$select': 'count(*) as n', '$where': qualified})[0]['n'])
    properties, sales, seen = [], [], set()
    removed_properties, removed_sales = collections.Counter(), collections.Counter()
    months = collections.Counter()
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
                      'invalidLocation' if not (38.5 < lat < 39.8 and -77.6 < lng < -76.6) else
                      'missingGrade' if not grade_match else
                      'smallOrMissingStructure' if sqft < 300 else None)
            seen.add(parcel)
            if reason:
                removed_properties[reason] += 1
                continue
            grade = int(grade_match[1])
            properties.append([parcel, address, row.get('city', ''), row['county'], zip_code,
                               f'{lat:.6f}', f'{lng:.6f}', sqft, grade, built])
            for segment in (1, 2, 3):
                day = row.get(f'date{segment}', '').replace('.', '-')
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or day < SINCE:
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
    properties.sort(key=lambda row: row[0])
    for sale in sales:
        months[sale[2][:7]] += 1
    directory = ROOT / 'src/datasets/maryland'
    properties_sha = write_csv(directory / 'maryland-properties.csv.gz',
        ['parcel_id', 'address', 'city', 'county', 'zip', 'lat', 'lng', 'sqft', 'grade', 'year_built'], properties)
    sales_sha = write_csv(directory / 'maryland-sales.csv.gz',
        ['sale_id', 'parcel_id', 'sold_on', 'price', 'beds', 'baths', 'sqft', 'condition', 'lat', 'lng', 'zip'], sales)
    provenance = {
        'datasetId': 'maryland-montgomery-prince-georges', 'fetchedAt': fetched,
        'publisher': 'Maryland SDAT and Maryland Department of Planning', 'license': 'Public Domain',
        'source': 'https://opendata.maryland.gov/d/ed4q-f8tm',
        'metadata': 'https://opendata.maryland.gov/api/views/ed4q-f8tm.json',
        'attribution': 'Maryland SDAT/MDP public-domain real property assessments (ed4q-f8tm), filtered and transformed by Ascent.',
        'fieldsRequested': FIELDS, 'countyCodes': {'MONT': 'Montgomery', 'PRIN': "Prince George\'s"},
        'sourceRows': sum(int(row['n']) for row in counts), 'sourceUseAndUnitsCounts': counts,
        'singleUnitResidentialRows': expected, 'properties': len(properties), 'rows': len(sales),
        'removedProperties': dict(removed_properties), 'removedSales': dict(removed_sales),
        'propertyCsvSha256': properties_sha, 'csvSha256': sales_sha,
        'fingerprintBasis': 'SHA-256 of decompressed CSV bytes',
        'firstSale': sales[0][2], 'lastSale': sales[-1][2], 'monthlySales': dict(sorted(months.items())),
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
    (directory / 'maryland.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    evidence = ROOT / 'evidence/datasets'
    (evidence / 'maryland-sales.csv.gz').write_bytes((directory / 'maryland-sales.csv.gz').read_bytes())
    (evidence / 'maryland.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: provenance[key] for key in ['properties', 'rows', 'csvSha256', 'monthlySales']}, indent=2))


if __name__ == '__main__':
    main()
