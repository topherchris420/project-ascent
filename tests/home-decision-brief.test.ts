import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_POLICY,
  BRIEF_VERSION,
  briefAnswers,
  briefMarket,
  buildHomeDecisionBrief,
  evidenceVerdict,
  type HomeDecisionBrief,
} from '../src/lib/home-decision-brief';
import {
  calculateStudio,
  defaultDemoState,
  sampleEvidence,
  type StudioEvidence,
  type StudioState,
} from '../src/lib/demo-studio';
import { dcDefaultState } from '../src/lib/dc-studio';
import { marylandDefaultState } from '../src/lib/maryland-studio';
import { condoDefaultState } from '../src/lib/dc-condo-studio';
import { compareDecisions, exampleFinance } from '../src/lib/homeowner-finance';
import { saleNetBeforePayoff } from '../src/lib/selling-costs';
import { dcValuationInputs } from '../src/lib/providers/dc-public-records';
import { marylandValuationInputs } from '../src/lib/providers/maryland-public-records';
import { condoValuationInputs, searchCondoAddresses } from '../src/lib/providers/dc-condo-public-records';

type Inputs = {
  subject: StudioEvidence['subject'];
  candidates: StudioEvidence['candidates'];
  sources: StudioEvidence['sources'];
  asOf: string;
  snapshot?: StudioEvidence['snapshot'];
};
const evidenceOf = (inputs: Inputs | null): StudioEvidence => {
  assert.ok(inputs);
  return {
    subject: inputs.subject,
    candidates: inputs.candidates,
    sources: inputs.sources,
    asOf: inputs.asOf,
    snapshot: inputs.snapshot,
  };
};
const dc = () => evidenceOf(dcValuationInputs('3313____0047'));
const maryland = () => evidenceOf(marylandValuationInputs('161301059818'));
const condo = () => evidenceOf(condoValuationInputs(searchCondoAddresses('2123 California')[0].parcelId));
const sample = (state: StudioState = defaultDemoState) => buildHomeDecisionBrief({ evidence: sampleEvidence, state });
/** Keep only `keep` eligible sales by excluding the rest, as a user can in the studio. */
const withSales = (keep: number): StudioState => {
  const comps = calculateStudio(sampleEvidence, defaultDemoState).comps;
  return {
    ...structuredClone(defaultDemoState),
    exclusions: comps.slice(keep).map(comp => ({ id: comp.propertyId, reason: 'Test exclusion' })),
  };
};
const figures = (brief: HomeDecisionBrief) =>
  [
    brief.value.estimate,
    brief.value.range,
    brief.value.calibrated,
    ...brief.comparables.leading.flatMap(sale => [sale.soldPrice, sale.adjustedPrice]),
    brief.financial.saleNow?.price,
    brief.financial.saleNow?.beforePayoff,
    brief.financial.saleNow?.afterPayoff,
  ].filter(figure => !!figure);

test('every figure in the brief is a traced engine output; the brief adds no value of its own', () => {
  const brief = sample();
  const result = calculateStudio(sampleEvidence, defaultDemoState);
  assert.equal(brief.version, BRIEF_VERSION);
  assert.equal(brief.value.estimate!.value, result.estimate);
  assert.deepEqual([brief.value.range!.value, brief.value.range!.upper], [result.low, result.high]);
  assert.equal(brief.references.valuationHash, result.calculationHash);
  for (const figure of figures(brief)) {
    assert.ok(figure!.traces.length > 0, `${figure!.label} has no trace`);
    for (const trace of figure!.traces) assert.ok(['record', 'assumption', 'calculation'].includes(trace.kind));
  }
  assert.ok(brief.value.estimate!.traces.some(trace => trace.ref === result.calculationHash));
  const byId = new Map(result.comps.map(comp => [comp.propertyId, comp]));
  for (const sale of brief.comparables.leading) {
    assert.equal(sale.adjustedPrice.value, byId.get(sale.id)!.adjustedPrice);
    assert.equal(sale.soldPrice!.traces[0].kind, 'record');
  }
  const weights = brief.comparables.leading.map(sale => sale.weightPercent);
  assert.deepEqual(
    weights,
    [...weights].sort((a, b) => b - a),
  );
  assert.equal(brief.comparables.eligible, result.comps.length);
});

