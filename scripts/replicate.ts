/**
 * One command for an outside replication of Ascent's published valuation studies.
 *
 *   npm run replicate                evidence checks, dataset fingerprints, exact Python re-derivation (~6 minutes)
 *   npm run replicate -- --quick     the same without the bootstrap intervals (~1 minute)
 *   npm run replicate -- --full      also re-runs every study's valuations from its dataset (~45 minutes)
 *
 * Writes replication-output/<UTC time>/ (ignored by git): summary.md, summary.json, one log per step and
 * replication-record.draft.json, pre-filled with what this run observed, for the reviewer to complete and sign
 * with scripts/replication/sign-record.ts. It reads the evidence and never modifies it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { blankDraft, publishedReports } from './replication/records';

/** `validate:valuation` market ids and the report each one reproduces. */
export const MARKET_REPORTS = {
  dc: 'evidence/valuation-validation-dc.json',
  'king-county': 'evidence/valuation-validation.json',
  maryland: 'evidence/valuation-validation-maryland.json',
  'maryland-v2': 'evidence/valuation-validation-maryland-v2.json',
  'dc-condos': 'evidence/valuation-validation-dc-condos.json',
  'maryland-external': 'evidence/valuation-validation-maryland-external.json',
} as const;

type Step = { label: string; command: string; passed: boolean; seconds: number; log: string; detail: string };
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const full = args.includes('--full');
const startedAt = new Date();
const out = join('replication-output', startedAt.toISOString().replace(/[:.]/g, '-'));
const steps: Step[] = [];

