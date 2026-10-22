"""State assessor facts and Montgomery County residential permits for the homes in the bundled Maryland snapshot.

Run (the sources are live, so a later run yields a newer snapshot with different fingerprints):
  python3 -I scripts/datasets/fetch-maryland-facts.py

It reads src/datasets/maryland/maryland-properties.csv.gz only to decide which parcels are covered, and never
changes it, the validated sales file or anything the valuation engine reads. It writes:
  src/datasets/maryland/maryland-facts.csv.gz          dwelling type, exterior construction, lot, last inspection
  src/datasets/maryland/montgomery-permits.csv.gz      residential permits issued since 2016, matched by address
  src/datasets/maryland/maryland-facts.provenance.json

Sources, both labeled Public Domain in their published metadata:
  Maryland SDAT/MDP Real Property Assessments, hidden owner names (opendata.maryland.gov ed4q-f8tm)
  Montgomery County Department of Permitting Services, Residential Permit (data.montgomerycountymd.gov m88u-pqki)
Prince George's County publishes permits without a stated license, so none are used. Owner names, permit
descriptions, contractors and coordinates are never requested.
"""

import collections
import csv
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
SDAT = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json'
SDAT_METADATA = 'https://opendata.maryland.gov/api/views/ed4q-f8tm.json'
PERMITS = 'https://data.montgomerycountymd.gov/resource/m88u-pqki.json'
PERMITS_METADATA = 'https://data.montgomerycountymd.gov/api/views/m88u-pqki.json'
PERMITS_SINCE = '2016-01-01'
FIELDS = {
    'parcel': 'account_id_mdp_field_acctid',
    'dwelling': 'additional_c_a_m_a_data_dwelling_type_mdp_field_strubldg_sdat_field_265',
    'construction': 'additional_c_a_m_a_data_dwelling_construction_code_mdp_field_strucnst_sdat_field_263',
    'land': 'c_a_m_a_system_data_land_area_mdp_field_landarea_sdat_field_242',
    'landUnit': 'c_a_m_a_system_data_land_unit_of_measure_mdp_field_luom_sdat_field_243',
    'inspected': 'current_cycle_data_date_inspected_yyyy_mm_mdp_field_lastinsp_sdat_field_168',
    'condition': 'c_a_m_a_system_data_dwelling_condition_code_sdat_field_233',
}
QUALIFIED = ("jurisdiction_code_mdp_field_jurscode in ('MONT','PRIN') AND land_use_code_mdp_field_lu_desclu_sdat_field_50 "
             "in ('Residential (R)','Town House (TH)') AND c_a_m_a_system_data_number_of_dwelling_units_mdp_field_bldg_units_sdat_field_239=1")
SUFFIXES = {'ST': 'STREET', 'AVE': 'AVENUE', 'AV': 'AVENUE', 'RD': 'ROAD', 'PL': 'PLACE', 'CT': 'COURT',
            'TER': 'TERRACE', 'TERR': 'TERRACE', 'DR': 'DRIVE', 'BLVD': 'BOULEVARD', 'LN': 'LANE', 'CIR': 'CIRCLE',
            'PKWY': 'PARKWAY', 'SQ': 'SQUARE', 'HWY': 'HIGHWAY', 'ALY': 'ALLEY', 'CRES': 'CRESCENT', 'WY': 'WAY',
            'TRL': 'TRAIL', 'XING': 'CROSSING', 'PIKE': 'PIKE', 'GRN': 'GREEN', 'PT': 'POINT', 'RDG': 'RIDGE',
            'CV': 'COVE', 'LOOP': 'LOOP', 'RUN': 'RUN', 'WALK': 'WALK', 'TPKE': 'TURNPIKE', 'CTR': 'CENTER'}
DIRECTIONS = {'NORTH': 'N', 'SOUTH': 'S', 'EAST': 'E', 'WEST': 'W', 'NORTHEAST': 'NE', 'NORTHWEST': 'NW',
              'SOUTHEAST': 'SE', 'SOUTHWEST': 'SW'}


