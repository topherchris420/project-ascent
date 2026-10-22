/**
 * Signs an outside reviewer's replication record with their own Ed25519 key and adds it to evidence/replications/.
 *
 *   npx tsx scripts/replication/sign-record.ts --template > my-record.json        a blank draft to complete
 *   openssl genpkey -algorithm ed25519 -out reviewer.pem                            once, kept private
 *   npx tsx scripts/replication/sign-record.ts --draft my-record.json --assessment my-assessment.md --key reviewer.pem
 *
 * `npm run replicate` also writes a draft pre-filled with what its run observed. The tool refuses a draft that
 * still contains a REPLACE placeholder or fails verification, never overwrites an existing record, copies the
 * narrative assessment beside the record and regenerates the accuracy page's summaries. Commit all three files.
 */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  assessmentDigest,
  REPLICATION_SCHEMA,
  replicationMessage,
  verifyReplicationRecord,
  type ReplicationRecord,
} from '../../src/lib/replication';
import {
  blankDraft,
  PLACEHOLDER,
  publishedReports,
  REPLICATION_SUMMARIES,
  REPLICATIONS,
  writeSummaries,
} from './records';

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);

function main() {
  if (args.includes('--template')) {
    process.stdout.write(`${JSON.stringify(blankDraft(), null, 2)}\n`);
    return;
  }
  const draftPath = option('--draft');
  const assessmentPath = option('--assessment');
  const keyPath = option('--key');
  if (!draftPath || !assessmentPath || !keyPath)
    throw new Error(
      'Use --draft <record.json> --assessment <assessment.md> --key <ed25519-private.pem>, or --template.',
    );
  const draftText = readFileSync(draftPath, 'utf8');
  if (draftText.includes(PLACEHOLDER))
    throw new Error(`The draft still contains ${PLACEHOLDER} placeholders; complete every field first.`);
  const assessment = readFileSync(assessmentPath, 'utf8');
  if (assessment.includes(PLACEHOLDER)) throw new Error(`The assessment still contains ${PLACEHOLDER} placeholders.`);
  const privateKey = createPrivateKey(readFileSync(keyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The signing key must be an Ed25519 private key.');
  const draft = JSON.parse(draftText);
  const signedAt = new Date().toISOString();
  const name = `${signedAt.slice(0, 10)}-${slug(draft.reviewer?.name ?? 'reviewer')}`;
  const recordPath = `${REPLICATIONS}/${name}.json`;
  const assessmentFile = `${REPLICATIONS}/${name}.md`;
  if (existsSync(recordPath) || existsSync(assessmentFile))
    throw new Error(`${recordPath} already exists. Records are never overwritten; sign again tomorrow or rename.`);
  const unsigned: Omit<ReplicationRecord, 'signature'> = {
    ...draft,
    schema: REPLICATION_SCHEMA,
    reviewer: {
      ...draft.reviewer,
      publicKeyPem: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
    },
    assessment: { file: assessmentFile, sha256: assessmentDigest(assessment) },
    signedAt,
  };
  const record = {
    ...unsigned,
    signature: sign(null, Buffer.from(replicationMessage(unsigned)), privateKey).toString('base64'),
  };
  const checks = verifyReplicationRecord(record, publishedReports(), file =>
    file === assessmentFile ? assessment : null,
  );
  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'}  ${check.label} — ${check.detail}`);
  if (!checks.every(check => check.passed)) throw new Error('Refusing to write a record that does not verify.');
  mkdirSync(REPLICATIONS, { recursive: true });
  writeFileSync(assessmentFile, assessment);
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  writeSummaries();
  console.log(
    `Wrote ${recordPath}, ${assessmentFile} and ${REPLICATION_SUMMARIES}. Commit all three, then confirm with npm run validate:valuation -- --check.`,
  );
}

main();
