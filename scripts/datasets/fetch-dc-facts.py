"""Assessor facts, condominium building facts and building permits for the homes in the bundled DC snapshots.

Run (the sources are live, so a later run yields a newer snapshot with different fingerprints):
  python3 -I scripts/datasets/fetch-dc-facts.py

It reads the bundled parcel and sales snapshots only to decide which parcels are covered. It never changes them,
the validated sales file, or anything the valuation engine reads. It writes:
  src/datasets/dc/dc-residential-facts.csv.gz      structure, style, construction grade, effective year, systems, lot
  src/datasets/dc/dc-house-permits.csv.gz          permits issued since 2016 on covered house lots
  src/datasets/dc-condos/dc-condo-facts.csv.gz     condominium regime, its units, the building lot, unit rooms, systems
  src/datasets/dc-condos/dc-condo-permits.csv.gz   permits issued since 2016 on covered units and their building lots
and a provenance file in each directory. Owner names, permit applicants, addresses of record, descriptions of work
and fees are never requested.

Sources, District of Columbia, CC BY 4.0 (license evidence: each layer's iteminfo?f=json):
  Computer Assisted Mass Appraisal - Residential (layer 25) and - Condominium (layer 24)
  Condo Relate Table (layer 52): unit, regime, regime name and record lot only
  Building Permits 2016-2026 (Department of Buildings feeds, one layer per year)
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
LAND = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/'
RESIDENTIAL, CONDO, RELATE = LAND + '25', LAND + '24', LAND + '52'
FEEDS = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/'
PERMIT_LAYERS = {2016: 24, 2017: 37, 2018: 9, 2019: 8, 2020: 2, 2021: 3, 2022: 14, 2023: 15, 2024: 16, 2025: 17, 2026: 18}
PERMITS_SINCE = '2016-01-01'
# Kept permit kinds, by type and subtype. Everything else (home occupations, elevator shop drawings, signs, tenant
# layouts, civil plans, variances, excavation and shoring) is counted and left out.
KEPT_SUBTYPES = {
    'CONSTRUCTION': {'ALTERATION AND REPAIR', 'ADDITION ALTERATION REPAIR', 'ADDITION', 'NEW BUILDING', 'DEMOLITION',
                     'RAZE', 'FOUNDATION ONLY', 'DECK', 'FENCE', 'GARAGE', 'SHED', 'SWIMMING POOL', 'RETAINING WALL',
                     'SOLAR SYSTEM', 'AWNING', 'MISCELLANEOUS'},
    'SUPPLEMENTAL': {'ELECTRICAL', 'PLUMBING AND GAS', 'MECHANICAL', 'BOILER'},
    'POST CARD': {'BUILDING', 'PLUMBING', 'MECHANICAL', 'GAS FITTING', 'ELECTRICAL - GENERAL', 'ELECTRICAL - HEAVY UP'},
}
# A canceled, withdrawn or revoked permit, or one never issued, is not evidence that work was authorized.
DROPPED_STATUSES = ('CANCEL', 'WITHDRAW', 'REVOKE')


def query(layer, where, fields):
    rows, offset = [], 0
    while True:
        params = urllib.parse.urlencode({'where': where, 'outFields': ','.join(fields), 'returnGeometry': 'false',
                                         'orderByFields': 'OBJECTID', 'resultOffset': offset,
                                         'resultRecordCount': 2000, 'f': 'json'})
        for attempt in range(6):
            try:
                request = urllib.request.Request(f'{layer}/query?{params}',
                                                 headers={'User-Agent': 'Ascent public-record research/1.0'})
                with urllib.request.urlopen(request, timeout=120) as response:
                    page = json.load(response)
                if 'error' in page:
                    raise RuntimeError(page['error'])
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(2 ** attempt)
        batch = [feature['attributes'] for feature in page.get('features', [])]
        rows.extend(batch)
        print(f'{layer.rsplit("/", 2)[-2]}/{layer.rsplit("/", 1)[-1]}: {len(rows)}', flush=True)
        if not page.get('exceededTransferLimit') and len(batch) < 2000:
            return rows
        if not batch:
            raise RuntimeError('Incomplete pagination')
        offset += len(batch)


def parcel_id(ssl):
    """The bundled snapshots' parcel identifier: the 12-character SSL with spaces as underscores."""
    ssl = (ssl or '').rstrip()
    parts = ssl.split()
    if len(ssl) != 12 and len(parts) == 2:
        ssl = f'{parts[0]:<4}{"":4}{parts[1]:>4}'
    elif len(ssl) != 12 and len(parts) == 3:
        ssl = f'{parts[0]:<4}{parts[1]:<4}{parts[2]:>4}'
    return ssl.replace(' ', '_') if len(ssl) == 12 else ''


