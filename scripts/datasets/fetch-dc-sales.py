"""Snapshot District of Columbia recorded residential sales into Ascent's validation CSV.

Reproduce (the source is live, so a later run yields a newer snapshot with a different fingerprint):
  python3 -I scripts/datasets/fetch-dc-sales.py evidence/datasets/dc-residential-sales.csv.gz evidence/datasets/dc-residential-sales.provenance.json

Sources (District of Columbia, CC BY 4.0), joined on SSL (square-suffix-lot):
  Tax System Property Sales (CAMA)           sale date, price, assessor qualification
  Computer Assisted Mass Appraisal - Residential  bedrooms, baths, gross building area, condition, years
  Address Points                              latitude, longitude, ZIP

Owner names are never requested. Every rule below is about record integrity, decided before any valuation
was run, and each one's count is written to the provenance file. No sale is removed for its price.
"""

import collections
import gzip
import hashlib
import io
import json
import sys
import time
import urllib.parse
import urllib.request

BASE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA'
SALES = f'{BASE}/Property_and_Land_WebMercator/FeatureServer/57'
CAMA = f'{BASE}/Property_and_Land_WebMercator/FeatureServer/25'
POINTS = f'{BASE}/Location_WebMercator/FeatureServer/0'
SINCE = '2022-01-01'


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


def day(ms):
    return time.strftime('%Y-%m-%d', time.gmtime(ms / 1000))


target_csv, target_provenance = sys.argv[1], sys.argv[2]
fetched_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
sales = query(SALES, f"SALE_DATE >= date '{SINCE}' AND SALE_PRICE > 0", ['OBJECTID', 'SSL', 'SALE_DATE', 'SALE_PRICE', 'QUALIFIED'])
cama = query(CAMA, '1=1', ['OBJECTID', 'SSL', 'BEDRM', 'BATHRM', 'HF_BATHRM', 'GBA', 'CNDTN', 'AYB', 'YR_RMDL', 'NUM_UNITS', 'BLDG_NUM'])
points = query(POINTS, 'SSL IS NOT NULL', ['OBJECTID', 'SSL', 'LATITUDE', 'LONGITUDE', 'ZIPCODE'])

buildings = collections.defaultdict(list)
for row in cama:
    buildings[row['SSL']].append(row)
located = collections.defaultdict(list)
for row in points:
    if row['LATITUDE'] and row['LONGITUDE']:
        located[row['SSL'].strip()].append(row)
# A deed price shared by several lots on one day is a bundled transfer; no single home carries that price.
bundles = collections.Counter((day(row['SALE_DATE']), row['SALE_PRICE']) for row in sales)

removed = collections.Counter()
seen = set()
out = []
for sale in sorted(sales, key=lambda row: (row['SALE_DATE'], row['SSL'], row['OBJECTID'])):
    ssl, sold_on, price = sale['SSL'], day(sale['SALE_DATE']), sale['SALE_PRICE']
    year = int(sold_on[:4])
    lots = buildings.get(ssl, [])
    spots = located.get(ssl.strip(), [])
    if sale['QUALIFIED'] != 'Q':
        removed['notAssessorQualified'] += 1
    elif bundles[(sold_on, price)] > 1:
        removed['multiParcelTransfer'] += 1
    elif (ssl, sold_on) in seen:
        removed['duplicateRecording'] += 1
    elif not lots:
        removed['notSingleFamilyResidentialCama'] += 1
    elif len(lots) != 1:
        removed['multipleBuildingsOnLot'] += 1
    elif (lots[0]['NUM_UNITS'] or 1) != 1:
        removed['multiUnitBuilding'] += 1
    elif not spots:
        removed['noAddressPoint'] += 1
    else:
        home = lots[0]
        built, remodeled = home['AYB'] or 0, home['YR_RMDL'] or 0
        # CAMA describes the home as it is now; a build or remodel in or after the sale year may postdate the sale.
        if built >= year or remodeled >= year:
            removed['characteristicsMayPostdateSale'] += 1
        elif not home['GBA'] or not home['CNDTN'] or home['BEDRM'] is None or home['BATHRM'] is None:
            removed['missingCharacteristics'] += 1
        else:
            seen.add((ssl, sold_on))
            lat = sum(spot['LATITUDE'] for spot in spots) / len(spots)
            lng = sum(spot['LONGITUDE'] for spot in spots) / len(spots)
            zip_code = sorted(str(int(float(spot['ZIPCODE']))) if spot['ZIPCODE'] else '' for spot in spots)[0]
            baths = (home['BATHRM'] or 0) + 0.5 * (home['HF_BATHRM'] or 0)
            parcel = ssl.replace(' ', '_')
            out.append(','.join([
                f'dc-{parcel}-{sold_on}', parcel, sold_on, str(int(round(price))), str(int(home['BEDRM'])),
                f'{baths:g}', str(int(home['GBA'])), str(int(home['CNDTN'])), f'{lat:.6f}', f'{lng:.6f}', zip_code,
            ]))

text = ('sale_id,parcel_id,sold_on,price,beds,baths,sqft,condition,lat,lng,zip\n' + '\n'.join(out) + '\n').encode('utf-8')
buffer = io.BytesIO()
with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as handle:
    handle.write(text)
open(target_csv, 'wb').write(buffer.getvalue())
provenance = {
    'datasetId': 'dc-residential-sales',
    'title': 'District of Columbia recorded residential sales joined to CAMA characteristics and address points',
    'publisher': 'District of Columbia (Office of Tax and Revenue; Office of the Chief Technology Officer), via opendata.dc.gov',
    'license': 'CC-BY-4.0',
    'attribution': 'Contains District of Columbia open data licensed under CC BY 4.0: Tax System Property Sales (CAMA), Computer Assisted Mass Appraisal - Residential, Address Points.',
    'sources': {'sales': SALES, 'characteristics': CAMA, 'locations': POINTS},
    'fetchedAt': fetched_at,
    'salesSince': SINCE,
    'sourceRows': {'sales': len(sales), 'characteristics': len(cama), 'addressPoints': len(points)},
    'rows': len(out),
    'firstSale': out[0].split(',')[2] if out else None,
    'lastSale': out[-1].split(',')[2] if out else None,
    'removedBeforeValidation': dict(sorted(removed.items())),
    'csvSha256': hashlib.sha256(text).hexdigest(),
    'fingerprintBasis': 'SHA-256 of the decompressed CSV bytes.',
    'conditionScale': 'DC CAMA CNDTN code (1 Poor, 2 Fair, 3 Average, 4 Good, 5 Very Good, 6 Excellent), used as condition points.',
    'derivation': 'scripts/datasets/fetch-dc-sales.py; baths = full + 0.5 x half; sqft = gross building area (GBA); coordinates = mean of the lot\'s address points.',
    'independence': 'Recorded deed transfers and assessor records published by the District government. Ascent\'s authors did not create, select or edit any record.',
    'limitations': [
        'CAMA characteristics are current, not as of each sale; sales in or before a recorded build or remodel year are removed, but unrecorded changes remain.',
        'Assessor qualification (Q) is the District\'s arm\'s-length determination; concessions are not recorded.',
        'Condominiums, multi-unit buildings and multi-building lots are out of scope.',
        'Recordation lags closing, so the most recent weeks of the snapshot are incomplete.',
    ],
}
open(target_provenance, 'w').write(json.dumps(provenance, indent=2) + '\n')
print(json.dumps({key: provenance[key] for key in ('rows', 'firstSale', 'lastSale', 'removedBeforeValidation', 'csvSha256')}, indent=2))