def query(url, params):
    full = url + '?' + urllib.parse.urlencode(params)
    for attempt in range(6):
        try:
            request = urllib.request.Request(full, headers={'User-Agent': 'Ascent public-record research/1.0',
                                                            'Accept': 'application/json'})
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.load(response)
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 ** attempt)


def paged(url, select, where, order):
    rows, offset = [], 0
    while True:
        batch = query(url, {'$select': select, '$where': where, '$order': order, '$limit': 50000, '$offset': offset})
        rows.extend(batch)
        offset += len(batch)
        print(f'{url.rsplit("/", 1)[-1]}: {offset}', flush=True)
        if len(batch) < 50000:
            return rows


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


def address_key(text, zip_code):
    """Upper case, punctuation removed, suffixes spelled out and directions abbreviated, then the ZIP."""
    words = [word for word in re.sub(r'[^A-Z0-9 ]', ' ', (text or '').upper()).split()]
    words = [SUFFIXES.get(word, DIRECTIONS.get(word, word)) for word in words]
    return f"{' '.join(words)}|{(zip_code or '')[:5]}" if words and re.match(r'\d', words[0]) else ''


def described(value):
    """'DWEL End Unit (0002)' -> 'End Unit'; 'Frame (002)' -> 'Frame'; blanks and placeholders -> ''."""
    text = re.sub(r'\s*\([0-9A-Z]+\)$', '', (value or '').strip())
    text = re.sub(r'^DWEL\s+', '', text)
    return '' if text.lower() in ('', 'blank') else text


