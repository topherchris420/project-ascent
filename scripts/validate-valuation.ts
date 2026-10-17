/**
 * Out-of-sample valuation accuracy validation against recorded public sales.
 *
 *   npm run validate:valuation            run the protocol and write evidence + the in-app benchmark
 *   npm run validate:valuation -- --check verify the committed evidence without re-running (seconds)
 *   npm run validate:valuation -- --verify re-run from the dataset and require byte-identical results
 *   npm run validate:valuation -- --attest --key reviewer-ed25519.pem --reviewer "Name, Org" --statement "..."
 *
 * --attest lets an outside reviewer sign the exact report digest they reproduced with their own Ed25519 key.
 */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  attestationMessage,
  digestOf,
  runValuationValidation,
  verifyAttestation,
  verifyValidationReport,
  type ValidationAttestation,
  type ValidationReport,
} from '../src/lib/valuation-validation';
import { benchmarkFromReport } from '../src/lib/valuation-safeguards';

const DATASET = 'evidence/datasets/king-county-2014-2015.csv.gz';
const REPORT = 'evidence/valuation-validation.json';
const SAMPLES = 'evidence/valuation-validation-samples.csv.gz';
const ATTESTATIONS = 'evidence/valuation-attestations.json';
const BENCHMARK = 'src/lib/valuation-benchmark.json';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const readGzipText = (path: string) => gunzipSync(readFileSync(path)).toString('utf8');
const attestations = (): ValidationAttestation[] =>
  existsSync(ATTESTATIONS) ? JSON.parse(readFileSync(ATTESTATIONS, 'utf8')) : [];

function printChecks(checks: { label: string; passed: boolean; detail: string }[]) {
  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.label} — ${check.detail}`);
  return checks.every(check => check.passed);
}

function committedChecks() {
  const report = JSON.parse(readFileSync(REPORT, 'utf8')) as ValidationReport;
  const checks = verifyValidationReport(report, readGzipText(SAMPLES));
  const benchmark = JSON.parse(readFileSync(BENCHMARK, 'utf8'));
  checks.push({
    label: 'In-app benchmark',
    passed: digestOf(benchmark) === digestOf(benchmarkFromReport(report)),
    detail: 'The figures the app displays are derived from this exact report.',
  });
  for (const attestation of attestations()) checks.push(verifyAttestation(attestation, report.reportDigest));
  return { report, checks };
}

function run() {
  const started = Date.now();
  const { report, samples } = runValuationValidation(readGzipText(DATASET), {
    samplesFile: SAMPLES,
    onProgress: (stage, done, total) => process.stderr.write(`\r${stage} ${done}/${total}        `),
  });
  process.stderr.write('\n');
  // The JSON written to disk must round-trip to the same digest, or third parties could not verify it.
  const roundTrip = JSON.parse(JSON.stringify(report)) as ValidationReport;
  const { reportDigest: _digest, ...body } = roundTrip;
  if (digestOf(body) !== report.reportDigest) throw new Error('Report does not survive a JSON round trip.');
  return { report, samples, seconds: (Date.now() - started) / 1000 };
}

function summary(report: ValidationReport) {
  const primary = report.holdout.perVariant[report.protocol.primaryVariant];
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  console.log(
    `Holdout ${report.holdout.window.from}..${report.holdout.window.to}: ${report.holdout.screenedSales} sales`,
  );
  for (const [id, item] of Object.entries(report.holdout.perVariant))
    console.log(
      `  ${id.padEnd(22)} valued ${pct(item.valuedShare)}  MdAPE ${pct(item.metrics.mdape)} [${pct(item.mdapeCi95[0])}, ${pct(item.mdapeCi95[1])}]  PPE10 ${pct(item.metrics.ppe10)}  COD ${item.metrics.cod.toFixed(1)}  PRD ${item.metrics.prd.toFixed(3)}`,
    );
  console.log(
    `  calibrated 80% interval coverage ${pct(report.holdout.intervals.calibratedCoverage)}; observed envelope coverage ${pct(report.holdout.intervals.envelopeCoverage)}`,
  );
  for (const item of report.acceptance)
    console.log(`  ${item.passed ? 'PASS' : 'FAIL'} ${item.id} ${item.label}: ${item.value}`);
  console.log(
    `Accepted: ${report.accepted}. Primary MdAPE ${pct(primary.metrics.mdape)}. Report ${report.reportDigest}`,
  );
}

if (flag('--check')) {
  const { report, checks } = committedChecks();
  summary(report);
  if (!attestations().length) console.log('No third-party attestations are recorded yet.');
  process.exit(printChecks(checks) ? 0 : 1);
} else if (flag('--verify')) {
  const { report, samples, seconds } = run();
  const committed = committedChecks();
  const checks = [
    ...committed.checks,
    {
      label: 'Independent re-run: report',
      passed: report.reportDigest === committed.report.reportDigest,
      detail: `${report.reportDigest} after ${seconds.toFixed(0)}s.`,
    },
    {
      label: 'Independent re-run: samples',
      passed: readGzipText(SAMPLES) === samples,
      detail: 'Every per-sale estimate reproduced exactly.',
    },
  ];
  summary(report);
  process.exit(printChecks(checks) ? 0 : 1);
} else if (flag('--attest')) {
  const keyPath = option('--key');
  const reviewer = option('--reviewer');
  const statement =
    option('--statement') ?? 'I re-ran this protocol from the published dataset and reproduced this report digest.';
  if (!keyPath || !reviewer) throw new Error('--attest requires --key <ed25519-private.pem> and --reviewer <name>.');
  const { report, checks } = committedChecks();
  if (!printChecks(checks)) throw new Error('Refusing to attest a report that does not verify.');
  const privateKey = createPrivateKey(readFileSync(keyPath));
  const signedAt = new Date().toISOString();
  const unsigned = {
    reviewer,
    publicKeyPem: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
    reportDigest: report.reportDigest,
    statement,
    signedAt,
  };
  const attestation = {
    ...unsigned,
    signature: sign(null, Buffer.from(attestationMessage(unsigned)), privateKey).toString('base64'),
  };
  writeFileSync(ATTESTATIONS, `${JSON.stringify([...attestations(), attestation], null, 2)}\n`);
  console.log(`Recorded attestation by ${reviewer} for ${report.reportDigest}.`);
} else {
  const { report, samples, seconds } = run();
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(SAMPLES, gzipSync(samples, { level: 9 }));
  writeFileSync(BENCHMARK, `${JSON.stringify(benchmarkFromReport(report), null, 2)}\n`);
  if (!existsSync(ATTESTATIONS)) writeFileSync(ATTESTATIONS, '[]\n');
  summary(report);
  console.log(`Completed in ${seconds.toFixed(0)}s. Wrote ${REPORT}, ${SAMPLES} and ${BENCHMARK}.`);
}