def read_csv(path):
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as handle:
        return list(csv.DictReader(handle))


def write(path, header, rows):
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, lineterminator='\n')
    writer.writerow(header)
    writer.writerows(rows)
    text = buffer.getvalue().encode('utf-8')
    with path.open('wb') as target:
        with gzip.GzipFile(filename='', mode='wb', fileobj=target, mtime=0, compresslevel=9) as handle:
            handle.write(text)
    return hashlib.sha256(text).hexdigest()


def label(value):
    """Assessor descriptions with placeholders removed; empty means not recorded."""
    text = (value or '').strip()
    return '' if text in ('', 'No Data', 'Default', 'Typical', '0') else text


def count(value, low, high):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return ''
    return str(number) if low <= number <= high else ''


def day(ms):
    return time.strftime('%Y-%m-%d', time.gmtime(ms / 1000))


fetched = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
this_year = int(fetched[:4])
house_dir, condo_dir = ROOT / 'src/datasets/dc', ROOT / 'src/datasets/dc-condos'
houses = {row['parcel_id']: row for row in read_csv(house_dir / 'dc-residential-properties.csv.gz')}
house_sales = {row['parcel_id'] for row in read_csv(house_dir / 'dc-residential-sales.csv.gz')}
condos = {row['parcel_id']: row for row in read_csv(condo_dir / 'dc-condo-properties.csv.gz')}
covered_houses = set(houses) | house_sales

# Houses: the same one-building-per-lot rule as the parcel snapshot.
residential = query(RESIDENTIAL, '1=1', ['OBJECTID', 'SSL', 'BEDRM', 'BATHRM', 'HF_BATHRM', 'GBA', 'CNDTN', 'AYB',
                                          'YR_RMDL', 'EYB', 'STRUCT_D', 'STYLE_D', 'GRADE_D', 'KITCHENS',
                                          'FIREPLACES', 'HEAT_D', 'AC', 'EXTWALL_D', 'ROOF_D', 'INTWALL_D', 'LANDAREA'])
by_lot = collections.defaultdict(list)
for row in residential:
    by_lot[parcel_id(row['SSL'])].append(row)
house_rows, removed_houses, changed = [], collections.Counter(), collections.Counter()
for parcel in sorted(covered_houses):
    lots = by_lot.get(parcel, [])
    if len(lots) != 1:
        removed_houses['notExactlyOneAssessorRecord'] += 1
        continue
    home = lots[0]
    snapshot = houses.get(parcel)
    if snapshot:
        baths = (home['BATHRM'] or 0) + 0.5 * (home['HF_BATHRM'] or 0)
        current = {'beds': str(int(home['BEDRM'] or 0)), 'baths': f'{baths:g}', 'sqft': str(int(home['GBA'] or 0)),
                   'condition': str(int(home['CNDTN'] or 0)), 'year_built': str(int(home['AYB'] or 0)),
                   'year_remodeled': str(int(home['YR_RMDL'] or 0))}
        for key, value in current.items():
            if snapshot[key] != value:
                changed[key] += 1
        if any(snapshot[key] != value for key, value in current.items()):
            changed['anyCharacteristic'] += 1
    ac = (home['AC'] or '').strip()
    house_rows.append([
        parcel, label(home['STRUCT_D']), label(home['STYLE_D']), label(home['GRADE_D']),
        count(home['EYB'], 1700, this_year + 1), count(home['KITCHENS'], 0, 10),
        count(home['FIREPLACES'], 0, 20), label(home['HEAT_D']), ac if ac in ('Y', 'N') else '',
        label(home['EXTWALL_D']), label(home['ROOF_D']), label(home['INTWALL_D']), count(home['LANDAREA'], 1, 10_000_000),
    ])

# Condominiums: unit records, the regime each belongs to and that regime's record lot.
units = query(CONDO, 'USECODE IN (16,17)', ['OBJECTID', 'SSL', 'ROOMS', 'EYB', 'HEAT_D', 'AC', 'FIREPLACES'])
links = query(RELATE, 'SSL IS NOT NULL', ['OBJECTID', 'SSL', 'REGIME_ID', 'NAME', 'MAT_SSL'])
unit_by_parcel = collections.defaultdict(list)
for row in units:
    unit_by_parcel[parcel_id(row['SSL'])].append(row)
