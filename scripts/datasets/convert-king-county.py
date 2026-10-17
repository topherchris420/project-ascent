"""Convert the CC0 King County 2014-2015 sales parquet into Ascent's compact validation CSV.

Reproduce with:
  curl -L -o kc.parquet https://huggingface.co/datasets/kraina/house_sales_in_king_county/resolve/main/data/house_sales_king_county.parquet
  python3 -I scripts/datasets/convert-king-county.py kc.parquet evidence/datasets/king-county-2014-2015.csv.gz

Every row is kept; no price-based filtering happens here. Input-quality screening is a pre-registered
step of the validation protocol (src/lib/valuation-validation.ts) so its counts appear in the report.
The gzip header carries no file name or timestamp, so the output bytes are reproducible.
"""

import gzip
import hashlib
import io
import sys

import pandas as pd

source, target = sys.argv[1], sys.argv[2]
upstream = hashlib.sha256(open(source, 'rb').read()).hexdigest()
frame = pd.read_parquet(source)
frame['sold_on'] = frame['date'].str.slice(0, 4) + '-' + frame['date'].str.slice(4, 6) + '-' + frame['date'].str.slice(6, 8)
frame = frame.sort_values(['sold_on', 'id']).reset_index(drop=True)
lines = ['sale_id,parcel_id,sold_on,price,beds,baths,sqft,condition,lat,lng,zip']
for row in frame.itertuples(index=False):
    lines.append(
        ','.join(
            [
                f'kc-{row.id}-{row.sold_on}',
                str(row.id),
                row.sold_on,
                str(int(round(row.price))),
                str(int(row.bedrooms)),
                f'{row.bathrooms:g}',
                str(int(row.sqft_living)),
                str(int(row.condition)),
                f'{row.lat:.4f}',
                f'{row.long:.3f}',
                str(int(row.zipcode)),
            ]
        )
    )
text = ('\n'.join(lines) + '\n').encode('utf-8')
buffer = io.BytesIO()
with gzip.GzipFile(filename='', mode='wb', fileobj=buffer, mtime=0, compresslevel=9) as handle:
    handle.write(text)
open(target, 'wb').write(buffer.getvalue())
print(f'upstream parquet sha256 {upstream}')
print(f'csv sha256 {hashlib.sha256(text).hexdigest()} rows {len(lines) - 1}')
print(f'gzip sha256 {hashlib.sha256(buffer.getvalue()).hexdigest()} bytes {len(buffer.getvalue())}')
