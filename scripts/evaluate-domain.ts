import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { builtinRules, testRule } from '../src/lib/domain';
import { fairHousingGoldenCases, inspectFairHousing } from '../src/lib/fair-housing';
import { analyzeOfferRisk } from '../src/lib/offer-risk';
import { createDemoWorkspace } from '../src/lib/seed';

async function main() {
  const started = performance.now();
  const baseline = (text: string) =>
    /race|religion|famil|children|kids|wheelchair|schools?|crime|muslim|white|black/i.test(text) ? 'block' : 'allow';
  const cases = fairHousingGoldenCases.map(entry => ({
    id: entry.id,
    category: entry.category,
    expected: entry.expected,
    actual: inspectFairHousing(entry.text, { surface: entry.surface }).decision,
    keywordBaseline: baseline(entry.text),
  }));
  const rate = (subset: typeof cases, correct: (entry: (typeof cases)[number]) => boolean) =>
    subset.length ? subset.filter(correct).length / subset.length : null;
  const harm = cases.filter(entry => entry.category === 'explicit-harm'),
    legitimate = cases.filter(entry => entry.category === 'legitimate'),
    proxy = cases.filter(entry => entry.category === 'proxy');
  const metrics = {
    total: cases.length,
    accuracy: rate(cases, entry => entry.actual === entry.expected),
    explicitHarmBlockRecall: rate(harm, entry => entry.actual === 'block'),
    legitimateAllowRate: rate(legitimate, entry => entry.actual === 'allow'),
    proxyReviewRecall: rate(proxy, entry => entry.actual === 'review'),
    keywordBaselineAccuracy: rate(cases, entry => entry.keywordBaseline === entry.expected),
    keywordBaselineLegitimateAllowRate: rate(legitimate, entry => entry.keywordBaseline === 'allow'),
  };
  const thresholds = { explicitHarmBlockRecall: 0.95, legitimateAllowRate: 0.9, proxyReviewRecall: 0.9 };
  const safetyPass = Object.entries(thresholds).every(
    ([key, minimum]) => (metrics[key as keyof typeof thresholds] ?? 0) >= minimum,
  );
  const workspace = createDemoWorkspace();
  const interactions = [
    {
      id: 'financing-unrecorded-protection',
      offer: { ...workspace.offers[0], contingencies: ['Inspection: verify actual contract'] },
      expected: [
        'offer-financing-no-contingency',
        'offer-financing-appraisal',
        'offer-financing-concessions',
        'offer-deposit-exposure',
      ],
    },
    { id: 'cash-not-a-guarantee', offer: workspace.offers[1], expected: [] },
    {
      id: 'other-home-dependency',
      offer: workspace.offers[2],
      expected: ['offer-financing-concessions', 'offer-sale-contingency'],
    },
  ].map(entry => {
    const triggered = analyzeOfferRisk(entry.offer, { asOf: workspace.asOf })
      .findings.filter(finding => finding.state === 'triggered')
      .map(finding => finding.ruleId);
    return {
      id: entry.id,
      expected: entry.expected,
      actual: triggered,
      expectedCaptured: entry.expected.filter(id => triggered.includes(id)).length,
      netOnlyBaselineCaptured: 0,
      note: 'The simple arithmetic baseline computes net only and does not model interactions. These are authored practice expectations, not expert ratings or outcome predictions.',
    };
  });
  const ruleCases = builtinRules.map(rule => ({
    id: rule.id,
    version: rule.version,
    approval: rule.approval.status,
    ...testRule(rule),
  }));
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: 'Authored English synthetic golden cases v1; no customer content or licensed records.',
    scope:
      'Deterministic execution and safety-triage comparison on this preset fixture only. No Homesolo measurement, independent expert agreement, legal correctness, real-world calibration or predictive superiority is established.',
    thresholds,
    safetyPass,
    fairHousing: { metrics, cases },
    rules: ruleCases,
    offerInteractions: interactions,
    unmeasured: {
      independentExpertAgreement: null,
      jurisdictionSpecificLegalValidation: false,
      customerTaskCompletion: null,
      realTransactionOutcomes: null,
      multilingualRobustness: null,
      adversarialCoverageExhaustive: false,
    },
    runtimeMs: Number((performance.now() - started).toFixed(3)),
    limitations: [
      'Labels were authored internally; external blinded adjudication remains required.',
      'Thresholds are acceptance goals, not statutory standards or a claim of production risk rates.',
      'An allow result is not compliance certification; review/block are application triage outcomes.',
      'Academic-style held-out cases, drift monitoring, longitudinal outcome calibration and actual qualified expert review remain.',
    ],
  };
  await mkdir('evidence', { recursive: true });
  await writeFile('evidence/domain-evaluation.json', `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ safetyPass, metrics, ruleCases: ruleCases.length, ruleCasesPass: ruleCases.every(entry => entry.passed), output: 'evidence/domain-evaluation.json' }, null, 2)}\n`,
  );
  if (!safetyPass || ruleCases.some(entry => !entry.passed)) process.exitCode = 1;
}
main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed'}\n`);
  process.exitCode = 1;
});
