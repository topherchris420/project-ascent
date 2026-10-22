"""Counts the recorded sales that the live public sources now hold beyond each bundled snapshot.

Run whenever the snapshots should be checked for age (the result is dated; it never changes a snapshot):
  python3 -I scripts/datasets/probe-freshness.py

For each market it asks the live source how many qualifying sales of covered homes are dated after the snapshot's
newest sale, and writes the count to src/datasets/<market>/freshness.json, which the studios show beside the
evidence. Only parcel identifiers and dates are requested, never prices, so nothing about a later sale can reach
an estimate. Late recordings dated on or before the snapshot's newest sale are not counted, so the counts are a
floor, not the full gap.
"""

import csv
import gzip
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
DC_SALES = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/FeatureServer/57'
SDAT = 'https://opendata.maryland.gov/resource/ed4q-f8tm.json'
SDAT_METADATA = 'https://opendata.maryland.gov/api/views/ed4q-f8tm.json'


def get(url, params):
    full = url + '?' + urllib.parse.urlencode(params)
    for attempt in range(6):
        try:
            request = urllib.request.Request(full, headers={'User-Agent': 'Ascent public-record research/1.0'})
            with urllib.request.urlopen(request, timeout=120) as response:
                page = json.load(response)
            if isinstance(page, dict) and 'error' in page:
                raise RuntimeError(page['error'])
            return page
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 ** attempt)


def parcels(path):
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as handle:
        return {row['parcel_id'] for row in csv.DictReader(handle)}


def provenance(path):
    return json.loads(path.read_text(encoding='utf-8'))


checked = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
dc_dir, condo_dir, md_dir = (ROOT / 'src/datasets' / name for name in ('dc', 'dc-condos', 'maryland'))

# District: every qualified sale dated after the earlier of the two snapshots' newest sales, then split by market.
house_after = provenance(dc_dir / 'dc-residential-sales.provenance.json')['lastSale']
condo_after = provenance(dc_dir.parent / 'dc-condos' / 'dc-condos.provenance.json')['lastSale']
earliest = min(house_after, condo_after)
later, offset = [], 0
while True:
    page = get(DC_SALES + '/query', {'where': f"QUALIFIED='Q' AND SALE_PRICE > 0 AND SALE_DATE > date '{earliest}'",
                                     'outFields': 'OBJECTID,SSL,SALE_DATE', 'returnGeometry': 'false',
                                     'orderByFields': 'OBJECTID', 'resultOffset': offset, 'resultRecordCount': 2000,
                                     'f': 'json'})
    batch = [feature['attributes'] for feature in page.get('features', [])]
    later.extend(batch)
    offset += len(batch)
    if not page.get('exceededTransferLimit') and len(batch) < 2000:
        break
day = lambda ms: time.strftime('%Y-%m-%d', time.gmtime(ms / 1000))  # noqa: E731
covered = {'dc': (parcels(dc_dir / 'dc-residential-properties.csv.gz'), house_after, dc_dir),
           'dc-condos': (parcels(condo_dir / 'dc-condo-properties.csv.gz'), condo_after, condo_dir)}
results = {}
for market, (homes, after, directory) in covered.items():
    sales = {((row['SSL'] or '').replace(' ', '_'), day(row['SALE_DATE'])) for row in later}
    count = sum(1 for parcel, sold in sales if parcel in homes and sold > after)
    results[market] = {
        'checkedAt': checked, 'sales': count, 'after': after,
        'source': 'District of Columbia Tax System Property Sales (CC BY 4.0), assessor-qualified sales of homes in this snapshot',
        'query': f"{DC_SALES} where QUALIFIED='Q' AND SALE_PRICE > 0 AND SALE_DATE > {after}; parcel and date only",
    }
    (directory / 'freshness.json').write_text(json.dumps(results[market], indent=2) + '\n', encoding='utf-8')

# Maryland: covered parcels whose most recent recorded transfer is a qualifying sale after the snapshot.
md_after = provenance(md_dir / 'maryland.provenance.json')['lastSale']
where = ("jurisdiction_code_mdp_field_jurscode in ('MONT','PRIN') AND land_use_code_mdp_field_lu_desclu_sdat_field_50 in "
         "('Residential (R)','Town House (TH)') AND c_a_m_a_system_data_number_of_dwelling_units_mdp_field_bldg_units_sdat_field_239=1 "
         "AND sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87='Private arms-length transfer, Improved (1)' "
         f"AND sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89 > '{md_after.replace('-', '.')}'")
md_homes = parcels(md_dir / 'maryland-properties.csv.gz')
rows, offset = [], 0
while True:
    batch = get(SDAT, {'$select': 'account_id_mdp_field_acctid as parcel', '$where': where,
                       '$order': 'account_id_mdp_field_acctid', '$limit': 50000, '$offset': offset})
    rows.extend(batch)
    offset += len(batch)
    if len(batch) < 50000:
        break
updated = get(SDAT_METADATA, {}).get('rowsUpdatedAt')
results['maryland'] = {
    'checkedAt': checked, 'sales': sum(1 for row in rows if row['parcel'] in md_homes), 'after': md_after,
    'source': 'Maryland SDAT/MDP real property assessments (public domain), private arms-length improved transfers of homes in this snapshot'
              + (f'; source last updated {time.strftime("%Y-%m-%d", time.gmtime(updated))}' if updated else ''),
    'query': f'{SDAT} most recent transfer after {md_after}; parcel only',
}
(md_dir / 'freshness.json').write_text(json.dumps(results['maryland'], indent=2) + '\n', encoding='utf-8')
print(json.dumps(results, indent=2))
