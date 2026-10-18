"""Owner-free DC condo snapshot: separately licensed CAMA, Condo Relate, Address Points and deed sales.
Run: python -I scripts/datasets/fetch-dc-condos.py
No condition is invented: the Condominium CAMA table has no condition field.
"""
import collections
import csv
import gzip
import hashlib
import io
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA'
LAND = BASE + '/Property_and_Land_WebMercator/FeatureServer/'
CAMA, RELATE, SALES = LAND + '24', LAND + '52', LAND + '57'
POINTS = BASE + '/Location_WebMercator/FeatureServer/0'


def query(layer, where, fields):
    rows, offset = [], 0
    while True:
        params = urllib.parse.urlencode({'where': where, 'outFields': ','.join(fields),
            'returnGeometry': 'false', 'orderByFields': 'OBJECTID', 'resultOffset': offset,
            'resultRecordCount': 2000, 'f': 'json'})
        for attempt in range(5):
            try:
                request = urllib.request.Request(layer + '/query?' + params, headers={'User-Agent': 'Ascent public-record research/1.0'})
                with urllib.request.urlopen(request, timeout=120) as response:
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
        print(f'{layer.rsplit("/", 1)[1]}: {len(rows)}', flush=True)
        if not page.get('exceededTransferLimit') and len(batch) < 2000:
            return rows
        if not batch:
            raise RuntimeError('Incomplete pagination')
        offset += len(batch)


def write(path, header, rows):
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


fetched = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
homes = query(CAMA, 'USECODE IN (16,17)', ['OBJECTID', 'SSL', 'BLDG_NUM', 'BEDRM', 'BATHRM', 'HF_BATHRM', 'LIVING_GBA', 'AYB', 'YR_RMDL', 'USECODE'])
links = query(RELATE, 'SSL IS NOT NULL', ['OBJECTID', 'SSL', 'MAR_ID', 'UNITNUM', 'MARUNITNUM'])
points = query(POINTS, "STATUS='ACTIVE' AND HAS_CONDO='Y'", ['OBJECTID', 'MAR_ID', 'ADDRESS', 'LATITUDE', 'LONGITUDE', 'ZIPCODE'])
sales = query(SALES, "SALE_DATE >= date '2022-01-01' AND SALE_PRICE > 0 AND QUALIFIED='Q'", ['OBJECTID', 'SSL', 'SALE_DATE', 'SALE_PRICE'])
by_ssl, addresses = collections.defaultdict(list), collections.defaultdict(set)
for row in homes:
    by_ssl[row['SSL'].strip()].append(row)
located = {str(int(row['MAR_ID'])): row for row in points if row['MAR_ID'] and row['ADDRESS'] and row['LATITUDE'] and row['LONGITUDE']}
for row in links:
    mar = str(int(row['MAR_ID'])) if row['MAR_ID'] else ''
    unit = str(row['MARUNITNUM'] or row['UNITNUM'] or '').strip()
    if mar in located and unit:
        addresses[row['SSL'].strip()].add((mar, unit))
removed_properties, removed_sales = collections.Counter(), collections.Counter()
properties, kept = [], {}
for ssl, entries in sorted(by_ssl.items()):
    home = entries[0]
    spots = addresses.get(ssl, set())
    if len(entries) != 1:
        removed_properties['multipleCamaRows'] += 1
    elif len(spots) != 1:
        removed_properties['missingOrAmbiguousUnitAddress'] += 1
    elif home['BEDRM'] is None or not 0 <= home['BEDRM'] <= 12 or not home['BATHRM'] or (home['LIVING_GBA'] or 0) < 200:
        removed_properties['missingOrInvalidCharacteristics'] += 1
    else:
        mar, unit = next(iter(spots))
        spot = located[mar]
        parcel = ssl.replace(' ', '_')
        record = [parcel, f"{spot['ADDRESS'].strip()} Unit {unit}", str(int(float(spot['ZIPCODE']))) if spot['ZIPCODE'] else '',
                  f"{spot['LATITUDE']:.6f}", f"{spot['LONGITUDE']:.6f}", int(home['BEDRM']),
                  (home['BATHRM'] or 0) + .5 * (home['HF_BATHRM'] or 0), int(home['LIVING_GBA']),
                  int(home['AYB'] or 0), int(home['YR_RMDL'] or 0), mar]
        kept[ssl] = record
        properties.append(record)

