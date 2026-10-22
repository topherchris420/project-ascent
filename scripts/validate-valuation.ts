/**
 * Out-of-sample valuation accuracy validation against recorded public sales.
 *
 *   npm run validate:valuation -- --market dc          run a market's protocol and write its evidence + in-app benchmark
 *   npm run validate:valuation -- --check              verify all committed evidence without re-running (seconds)
 *   npm run validate:valuation -- --verify --market dc re-run from the dataset and require byte-identical results
 *   npm run validate:valuation -- --attest --market dc --key reviewer-ed25519.pem --reviewer "Name, Org"
 *
 * Markets: dc, king-county, maryland, maryland-v2, dc-condos and maryland-external (registered before its data was
 * downloaded; see scripts/register-maryland-external.ts). Without --market, every market is used.
 * --attest lets an outside reviewer sign the exact report digest they reproduced with their own Ed25519 key.
 */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  attestationMessage,
  dcProtocol,
  digestOf,
  kingCountyProtocol,
  marylandProtocol,
  marylandV2Protocol,
  marylandExternalProtocol,
  dcCondoProtocol,
  PENDING_DATA_LOCK,
  protocolDigest,
  registrationTemplate,
  runValuationValidation,
  verifyAttestation,
  verifyValidationReport,
  type ValidationAttestation,
  type ValidationProtocol,
  type ValidationReport,
} from '../src/lib/valuation-validation';
import { benchmarkFromReport } from '../src/lib/valuation-safeguards';
import { EXTERNAL, textDigest } from './maryland-external';

type Market = {
  protocol: ValidationProtocol;
  dataset: string;
  report: string;
  samples: string;
  benchmark: string;
  /** Registered before its data existed; scoring requires the registration and a matching data lock. */
  preDownload?: { registration: string; lock: string; procedure: readonly string[] };
};
const markets: Record<string, Market> = {
  'maryland-external': {
    protocol: marylandExternalProtocol,
    dataset: EXTERNAL.dataset,
    report: EXTERNAL.report,
    samples: EXTERNAL.samples,
    benchmark: EXTERNAL.benchmark,
    preDownload: { registration: EXTERNAL.registration, lock: EXTERNAL.lock, procedure: EXTERNAL.procedure },
  },
  'maryland-v2': {
    protocol: marylandV2Protocol,
    dataset: 'evidence/datasets/maryland-sales.csv.gz',
    report: 'evidence/valuation-validation-maryland-v2.json',
    samples: 'evidence/valuation-validation-maryland-v2-samples.csv.gz',
    benchmark: 'src/lib/valuation-benchmark-maryland-v2.json',
  },
  'dc-condos': {
    protocol: dcCondoProtocol,
    dataset: 'src/datasets/dc-condos/dc-condo-sales.csv.gz',
    report: 'evidence/valuation-validation-dc-condos.json',
    samples: 'evidence/valuation-validation-dc-condos-samples.csv.gz',
    benchmark: 'src/lib/valuation-benchmark-dc-condos.json',
  },
  maryland: {
    protocol: marylandProtocol,
    dataset: 'evidence/datasets/maryland-sales.csv.gz',
    report: 'evidence/valuation-validation-maryland.json',
    samples: 'evidence/valuation-validation-maryland-samples.csv.gz',
    benchmark: 'src/lib/valuation-benchmark-maryland.json',
  },
  dc: {
    protocol: dcProtocol,
    dataset: 'evidence/datasets/dc-residential-sales.csv.gz',
    report: 'evidence/valuation-validation-dc.json',
    samples: 'evidence/valuation-validation-dc-samples.csv.gz',
    benchmark: 'src/lib/valuation-benchmark-dc.json',
  },
  'king-county': {
    protocol: kingCountyProtocol,
    dataset: 'evidence/datasets/king-county-2014-2015.csv.gz',
    report: 'evidence/valuation-validation.json',
    samples: 'evidence/valuation-validation-samples.csv.gz',
    benchmark: 'src/lib/valuation-benchmark.json',
  },
};
const ATTESTATIONS = 'evidence/valuation-attestations.json';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const requested = option('--market');
if (requested && !markets[requested])
  throw new Error(`Unknown market "${requested}". Use one of: ${Object.keys(markets).join(', ')}.`);
const selected = requested ? [requested] : Object.keys(markets);
const readGzipText = (path: string) => gunzipSync(readFileSync(path)).toString('utf8');
const attestations = (): ValidationAttestation[] =>
  existsSync(ATTESTATIONS) ? JSON.parse(readFileSync(ATTESTATIONS, 'utf8')) : [];

