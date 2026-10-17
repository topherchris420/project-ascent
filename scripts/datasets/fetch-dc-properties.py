"""Snapshot District of Columbia single-family residential parcels for address search and comparable labels.

Reproduce (the source is live, so a later run yields a newer snapshot with a different fingerprint):
  python3 -I scripts/datasets/fetch-dc-properties.py src/datasets/dc/dc-residential-properties.csv.gz src/datasets/dc/dc-residential-properties.provenance.json

Sources (District of Columbia, CC BY 4.0), joined on SSL (square-suffix-lot):
  Computer Assisted Mass Appraisal - Residential  bedrooms, baths, gross building area, condition, years
  Address Points                                  active street address, latitude, longitude, ZIP

This file does not change the validated sales snapshot (evidence/datasets/dc-residential-sales.csv.gz). It applies
the same single-family rules as fetch-dc-sales.py so a searchable home is one the validated configuration can value.
Owner names and mailing addresses are never requested.
"""

import collections
import csv
import gzip
import hashlib
import io
import json
import sys
import time
import urllib.parse
import urllib.request

BASE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA'
CAMA = f'{BASE}/Property_and_Land_WebMercator/FeatureServer/25'
POINTS = f'{BASE}/Location_WebMercator/FeatureServer/0'


def query(layer, where, fields):
    rows, offset = [], 0
    while True:
        params = urllib.parse.urlencode(
            {'where': where, 'outFields': ','.join(fields), 'returnGeometry': 'false', 'orderByFields': 'OBJECTID',
             'resultOffset': offset, 'resultRecordCount': 2000, 'f': 'json'})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(f'{layer}/query?{params}', timeout=120) as response:
                    page = json.load(response)
                if 'error' in page:
                    raise RuntimeError(page['error'])
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(2 ** attempt)
        batch = [feature['attributes'] for feature in page.get('features', [])]
        rows.extend(batch)
        sys.stderr.write(f'\r{layer.rsplit("/", 2)[-2]}/{layer.rsplit("/", 1)[-1]}: {len(rows)}   ')
        if not page.get('exceededTransferLimit') and len(batch) < 2000:
            break
        offset += len(batch)
    sys.stderr.write('\n')
    return rows


target_csv, target_provenance = sys.argv[1], sys.argv[2]
fetched_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
cama = query(CAMA, '1=1', ['OBJECTID', 'SSL', 'BEDRM', 'BATHRM', 'HF_BATHRM', 'GBA', 'CNDTN', 'AYB', 'YR_RMDL', 'NUM_UNITS', 'BLDG_NUM'])
points = query(POINTS, "SSL IS NOT NULL AND STATUS = 'ACTIVE'", ['OBJECTID', 'SSL', 'ADDRESS', 'LATITUDE', 'LONGITUDE', 'ZIPCODE'])

buildings = collections.defaultdict(list)
for row in cama:
    buildings[row['SSL']].append(row)
located = collections.defaultdict(list)
for row in points:
    if row['LATITUDE'] and row['LONGITUDE'] and row['ADDRESS']:
        located[row['SSL'].strip()].append(row)

removed = collections.Counter()
rows = []
for ssl, lots in sorted(buildings.items()):
    spots = located.get(ssl.strip(), [])
    home = lots[0]
    if len(lots) != 1:
        removed['multipleBuildingsOnLot'] += 1
    elif (home['NUM_UNITS'] or 1) != 1:
        removed['multiUnitBuilding'] += 1
    elif not home['GBA'] or not home['CNDTN'] or home['BEDRM'] is None or home['BATHRM'] is None:
        removed['missingCharacteristics'] += 1
    elif not spots:
        removed['noActiveAddressPoint'] += 1
    else:
        addresses = sorted({spot['ADDRESS'].strip().upper() for spot in spots})
        lat = sum(spot['LATITUDE'] for spot in spots) / len(spots)
        lng = sum(spot['LONGITUDE'] for spot in spots) / len(spots)
        zip_code = sorted(str(int(float(spot['ZIPCODE']))) if spot['ZIPCODE'] else '' for spot in spots)[0]
        baths = (home['BATHRM'] or 0) + 0.5 * (home['HF_BATHRM'] or 0)
        rows.append([
            ssl.replace(' ', '_'), addresses[0], '|'.join(addresses[1:]), zip_code, f'{lat:.6f}', f'{lng:.6f}',
            str(int(home['BEDRM'])), f'{baths:g}', str(int(home['GBA'])), str(int(home['CNDTN'])),
            str(int(home['AYB'] or 0)), str(int(home['YR_RMDL'] or 0)),
        ])

text_buffer = io.StringIO()
writer = csv.writer(text_buffer, lineterminator='\n')
writer.writerow(['parcel_id', 'address', 'aliases', 'zip', 'lat', 'lng', 'beds', 'baths', 'sqft', 'condition', 'year_built', 'year_remodeled'])
writer.writerows(rows)
text = text_buffer.getvalue().encode('utf-8')
buffer = io.BytesIO()
with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as handle:
    handle.write(text)
open(target_csv, 'wb').write(buffer.getvalue())
provenance = {
    'datasetId': 'dc-residential-properties',
    'title': 'District of Columbia single-family residential parcels with active street addresses',
    'publisher': 'District of Columbia (Office of Tax and Revenue; Office of the Chief Technology Officer), via opendata.dc.gov',
    'license': 'CC-BY-4.0',
    'attribution': 'Contains District of Columbia open data licensed under CC BY 4.0: Computer Assisted Mass Appraisal - Residential, Address Points. Joined and filtered by Ascent.',
    'sources': {'characteristics': CAMA, 'locations': POINTS},
    'fetchedAt': fetched_at,
    'sourceRows': {'characteristics': len(cama), 'activeAddressPoints': len(points)},
    'rows': len(rows),
    'removed': dict(sorted(removed.items())),
    'csvSha256': hashlib.sha256(text).hexdigest(),
    'fingerprintBasis': 'SHA-256 of the decompressed CSV bytes.',
    'conditionScale': 'DC CAMA CNDTN code (1 Poor, 2 Fair, 3 Average, 4 Good, 5 Very Good, 6 Excellent), used as condition points.',
    'derivation': 'scripts/datasets/fetch-dc-properties.py; baths = full + 0.5 x half; sqft = gross building area (GBA); coordinates = mean of the lot\'s active address points; first address alphabetically is shown, others kept as search aliases.',
    'limitations': [
        'Characteristics are the assessor\'s current record, not an inspection; renovations not yet recorded are missing.',
        'Condominiums, multi-unit buildings and multi-building lots are out of scope, matching the validated sales snapshot.',
        'No owner, tax, permit or listing information is included.',
    ],
}
open(target_provenance, 'w').write(json.dumps(provenance, indent=2) + '\n')
print(json.dumps({key: provenance[key] for key in ('rows', 'removed', 'csvSha256', 'fetchedAt')}, indent=2))
