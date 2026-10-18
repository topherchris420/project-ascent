/** Run once before the first Maryland scoring; existing registrations are never overwritten. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { marylandProtocol, protocolDigest } from '../src/lib/valuation-validation';
const path = 'evidence/maryland-protocol-registration.json';
const digest = protocolDigest(marylandProtocol);
if (existsSync(path)) {
  const previous = JSON.parse(readFileSync(path, 'utf8'));
  if (previous.protocolDigest !== digest) throw new Error('The registered Maryland protocol changed.');
} else {
  if (existsSync('evidence/valuation-validation-maryland.json')) throw new Error('Cannot preregister an already scored holdout.');
  writeFileSync(path, `${JSON.stringify({ protocol: marylandProtocol, protocolDigest: digest,
    registeredAt: new Date().toISOString(),
    statement: 'Dataset frozen and protocol committed before the first Maryland valuation run. DC acceptance thresholds, fitting method, selection grid and bootstrap are unchanged. Missing rooms are omitted; windows allow for recording lag. No holdout outcome used for model or protocol choices.' }, null, 2)}\n`);
}
console.log(`Registered ${digest}`);
