/**
 * Registers the external Maryland test before its data exists. Refuses once the dataset, a data lock or a
 * report is present; afterwards it only confirms that nothing registered has changed.
 *
 *   npx tsx scripts/register-maryland-external.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { supplementPlan } from '../src/lib/valuation-supplement';
import {
  digestOf,
  marylandExternalProtocol,
  PENDING_DATA_LOCK,
  protocolDigest,
  registrationTemplate,
} from '../src/lib/valuation-validation';
import { ANALYSIS, EXTERNAL, textDigest } from './maryland-external';

const template = registrationTemplate(marylandExternalProtocol);
if (existsSync(EXTERNAL.registration)) {
  const registered = JSON.parse(readFileSync(EXTERNAL.registration, 'utf8'));
  const unchanged =
    registered.protocolDigest === protocolDigest(template) &&
    registered.supplementDigest === digestOf(supplementPlan) &&
    EXTERNAL.procedure.every(path => registered.procedure.files[path] === textDigest(path));
  if (!unchanged) throw new Error('The registered protocol, supplement plan or fetch procedure has changed.');
  console.log(`Registered ${registered.registeredAt}: ${registered.protocolDigest}`);
} else {
  for (const path of [EXTERNAL.dataset, EXTERNAL.lock, EXTERNAL.report])
    if (existsSync(path)) throw new Error(`${path} exists; registration must come before the data.`);
  if (marylandExternalProtocol.dataset.csvSha256 !== PENDING_DATA_LOCK)
    throw new Error('The protocol already names a dataset fingerprint.');
  const registration = {
    protocol: template,
    protocolDigest: protocolDigest(template),
    supplement: supplementPlan,
    supplementDigest: digestOf(supplementPlan),
    procedure: {
      steps: [
        'Commit and push this registration.',
        'python -I scripts/datasets/fetch-maryland-external.py',
        'npx tsx scripts/lock-maryland-external.ts, then set the protocol’s csvSha256 to the locked fingerprint and commit both before any valuation.',
        'npm run validate:valuation -- --market maryland-external',
        'npx tsx scripts/maryland-external-supplement.ts',
        'Publish every result, including failures.',
      ],
      files: Object.fromEntries(EXTERNAL.procedure.map(path => [path, textDigest(path)])),
      fileDigestBasis: 'SHA-256 of the UTF-8 text with line endings normalized to LF',
    },
    analysis: {
      files: Object.fromEntries(ANALYSIS.map(path => [path, textDigest(path)])),
      note: 'Code that computes S1–S4. A later change does not block the run, but the results record every changed file.',
    },
    priorQueries: [
      {
        purpose:
          'Confirm that each county has records in the source. Counts of all records per jurisdiction code (every property type and transfer, no prices, dates or characteristics); no sale-level data was requested.',
        request:
          'https://opendata.maryland.gov/resource/ed4q-f8tm.json?$select=jurisdiction_code_mdp_field_jurscode as county,count(*) as n&$group=jurisdiction_code_mdp_field_jurscode&$order=jurisdiction_code_mdp_field_jurscode',
        result: { ANNE: 229245, BACO: 306537, FRED: 112759, HOWA: 112796 },
      },
    ],
    registeredAt: new Date().toISOString(),
    statement:
      'External test of the Maryland v2 method in Anne Arundel, Baltimore County, Frederick and Howard. No data for these counties is in this repository, and none had been fetched in this work apart from the record counts above. Screening, fitting, selection, interval method and all nine acceptance bars are Maryland v2’s, refitted on these counties’ own fit window; the windows repeat Maryland v1’s so the holdout covers July 2025 – June 2026. The dataset fingerprint is fixed by a data lock committed after download and before any valuation. Supplementary studies S1–S4 are fixed in the supplement plan. Every outcome will be published, including failures; a pass would describe these counties and period only, and Ascent serves no properties in them.',
  };
  writeFileSync(EXTERNAL.registration, `${JSON.stringify(registration, null, 2)}\n`);
  console.log(`Registered ${registration.protocolDigest}; supplement ${registration.supplementDigest}.`);
}