function printChecks(checks: { label: string; passed: boolean; detail: string }[]) {
  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.label} — ${check.detail}`);
  return checks.every(check => check.passed);
}

function committedChecks(market: Market) {
  const report = JSON.parse(readFileSync(market.report, 'utf8')) as ValidationReport;
  const checks = verifyValidationReport(report, readGzipText(market.samples));
  const benchmark = JSON.parse(readFileSync(market.benchmark, 'utf8'));
  checks.push({
    label: 'In-app benchmark',
    passed: digestOf(benchmark) === digestOf(benchmarkFromReport(report)),
    detail: 'The figures the app displays are derived from this exact report.',
  });
  // Attestations name one report digest; each is checked against the report it signed.
  for (const attestation of attestations().filter(item => item.reportDigest === report.reportDigest))
    checks.push(verifyAttestation(attestation, report.reportDigest));
  return { report, checks };
}

/** The registration fixed everything but the fingerprint before download; the data lock fixed the fingerprint. */
function registrationChecks(market: Market) {
  const { registration: registrationPath, lock: lockPath, procedure } = market.preDownload!;
  const registration = existsSync(registrationPath) ? JSON.parse(readFileSync(registrationPath, 'utf8')) : null;
  const template = protocolDigest(registrationTemplate(market.protocol));
  const checks = [
    {
      label: 'Pre-download registration',
      passed: registration?.protocolDigest === template,
      detail: registration
        ? `Registered ${registration.registeredAt}; everything but the dataset fingerprint is ${template}.`
        : `${registrationPath} is missing.`,
    },
    {
      label: 'Registered fetch procedure',
      passed: !!registration && procedure.every(path => registration.procedure.files[path] === textDigest(path)),
      detail: procedure.join(', '),
    },
  ];
  if (market.protocol.dataset.csvSha256 === PENDING_DATA_LOCK)
    checks.push({
      label: 'Data lock',
      passed: !existsSync(market.report),
      detail: 'No dataset is locked yet, so nothing can have been scored.',
    });
  else {
    const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;
    checks.push({
      label: 'Data lock',
      passed: lock?.csvSha256 === market.protocol.dataset.csvSha256 && lock?.registrationProtocolDigest === template,
      detail: lock
        ? `Dataset ${lock.csvSha256} locked ${lock.lockedAt}, after registration commit ${lock.registrationCommit.slice(0, 12)}.`
        : `${lockPath} is missing.`,
    });
  }
  return checks;
}

function run(market: Market) {
  const started = Date.now();
  const { report, samples } = runValuationValidation(readGzipText(market.dataset), {
    protocol: market.protocol,
    samplesFile: market.samples,
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
    `${report.protocol.id} holdout ${report.holdout.window.from}..${report.holdout.window.to}: ${report.holdout.screenedSales} sales`,
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

let ok = true;
if (flag('--attest')) {
  const keyPath = option('--key');
  const reviewer = option('--reviewer');
  const statement =
    option('--statement') ?? 'I re-ran this protocol from the published dataset and reproduced this report digest.';
  if (!requested || !keyPath || !reviewer)
    throw new Error('--attest requires --market <id>, --key <ed25519-private.pem> and --reviewer <name>.');
  const { report, checks } = committedChecks(markets[requested]);
  if (!printChecks(checks)) throw new Error('Refusing to attest a report that does not verify.');
  const privateKey = createPrivateKey(readFileSync(keyPath));
  const unsigned = {
    reviewer,
    publicKeyPem: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
    reportDigest: report.reportDigest,
    statement,
    signedAt: new Date().toISOString(),
  };
  const attestation = {
    ...unsigned,
    signature: sign(null, Buffer.from(attestationMessage(unsigned)), privateKey).toString('base64'),
  };
  writeFileSync(ATTESTATIONS, `${JSON.stringify([...attestations(), attestation], null, 2)}\n`);
  console.log(`Recorded attestation by ${reviewer} for ${report.reportDigest}.`);
} else
  for (const id of selected) {
    const market = markets[id];
    const registered = market.preDownload ? registrationChecks(market) : [];
    if (flag('--check')) {
      if (market.preDownload && !existsSync(market.report)) {
        console.log(`${market.protocol.id}: registered, not yet scored.`);
        ok = printChecks(registered) && ok;
        continue;
      }
      const { report, checks } = committedChecks(market);
      summary(report);
      if (!checks.some(check => check.label.startsWith('Attestation')))
        console.log('No third-party attestations are recorded for this report yet.');
      ok = printChecks([...registered, ...checks]) && ok;
    } else if (flag('--verify')) {
      const { report, samples, seconds } = run(market);
      const committed = committedChecks(market);
      summary(report);
      ok =
        printChecks([
          ...registered,
          ...committed.checks,
          {
            label: 'Independent re-run: report',
            passed: report.reportDigest === committed.report.reportDigest,
            detail: `${report.reportDigest} after ${seconds.toFixed(0)}s.`,
          },
          {
            label: 'Independent re-run: samples',
            passed: readGzipText(market.samples) === samples,
            detail: 'Every per-sale estimate reproduced exactly.',
          },
        ]) && ok;
    } else {
      if (existsSync(market.report))
        throw new Error(
          `Refusing to overwrite ${market.report}. Use --verify to reproduce a published experiment; declare a new protocol and holdout for revisions.`,
        );
      if (market.preDownload && !printChecks(registered))
        throw new Error('Scoring requires the pre-download registration and a matching data lock.');
      if (['maryland-v2', 'dc-condos'].includes(id)) {
        const registration = JSON.parse(readFileSync(`evidence/${id}-protocol-registration.json`, 'utf8'));
        if (registration.protocolDigest !== digestOf(market.protocol))
          throw new Error('Protocol does not match its pre-scoring registration.');
      }
      const { report, samples, seconds } = run(market);
      writeFileSync(market.report, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(market.samples, gzipSync(samples, { level: 9 }));
      writeFileSync(market.benchmark, `${JSON.stringify(benchmarkFromReport(report), null, 2)}\n`);
      if (!existsSync(ATTESTATIONS)) writeFileSync(ATTESTATIONS, '[]\n');
      summary(report);
      console.log(
        `Completed in ${seconds.toFixed(0)}s. Wrote ${market.report}, ${market.samples} and ${market.benchmark}.`,
      );
    }
  }
process.exit(ok ? 0 : 1);
