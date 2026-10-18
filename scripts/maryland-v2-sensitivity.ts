/** Predeclared sensitivity, not a new fit or a replacement acceptance result. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  applyCalibration,
  createSaleIndex,
  digestOf,
  marylandV2Protocol,
  parseValidationCsv,
  ratioMetrics,
  samplesCsv,
  screenSales,
  valueSale,
  type ValidationReport,
  type ValidationSale,
} from '../src/lib/valuation-validation';
import { parseCsv } from '../src/lib/providers/dc-public-records';
const report = JSON.parse(readFileSync('evidence/valuation-validation-maryland-v2.json', 'utf8')) as ValidationReport;
const csv = gunzipSync(readFileSync('evidence/datasets/maryland-sales.csv.gz')).toString('utf8');
const protocol = { ...marylandV2Protocol, screening: { ...marylandV2Protocol.screening, minPrice: 0 } };
const { kept } = screenSales(parseValidationCsv(csv), protocol);
const index = createSaleIndex(kept);
const history = new Map<string, ValidationSale[]>();
for (const sale of kept) {
  const bucket = history.get(sale.zip) ?? [];
  bucket.push(sale);
  history.set(sale.zip, bucket);
}
const primary = report.variants.find(variant => variant.id === report.protocol.primaryVariant)!;
const variants = [{ id: primary.id, label: primary.label, assumptions: primary.assumptions! }];
const rows = kept
  .filter(sale => sale.soldOn >= report.holdout.window.from && sale.soldOn <= report.holdout.window.to)
  .map(sale => {
    const row = valueSale(sale, index, variants, primary.id, history, protocol);
    const estimate = row.estimates[primary.id];
    if (estimate !== null) row.interval = applyCalibration(estimate, row.comps, report.calibration);
    return row;
  });
const valued = rows.filter(row => row.estimates[primary.id] !== null);
const text = samplesCsv(rows, [primary.id, 'baseline-median-ppsf', 'baseline-zip-median']);
const [header, ...properties] = parseCsv(
  gunzipSync(readFileSync('src/datasets/maryland/maryland-properties.csv.gz')).toString('utf8'),
);
const county = new Map(properties.map(row => [row[header.indexOf('parcel_id')], row[header.indexOf('county')]]));
const originalSamples = parseCsv(
  gunzipSync(readFileSync('evidence/valuation-validation-maryland-v2-samples.csv.gz')).toString('utf8'),
);
const sampleHeader = originalSamples.shift()!;
const at = (key: string) => sampleHeader.indexOf(key);
const counties = ['MONT', 'PRIN'].map(code => {
  const sales = originalSamples.filter(row => county.get(row[at('parcel_id')]) === code);
  const priced = sales.filter(row => row[at(`estimate:${primary.id}`)] !== '');
  return {
    code,
    sales: sales.length,
    valued: priced.length,
    metrics: ratioMetrics(
      priced.map(row => ({ estimate: +row[at(`estimate:${primary.id}`)], actual: +row[at('actual')] })),
    ),
  };
});
const body = {
  primaryReportDigest: report.reportDigest,
  basis:
    'Predeclared all-positive-consideration sensitivity. Reuse the primary fit, search and calibration unchanged; admit nominal consideration in both subjects and comparable history. No new acceptance claim or tuning. County metrics are descriptive slices of the primary, screened cohort.',
  sales: rows.length,
  valued: valued.length,
  nominalConsiderationBelow50000: rows.filter(row => row.actual < 50000).length,
  metrics: ratioMetrics(valued.map(row => ({ estimate: row.estimates[primary.id]!, actual: row.actual }))),
  coverage:
    valued.filter(row => row.interval && row.actual >= row.interval.low && row.actual <= row.interval.high).length /
    valued.length,
  counties,
  samplesDigest: digestOf(text),
};
writeFileSync('evidence/valuation-maryland-v2-sensitivity-samples.csv.gz', gzipSync(text, { level: 9 }));
writeFileSync(
  'evidence/valuation-maryland-v2-sensitivity.json',
  JSON.stringify({ ...body, digest: digestOf(body) }, null, 2) + '\n',
);
console.log(JSON.stringify(body, null, 2));
