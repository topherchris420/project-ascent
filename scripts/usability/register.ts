/**
 * Registers the Home Decision Brief comprehension protocol before any session. Refuses once results exist;
 * afterwards it only confirms the registered protocol is the one in src/lib/usability-study.ts.
 *
 *   npm run usability:register
 *
 * Commit and push the registration before recruiting: the push time is the public record that the tasks,
 * criteria, threshold and analysis were fixed first. A changed protocol needs a new id and a new registration.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { usabilityProtocol, usabilityProtocolDigest } from '../../src/lib/usability-study';
import { REGISTRATION, RESULTS_DIRECTORY } from './files';

if (existsSync(REGISTRATION)) {
  const registered = JSON.parse(readFileSync(REGISTRATION, 'utf8'));
  if (registered.protocolDigest !== usabilityProtocolDigest())
    throw new Error(
      `The protocol in src/lib/usability-study.ts no longer matches its registration (${registered.protocolDigest}). Declare a new protocol id instead of editing a registered one.`,
    );
  console.log(`Registered ${registered.registeredAt}: ${registered.protocolDigest}`);
} else {
  const studies = existsSync(RESULTS_DIRECTORY)
    ? readdirSync(RESULTS_DIRECTORY, { withFileTypes: true }).filter(entry => entry.isDirectory())
    : [];
  if (studies.length) throw new Error('Results already exist; a protocol must be registered before any session.');
  mkdirSync('evidence/usability', { recursive: true });
  const registration = {
    protocol: usabilityProtocol,
    protocolDigest: usabilityProtocolDigest(),
    registeredAt: new Date().toISOString(),
    statement:
      'Registered before any participant was recruited or any session took place. Tasks, prepared states, criteria, the 80% threshold, measures and analysis are fixed by this digest. Every result will be published, including failed criteria; interface changes made in response will be re-tested with new participants under a new study id.',
  };
  writeFileSync(REGISTRATION, `${JSON.stringify(registration, null, 2)}\n`);
  console.log(`Registered ${registration.protocolDigest}. Commit and push ${REGISTRATION} before recruiting.`);
}
