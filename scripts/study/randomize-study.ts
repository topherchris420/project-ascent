/**
 * Counterbalanced participant schedule for protocol ascent-preference-1.
 *   npx tsx scripts/study/randomize-study.ts --seed 20261017 --participants 10 > docs/study/schedule.json
 * Run once, before recruitment, with a seed the facilitator records in the pre-registration.
 */
import { randomizeStudy, STUDY_PROTOCOL_ID } from '../../src/lib/study-analysis';

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const seed = Number(option('--seed'));
const count = Number(option('--participants') ?? 10);
if (!Number.isInteger(seed) || seed <= 0)
  throw new Error('Pass a positive integer --seed and record it before recruiting.');
if (!Number.isInteger(count) || count < 2 || count % 2)
  throw new Error('Use an even --participants count so order is balanced.');
const ids = Array.from({ length: count }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
console.log(JSON.stringify({ protocol: STUDY_PROTOCOL_ID, seed, schedule: randomizeStudy(ids, seed) }, null, 2));