test('the fictional sample is labeled as practice and never receives a study range', () => {
  const brief = sample();
  assert.equal(brief.property.market, 'demo');
  assert.equal(brief.property.fictional, true);
  assert.equal(brief.value.verdict, 'limited');
  assert.equal(brief.value.label, 'Practice estimate · fictional data');
  assert.equal(brief.value.calibrated, null);
  assert.equal(brief.value.study, null);
  assert.equal(brief.reliability.tierReference, null);
  assert.match(brief.value.reasons[0], /fictional practice records/);
  assert.ok(brief.limits.some(limit => /Fictional practice data/.test(limit)));
});

test('fewer than three eligible sales: the brief declines to state a value and says why', () => {
  for (const keep of [1, 2]) {
    const brief = sample(withSales(keep));
    assert.equal(brief.value.verdict, 'declined');
    assert.equal(brief.value.label, 'Value not stated');
    assert.equal(brief.value.estimate, null);
    assert.equal(brief.value.range, null);
    assert.equal(brief.value.calibrated, null);
    assert.match(brief.value.reasons[0], new RegExp(`^Only ${keep} eligible recorded sale`));
    assert.match(brief.value.answer, /not stating a value/);
    // The arithmetic is not passed on as a sale price, and the first next step is a professional opinion.
    assert.equal(brief.financial.saleNow, null);
    assert.match(brief.nextSteps[0].item, /appraisal/);
    // The sales stay inspectable.
    assert.equal(brief.comparables.eligible, keep);
  }
  assert.equal(sample(withSales(BRIEF_POLICY.minComparables)).value.verdict, 'limited');
  const empty = sample({
    ...structuredClone(defaultDemoState),
    assumptions: { ...defaultDemoState.assumptions, maxAgeDays: 1 },
  });
  assert.equal(empty.value.verdict, 'declined');
  assert.match(empty.value.reasons[0], /No recorded sale passes/);
  assert.equal(empty.comparables.leading.length, 0);
});

test('a chosen asking price still shows selling arithmetic when no value is stated', () => {
  const brief = sample({ ...withSales(2), listPrice: 900000, payoff: 400000 });
  assert.equal(brief.value.verdict, 'declined');
  assert.equal(brief.financial.saleNow!.price.value, 900000);
  assert.equal(brief.financial.saleNow!.price.traces[0].kind, 'assumption');
  const before = Math.round(
    saleNetBeforePayoff(900000, {
      commissionPercent: defaultDemoState.commissionPercent,
      closingPercent: defaultDemoState.closingPercent,
      concessions: defaultDemoState.concessions,
    }),
  );
  assert.equal(brief.financial.saleNow!.beforePayoff.value, before);
  assert.equal(brief.financial.saleNow!.afterPayoff!.value, before - 400000);
});

test('the evidence verdict follows the published policy exactly', () => {
  const pass = { id: 'dispersion', status: 'pass' as const, label: '', detail: '' };
  const review = { ...pass, status: 'review' as const };
  assert.equal(evidenceVerdict(2, { decision: 'release', checks: [pass] }), 'declined');
  assert.equal(evidenceVerdict(3, { decision: 'release', checks: [pass] }), 'supported');
  assert.equal(evidenceVerdict(3, { decision: 'review', checks: [pass, review] }), 'limited');
  assert.equal(evidenceVerdict(9, { decision: 'withhold', checks: [pass] }), 'declined');
  assert.equal(evidenceVerdict(9, null), 'declined');
});