const capture = (command: string, commandArgs: string[]) => {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  return { status: result.error ? null : result.status, text: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};
const display = (command: string, commandArgs: string[]) =>
  [command === process.execPath ? 'node' : command, ...commandArgs].join(' ');

function step(label: string, log: string, command: string, commandArgs: string[], summarize: (text: string) => string) {
  process.stderr.write(`${label}…\n`);
  const started = Date.now();
  const { status, text } = capture(command, commandArgs);
  writeFileSync(join(out, log), `$ ${display(command, commandArgs)}\n\n${text}`);
  const item = {
    label,
    command: display(command, commandArgs),
    passed: status === 0,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    log,
    detail: status === null ? 'Could not start the command.' : summarize(text),
  };
  steps.push(item);
  process.stderr.write(`${item.passed ? 'PASS' : 'FAIL'}  ${label} (${item.seconds}s)\n`);
  return item;
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = `${directory}/${name}`;
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

/**
 * Every fingerprint a provenance file declares must match a bundled CSV, byte for byte, and every bundled CSV must
 * match a declaration. A declaration lists the file beside it, or a copy elsewhere when its own directory holds none
 * (the evidence copy of a runtime-only file). A damaged copy therefore fails even though its declaration can still
 * find an intact twin.
 */
export function datasetFingerprints(roots = ['evidence/datasets', 'src/datasets']) {
  const files = roots.flatMap(filesBelow);
  const sha = new Map(
    files
      .filter(path => path.endsWith('.csv.gz'))
      .map(path => [
        path,
        createHash('sha256')
          .update(gunzipSync(readFileSync(path)))
          .digest('hex'),
      ]),
  );
  const declared = files
    .filter(path => path.endsWith('.provenance.json'))
    .flatMap(provenance =>
      Object.entries(JSON.parse(readFileSync(provenance, 'utf8')) as Record<string, unknown>)
        .filter(([key, value]) => /^(csvSha256|\w+CsvSha256)$/.test(key) && typeof value === 'string')
        .map(([key, value]) => {
          const copies = [...sha].filter(([, digest]) => digest === value).map(([path]) => path);
          const beside = copies.filter(path => dirname(path) === dirname(provenance));
          return { provenance, key, sha256: value as string, matches: beside.length ? beside : copies };
        }),
    );
  const unmatchedFiles = [...sha.keys()].filter(path => !declared.some(item => item.matches.includes(path)));
  return {
    declared,
    unmatchedFiles,
    passed: declared.every(item => item.matches.length > 0) && unmatchedFiles.length === 0,
  };
}

/**
 * The signable draft for one run. A run on a working tree with uncommitted changes describes no published commit,
 * so nothing it observed is pre-filled: the commit stays a placeholder the signer refuses, and every outcome stays
 * not attempted until the reviewer re-runs from a clean checkout or completes them deliberately.
 */
export function replicationDraft(run: {
  commit: string | null;
  uncommittedChanges: number;
  environment: string;
  date: string;
  quick: boolean;
  rederived: { reports: { reportDigest: string; passed: boolean }[] } | null;
  reruns: Map<string, boolean>;
}) {
  const clean = run.uncommittedChanges === 0;
  const draft = blankDraft(clean ? (run.commit ?? undefined) : undefined);
  draft.environment = run.environment;
  for (const study of draft.studies) {
    if (!clean) {
      study.notes = `Not pre-filled: the run had ${run.uncommittedChanges} uncommitted change(s), so its results describe no published commit.`;
      continue;
    }
    const derivation = run.rederived?.reports.find(report => report.reportDigest === study.reportDigest);
    study.rederive = !derivation || run.quick ? 'not-attempted' : derivation.passed ? 'reproduced' : 'differs';
    const rerun = run.reruns.get(study.reportDigest);
    study.rerun = rerun === undefined ? 'not-attempted' : rerun ? 'reproduced' : 'differs';
    study.notes = [
      derivation &&
        `scripts/replication/rederive.py ${run.quick ? 'matched the point figures with the bootstrap skipped' : derivation.passed ? 'matched every figure, bootstrap included' : 'found differences'} on ${run.date}.`,
      rerun !== undefined &&
        `validate:valuation --verify ${rerun ? 'reproduced the report and every per-sale estimate' : 'did not reproduce the report'}.`,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return draft;
}

const lastLine = (text: string, pattern: RegExp) =>
  text
    .split('\n')
    .filter(line => pattern.test(line))
    .at(-1)
    ?.trim() ?? '';

function main() {
  mkdirSync(out, { recursive: true });
  const python = ['python3', 'python'].find(candidate => /Python 3\./.test(capture(candidate, ['--version']).text));
  const commit = capture('git', ['rev-parse', 'HEAD']).text.trim();
  const dirty = capture('git', ['status', '--porcelain']).text.trim();
  const environment = {
    startedAt: startedAt.toISOString(),
    commit: /^[0-9a-f]{40}$/.test(commit) ? commit : null,
    uncommittedChanges: dirty ? dirty.split('\n').length : 0,
    node: process.version,
    python: python ? capture(python, ['--version']).text.trim() : null,
    os: `${platform()} ${release()} ${arch()}`,
    cpu: `${cpus()[0]?.model ?? 'unknown'} × ${cpus().length}`,
    memoryGb: Math.round(totalmem() / 1e9),
    lockfileSha256: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
  };

  process.stderr.write('Dataset fingerprints…\n');
  const datasets = datasetFingerprints();
  steps.push({
    label: 'Dataset fingerprints',
    command: 'SHA-256 of every decompressed bundled CSV against its provenance file',
    passed: datasets.passed,
    seconds: 0,
    log: 'datasets.json',
    detail: `${datasets.declared.filter(item => item.matches.length).length} of ${datasets.declared.length} declared fingerprints match a bundled file; ${
      datasets.unmatchedFiles.length
        ? `${datasets.unmatchedFiles.length} bundled CSV(s) match no declaration: ${datasets.unmatchedFiles.join(', ')}.`
        : 'every bundled CSV matches one.'
    }`,
  });
  writeFileSync(join(out, 'datasets.json'), `${JSON.stringify(datasets, null, 2)}\n`);

  step(
    'Committed evidence checks',
    'validate-check.log',
    process.execPath,
    ['--import', 'tsx', 'scripts/validate-valuation.ts', '--check'],
    text => `${(text.match(/^PASS /gm) ?? []).length} checks passed, ${(text.match(/^FAIL /gm) ?? []).length} failed.`,
  );

  const rederiveJson = join(out, 'rederive.json');
  let rederived: { passed: boolean; reports: { reportDigest: string; passed: boolean }[] } | null = null;
  if (python) {
    step(
      quick ? 'Independent re-derivation (bootstrap skipped)' : 'Independent re-derivation with the exact bootstrap',
      'rederive.log',
      python,
      ['-I', 'scripts/replication/rederive.py', '--json', rederiveJson, ...(quick ? ['--quick'] : [])],
      text => lastLine(text, /reports re-derived/),
    );
    if (existsSync(rederiveJson)) rederived = JSON.parse(readFileSync(rederiveJson, 'utf8'));
  } else
    steps.push({
      label: 'Independent re-derivation',
      command: 'python3 -I scripts/replication/rederive.py',
      passed: false,
      seconds: 0,
      log: '',
      detail: 'Python 3 was not found; install it to run the independent re-derivation.',
    });

  const reruns = new Map<string, boolean>();
  if (full)
    for (const [market, reportPath] of Object.entries(MARKET_REPORTS)) {
      const item = step(
        `Re-run ${market} from its dataset`,
        `verify-${market}.log`,
        process.execPath,
        ['--import', 'tsx', 'scripts/validate-valuation.ts', '--verify', '--market', market],
        text => lastLine(text, /Independent re-run: report/) || 'See the log.',
      );
      reruns.set(JSON.parse(readFileSync(reportPath, 'utf8')).reportDigest, item.passed);
    }

  const draft = replicationDraft({
    commit: environment.commit,
    uncommittedChanges: environment.uncommittedChanges,
    environment: `${environment.os}; ${environment.cpu}; ${environment.memoryGb} GB; Node ${environment.node}; ${environment.python ?? 'no Python'}`,
    date: environment.startedAt.slice(0, 10),
    quick,
    rederived,
    reruns,
  });
  writeFileSync(join(out, 'replication-record.draft.json'), `${JSON.stringify(draft, null, 2)}\n`);

  const passed = steps.every(item => item.passed);
  const summary = {
    tool: 'scripts/replicate.ts',
    mode: full ? 'full' : quick ? 'quick' : 'standard',
    passed,
    environment,
    steps,
    reports: publishedReports(),
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const markdown = [
    `# Ascent replication run · ${environment.startedAt}`,
    '',
    `Mode: **${summary.mode}**. Commit \`${environment.commit ?? 'unknown'}\`${environment.uncommittedChanges ? ` with ${environment.uncommittedChanges} uncommitted change(s): results do not describe a published commit` : ''}.`,
    `Environment: ${draft.environment}.`,
    '',
    '| Step | Result | Detail | Seconds | Log |',
    '| --- | --- | --- | ---: | --- |',
    ...steps.map(
      item =>
        `| ${item.label} | ${item.passed ? 'PASS' : '**FAIL**'} | ${item.detail} | ${item.seconds} | ${item.log} |`,
    ),
    '',
    '## Studies',
    '',
    '| Protocol | Report digest | Re-derived | Re-run |',
    '| --- | --- | --- | --- |',
    ...draft.studies.map(
      study => `| ${study.protocolId} | \`${study.reportDigest.slice(0, 23)}…\` | ${study.rederive} | ${study.rerun} |`,
    ),
    '',
    '## What this run does not establish',
    '',
    '- The re-derivation and the evidence checks were written by Ascent’s maintainers. Audit them or reimplement the method (docs/replication/method-specification.md).',
    '- A byte-for-byte re-run (`--full`) shows the engine is deterministic, not that the method is sound. The methodology assessment is yours.',
    '',
    '## Next',
    '',
    ...(environment.uncommittedChanges
      ? [
          'This working tree had uncommitted changes (untracked files count), so the draft pre-fills neither the commit nor any outcome. Re-run from a clean checkout of the commit you are reviewing before you sign.',
          '',
        ]
      : []),
    '1. Complete `replication-record.draft.json`: every REPLACE field, the rubric ratings and your conclusion.',
    '2. Write your narrative assessment in Markdown, including disagreements and anything you could not reproduce.',
    '3. `npx tsx scripts/replication/sign-record.ts --draft <draft> --assessment <assessment.md> --key <your-ed25519.pem>`',
    '4. Open a pull request with the three files it writes. See docs/independent-replication.md.',
    '',
  ].join('\n');
  writeFileSync(join(out, 'summary.md'), markdown);
  console.log(markdown);
  console.log(`Wrote ${out}/`);
  process.exit(passed ? 0 : 1);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/replicate.ts')) main();
