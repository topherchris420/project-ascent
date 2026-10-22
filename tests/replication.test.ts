import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  assessmentDigest,
  REPLICATION_SCHEMA,
  replicationMessage,
  replicationRubric,
  replicationSummary,
  reproductionSummary,
  verifyReplicationRecord,
  type ReplicationRecord,
} from '../src/lib/replication';
import { bootstrapIndices, type ValidationReport } from '../src/lib/valuation-validation';
import { blankDraft, PLACEHOLDER, publishedReports, replicationChecks } from '../scripts/replication/records';
import { datasetFingerprints, MARKET_REPORTS, replicationDraft } from '../scripts/replicate';

const dc = JSON.parse(readFileSync('evidence/valuation-validation-dc.json', 'utf8')) as ValidationReport;
const condos = JSON.parse(readFileSync('evidence/valuation-validation-dc-condos.json', 'utf8')) as ValidationReport;
const published = publishedReports();
const assessment = '# Assessment\n\nReproduced both reports; the interval method assumes exchangeable sales.\n';
const file = 'evidence/replications/2026-11-01-example-reviewer.md';
const read =
  (text = assessment) =>
  (path: string) =>
    path === file ? text : null;

/** A record signed by `key` and naming `publicKeyPem`; by default a fresh Ed25519 key signs and is named. */
function signed(
  edit: (record: Omit<ReplicationRecord, 'signature'>) => void = () => undefined,
  key?: KeyObject,
  publicKeyPem?: string,
): ReplicationRecord {
  const pair = generateKeyPairSync('ed25519');
  const signer = key ?? pair.privateKey;
  const unsigned: Omit<ReplicationRecord, 'signature'> = {
    schema: REPLICATION_SCHEMA,
    reviewer: {
      name: 'Example Reviewer',
      affiliation: 'Example University',
      publicKeyPem: publicKeyPem ?? pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      keyPublishedAt: 'https://example.org/keys/reviewer.pem',
    },
    independence: {
      statement: 'No relationship with the maintainers; I chose what to examine.',
      conflicts: 'None',
      compensation: 'Unpaid',
    },
    commit: '22aee33a53d4e1d8a9c50cb0b3f9e4e8a1b2c3d4',
    environment: 'Linux, Node 24, Python 3.12',
    studies: [dc, condos].map(report => ({
      protocolId: report.protocol.id,
      reportDigest: report.reportDigest,
      rederive: 'reproduced' as const,
      rerun: 'reproduced' as const,
      reimplement: 'not-attempted' as const,
      refetch: 'not-attempted' as const,
      notes: '',
    })),
    findings: replicationRubric.map(item => ({
      area: item.id,
      rating: item.id === 'uncertainty' ? ('minor' as const) : ('no-concern' as const),
      summary: item.id === 'uncertainty' ? 'Building-level correlation is not modeled.' : 'No concern.',
    })),
    conclusion: {
      reproduction: 'all',
      methodology: 'sound-with-reservations',
      statement: 'Both reports reproduced exactly; condo intervals may be too narrow.',
    },
    assessment: { file, sha256: assessmentDigest(assessment) },
    signedAt: '2026-11-01T12:00:00.000Z',
  };
  edit(unsigned);
  return { ...unsigned, signature: sign(null, Buffer.from(replicationMessage(unsigned)), signer).toString('base64') };
}
const valid = signed;
const failing = (record: unknown, text?: string) =>
  verifyReplicationRecord(record, published, read(text))
    .filter(check => !check.passed)
    .map(check => check.label.replace(/^Replication by [^:]+: /, ''));

test('a complete signed replication record verifies, and its summary keeps every concern', () => {
  const record = valid();
  assert.deepEqual(failing(record), []);
  const summary = replicationSummary(record);
  assert.equal(summary.reproduction, 'all');
  assert.equal(summary.methodology, 'sound-with-reservations');
  assert.deepEqual(summary.concerns, { minor: 1, major: 0, critical: 0 });
  assert.deepEqual(
    summary.studies.map(study => study.reproduced),
    [true, true],
  );
});

test('any edit after signing, or a key the reviewer does not hold, breaks the signature', () => {
  const record = valid();
  assert.deepEqual(failing({ ...record, conclusion: { ...record.conclusion, methodology: 'sound' } }), ['signature']);
  const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.deepEqual(failing(signed(undefined, generateKeyPairSync('ed25519').privateKey, other)), ['signature']);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ecdsa = signed(undefined, privateKey, publicKey.export({ type: 'spki', format: 'pem' }).toString());
  assert.deepEqual(failing(ecdsa), ['signature']);
  assert.match(
    verifyReplicationRecord(ecdsa, published, read()).find(check => !check.passed)!.detail,
    /not an Ed25519 key/,
  );
});

test('a conclusion must agree with its own study results', () => {
  const record = valid(draft => {
    draft.studies[1].rederive = 'differs';
  });
  assert.deepEqual(failing(record), ['conclusion']);
  assert.equal(reproductionSummary(record.studies), 'some');
  const honest = valid(draft => {
    draft.studies[1].rederive = 'differs';
    draft.conclusion.reproduction = 'some';
  });
  assert.deepEqual(failing(honest), []);
  assert.equal(replicationSummary(honest).studies[1].reproduced, false);
  const untried = valid(draft => {
    for (const study of draft.studies) study.rederive = study.rerun = 'not-attempted';
    draft.conclusion.reproduction = 'none';
  });
  assert.deepEqual(failing(untried), []);
});