test('without financial inputs, no choice is computed and nothing is filled in', () => {
  const brief = sample();
  assert.ok(brief.financial.choices.every(choice => !choice.available && choice.figures.length === 0));
  assert.ok(brief.financial.choices.find(choice => choice.kind === 'hold')!.missing.length > 0);
  assert.deepEqual(brief.financial.breakEvens, []);
  assert.equal(
    brief.financial.calculationHash,
    compareDecisions({ ...exampleFinance(), ...nullFinance() }).calculationHash,
  );
  // Sale arithmetic before payoff needs only the price and the disclosed default fees.
  assert.equal(brief.financial.saleNow!.afterPayoff, null);
  assert.ok(brief.nextSteps.some(step => /payoff statement/.test(step.item)));
  assert.ok(brief.financial.exclusions.length >= 5);
});
/** The finance inputs the studio supplies on its own: the estimate as value and price, default fees, no payoff. */
function nullFinance() {
  const brief = sample();
  return Object.fromEntries(
    Object.keys(exampleFinance()).map(key => [
      key,
      key === 'horizonMonths'
        ? 60
        : key === 'sellingMonths'
          ? 0
          : key === 'propertyValue' || key === 'salePrice'
            ? brief.value.estimate!.value
            : key === 'commissionPercent'
              ? defaultDemoState.commissionPercent
              : key === 'closingPercent'
                ? defaultDemoState.closingPercent
                : key === 'concessions'
                  ? defaultDemoState.concessions
                  : null,
    ]),
  );
}

test('with financial inputs, choices are the engine’s results and nothing is ranked', () => {
  const finance = exampleFinance();
  const brief = buildHomeDecisionBrief({ evidence: sampleEvidence, state: defaultDemoState, finance });
  const comparison = compareDecisions(finance);
  assert.equal(brief.financial.calculationHash, comparison.calculationHash);
  assert.deepEqual(
    brief.financial.choices.map(choice => choice.kind),
    comparison.results.map(result => result.kind),
  );
  for (const choice of brief.financial.choices) {
    const result = comparison.results.find(item => item.kind === choice.kind)!;
    assert.equal(choice.available, result.available);
    const position = choice.figures.find(figure => figure.label === 'Net position at horizon');
    assert.equal(position?.value, result.netPosition ?? undefined);
  }
  assert.equal(brief.financial.breakEvens.length, 5);
  assert.ok(brief.financial.breakEvens.every(item => item.text.length > 0));
  assert.match(brief.financial.answer, /not a prediction, and Ascent does not rank them/);
  assert.ok(brief.influences.financial.length > 0);
  const invalid = buildHomeDecisionBrief({
    evidence: sampleEvidence,
    state: defaultDemoState,
    finance: { ...finance, vacancyPercent: 140 },
  });
  assert.equal(invalid.financial.inputsValid, false);
  assert.ok(invalid.financial.choices.every(choice => !choice.available));
});

test('editing assumptions never changes the evidence, and the brief is reproducible', () => {
  const evidence = structuredClone(sampleEvidence),
    frozen = JSON.stringify(evidence);
  const original = buildHomeDecisionBrief({ evidence, state: defaultDemoState });
  const edited = buildHomeDecisionBrief({
    evidence,
    state: { ...structuredClone(defaultDemoState), assumptions: { ...defaultDemoState.assumptions, sqftRate: 150 } },
  });
  assert.notEqual(edited.checksum, original.checksum);
  assert.equal(JSON.stringify(evidence), frozen);
  assert.equal(buildHomeDecisionBrief({ evidence, state: defaultDemoState }).checksum, original.checksum);
  assert.equal(
    buildHomeDecisionBrief({ evidence, state: { ...defaultDemoState, listPrice: 950000 } }).financial.saleNow!.price
      .value,
    950000,
  );
});

