"""Snapshot Montgomery and Prince George's County, Maryland detached single-family records from the State of
Maryland's public-domain real property data (SDAT and Maryland Department of Planning, opendata.maryland.gov).

Reproduce (the source is live, so a later run yields a newer snapshot with a different fingerprint):
  python3 -I scripts/datasets/fetch-md-records.py evidence/datasets src/datasets/md

Writes the validation sales CSV (same columns as DC's) to the first folder and the parcel file used for address
search to the second, each with a provenance file; the sales CSV is also copied beside the parcels.

Only listed columns are requested: grantor (seller) names, owner names and mailing addresses are never fetched.
Every rule below concerns record integrity and was decided before any valuation was run; no sale is removed for its
price. Bedrooms and bathrooms are not published in Maryland's open data, so both are written as 0 and the validation
protocol declares them unrecorded. The assessor's dwelling grade (1 Low to 9 Superior) is written in the condition
column; Maryland's dwelling condition code is blank for almost every home.
"""

import collections
import csv
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json'
LANDING = 'https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments-Hidden-Property/ed4q-f8tm'
SINCE = '2022-01-01'
# Socrata rejects anonymous default client strings; identify the snapshot honestly.
USER_AGENT = 'Ascent-public-records-snapshot/1.0 (+https://github.com/topherchris420/project-ascent)'
F = {
    'account': 'account_id_mdp_field_acctid',
    'county': 'county_name_mdp_field_cntyname',
    'address': 'mdp_street_address_mdp_field_address',
    'city': 'mdp_street_address_city_mdp_field_city',
    'zip': 'mdp_street_address_zip_code_mdp_field_zipcode',
    'lat': 'mdp_latitude_mdp_field_digycord_converted_to_wgs84',
    'lng': 'mdp_longitude_mdp_field_digxcord_converted_to_wgs84',
    'type': 'mdp_street_address_type_code_mdp_field_resityp',
    'units': 'c_a_m_a_system_data_number_of_dwelling_units_mdp_field_bldg_units_sdat_field_239',
    'sqft': 'c_a_m_a_system_data_structure_area_sq_ft_mdp_field_sqftstrc_sdat_field_241',
    'built': 'c_a_m_a_system_data_year_built_yyyy_mdp_field_yearblt_sdat_field_235',
    'grade': 'c_a_m_a_system_data_dwelling_grade_code_and_description_mdp_field_strugrad_strudesc_sdat_field_230',
    'date1': 'sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89',
    'price1': 'sales_segment_1_consideration_mdp_field_considr1_sdat_field_90',
    'code1': 'sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87',
    'date2': 'sales_segment_2_transfer_date_yyyy_mm_dd_sdat_field_109',
    'price2': 'sales_segment_2_consideration_sdat_field_110',
    'code2': 'sales_segment_2_how_conveyed_ind_sdat_field_107',
    'date3': 'sales_segment_3_transfer_date_yyyy_mm_dd_sdat_field_129',
    'price3': 'sales_segment_3_consideration_sdat_field_130',
    'code3': 'sales_segment_3_how_conveyed_ind_sdat_field_127',
}
WHERE = (
    f"{F['county']} in ('Montgomery', 'Prince George''s') AND land_use_code_mdp_field_lu_desclu_sdat_field_50 = "
    f"'Residential (R)' AND {F['type']} = 'SF'"
)


def fetch():
    rows, offset, page = [], 0, 50000
    while True:
        params = urllib.parse.urlencode({
            '$select': ','.join(F.values()), '$where': WHERE, '$order': F['account'], '$limit': page, '$offset': offset})
        for attempt in range(6):
            try:
                request = urllib.request.Request(f'{ENDPOINT}?{params}', headers={'User-Agent': USER_AGENT})
                with urllib.request.urlopen(request, timeout=300) as response:
                    batch = json.load(response)
                break
            except urllib.error.HTTPError as error:
                if error.code in (400, 401, 403, 404) or attempt == 5:
                    raise
                time.sleep(2 ** attempt)
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(2 ** attempt)
        rows.extend(batch)
        sys.stderr.write(f'\rMaryland parcels: {len(rows)}   ')
        if len(batch) < page:
            break
        offset += page
    sys.stderr.write('\n')
    return rows