link_by_parcel = collections.defaultdict(list)
for row in links:
    link_by_parcel[parcel_id(row['SSL'])].append(row)
regime_residential, regime_other, regime_names = collections.Counter(), collections.Counter(), {}
for parcel, rows in link_by_parcel.items():
    regime = rows[0]['REGIME_ID']
    if regime is None or len(rows) != 1:
        continue
    regime = int(regime)
    if rows[0]['NAME']:
        regime_names.setdefault(regime, collections.Counter())[rows[0]['NAME'].strip()] += 1
    if len(unit_by_parcel.get(parcel, [])) == 1:
        regime_residential[regime] += 1
    else:
        regime_other[regime] += 1
condo_rows, removed_condos, building_lots = [], collections.Counter(), {}
for parcel in sorted(condos):
    rows, link = unit_by_parcel.get(parcel, []), link_by_parcel.get(parcel, [])
    if len(rows) != 1:
        removed_condos['notExactlyOneUnitRecord'] += 1
        continue
    unit = rows[0]
    regime = int(link[0]['REGIME_ID']) if len(link) == 1 and link[0]['REGIME_ID'] is not None else None
    lot = parcel_id(link[0]['MAT_SSL']) if len(link) == 1 else ''
    if lot:
        building_lots[parcel] = lot
    name = regime_names[regime].most_common(1)[0][0] if regime in regime_names else ''
    ac = (unit['AC'] or '').strip()
    condo_rows.append([
        parcel, regime if regime is not None else '', name,
        regime_residential.get(regime, '') if regime is not None else '',
        regime_other.get(regime, 0) if regime is not None else '', lot, count(unit['ROOMS'], 1, 30),
        count(unit['EYB'], 1700, this_year + 1), label(unit['HEAT_D']), ac if ac in ('Y', 'N') else '',
        count(unit['FIREPLACES'], 0, 10),
    ])

# Permits since 2016, kept only for covered lots, deduplicated by permit number.
house_lots = covered_houses
condo_lots = set(condos) | set(building_lots.values())
seen, house_permits, condo_permits, removed_permits = set(), [], [], collections.Counter()
for year, layer in sorted(PERMIT_LAYERS.items()):
    for row in query(FEEDS + str(layer), "SSL IS NOT NULL AND ISSUE_DATE IS NOT NULL AND PERMIT_TYPE_NAME IN "
                     "('CONSTRUCTION','SUPPLEMENTAL','POST CARD')",
                     ['OBJECTID', 'PERMIT_ID', 'ISSUE_DATE', 'PERMIT_TYPE_NAME', 'PERMIT_SUBTYPE_NAME',
                      'APPLICATION_STATUS_NAME', 'SSL']):
        parcel, permit = parcel_id(row['SSL']), (row['PERMIT_ID'] or '').strip()
        kind, subtype = (row['PERMIT_TYPE_NAME'] or '').strip(), (row['PERMIT_SUBTYPE_NAME'] or '').strip()
        status = (row['APPLICATION_STATUS_NAME'] or '').strip()
        issued = day(row['ISSUE_DATE'])
        if parcel not in house_lots and parcel not in condo_lots:
            removed_permits['notACoveredLot'] += 1
        elif not permit or (permit, parcel) in seen:
            removed_permits['duplicateOrUnnumbered'] += 1
        elif issued < PERMITS_SINCE or issued > fetched[:10]:
            removed_permits['issuedOutsideWindow'] += 1
        elif subtype not in KEPT_SUBTYPES.get(kind, ()):
            removed_permits['otherPermitKind'] += 1
        elif any(word in status.upper() for word in DROPPED_STATUSES):
            removed_permits['canceledWithdrawnOrRevoked'] += 1
        else:
            seen.add((permit, parcel))
            record = [parcel, permit, issued, kind, subtype, status]
            if parcel in house_lots:
                house_permits.append(record)
            if parcel in condo_lots:
                condo_permits.append(record)
house_permits.sort(key=lambda row: (row[0], row[2], row[1]))
condo_permits.sort(key=lambda row: (row[0], row[2], row[1]))

