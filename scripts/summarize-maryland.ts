/** Descriptive county slices of the frozen pooled holdout; no refitting or new acceptance decisions. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/providers/dc-public-records';
import { digestOf, ratioMetrics, type ValidationReport } from '../src/lib/valuation-validation';

const report = JSON.parse(readFileSync('evidence/valuation-validation-maryland.json', 'utf8')) as ValidationReport;
const read = (file: string) => parseCsv(gunzipSync(readFileSync(file)).toString('utf8'));
const [propertyHeader, ...properties] = read('src/datasets/maryland/maryland-properties.csv.gz');
const counties = new Map(
  properties.map(row => [row[propertyHeader.indexOf('parcel_id')], row[propertyHeader.indexOf('county')]]),
);
const [header, ...samples] = read('evidence/valuation-validation-maryland-samples.csv.gz');
const field = (row: string[], key: string) => row[header.indexOf(key)];
const results = Object.entries({ MONT: 'Montgomery', PRIN: 'Prince George’s' }).map(([code, label]) => {
  const rows = samples.filter(row => counties.get(field(row, 'parcel_id')) === code);
  const valued = rows.filter(row => field(row, 'estimate:locally-calibrated') !== '');
  const metrics = ratioMetrics(
    valued.map(row => ({ estimate: +field(row, 'estimate:locally-calibrated'), actual: +field(row, 'actual') })),
  );
  const withInterval = valued.filter(row => field(row, 'interval_low') !== '');
  const covered = withInterval.filter(
    row =>
      +field(row, 'actual') >= +field(row, 'interval_low') && +field(row, 'actual') <= +field(row, 'interval_high'),
  ).length;
  return {
    code,
    label,
    sales: rows.length,
    valued: valued.length,
    valuedShare: valued.length / rows.length,
    metrics,
    calibratedCoverage: covered / withInterval.length,
  };
});
if (results.reduce((sum, county) => sum + county.sales, 0) !== samples.length)
  throw new Error('A holdout parcel has no county.');
const body = {
  reportDigest: report.reportDigest,
  window: report.holdout.window,
  counties: results,
  basis:
    'Descriptive county slices of the pooled Maryland holdout, using the same frozen model. No county-specific fitting, selection or acceptance claim.',
};
const text = `${JSON.stringify({ ...body, digest: digestOf(body) }, null, 2)}\n`;
for (const path of ['evidence/valuation-maryland-counties.json', 'src/lib/valuation-maryland-counties.json'])
  writeFileSync(path, text);
console.log(text);