def code(text):
    match = re.search(r'\((\d+)\)\s*$', text or '')
    return int(match.group(1)) if match else None


def number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def gzip_bytes(text):
    buffer = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as handle:
        handle.write(text)
    return buffer.getvalue()


evidence_dir, runtime_dir = sys.argv[1], sys.argv[2]
os.makedirs(runtime_dir, exist_ok=True)
fetched_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
source = fetch()

removed_parcels = collections.Counter()
parcels = {}
for row in source:
    account = (row.get(F['account']) or '').strip()
    grade, sqft, built = code(row.get(F['grade'])), number(row.get(F['sqft'])), number(row.get(F['built']))
    lat, lng = number(row.get(F['lat'])), number(row.get(F['lng']))
    if (row.get(F['units']) or '1') not in ('1', ''):
        removed_parcels['multiUnitBuilding'] += 1
    elif not grade or not sqft or sqft <= 0:
        removed_parcels['missingCharacteristics'] += 1
    elif lat is None or lng is None or not row.get(F['address']):
        removed_parcels['noAddressOrLocation'] += 1
    else:
        parcels[account] = {
            'parcel_id': account,
            'address': ' '.join((row.get(F['address']) or '').split()),
            'city': (row.get(F['city']) or '').strip(),
            'county': row.get(F['county']),
            'zip': (row.get(F['zip']) or '').strip()[:5],
            'lat': f'{lat:.6f}', 'lng': f'{lng:.6f}',
            'sqft': str(int(sqft)), 'grade': str(grade), 'year_built': str(int(built or 0)),
            'row': row,
        }

candidates = []
for account, parcel in parcels.items():
    row = parcel['row']
    for slot in ('1', '2', '3'):
        sold = (row.get(F[f'date{slot}']) or '').strip().replace('.', '-')
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', sold) and sold >= SINCE:
            candidates.append((sold, account, number(row.get(F[f'price{slot}'])), code(row.get(F[f'code{slot}']))))
bundles = collections.Counter((sold, price) for sold, _, price, conveyed in candidates if price and conveyed == 1)

removed_sales = collections.Counter()
seen = set()
out = []
for sold, account, price, conveyed in sorted(candidates):
    parcel = parcels[account]
    if conveyed != 1:
        removed_sales['notArmsLengthImproved'] += 1
    elif not price or price <= 0:
        removed_sales['noConsideration'] += 1
    elif bundles[(sold, price)] > 1:
        removed_sales['multiParcelTransfer'] += 1
    elif (account, sold) in seen:
        removed_sales['duplicateRecording'] += 1
    elif int(parcel['year_built']) >= int(sold[:4]):
        # Characteristics describe the home now; a build in or after the sale year may postdate the sale.
        removed_sales['characteristicsMayPostdateSale'] += 1
    else:
        seen.add((account, sold))
        out.append(','.join([f'md-{account}-{sold}', account, sold, str(int(round(price))), '0', '0', parcel['sqft'],
                             parcel['grade'], parcel['lat'], parcel['lng'], parcel['zip']]))

sales_text = ('sale_id,parcel_id,sold_on,price,beds,baths,sqft,condition,lat,lng,zip\n' + '\n'.join(out) + '\n').encode('utf-8')
parcel_buffer = io.StringIO()
writer = csv.writer(parcel_buffer, lineterminator='\n')
writer.writerow(['parcel_id', 'address', 'city', 'county', 'zip', 'lat', 'lng', 'sqft', 'grade', 'year_built'])
for account in sorted(parcels):
    p = parcels[account]
    writer.writerow([p[key] for key in ('parcel_id', 'address', 'city', 'county', 'zip', 'lat', 'lng', 'sqft', 'grade', 'year_built')])
parcel_text = parcel_buffer.getvalue().encode('utf-8')

