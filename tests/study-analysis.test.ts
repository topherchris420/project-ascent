import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeStudy,
  binomialUpperTail,
  clopperPearson,
  parseStudyCsv,
  randomizeStudy,
  TASK_IDS,
  type Participant,
  type Preference,
  type TaskResult,
} from '../src/lib/study-analysis';

const close = (actual: number, expected: number, tolerance = 5e-4) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('exact binomial arithmetic matches textbook values', () => {
  // 7 of 10: Clopper-Pearson 95% interval [0.3475, 0.9333]; P(X >= 7 | n=10, p=0.5) = 176/1024.
  const [low, high] = clopperPearson(7, 10);
  close(low, 0.3475);
  close(high, 0.9333);
  close(binomialUpperTail(7, 10, 0.5), 176 / 1024, 1e-12);
  assert.deepEqual(clopperPearson(0, 10)[0], 0);
  assert.deepEqual(clopperPearson(10, 10)[1], 1);
  close(clopperPearson(10, 10)[0], 0.6915);
});

test('randomization balances product order and subject pairing, with a fixed task order', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
  const a = randomizeStudy(ids, 20261017),
    b = randomizeStudy(ids, 20261017);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, randomizeStudy(ids, 7));
  assert.equal(a.filter(row => row.firstProduct === 'ascent').length, 5);
  assert.deepEqual(new Set(a.map(row => row.id)), new Set(ids));
  for (const row of a) {
    assert.deepEqual(row.taskOrder, [...TASK_IDS]);
    assert.notEqual(row.subjects.ascent, row.subjects.homesolo);
  }
  // Every combination of product order and subject pairing is used; none dominates.
  const cells = new Map<string, number>();
  for (const row of a) {
    const key = `${row.firstProduct}:${row.subjects.ascent}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  assert.equal(cells.size, 4);
  assert.ok(Math.max(...cells.values()) - Math.min(...cells.values()) <= 1);
});

const people = (n: number): Participant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`,
    firstProduct: i % 2 ? 'homesolo' : 'ascent',
    status: 'completed',
  }));
const allTasks = (participants: Participant[], overrides: Partial<TaskResult> = {}): TaskResult[] =>
  participants.flatMap(p =>
    (['ascent', 'homesolo'] as const).flatMap(product =>
      TASK_IDS.map(task => ({
        participantId: p.id,
        product,
        task,
        supported: true,
        completed: true,
        correct: true,
        seconds: product === 'ascent' ? 100 : 130,
        criticalArithmeticError: false,
        unauthorizedDisclosure: false,
        assisted: false,
        ...overrides,
      })),
    ),
  );

test('withdrawals and ties count against the preference target; unsupported tasks are reported, not dropped', () => {
  const participants = people(10);
  participants[9] = { ...participants[9], status: 'withdrawn', withdrawalReason: 'Scheduling' };
  const preferences: Preference[] = participants.slice(0, 9).map((p, i) => ({
    participantId: p.id,
    choice: i < 7 ? 'ascent' : i === 7 ? 'homesolo' : 'none',
    reasons: '',
  }));
  const results = allTasks(participants.slice(0, 9)).map(row =>
    row.product === 'homesolo' && row.task === 'T5'
      ? { ...row, supported: false, completed: false, correct: false }
      : row,
  );
  const report = analyzeStudy(participants, results, preferences);
  assert.equal(report.valid, true);
  assert.equal(report.preference.ascent, 7);
  assert.equal(report.preference.none, 1);
  assert.equal(report.enrolled, 10);
  assert.equal(report.targets.preference.met, true);
  assert.equal(report.withdrawals[0].reason, 'Scheduling');
  const homesolo = report.tasks.find(t => t.product === 'homesolo')!;
  assert.equal(homesolo.unsupported, 9);
  assert.equal(homesolo.successRate, 1);
  const t1 = report.paired.find(p => p.task === 'T1')!;
  assert.equal(t1.pairs, 9);
  assert.equal(t1.medianDifferenceSeconds, -30);
  assert.equal(t1.ascentFaster, 9);
  close(t1.signTestP!, 2 / 512, 1e-12);
  assert.match(report.interpretation, /not evidence of population-wide superiority/);
  // Six of ten misses the bar even though Ascent leads.
  const fewer = analyzeStudy(
    people(10),
    allTasks(people(10)),
    people(10).map((p, i) => ({ participantId: p.id, choice: i < 6 ? 'ascent' : 'homesolo', reasons: '' })),
  );
  assert.equal(fewer.targets.preference.met, false);
});

test('a critical arithmetic error or a disclosure fails its target; invalid inputs are flagged', () => {
  const participants = people(10);
  const results = allTasks(participants);
  results[0] = { ...results[0], criticalArithmeticError: true, correct: false };
  const report = analyzeStudy(participants, results, []);
  assert.equal(report.targets.criticalArithmeticErrors.met, false);
  assert.equal(report.targets.ascentTaskSuccess.met, true);
  const unbalanced = analyzeStudy(
    people(10).map(p => ({ ...p, firstProduct: 'ascent' })),
    [],
    [{ participantId: 'P99', choice: 'ascent', reasons: '' }],
  );
  assert.equal(unbalanced.valid, false);
  assert.ok(unbalanced.issues.some(issue => issue.includes('counterbalanced')));
  assert.ok(unbalanced.issues.some(issue => issue.includes('P99')));
});

test('facilitator CSVs parse with comments, quotes and blank cells', () => {
  const rows = parseStudyCsv(
    '# comment line\nparticipant_id,choice,reasons\nP01,ascent,"Clearer math, faster report"\nP02,none,\n',
  );
  assert.deepEqual(rows, [
    { participant_id: 'P01', choice: 'ascent', reasons: 'Clearer math, faster report' },
    { participant_id: 'P02', choice: 'none', reasons: '' },
  ]);
});
