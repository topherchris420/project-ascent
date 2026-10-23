import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeDecisionBrief } from '../src/lib/home-decision-brief';
import { calculateStudio, defaultDemoState, sampleEvidence } from '../src/lib/demo-studio';
import { buildOsBrief, osAnswers, valueContext } from '../src/lib/homeowner-os';
import { input, usd, withSales } from './os-fixtures';

test('only a stated estimate reaches the Offer Lab', () => {
  const supported = buildHomeDecisionBrief({ evidence: sampleEvidence, state: defaultDemoState });
  assert.notEqual(supported.value.verdict, 'declined');
  assert.equal(valueContext(supported).estimate, supported.value.estimate!.value);
  const declined = buildHomeDecisionBrief({ evidence: sampleEvidence, state: withSales(2) });
  assert.equal(declined.value.verdict, 'declined');
  assert.equal(valueContext(declined).estimate, null);
});

test('a withheld estimate stays withheld across the OS brief, the offers and every answer, including saved versions', () => {
  const state = withSales(2);
  const withheld = calculateStudio(sampleEvidence, state).estimate;
  const value = input(state, true);
  assert.ok(value.saved!.calculation.valuationEstimate, 'the saved version holds a calculated figure');
  const os = buildOsBrief(value);
  const text = JSON.stringify({ os, answers: osAnswers(value, os), offers: value.offers });
  for (const figure of [withheld, value.saved!.calculation.valuationEstimate!])
    assert.ok(!text.includes(usd(figure)) && !text.includes(String(Math.round(figure))), `${figure} must not appear`);
  assert.match(os.offers.at(-1)!.text, /withholds an estimate/);
  assert.ok(os.questions.some(item => /Ask a licensed agent or appraiser for a price opinion/.test(item.text)));
  assert.ok(
    os.changes.some(item => /valuation calculation differs|Compared with the version you saved/.test(item.text)),
  );
});

test('what to do next lists upcoming deadlines in date order and skips past ones', () => {
  const os = buildOsBrief(input(defaultDemoState));
  const dated = os.next.filter(item => /^\w{3} \d+, \d{4}:/.test(item.text)).map(item => item.text);
  assert.deepEqual(
    dated.map(text => text.slice(0, 12)),
    // The inspection period ends 7 days after the assumed Oct 24 acceptance.
    ['Oct 23, 2026', 'Oct 28, 2026', 'Oct 30, 2026', 'Oct 31, 2026', 'Nov 10, 2026'],
  );
  assert.ok(!os.next.some(item => /Old task/.test(item.text)));
  assert.match(dated[0], /Offer expires for Offer A \(as entered\)/);
});

test('missing documents follow the transaction stage, and questions for a professional come from the records', () => {
  const os = buildOsBrief(input(defaultDemoState));
  assert.deepEqual(
    os.documents.map(item => [item.item, item.present]),
    [
      ['Signed purchase contract and addenda', false],
      ['Home inspection report', true],
      ['Repair or credit agreement', true],
      ['Appraisal report', false],
    ],
  );
  assert.ok(os.missing.some(item => /appraisal report/.test(item.text)));
  const questions = os.questions.map(item => item.text).join(' ');
  assert.match(questions, /escalation clause up to \$720,000/);
  assert.match(questions, /Offer A waives the appraisal, financing contingencies on a financed offer/);
  assert.match(questions, /payoff statement/);
  assert.match(questions, /how your contract counts days/);
  assert.match(questions, /Exposed wiring in basement/);
});

test('Ask Ascent answers deterministically with references and never picks an offer', () => {
  const value = input(defaultDemoState);
  const answers = osAnswers(value);
  assert.deepEqual(answers, osAnswers(structuredClone(value)));
  assert.match(answers.offers.text, /Ascent does not say which offer to accept/);
  assert.ok(answers.offers.refs[0].startsWith('calculation fnv1a32-'));
  assert.match(answers.checklist.text, /2 open task\(s\)/);
  assert.match(answers.checklist.text, /common steps/);
  assert.match(answers.next.text, /Offer expires/);
  for (const answer of Object.values(answers)) {
    assert.ok(answer.label.endsWith('?'));
    assert.doesNotMatch(answer.text, /\brecommend|\bshould accept|best offer|likely to close|probabilit/i);
  }
  const offline = osAnswers({ ...value, room: null, lab: null, offers: null });
  assert.match(offline.checklist.text, /needs an account; everything else here works without one/);
  assert.match(offline.offers.text, /No offers are entered yet/);
});

test('the OS brief checksum is reproducible and covers the underlying brief', () => {
  const a = buildOsBrief(input(defaultDemoState));
  const b = buildOsBrief(input(defaultDemoState));
  assert.equal(a.checksum, b.checksum);
  assert.notEqual(buildOsBrief({ ...input(defaultDemoState), room: null }).checksum, a.checksum);
});