test('DC: the validated, unmodified analysis carries the published calibrated range, and only then', () => {
  const evidence = dc();
  assert.equal(briefMarket(evidence).market, 'dc');
  const brief = buildHomeDecisionBrief({ evidence, state: dcDefaultState() });
  assert.notEqual(brief.value.verdict, 'declined');
  assert.ok(brief.value.calibrated);
  assert.ok(brief.value.calibrated!.value < brief.value.estimate!.value);
  assert.ok(brief.value.calibrated!.upper! > brief.value.estimate!.value);
  assert.match(brief.value.study!.text, /9 of 9 accuracy criteria met/);
  assert.match(brief.reliability.tierReference!, /median error/);
  const rated = buildHomeDecisionBrief({ evidence, state: { ...dcDefaultState(), subjectCondition: 3 } });
  assert.equal(rated.value.calibrated, null);
  assert.equal(rated.value.verdict, 'limited');
  assert.ok(rated.value.reasons.some(reason => /your own condition rating/.test(reason)));
  assert.ok(rated.missingFacts.some(fact => fact.fact === 'Verification of your condition rating'));
});

test('Maryland: the failed study is disclosed, no range is calibrated, and missing rooms are named', () => {
  const evidence = maryland();
  assert.equal(briefMarket(evidence).market, 'maryland');
  const brief = buildHomeDecisionBrief({ evidence, state: marylandDefaultState() });
  assert.equal(brief.value.verdict, 'limited');
  assert.equal(brief.value.calibrated, null);
  assert.match(brief.value.reasons[0], /met 8 of 9 accuracy criteria; it missed price-related differential/);
  assert.match(brief.value.study!.text, /did not pass/);
  assert.ok(brief.missingFacts.some(fact => fact.fact === 'Bedroom and bathroom counts'));
  assert.ok(brief.missingFacts.some(fact => fact.fact === 'Interior condition and updates'));
  assert.deepEqual(brief.nextSteps[0], {
    item: 'A professional review of the leading sales',
    why: 'The method did not pass its published accuracy study for this market.',
    affects: ['value', 'reliability'],
    priority: 1,
  });
});

test('DC condos: the failed condo study is disclosed and condo-specific facts are requested', () => {
  const evidence = condo();
  assert.equal(briefMarket(evidence).market, 'dc-condos');
  const brief = buildHomeDecisionBrief({ evidence, state: condoDefaultState() });
  assert.equal(brief.value.calibrated, null);
  assert.match(brief.value.reasons[0], /Washington, DC condominiums met 4 of 9/);
  assert.ok(brief.missingFacts.some(fact => /HOA dues/.test(fact.fact)));
  assert.ok(brief.missingFacts.some(fact => fact.fact === 'Condition'));
  assert.ok(brief.nextSteps.some(step => /resale package/.test(step.item)));
});

test('Ask Ascent answers use only the brief’s own figures and name their references', () => {
  const brief = buildHomeDecisionBrief({
    evidence: sampleEvidence,
    state: { ...defaultDemoState, payoff: 300000 },
  });
  const answers = briefAnswers(brief);
  const dollars = /\$\d{1,3}(?:,\d{3})*/g;
  const known = new Set(JSON.stringify(brief).match(dollars));
  for (const id of ['why', 'top-comp', 'after-costs'] as const) {
    assert.ok(answers[id].text.length > 40);
    for (const amount of answers[id].text.match(dollars) ?? []) assert.ok(known.has(amount), `${id}: ${amount}`);
  }
  assert.match(answers['top-comp'].text, new RegExp(brief.comparables.leading[0].address));
  assert.ok(answers['top-comp'].refs.includes(`record ${brief.comparables.leading[0].id}`));
  assert.ok(answers.why.refs.includes(`valuation ${brief.references.valuationHash}`));
  assert.match(answers['after-costs'].text, /keep about/);
  assert.match(answers.lower.text, /does not change the evidence-supported estimate/);
  assert.match(answers.unsupported.text, /does not support a forecast/);
  const declined = briefAnswers(sample(withSales(2)));
  assert.match(declined.why.text, /not stating a value/);
  assert.match(declined['after-costs'].text, /did not state a value/);
});
