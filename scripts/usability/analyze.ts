/**
 * Analyzes one comprehension study exactly as its registered protocol says, and publishes every result.
 *
 *   npm run usability:analyze -- --results evidence/usability/<study-id>/results.json
 *
 * Refuses results gathered under another protocol digest, results without a registration, and overwriting a
 * published report. Writes evidence/usability/<study-id>/report.json and docs/usability/results-<study-id>.md.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  analyzeUsability,
  usabilityProtocolDigest,
  usabilityReportMarkdown,
  usabilityResultsSchema,
} from '../../src/lib/usability-study';
import { publishedPath, REGISTRATION, reportPath, resultsPath } from './files';

const args = process.argv.slice(2);
const at = args.indexOf('--results');
const path = at >= 0 ? args[at + 1] : undefined;
if (!path) throw new Error('Use --results evidence/usability/<study-id>/results.json');
if (!existsSync(REGISTRATION)) throw new Error('No registration: run npm run usability:register before any session.');
const registration = JSON.parse(readFileSync(REGISTRATION, 'utf8'));
if (registration.protocolDigest !== usabilityProtocolDigest())
  throw new Error('The protocol in code no longer matches its registration.');
const results = usabilityResultsSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
if (path.replace(/\\/g, '/') !== resultsPath(results.studyId))
  throw new Error(`Keep results at ${resultsPath(results.studyId)} so the published report can be found from them.`);
if (results.sessions.some(session => session.date < registration.registeredAt.slice(0, 10)))
  throw new Error('A session is dated before the protocol was registered.');
for (const target of [reportPath(results.studyId), publishedPath(results.studyId)])
  if (existsSync(target))
    throw new Error(`${target} exists. Published results are never overwritten; a retest needs a new study id.`);
const report = analyzeUsability(results);
writeFileSync(reportPath(results.studyId), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(publishedPath(results.studyId), usabilityReportMarkdown(report));
console.log(
  `${report.criteriaMet} of ${report.tasks.length} criteria met by ${report.participants.n} participants. Wrote ${reportPath(results.studyId)} and ${publishedPath(results.studyId)}.`,
);
