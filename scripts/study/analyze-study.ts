/**
 * Pre-registered analysis for protocol ascent-preference-1.
 *   npx tsx scripts/study/analyze-study.ts <folder with participants.csv, task-results.csv, preferences.csv>
 * Writes study-report.json and study-report.md into the same folder. Exits non-zero if the inputs are invalid.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeStudy,
  parseStudyCsv,
  PRODUCTS,
  TASK_IDS,
  type Participant,
  type Preference,
  type Product,
  type TaskId,
  type TaskResult,
} from '../../src/lib/study-analysis';

const folder = process.argv[2];
if (!folder) throw new Error('Pass the folder that holds participants.csv, task-results.csv and preferences.csv.');
const read = (file: string) => parseStudyCsv(readFileSync(join(folder, file), 'utf8'));
const yes = (value: string) => /^(1|true|yes|y)$/i.test(value);
const product = (value: string): Product => {
  if (!PRODUCTS.includes(value as Product)) throw new Error(`Unknown product "${value}". Use ascent or homesolo.`);
  return value as Product;
};
const participants: Participant[] = read('participants.csv').map(row => ({
  id: row.participant_id,
  firstProduct: product(row.first_product),
  status: row.status === 'withdrawn' ? 'withdrawn' : 'completed',
  withdrawalReason: row.withdrawal_reason || undefined,
}));
const results: TaskResult[] = read('task-results.csv').map(row => {
  if (!TASK_IDS.includes(row.task as TaskId)) throw new Error(`Unknown task "${row.task}".`);
  return {
    participantId: row.participant_id,
    product: product(row.product),
    task: row.task as TaskId,
    supported: row.supported === '' ? true : yes(row.supported),
    completed: yes(row.completed),
    correct: yes(row.correct),
    seconds: row.seconds === '' ? null : Number(row.seconds),
    criticalArithmeticError: yes(row.critical_arithmetic_error),
    unauthorizedDisclosure: yes(row.unauthorized_disclosure),
    assisted: yes(row.assisted),
  };
});
const preferences: Preference[] = read('preferences.csv').map(row => ({
  participantId: row.participant_id,
  choice: row.choice === 'ascent' || row.choice === 'homesolo' ? row.choice : 'none',
  reasons: row.reasons,
}));
const report = analyzeStudy(participants, results, preferences);
const pct = (value: number | null) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`);
const lines = [
  `# Preference study report · ${report.protocol}`,
  '',
  report.valid ? 'Inputs passed validation.' : `**Inputs failed validation:** ${report.issues.join(' ')}`,
  '',
  `Enrolled ${report.enrolled}; completed ${report.completers}; withdrawn ${report.withdrawals.length}.`,
  '',
  '## Primary outcome',
  `Preferred Ascent: **${report.preference.ascent} of ${report.enrolled}** (${pct(report.preference.share)}; exact 95% CI ${pct(report.preference.ci95[0])}–${pct(report.preference.ci95[1])}). Preferred HomeSolo: ${report.preference.homesolo}. No preference: ${report.preference.none}. One-sided exact p versus an even split: ${report.preference.pVersusEvenSplit?.toFixed(3) ?? 'n/a'}.`,
  `Target ${report.targets.preference.target}: **${report.targets.preference.met ? 'met' : 'not met'}**.`,
  '',
  '## Task outcomes',
  '| Product | Supported tasks | Correct | Success rate | Unsupported | Assisted | Critical arithmetic errors | Unauthorized disclosures |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...report.tasks.map(
    t =>
      `| ${t.product} | ${t.supported} | ${t.successes} | ${pct(t.successRate)} | ${t.unsupported} | ${t.assisted} | ${t.criticalArithmeticErrors} | ${t.unauthorizedDisclosures} |`,
  ),
  '',
  '| Task | Pairs | Median Ascent − HomeSolo (s) | Ascent faster | Sign test p |',
  '| --- | --- | --- | --- | --- |',
  ...report.paired.map(
    p =>
      `| ${p.task} | ${p.pairs} | ${p.medianDifferenceSeconds ?? 'n/a'} | ${p.ascentFaster} | ${p.signTestP?.toFixed(3) ?? 'n/a'} |`,
  ),
  '',
  '## Engineering targets',
  `Ascent task success ≥ 95%: ${report.targets.ascentTaskSuccess.met ? 'met' : 'not met'} (${pct(report.targets.ascentTaskSuccess.observed)}). Critical arithmetic errors: ${report.targets.criticalArithmeticErrors.observed}. Unauthorized disclosures: ${report.targets.unauthorizedDisclosures.observed}.`,
  '',
  `> ${report.interpretation}`,
  '',
];
writeFileSync(join(folder, 'study-report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(folder, 'study-report.md'), lines.join('\n'));
console.log(lines.join('\n'));
if (!report.valid) process.exit(1);