def main():
    # Both licenses are checked before anything is fetched or written.
    sdat_license = query(SDAT_METADATA, {}).get('license')
    permit_license = query(PERMITS_METADATA, {}).get('license')
    if (sdat_license or {}).get('name') != 'Public Domain' or (permit_license or {}).get('name') != 'Public Domain':
        raise RuntimeError(f'License changed: SDAT {sdat_license}, Montgomery permits {permit_license}. Do not publish.')
    fetched = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    directory = ROOT / 'src/datasets/maryland'
    with gzip.open(directory / 'maryland-properties.csv.gz', 'rt', encoding='utf-8', newline='') as handle:
        parcels = {row['parcel_id']: row for row in csv.DictReader(handle)}

    rows = paged(SDAT, ','.join(f'{field} as {alias}' for alias, field in FIELDS.items()), QUALIFIED, FIELDS['parcel'])
    facts, removed, conditions = [], collections.Counter(), collections.Counter()
    seen = set()
    for row in rows:
        parcel = row.get('parcel', '')
        conditions[described(row.get('condition')) or 'blank'] += 1
        if parcel not in parcels:
            removed['notInPropertySnapshot'] += 1
            continue
        if parcel in seen:
            removed['duplicateParcel'] += 1
            continue
        seen.add(parcel)
        land = float(row.get('land') or 0)
        unit = (row.get('landUnit') or '').strip()
        land_sqft = round(land * 43560) if unit == 'A' else round(land) if unit == 'S' else 0
        inspected = (row.get('inspected') or '').replace('.', '-')
        inspected = inspected if re.fullmatch(r'(19[5-9]\d|20\d\d)-(0[1-9]|1[0-2])', inspected) else ''
        facts.append([parcel, described(row.get('dwelling')), described(row.get('construction')),
                      land_sqft if 0 < land_sqft <= 50_000_000 else '', inspected])
    facts.sort(key=lambda item: item[0])
    removed['propertyNotReturned'] = len(parcels) - len(facts)

    # Montgomery only: an address key must name exactly one covered parcel.
    keys = collections.defaultdict(list)
    for parcel, row in parcels.items():
        if row['county'] == 'MONT':
            key = address_key(row['address'], row['zip'])
            if key:
                keys[key].append(parcel)
    permit_rows = paged(PERMITS, 'permitno,status,stno,predir,stname,suffix,postdir,zip,issueddate,finaleddate,'
                        'declaredvaluation,worktype,usecode', f"issueddate >= '{PERMITS_SINCE}T00:00:00'", 'permitno')
    permits, skipped, permit_seen = [], collections.Counter(), set()
    for row in permit_rows:
        key = address_key(' '.join(row.get(part, '') or '' for part in ('stno', 'predir', 'stname', 'suffix', 'postdir')),
                          row.get('zip'))
        matches = keys.get(key, [])
        number = (row.get('permitno') or '').strip()
        issued = (row.get('issueddate') or '')[:10]
        if not key:
            skipped['unreadableAddress'] += 1
        elif not matches:
            skipped['noCoveredParcel'] += 1
        elif len(matches) > 1:
            skipped['ambiguousAddress'] += 1
        elif not number or number in permit_seen:
            skipped['duplicateOrUnnumbered'] += 1
        elif not re.fullmatch(r'\d{4}-\d{2}-\d{2}', issued) or issued > fetched[:10]:
            skipped['invalidIssueDate'] += 1
        else:
            permit_seen.add(number)
            value = row.get('declaredvaluation')
            try:
                declared = round(float(value)) if value not in (None, '') else ''
            except ValueError:
                declared = ''
            permits.append([matches[0], number, issued, (row.get('finaleddate') or '')[:10],
                            (row.get('status') or '').strip(), (row.get('worktype') or '').strip(),
                            (row.get('usecode') or '').strip(),
                            declared if declared == '' or 0 <= declared <= 100_000_000 else ''])
    permits.sort(key=lambda item: (item[0], item[2], item[1]))

    facts_sha = write(directory / 'maryland-facts.csv.gz',
                      ['parcel_id', 'dwelling_type', 'construction', 'land_sqft', 'inspected'], facts)
    permits_sha = write(directory / 'montgomery-permits.csv.gz',
                        ['parcel_id', 'permit_id', 'issued', 'finaled', 'status', 'work_type', 'use', 'declared_value'],
                        permits)
    provenance = {
        'datasetId': 'maryland-facts',
        'fetchedAt': fetched,
        'license': 'Public Domain',
        'licenseEvidence': {'sdat': SDAT_METADATA, 'montgomeryPermits': PERMITS_METADATA},
        'attribution': 'Maryland SDAT/MDP public-domain real property assessments (ed4q-f8tm) and Montgomery County Department of Permitting Services residential permits (m88u-pqki, public domain), joined by Ascent.',
        'sources': {'sdat': SDAT, 'montgomeryPermits': PERMITS},
        'fieldsRequested': FIELDS,
        'factsCsvSha256': facts_sha,
        'permitsCsvSha256': permits_sha,
        'facts': len(facts),
        'removedFacts': dict(sorted(removed.items())),
        'permits': len(permits),
        'permitsSince': PERMITS_SINCE,
        'permitRowsFetched': len(permit_rows),
        'skippedPermits': dict(sorted(skipped.items())),
        'dwellingConditionValues': dict(conditions.most_common()),
        'dwellingConditionNote': 'SDAT field #233 (dwelling condition) is recorded for almost no covered homes, so condition stays unavailable in Maryland; the counts above are kept to show why.',
        'fingerprintBasis': 'SHA-256 of decompressed CSV bytes',
        'derivation': 'scripts/datasets/fetch-maryland-facts.py; land in acres converted at 43,560 square feet; inspection months before 1950 (the source uses 1899-12 as a placeholder) left blank; permits matched on street number, name, suffix, directions and ZIP to exactly one covered Montgomery parcel.',
        'limitations': [
            'Dwelling type and exterior construction are the assessor\'s current record, not an inspection of condition.',
            'The last inspection month is when the assessor last reviewed the record, often from the exterior; it is not an interior inspection.',
            'Permits are Montgomery County only, from 2016. A permit authorizes work; finaled means the county approved it as complete. Unpermitted work is absent. Prince George\'s permits are not used because no license is stated.',
            'Address matching can miss permits filed under a different address form, and skips any address shared by more than one covered parcel.',
        ],
    }
    (directory / 'maryland-facts.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: provenance[key] for key in ('facts', 'removedFacts', 'permits', 'skippedPermits',
                                                       'dwellingConditionValues')}, indent=2))


if __name__ == '__main__':
    main()
