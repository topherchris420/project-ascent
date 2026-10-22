/**
 * Locks the external Maryland dataset after download and before any valuation: records its fingerprints,
 * row counts and per-window sale counts (never prices or outcomes) against the registration commit.
 *
 *   npx tsx scripts/lock-maryland-external.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { supplementPlan } from '../src/lib/valuation-supplement';
import {
  digestOf,
  marylandExternalProtocol,
  PENDING_DATA_LOCK,
  protocolDigest,
  registrationTemplate,
} from '../src/lib/valuation-validation';
import { EXTERNAL, textDigest } from './maryland-external';

for (const path of [EXTERNAL.lock, EXTERNAL.report])
  if (existsSync(path)) throw new Error(`${path} exists; a dataset is locked once, before scoring.`);
if (marylandExternalProtocol.dataset.csvSha256 !== PENDING_DATA_LOCK)
  throw new Error('The protocol already names a dataset fingerprint.');
const registration = JSON.parse(readFileSync(EXTERNAL.registration, 'utf8'));
if (
  registration.protocolDigest !== protocolDigest(registrationTemplate(marylandExternalProtocol)) ||
  registration.supplementDigest !== digestOf(supplementPlan) ||
  EXTERNAL.procedure.some(path => registration.procedure.files[path] !== textDigest(path))
)
  throw new Error('The registration no longer matches the protocol, supplement plan or fetch procedure.');

const git = (...args: string[]) =>
  execFileSync('git', ['-c', `safe.directory=${process.cwd().replace(/\\/g, '/')}`, ...args], {
    encoding: 'utf8',
  }).trim();
const registrationCommit = git('log', '--format=%H', '--diff-filter=A', '--', EXTERNAL.registration);
if (!/^[0-9a-f]{40}$/.test(registrationCommit)) throw new Error('Commit the registration before locking data.');

const text = (path: string) => gunzipSync(readFileSync(path)).toString('utf8');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const sales = text(EXTERNAL.dataset);
const counties = text(EXTERNAL.counties);
const provenance = JSON.parse(readFileSync(EXTERNAL.provenance, 'utf8'));
if (sha256(sales) !== provenance.csvSha256 || sha256(counties) !== provenance.parcelCountiesCsvSha256)
  throw new Error('Dataset files do not match their provenance fingerprints.');
const days = sales
  .split('\n')
  .slice(1)
  .filter(Boolean)
  .map(line => line.split(',')[2]);
const lock = {
  protocolId: marylandExternalProtocol.id,
  registrationProtocolDigest: registration.protocolDigest,
  registrationSupplementDigest: registration.supplementDigest,
  registrationCommit,
  registrationCommittedAt: git('show', '-s', '--format=%cI', registrationCommit),
  fetchedAt: provenance.fetchedAt,
  csvSha256: provenance.csvSha256,
  parcelCountiesCsvSha256: provenance.parcelCountiesCsvSha256,
  provenanceDigest: textDigest(EXTERNAL.provenance),
  rows: days.length,
  windowSales: Object.fromEntries(
    Object.entries(marylandExternalProtocol.windows).map(([name, window]) => [
      name,
      days.filter(day => day >= window.from && day <= window.to).length,
    ]),
  ),
  lockedAt: new Date().toISOString(),
  statement:
    'Locked after download and before any valuation. Only fingerprints, row counts and per-window sale counts were read; no price was summarized and no estimate was computed.',
};
writeFileSync(EXTERNAL.lock, `${JSON.stringify(lock, null, 2)}\n`);
console.log(JSON.stringify(lock, null, 2));
console.log(`Set marylandExternalProtocol.dataset.csvSha256 to '${lock.csvSha256}' and commit before scoring.`);