attribution = 'Contains State of Maryland data (SDAT and Maryland Department of Planning) published as Public Domain on opendata.maryland.gov.'
common = {
    'publisher': 'State of Maryland: State Department of Assessments and Taxation (SDAT) and Maryland Department of Planning (MDP)',
    'license': 'Public Domain',
    'licenseEvidence': 'opendata.maryland.gov dataset ed4q-f8tm metadata: license "Public Domain" (licenseId PUBLIC_DOMAIN); attribution field "SDAT (State Department of Assessments and Taxation) and MDP (Maryland Department of Planning)".',
    'attribution': attribution,
    'source': LANDING,
    'endpoint': ENDPOINT,
    'fetchedAt': fetched_at,
    'scope': "Montgomery and Prince George's counties; land use Residential (R); MDP residence type SF (detached single-family); one dwelling unit",
    'sourceRows': len(source),
    'conditionScale': 'SDAT dwelling grade (1 Low, 2 Economy, 3 Below Average, 4 Average, 5 Above Average, 6 Good, 7 Very Good, 8 Excellent, 9 Superior), written in the condition column. The SDAT dwelling condition code is blank for almost every home.',
    'unrecorded': 'Bedrooms and bathrooms are not published; written as 0 and declared unrecorded in the validation protocol.',
}
sales_provenance = {
    'datasetId': 'md-residential-sales',
    'title': "Montgomery and Prince George's County, MD recorded detached single-family sales with SDAT characteristics",
    **common,
    'salesSince': SINCE,
    'rows': len(out),
    'firstSale': out[0].split(',')[2] if out else None,
    'lastSale': out[-1].split(',')[2] if out else None,
    'historyDepth': 'SDAT publishes the last three transfers per account; sales are taken from all three segments.',
    'removedParcels': dict(sorted(removed_parcels.items())),
    'removedBeforeValidation': dict(sorted(removed_sales.items())),
    'csvSha256': hashlib.sha256(sales_text).hexdigest(),
    'fingerprintBasis': 'SHA-256 of the decompressed CSV bytes.',
    'derivation': 'scripts/datasets/fetch-md-records.py; price = consideration; sqft = SDAT structure area; arm\'s-length = how-conveyed code 1 (private arm\'s-length, improved).',
    'limitations': [
        'Characteristics are current, not as of each sale; sales in or before the year built are removed, but renovations are not recorded.',
        'Concessions are not recorded. Code 1 is SDAT\'s arm\'s-length determination.',
        'Only the last three transfers per account are published, so older history is incomplete for frequently sold homes.',
        'Townhouses, condominiums and multi-unit buildings are out of scope.',
        'Recordation lags settlement, so the most recent weeks are incomplete.',
    ],
}
parcel_provenance = {
    'datasetId': 'md-residential-properties',
    'title': "Montgomery and Prince George's County, MD detached single-family parcels with addresses and SDAT characteristics",
    **common,
    'rows': len(parcels),
    'removed': dict(sorted(removed_parcels.items())),
    'csvSha256': hashlib.sha256(parcel_text).hexdigest(),
    'fingerprintBasis': 'SHA-256 of the decompressed CSV bytes.',
}
sales_path = os.path.join(evidence_dir, 'md-residential-sales.csv.gz')
open(sales_path, 'wb').write(gzip_bytes(sales_text))
open(os.path.join(evidence_dir, 'md-residential-sales.provenance.json'), 'w').write(json.dumps(sales_provenance, indent=2) + '\n')
shutil.copyfile(sales_path, os.path.join(runtime_dir, 'md-residential-sales.csv.gz'))
shutil.copyfile(os.path.join(evidence_dir, 'md-residential-sales.provenance.json'), os.path.join(runtime_dir, 'md-residential-sales.provenance.json'))
open(os.path.join(runtime_dir, 'md-residential-properties.csv.gz'), 'wb').write(gzip_bytes(parcel_text))
open(os.path.join(runtime_dir, 'md-residential-properties.provenance.json'), 'w').write(json.dumps(parcel_provenance, indent=2) + '\n')
print(json.dumps({
    'sales': {key: sales_provenance[key] for key in ('rows', 'firstSale', 'lastSale', 'removedBeforeValidation', 'csvSha256')},
    'parcels': {key: parcel_provenance[key] for key in ('rows', 'removed', 'csvSha256')},
    'sourceRows': len(source),
}, indent=2))
