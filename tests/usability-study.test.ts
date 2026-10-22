import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeUsability,
  answerKeyMarkdown,
  illustrativeStudyInputs,
  susItems,
  susScore,
  usabilityAnswerKey,
  usabilityProtocol,
  usabilityProtocolDigest,
  usabilityReportMarkdown,
  usabilityResultsSchema,
  wilsonInterval,
  type UsabilityResults,
} from '../src/lib/usability-study';
import { buildHomeDecisionBrief } from '../src/lib/home-decision-brief';
import { defaultDemoState } from '../src/lib/demo-studio';
import { propertyHref } from '../src/lib/homeowner-passport';
import { sparseStudyEvidence, studyEvidence, studySession, STUDY_STATES } from '../src/lib/study-states';
import { digestOf } from '../src/lib/valuation-validation';

const template = JSON.parse(readFileSync('docs/usability/results-template.json', 'utf8')) as UsabilityResults;

/** Synthetic sessions for testing the arithmetic only; never results, and never written under evidence/. */
function synthetic(n: number, outcome: (participant: number, task: number) => 'met' | 'not-met' | 'not-attempted') {
  return {
    ...structuredClone(template),
    studyId: 'synthetic-test',
    commit: 'a'.repeat(40),
    sessions: Array.from({ length: n }, (_, p) => ({
      ...structuredClone(template.sessions[0]),
      participant: `P${String(p + 1).padStart(2, '0')}`,
      device: p % 2 ? ('desktop' as const) : ('phone' as const),
      assistiveTechnology: p < 2 ? ('screen-reader' as const) : ('none' as const),
      housing: p % 3 ? ('house' as const) : ('condo' as const),
      ageBand: (['18-34', '35-49', '50-64', '65+'] as const)[p % 4],
      sus: Array.from({ length: 10 }, (_, i) => (i % 2 ? 2 : 4)),
      tasks: usabilityProtocol.tasks.map((task, t) => ({
        task: task.id,
        outcome: outcome(p, t),
        unaided: outcome(p, t) === 'met',
        seconds: 30 + t + p,
        errors: outcome(p, t) === 'met' ? 0 : 1,
        misinterpretations: outcome(p, t) === 'not-met' ? [`P${p + 1} misread T${t + 1}`] : [],
        notes: '',
      })),
      barriers: p === 0 ? [{ task: 'T3', description: 'Screen reader skipped the weight bar' }] : [],
    })),
  };
}

test('Wilson intervals match the textbook values and stay within [0, 1]', () => {
  const [low, high] = wilsonInterval(8, 10);
  assert.equal(low.toFixed(4), '0.4902');
  assert.equal(high.toFixed(4), '0.9433');
  assert.equal(wilsonInterval(0, 12)[0], 0);
  assert.equal(wilsonInterval(12, 12)[1], 1);
  assert.ok(wilsonInterval(12, 12)[0] > 0.7);
  assert.deepEqual(wilsonInterval(0, 0), [0, 1]);
});

test('SUS scores follow Brooke’s alternating item scoring', () => {
  assert.equal(susScore(Array(10).fill(3)), 50);
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  assert.equal(susScore([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]), 75);
  assert.throws(() => susScore([3, 3, 3]));
  assert.throws(() => susScore(Array(10).fill(6)));
});

