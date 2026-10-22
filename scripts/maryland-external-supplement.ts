/**
 * Registered supplementary studies of the external Maryland holdout (S1–S4). Uses the base run's frozen
 * primary configuration and calibration; never a new fit, selection or acceptance claim. Refuses to overwrite.
 *
 *   npx tsx scripts/maryland-external-supplement.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/providers/dc-public-records';
import { engineFingerprint } from '../src/lib/valuation-safeguards';
import {
  abstentionStudy,
  countySlices,
  studyAssessment,
  supplementPlan,
  transportStudy,
  verticalEquityStudy,
  type StudyRow,
} from '../src/lib/valuation-supplement';
import {
  applyCalibration,
  createSaleIndex,
  digestOf,
  marylandExternalProtocol,
  parseValidationCsv,
  primaryCmaResult,
  screenSales,
  verifyValidationReport,
  type ValidationProtocol,
  type ValidationReport,
} from '../src/lib/valuation-validation';
import { ANALYSIS, EXTERNAL, textDigest } from './maryland-external';

if (existsSync(EXTERNAL.supplement)) throw new Error(`Refusing to overwrite ${EXTERNAL.supplement}.`);
const registration = JSON.parse(readFileSync(EXTERNAL.registration, 'utf8'));
if (registration.supplementDigest !== digestOf(supplementPlan))
  throw new Error('The supplement plan differs from its registration.');
const changed = ANALYSIS.filter(path => registration.analysis.files[path] !== textDigest(path));
if (changed.length) console.warn(`Analysis files changed since registration (recorded in the output): ${changed}`);

const text = (path: string) => gunzipSync(readFileSync(path)).toString('utf8');
const report = JSON.parse(readFileSync(EXTERNAL.report, 'utf8')) as ValidationReport;
const samples = text(EXTERNAL.samples);
const failed = verifyValidationReport(report, samples).filter(check => !check.passed);
if (failed.length) throw new Error(`The base report does not verify: ${failed.map(check => check.label)}.`);
const shipped = JSON.parse(readFileSync('evidence/valuation-validation-maryland-v2.json', 'utf8')) as ValidationReport;
if (shipped.reportDigest !== supplementPlan.transport.reportDigest)
  throw new Error('The shipped Maryland report is not the registered one.');

const protocol: ValidationProtocol = marylandExternalProtocol;
const csv = text(EXTERNAL.dataset);
const { kept } = screenSales(parseValidationCsv(csv, protocol.omittedFeatures?.includes('conditionValue')), protocol);
const index = createSaleIndex(kept);
const primaryOf = (source: ValidationReport) =>
  source.variants.find(variant => variant.id === source.protocol.primaryVariant)!.assumptions!;
const engine = { fingerprint: engineFingerprint().fingerprint, expected: report.engine.fingerprint };
const [, ...countyRows] = parseCsv(text(EXTERNAL.counties));
const countyOf = new Map(countyRows.map(row => [row[0], row[1]]));
// The study must reproduce every published estimate, or it is not studying the model that was scored.
const [sampleHeader, ...sampleRows] = parseCsv(samples);
const column = (key: string) => sampleHeader.indexOf(key);
const published = new Map(
  sampleRows.map(row => [row[column('sale_id')], row[column(`estimate:${report.protocol.primaryVariant}`)]]),
);

const within = (day: string, window: { from: string; to: string }) => day >= window.from && day <= window.to;
const test = kept.filter(sale => within(sale.soldOn, protocol.windows.test));
if (test.length !== published.size) throw new Error('The holdout differs from the published samples.');
const rows: StudyRow[] = [];
const transported: { estimate: number | null; actual: number; interval: { low: number; high: number } | null }[] = [];
const lines = [
  'sale_id,county,actual,estimate,comps,verdict,review,interval_low,interval_high,transport_estimate,transport_low,transport_high',
];
test.forEach((sale, i) => {
  if (i % 500 === 0) process.stderr.write(`\rholdout ${i}/${test.length}        `);
  const result = primaryCmaResult(sale, index, primaryOf(report), protocol);
  if (String(result?.estimate ?? '') !== published.get(sale.saleId))
    throw new Error(`Sale ${sale.saleId} does not reproduce its published estimate.`);
  const county = countyOf.get(sale.parcelId);
  if (!county) throw new Error(`Sale ${sale.saleId} has no county.`);
  const assessed = result ? studyAssessment(result, engine) : null;
  const row: StudyRow = {
    saleId: sale.saleId,
    county,
    actual: sale.price,
    estimate: result?.estimate ?? null,
    comps: result?.comps.length ?? 0,
    verdict: assessed?.verdict ?? null,
    review: assessed?.review ?? [],
    interval: result ? applyCalibration(result.estimate, result.comps.length, report.calibration) : null,
  };
  rows.push(row);
  const moved = primaryCmaResult(sale, index, primaryOf(shipped), protocol);
  const carried = {
    estimate: moved?.estimate ?? null,
    actual: sale.price,
    interval: moved ? applyCalibration(moved.estimate, moved.comps.length, shipped.calibration) : null,
  };
  transported.push(carried);
  lines.push(
    [
      row.saleId,
      row.county,
      row.actual,
      row.estimate ?? '',
      row.comps,
      row.verdict ?? '',
      row.review.join(';'),
      row.interval?.low ?? '',
      row.interval?.high ?? '',
      carried.estimate ?? '',
      carried.interval?.low ?? '',
      carried.interval?.high ?? '',
    ].join(','),
  );
});
process.stderr.write('\n');
const calibration = kept
  .filter(sale => within(sale.soldOn, protocol.windows.calibrate))
  .flatMap(sale => {
    const result = primaryCmaResult(sale, index, primaryOf(report), protocol);
    return result ? [{ estimate: result.estimate, actual: sale.price }] : [];
  });
const sampleText = `${lines.join('\n')}\n`;
const body = {
  plan: supplementPlan.id,
  planDigest: digestOf(supplementPlan),
  baseReportDigest: report.reportDigest,
  shippedReportDigest: shipped.reportDigest,
  engine,
  analysisFiles: Object.fromEntries(ANALYSIS.map(path => [path, textDigest(path)])),
  analysisChangedSinceRegistration: changed,
  abstention: abstentionStudy(rows),
  verticalEquity: verticalEquityStudy(
    rows.filter(row => row.estimate !== null).map(row => ({ estimate: row.estimate!, actual: row.actual })),
    calibration,
  ),
  counties: countySlices(rows),
  transport: transportStudy(transported),
  samplesDigest: digestOf(sampleText),
};
writeFileSync(EXTERNAL.supplementSamples, gzipSync(sampleText, { level: 9 }));
writeFileSync(EXTERNAL.supplement, `${JSON.stringify({ ...body, digest: digestOf(body) }, null, 2)}\n`);
console.log(JSON.stringify(body, null, 2));