test('records name only published reports, answer the whole rubric and carry their exact assessment', () => {
  assert.deepEqual(
    failing(
      valid(draft => {
        draft.studies[0].reportDigest = `sha256-${'0'.repeat(64)}`;
      }),
    ),
    ['studies'],
  );
  assert.deepEqual(
    failing(
      valid(draft => {
        draft.studies[0].protocolId = condos.protocol.id;
      }),
    ),
    ['studies'],
  );
  assert.deepEqual(
    failing(
      valid(draft => {
        draft.findings[1] = { ...draft.findings[0] };
      }),
    ),
    ['rubric'],
  );
  assert.deepEqual(failing(valid(), `${assessment}Edited after signing.\n`), ['assessment']);
  assert.deepEqual(failing(valid(), assessment.replace(/\n/g, '\r\n')), []);
  assert.deepEqual(
    failing(
      valid(draft => {
        draft.findings.pop();
      }),
    ),
    ['format'],
  );
  assert.deepEqual(failing({ ...valid(), extra: true }), ['format']);
});

test('the committed replication summaries are exactly the verified records, and drafts cannot be signed unfinished', () => {
  const { checks } = replicationChecks();
  assert.deepEqual(
    checks.filter(check => !check.passed),
    [],
  );
  const draft = blankDraft('a'.repeat(40));
  assert.ok(JSON.stringify(draft).includes(PLACEHOLDER));
  assert.deepEqual(
    draft.findings.map(item => item.area),
    replicationRubric.map(item => item.id),
  );
  assert.ok(draft.findings.every(item => item.rating === 'not-assessed'));
  assert.deepEqual(
    draft.studies.map(study => study.reportDigest).sort(),
    published.map(report => report.reportDigest).sort(),
  );
  assert.equal(new Set(replicationRubric.map(item => item.id)).size, replicationRubric.length);
});

test('the replication runner re-runs every published report and nothing else', () => {
  const digests = Object.values(MARKET_REPORTS).map(
    path => (JSON.parse(readFileSync(path, 'utf8')) as ValidationReport).reportDigest,
  );
  assert.deepEqual(digests.sort(), published.map(report => report.reportDigest).sort());
});

test('a run on a modified working tree pre-fills nothing a reviewer could sign', () => {
  const run = {
    commit: 'a'.repeat(40),
    environment: 'test machine',
    date: '2026-11-01',
    quick: false,
    rederived: { reports: published.map(report => ({ reportDigest: report.reportDigest, passed: true })) },
    reruns: new Map<string, boolean>(),
  };
  const clean = replicationDraft({ ...run, uncommittedChanges: 0 });
  assert.equal(clean.commit, run.commit);
  assert.ok(clean.studies.every(study => study.rederive === 'reproduced' && study.rerun === 'not-attempted'));
  const dirty = replicationDraft({ ...run, uncommittedChanges: 2 });
  assert.match(dirty.commit, new RegExp(`^${PLACEHOLDER}`));
  assert.ok(dirty.studies.every(study => study.rederive === 'not-attempted' && study.rerun === 'not-attempted'));
  assert.ok(dirty.studies.every(study => /2 uncommitted change/.test(study.notes)));
});

test('a damaged copy of a bundled CSV fails the fingerprint step even when its twin is intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'ascent-fingerprints-'));
  const put = (path: string, text: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), path.endsWith('.gz') ? gzipSync(text) : text);
  };
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  try {
    put('runtime/sales.csv.gz', 'id,price\n1,100\n');
    put('runtime/sales.provenance.json', JSON.stringify({ csvSha256: sha('id,price\n1,100\n') }));
    put('evidence/sales.csv.gz', 'id,price\n1,100\n');
    // The evidence provenance also declares a runtime-only file, which it may find in another directory.
    put('runtime/homes.csv.gz', 'id\n1\n');
    put(
      'evidence/sales.provenance.json',
      JSON.stringify({ csvSha256: sha('id,price\n1,100\n'), propertyCsvSha256: sha('id\n1\n') }),
    );
    const roots = [join(root, 'evidence'), join(root, 'runtime')];
    const intact = datasetFingerprints(roots);
    assert.equal(intact.passed, true);
    assert.deepEqual(intact.unmatchedFiles, []);
    put('runtime/sales.csv.gz', 'id,price\n1,999\n');
    const damaged = datasetFingerprints(roots);
    assert.equal(damaged.passed, false);
    assert.deepEqual(damaged.unmatchedFiles, [join(root, 'runtime/sales.csv.gz')]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const python = ['python3', 'python'].find(command =>
  /Python 3\./.test(`${spawnSync(command, ['--version'], { encoding: 'utf8' }).stdout ?? ''}`),
);
test('the independent Python re-derivation agrees with every published report', { skip: !python }, () => {
  for (const [seed, n, draws] of [
    [20261017, 7, 3],
    [20261118, 1, 2],
    [123, 50, 1],
  ]) {
    const run = spawnSync(python!, ['-I', 'scripts/replication/rederive.py', '--prng', `${seed}`, `${n}`, `${draws}`], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(
      JSON.parse(run.stdout),
      bootstrapIndices(n, draws, seed).map(draw => Array.from(draw)),
    );
  }
  const quick = spawnSync(python!, ['-I', 'scripts/replication/rederive.py', '--quick'], { encoding: 'utf8' });
  assert.equal(quick.status, 0, `${quick.stdout}\n${quick.stderr}`);
  assert.match(quick.stdout, new RegExp(`All ${published.length} reports re-derived and matched`));
  assert.doesNotMatch(quick.stdout, /^ {2}FAIL/m);
});

test('the replication brief asks exactly the rubric questions the records answer', () => {
  const brief = readFileSync('docs/independent-replication.md', 'utf8');
  for (const item of replicationRubric) {
    assert.ok(brief.includes(`| ${item.title} | ${item.question} |`), `${item.id} is missing from the brief`);
  }
  for (const report of published) assert.ok(brief.includes(report.protocolId), `${report.protocolId} is not listed`);
});