test('the registered protocol is the one in code, with the original nine tasks and criteria', () => {
  const registration = JSON.parse(readFileSync('evidence/usability/registration.json', 'utf8'));
  assert.equal(registration.protocolDigest, usabilityProtocolDigest());
  assert.equal(digestOf(registration.protocol), usabilityProtocolDigest());
  const original = readFileSync('docs/usability-protocol.md', 'utf8');
  for (const task of usabilityProtocol.tasks) {
    assert.ok(original.includes(task.prompt.replace(/'/g, "'")), `${task.id} prompt differs from the protocol`);
    assert.ok(original.includes(`| ${task.id.slice(1)} | ${task.criterion} |`), `${task.id} criterion differs`);
  }
  assert.equal(usabilityProtocol.successShare, 0.8);
  assert.deepEqual(
    usabilityProtocol.tasks.map(task => task.id),
    ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'],
  );
});

test('the analysis counts every participant, treats a skipped task as not met and keeps every misreading', () => {
  // 12 participants: T1 met by all; T2 met by 9 (75%); T3 met by 10 with 2 not attempted.
  const results = synthetic(12, (p, t) =>
    t === 1 ? (p < 9 ? 'met' : 'not-met') : t === 2 ? (p < 10 ? 'met' : 'not-attempted') : 'met',
  );
  const report = analyzeUsability(results);
  const [t1, t2, t3] = report.tasks;
  assert.equal(t1.met, 12);
  assert.equal(t1.criterionMet, true);
  assert.equal(t2.met, 9);
  assert.equal(t2.criterionMet, false);
  assert.equal(t2.misinterpretations.length, 3);
  assert.equal(t3.met, 10);
  assert.equal(t3.notAttempted, 2);
  assert.equal(t3.criterionMet, true);
  assert.equal(t3.share, 0.8333);
  assert.equal(report.criteriaMet, 8);
  assert.equal(report.participants.withinPlan, true);
  assert.deepEqual(
    report.targets.map(target => target.met),
    [true, true, true, true],
  );
  assert.equal(report.sus.mean, 75);
  assert.equal(report.barriers.length, 1);
  assert.equal(report.reportDigest, digestOf({ ...report, reportDigest: undefined }));
  const markdown = usabilityReportMarkdown(report);
  assert.match(markdown, /\*\*8 of 9 criteria met\*\*/);
  assert.match(markdown, /T2 · Abstention .* \| 9 of 12 \| .* \| \*\*Not met\*\* \|/);
  assert.match(markdown, /P10: “P10 misread T2”/);
  assert.match(markdown, /Screen reader skipped the weight bar/);
});

test('results from another protocol, or with names, repeats or reordered tasks, are refused', () => {
  assert.throws(() => analyzeUsability({ ...synthetic(12, () => 'met'), protocolDigest: `sha256-${'0'.repeat(64)}` }));
  const named = synthetic(12, () => 'met');
  named.sessions[0].participant = 'Jane';
  assert.equal(usabilityResultsSchema.safeParse(named).success, false);
  const repeated = synthetic(12, () => 'met');
  repeated.sessions[1].participant = 'P01';
  assert.equal(usabilityResultsSchema.safeParse(repeated).success, false);
  const reordered = synthetic(12, () => 'met');
  reordered.sessions[0].tasks.reverse();
  assert.equal(usabilityResultsSchema.safeParse(reordered).success, false);
  const small = analyzeUsability(synthetic(8, () => 'met'));
  assert.equal(small.participants.withinPlan, false);
  assert.match(usabilityReportMarkdown(small), /the protocol plans 12–16/);
  assert.equal(usabilityResultsSchema.safeParse(template).success, true);
});

test('the facilitator kit asks the registered prompts verbatim and scores with the registered rules', () => {
  const guide = readFileSync('docs/usability/facilitator-guide.md', 'utf8');
  for (const task of usabilityProtocol.tasks) {
    assert.ok(guide.includes(`| ${task.prompt} |`), `${task.id} prompt is not verbatim in the guide`);
    assert.ok(guide.includes(`| ${task.id} | ${task.accept} | ${task.reject} |`), `${task.id} scoring differs`);
  }
  const sus = readFileSync('docs/usability/sus.md', 'utf8');
  susItems.forEach((item, i) => assert.ok(sus.includes(`| ${i + 1} | ${item} |`), `SUS item ${i + 1} differs`));
});

test('the answer key is current for this build', () => {
  assert.equal(readFileSync('docs/usability/answer-key.md', 'utf8'), answerKeyMarkdown());
  const key = usabilityAnswerKey();
  assert.equal(key.T2.label, 'Value not stated');
  assert.match(key.T2.reason, /Only 2 eligible recorded sales/);
  assert.equal(key.T8.status, 'found');
  assert.equal(key.T9.mortgageInSharingExport, false);
  assert.ok(key.T5.facts.length >= 2);
});

test('each prepared state opens in the condition its tasks need', () => {
  const value = buildHomeDecisionBrief({ evidence: studyEvidence('value'), state: defaultDemoState });
  assert.notEqual(value.value.verdict, 'declined');
  const sparse = buildHomeDecisionBrief({ evidence: studyEvidence('abstention'), state: defaultDemoState });
  assert.equal(sparse.value.verdict, 'declined');
  assert.equal(sparse.comparables.eligible, 2);
  assert.equal(sparse.comparables.excludedByYou.length, 0);
  assert.equal(sparse.influences.settings.changes.length, 0);
  const { state, finance } = illustrativeStudyInputs();
  const money = buildHomeDecisionBrief({ evidence: studyEvidence('finance'), state, finance });
  assert.equal(money.financial.choices.filter(choice => choice.available).length, 6);
  assert.deepEqual(STUDY_STATES.map(studySession), [
    { illustrativeFinance: false, panel: 'overview' },
    { illustrativeFinance: false, panel: 'overview' },
    { illustrativeFinance: true, panel: 'compare' },
  ]);
  assert.equal(propertyHref(sparseStudyEvidence.subject), '/demo/study/abstention');
});