def day(ms):
    return time.strftime('%Y-%m-%d', time.gmtime(ms / 1000))

bundles = collections.Counter((day(sale['SALE_DATE']), sale['SALE_PRICE']) for sale in sales)
out, seen = [], set()
for sale in sorted(sales, key=lambda row: (row['SALE_DATE'], row['SSL'], row['OBJECTID'])):
    ssl, sold_on = sale['SSL'].strip(), day(sale['SALE_DATE'])
    home = kept.get(ssl)
    if not home:
        removed_sales['noCoveredCondo'] += 1
    elif bundles[(sold_on, sale['SALE_PRICE'])] > 1:
        removed_sales['ambiguousSharedDayAndPrice'] += 1
    elif max(home[8], home[9]) >= int(sold_on[:4]):
        removed_sales['characteristicsMayPostdateSale'] += 1
    elif sold_on >= fetched[:10]:
        removed_sales['sameDayOrFuture'] += 1
    elif (ssl, sold_on) in seen:
        removed_sales['duplicateRecording'] += 1
    else:
        seen.add((ssl, sold_on))
        out.append([f'dc-condo-{home[0]}-{sold_on}', home[0], sold_on, round(sale['SALE_PRICE']),
                    home[5], home[6], home[7], home[3], home[4], home[2]])
directory = ROOT / 'src/datasets/dc-condos'
prop_sha = write(directory / 'dc-condo-properties.csv.gz', ['parcel_id', 'address', 'zip', 'lat', 'lng', 'beds', 'baths', 'sqft', 'year_built', 'year_remodeled', 'mar_id'], properties)
sale_sha = write(directory / 'dc-condo-sales.csv.gz', ['sale_id', 'parcel_id', 'sold_on', 'price', 'beds', 'baths', 'sqft', 'lat', 'lng', 'zip'], out)
provenance = {
    'datasetId': 'dc-condominiums', 'fetchedAt': fetched, 'license': 'CC-BY-4.0',
    'attribution': 'Contains District of Columbia open data licensed under CC BY 4.0: Condominium CAMA, Condo Relate Table, Address Points and Tax System Property Sales. Joined and filtered by Ascent.',
    'sources': {'characteristics': CAMA, 'unitAddresses': RELATE, 'locations': POINTS, 'sales': SALES},
    'licenseEvidence': {key: url + '/iteminfo?f=json' for key, url in {'cama': CAMA, 'relate': RELATE, 'points': POINTS, 'sales': SALES}.items()},
    'properties': len(properties), 'rows': len(out), 'sourceRows': {'cama': len(homes), 'relate': len(links), 'points': len(points), 'qualifiedSales': len(sales)},
    'propertyCsvSha256': prop_sha, 'csvSha256': sale_sha, 'firstSale': out[0][2], 'lastSale': out[-1][2],
    'fingerprintBasis': 'SHA-256 of decompressed CSV bytes',
    'removedProperties': dict(removed_properties), 'removedSales': dict(removed_sales),
    'limitations': ['No condo-specific accuracy validation. Do not inherit DC single-family calibration.',
       'Condominium CAMA has no condition field; condition adjustment must stay disabled.',
       'Floor, view, parking rights, HOA dues, reserves, assessments, amenities and interior condition are unmodeled.',
       'Current characteristics, not historical; sale year at or before build/remodel year excluded.',
       'Same-day equal-price qualified transfers are conservatively excluded as potentially shared prices; unrelated same-price closings can also be removed.',
       'Coordinates are the building street address point, not the unit location or floor. Studios with zero recorded bedrooms are supported.',
       'Only residential condo use codes 16 and 17 with one unambiguous unit address; co-ops, commercial, combined units and missing addresses excluded.'],
}
(directory / 'dc-condos.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: provenance[key] for key in ['properties', 'rows', 'lastSale', 'removedProperties', 'removedSales']}, indent=2))