permit_header = ['parcel_id', 'permit_id', 'issued', 'type', 'subtype', 'status']
shas = {
    'facts': write(house_dir / 'dc-residential-facts.csv.gz',
                   ['parcel_id', 'structure', 'style', 'grade', 'effective_year_built', 'kitchens',
                    'fireplaces', 'heat', 'central_air', 'exterior', 'roof', 'floors', 'land_sqft'], house_rows),
    'housePermits': write(house_dir / 'dc-house-permits.csv.gz', permit_header, house_permits),
    'condoFacts': write(condo_dir / 'dc-condo-facts.csv.gz',
                        ['parcel_id', 'regime_id', 'regime_name', 'regime_units', 'regime_other_units', 'building_lot',
                         'rooms', 'effective_year_built', 'heat', 'central_air', 'fireplaces'], condo_rows),
    'condoPermits': write(condo_dir / 'dc-condo-permits.csv.gz', permit_header, condo_permits),
}
license_evidence = {name: url + '/iteminfo?f=json' for name, url in
                    {'residential': RESIDENTIAL, 'condominium': CONDO, 'relate': RELATE,
                     'permits2026': FEEDS + str(PERMIT_LAYERS[2026])}.items()}
permit_note = ('Permits are issued authorizations, not proof that work was finished or inspected; unpermitted work is '
               'absent. Status is the Department of Buildings status at collection. Permits from 2016 onward only.')
common = {
    'fetchedAt': fetched,
    'license': 'CC-BY-4.0',
    'licenseEvidence': license_evidence,
    'permitLayers': {str(year): FEEDS + str(layer) for year, layer in sorted(PERMIT_LAYERS.items())},
    'permitsSince': PERMITS_SINCE,
    'keptPermitSubtypes': {kind: sorted(values) for kind, values in KEPT_SUBTYPES.items()},
    'removedPermits': dict(sorted(removed_permits.items())),
    'fingerprintBasis': 'SHA-256 of decompressed CSV bytes',
    'derivation': 'scripts/datasets/fetch-dc-facts.py',
}
(house_dir / 'dc-residential-facts.provenance.json').write_text(json.dumps({
    'datasetId': 'dc-residential-facts',
    'attribution': 'Contains District of Columbia open data licensed under CC BY 4.0: Computer Assisted Mass Appraisal - Residential and Building Permits. Joined and filtered by Ascent.',
    'sources': {'characteristics': RESIDENTIAL, 'permits': FEEDS},
    **common,
    'factsCsvSha256': shas['facts'], 'permitsCsvSha256': shas['housePermits'],
    'facts': len(house_rows), 'permits': len(house_permits),
    'coveredParcels': len(covered_houses), 'removedParcels': dict(removed_houses),
    'parcelSnapshotChanges': dict(sorted(changed.items())),
    'parcelSnapshotChangesNote': 'Covered parcels whose bedrooms, baths, gross building area, condition grade, build year or remodel year in the live assessor record now differ from the bundled parcel snapshot. The valuation keeps using the snapshot; these counts measure how much it has aged.',
    'limitations': [
        'Assessor characteristics, not an inspection. Effective year built is the assessor\'s judgment of age after updates.',
        'Floors is the assessor\'s interior finish description (for example hardwood or carpet).',
        permit_note,
    ],
}, indent=2) + '\n', encoding='utf-8')
(condo_dir / 'dc-condo-facts.provenance.json').write_text(json.dumps({
    'datasetId': 'dc-condo-facts',
    'attribution': 'Contains District of Columbia open data licensed under CC BY 4.0: Condominium CAMA, Condo Relate Table and Building Permits. Joined and filtered by Ascent.',
    'sources': {'characteristics': CONDO, 'regimes': RELATE, 'permits': FEEDS},
    **common,
    'factsCsvSha256': shas['condoFacts'], 'permitsCsvSha256': shas['condoPermits'],
    'facts': len(condo_rows), 'permits': len(condo_permits), 'buildingLots': len(set(building_lots.values())),
    'removedUnits': dict(removed_condos),
    'regimeUnitsNote': 'regime_units counts units in the regime with one residential condominium assessor record; regime_other_units counts other recorded units in the regime with none, such as parking, storage or commercial units.',
    'limitations': [
        'No HOA dues, reserves, special assessments, view, deeded parking or amenities: none is published in these records.',
        'Building permits are those recorded on the regime\'s record lot; permits filed on another lot are missed.',
        permit_note,
    ],
}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'houseFacts': len(house_rows), 'housePermits': len(house_permits), 'condoFacts': len(condo_rows),
                  'condoPermits': len(condo_permits), 'removedPermits': removed_permits,
                  'parcelSnapshotChanges': changed}, indent=2, default=dict))
