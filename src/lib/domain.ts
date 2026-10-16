import { calculationChecksum } from './analytics';
import { scopeWorkspaceForAccess } from './fabric';
import type { CmaResult, Workspace } from './types';
import type {
  DomainEvidence,
  DomainRule,
  DomainState,
  Explainability,
  FactValue,
  RuleExpression,
  RuleFinding,
  RuleTestResult,
} from './domain-types';

export const DOMAIN_VERSION = 'ascent-domain-1.0';
export const factRegistry: Record<string, { type: 'number' | 'boolean' | 'string'; meaning: string }> = {
  'cma.compCount': { type: 'number', meaning: 'Number of eligible closed comparables.' },
  'cma.maxGrossAdjustmentRatio': {
    type: 'number',
    meaning: 'Largest absolute-adjustment total divided by that comparable closing price.',
  },
  'cma.relativeRangeWidth': {
    type: 'number',
    meaning: '(Empirical adjusted-comp high minus low) divided by the computed estimate.',
  },
  'cma.manualTrend': { type: 'boolean', meaning: 'A nonzero analyst monthly trend was entered.' },
  'offer.financingRequired': {
    type: 'boolean',
    meaning: 'Recorded financing is not cash; not proof of actual funds or loan approval.',
  },
  'offer.hasFinancingContingency': {
    type: 'boolean',
    meaning: 'A recorded contingency explicitly mentions financing or loan approval.',
  },
  'offer.hasAppraisalContingency': {
    type: 'boolean',
    meaning: 'A recorded contingency explicitly mentions appraisal.',
  },
  'offer.hasSaleContingency': {
    type: 'boolean',
    meaning: 'A recorded contingency explicitly mentions a sale of another/existing home.',
  },
  'offer.hasInspectionContingency': {
    type: 'boolean',
    meaning: 'A recorded contingency explicitly mentions inspection.',
  },
  'offer.sellerCreditPercent': {
    type: 'number',
    meaning: 'Recorded seller credit / offer price × 100; not a program-specific concession limit.',
  },
  'offer.earnestPercent': {
    type: 'number',
    meaning: 'Recorded earnest money / offer price × 100; not a legal minimum or loss probability.',
  },
  'offer.earnestMoney': {
    type: 'number',
    meaning: 'Recorded deposit dollars; escrow terms and refundability remain unknown.',
  },
  'offer.closeDays': { type: 'number', meaning: 'Calendar days from analysis clock to entered closing date.' },
  'offer.expired': { type: 'boolean', meaning: 'Entered offer expiration precedes analysis clock.' },
  'offer.noContingencies': {
    type: 'boolean',
    meaning: 'No contingencies were entered; does not prove the executed contract has none.',
  },
};

export function validateExpression(expression: RuleExpression, depth = 0, budget = { remaining: 80 }): void {
  if (--budget.remaining < 0 || depth > 6 || !expression || typeof expression !== 'object')
    throw new Error('Rule expression exceeds the supported depth/80-node bound or is invalid.');
  if ('all' in expression || 'any' in expression) {
    const children = 'all' in expression ? expression.all : expression.any;
    if (!Array.isArray(children) || children.length < 1 || children.length > 12)
      throw new Error('Rule groups require between 1 and 12 expressions.');
    children.forEach(child => validateExpression(child, depth + 1, budget));
    return;
  }
  if ('not' in expression) {
    validateExpression(expression.not, depth + 1, budget);
    return;
  }
  const fact = Object.hasOwn(factRegistry, expression.fact) ? factRegistry[expression.fact] : undefined;
  if (!fact || !['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'in'].includes(expression.op))
    throw new Error('Unsupported fact or rule operator. Only the registered financial/property facts may be used.');
  if (expression.op === 'exists') return;
  const values = Array.isArray(expression.value) ? expression.value : [expression.value];
  if (expression.op === 'in' && (!Array.isArray(expression.value) || !values.length || values.length > 20))
    throw new Error('Membership rules require 1–20 values.');
  if (expression.op !== 'in' && Array.isArray(expression.value))
    throw new Error('Only membership rules accept multiple values.');
  if (
    values.some(
      value =>
        value === undefined ||
        (value !== null && typeof value !== fact.type) ||
        (typeof value === 'number' && !Number.isFinite(value)),
    )
  )
    throw new Error('Rule values must match the registered fact type.');
  if (['gt', 'gte', 'lt', 'lte'].includes(expression.op) && fact.type !== 'number')
    throw new Error('Ordered comparisons require numeric facts.');
}
type Truth = true | false | 'unknown';
export function evaluateExpression(expression: RuleExpression, facts: Record<string, FactValue>): Truth {
  if ('all' in expression) {
    const values = expression.all.map(child => evaluateExpression(child, facts));
    return values.includes(false) ? false : values.includes('unknown') ? 'unknown' : true;
  }
  if ('any' in expression) {
    const values = expression.any.map(child => evaluateExpression(child, facts));
    return values.includes(true) ? true : values.includes('unknown') ? 'unknown' : false;
  }
  if ('not' in expression) {
    const value = evaluateExpression(expression.not, facts);
    return value === 'unknown' ? 'unknown' : !value;
  }
  const value = facts[expression.fact];
  if (expression.op === 'exists') return value !== undefined && value !== null;
  if (value === undefined || value === null) return 'unknown';
  if (typeof value !== factRegistry[expression.fact]?.type || (typeof value === 'number' && !Number.isFinite(value)))
    return 'unknown';
  switch (expression.op) {
    case 'eq':
      return value === expression.value;
    case 'ne':
      return value !== expression.value;
    case 'in':
      return (expression.value as FactValue[]).includes(value);
    case 'gt':
      return typeof value === 'number' && value > (expression.value as number);
    case 'gte':
      return typeof value === 'number' && value >= (expression.value as number);
    case 'lt':
      return typeof value === 'number' && value < (expression.value as number);
    case 'lte':
      return typeof value === 'number' && value <= (expression.value as number);
    default:
      return 'unknown';
  }
}
function expressionFacts(expression: RuleExpression): string[] {
  if ('all' in expression) return expression.all.flatMap(expressionFacts);
  if ('any' in expression) return expression.any.flatMap(expressionFacts);
  if ('not' in expression) return expressionFacts(expression.not);
  return [expression.fact];
}
export function testRule(rule: DomainRule): RuleTestResult {
  const failures: string[] = [];
  try {
    validateExpression(rule.condition);
    rule.exceptions.forEach(exception => validateExpression(exception.condition));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Invalid expression.');
  }
  if (!rule.tests.some(entry => entry.expectedTriggered) || !rule.tests.some(entry => !entry.expectedTriggered))
    failures.push('At least one triggering and one non-triggering test are required.');
  for (const entry of rule.tests) {
    if (failures.some(failure => failure.startsWith('Unsupported') || failure.includes('expression'))) break;
    try {
      const truth = evaluateExpression(rule.condition, entry.facts),
        exceptions = rule.exceptions.map(exception => evaluateExpression(exception.condition, entry.facts));
      if (truth === 'unknown' || (truth === true && exceptions.includes('unknown'))) {
        failures.push(`Case ${entry.id}: required facts are missing or invalid.`);
        continue;
      }
      const triggered = truth === true && !exceptions.includes(true);
      if (triggered !== entry.expectedTriggered)
        failures.push(`Case ${entry.id}: expected ${entry.expectedTriggered ? 'trigger' : 'no trigger'}.`);
    } catch {
      failures.push(`Case ${entry.id}: invalid evaluation.`);
    }
  }
  return { passed: failures.length === 0, total: rule.tests.length, failures };
}
const practiceSource: DomainEvidence = {
  id: 'analyst-domain-design-v1',
  label: 'Ascent analyst-practice assumptions v1; no independent expert validation or legal authority.',
  retrievedAt: '2026-10-15T12:00:00.000Z',
  kind: 'analyst',
};
const rule = (
  id: string,
  category: 'cma' | 'offer',
  condition: RuleExpression,
  title: string,
  explanation: string,
  yes: Record<string, FactValue>,
  no: Record<string, FactValue>,
  options: Partial<DomainRule> = {},
): DomainRule => ({
  id,
  version: '1.0.0',
  title,
  category,
  classification: 'professional-practice',
  regionIds: ['dmv', 'austin'],
  effectiveFrom: '2026-10-15T00:00:00.000Z',
  condition,
  exceptions: [],
  severity: 'review',
  explanation,
  assumptions: ['Unreviewed analyst-practice rule; not law, a learned probability, or a guarantee.'],
  professionalDecision:
    'A qualified professional must verify executed documents, source evidence and client objectives before acting.',
  evidence: [practiceSource],
  tests: [
    { id: 'triggers', facts: yes, expectedTriggered: true },
    { id: 'does-not-trigger', facts: no, expectedTriggered: false },
  ],
  approval: { status: 'unreviewed' },
  ...options,
});
const fact = (name: string, op: 'eq' | 'gt' | 'lt', value: FactValue): RuleExpression => ({ fact: name, op, value });
export const builtinRules: DomainRule[] = [
  rule(
    'cma-sparse-evidence',
    'cma',
    fact('cma.compCount', 'lt', 3),
    'Sparse comparable evidence',
    'Fewer than three eligible sales warrant extra evidence and sensitivity review. Three is an explicit practice heuristic, not a statutory minimum.',
    { 'cma.compCount': 2 },
    { 'cma.compCount': 3 },
  ),
  rule(
    'cma-large-adjustment',
    'cma',
    fact('cma.maxGrossAdjustmentRatio', 'gt', 0.25),
    'Adjustment dependence',
    'Gross adjustments exceed the declared 25% review heuristic for at least one sale. Check comp selection and overlapping feature adjustments; this is not a validated reliability cutoff.',
    { 'cma.maxGrossAdjustmentRatio': 0.3 },
    { 'cma.maxGrossAdjustmentRatio': 0.2 },
  ),
  rule(
    'cma-wide-envelope',
    'cma',
    fact('cma.relativeRangeWidth', 'gt', 0.1),
    'Wide empirical comparable envelope',
    'The adjusted-comp envelope exceeds 10% of the estimate under an explicit analyst review threshold. Explain heterogeneity; this does not estimate a confidence interval.',
    { 'cma.relativeRangeWidth': 0.12 },
    { 'cma.relativeRangeWidth': 0.05 },
  ),
  rule(
    'cma-assumed-trend',
    'cma',
    fact('cma.manualTrend', 'eq', true),
    'Unvalidated time trend',
    'A nonzero monthly trend changes values. Obtain independent local time-series support and compare a zero-trend sensitivity run.',
    { 'cma.manualTrend': true },
    { 'cma.manualTrend': false },
  ),
  rule(
    'offer-financing-no-contingency',
    'offer',
    { all: [fact('offer.financingRequired', 'eq', true), fact('offer.hasFinancingContingency', 'eq', false)] },
    'Financing and contingency interaction',
    'Financing is recorded without an explicit financing contingency; review exact contract remedies and documented lender readiness.',
    { 'offer.financingRequired': true, 'offer.hasFinancingContingency': false },
    { 'offer.financingRequired': false, 'offer.hasFinancingContingency': false },
    {
      sellerExplanation:
        'Financed terms do not prove closing reliability; verify lender readiness and contractual remedies when financing protection is not recorded.',
      buyerExplanation:
        'Financing failure may leave contractual exposure when financing protection is not recorded. Verify the actual contingency, notice provisions and remedies; no deposit loss is assumed.',
    },
  ),
  rule(
    'offer-financing-appraisal',
    'offer',
    { all: [fact('offer.financingRequired', 'eq', true), fact('offer.hasAppraisalContingency', 'eq', false)] },
    'Financing without recorded appraisal protection',
    'A financing label and absent recorded appraisal protection do not establish available appraisal-gap funds. Verify contract language, lender terms and reserves.',
    { 'offer.financingRequired': true, 'offer.hasAppraisalContingency': false },
    { 'offer.financingRequired': true, 'offer.hasAppraisalContingency': true },
  ),
  rule(
    'offer-financing-concessions',
    'offer',
    { all: [fact('offer.financingRequired', 'eq', true), fact('offer.sellerCreditPercent', 'gt', 0)] },
    'Financing and seller-credit interaction',
    'Seller credit is recorded on a financed offer. Applicable concession limits depend on the program, occupancy, loan terms and lender; none are inferred here.',
    { 'offer.financingRequired': true, 'offer.sellerCreditPercent': 2 },
    { 'offer.financingRequired': false, 'offer.sellerCreditPercent': 2 },
  ),
  rule(
    'offer-sale-contingency',
    'offer',
    fact('offer.hasSaleContingency', 'eq', true),
    'Dependent sale and closing continuity',
    'A recorded home-sale contingency creates a linked transaction dependency. Its status, notice terms and fallback plan are unknown.',
    { 'offer.hasSaleContingency': true },
    { 'offer.hasSaleContingency': false },
  ),
  rule(
    'offer-deposit-exposure',
    'offer',
    {
      all: [
        fact('offer.earnestMoney', 'gt', 0),
        fact('offer.financingRequired', 'eq', true),
        fact('offer.hasFinancingContingency', 'eq', false),
      ],
    },
    'Deposit terms require document review',
    'Earnest money plus financing without recorded financing protection warrants review of escrow, termination and remedy clauses. No universal deposit threshold or forfeiture rule is asserted.',
    { 'offer.earnestMoney': 10000, 'offer.financingRequired': true, 'offer.hasFinancingContingency': false },
    { 'offer.earnestMoney': 0, 'offer.financingRequired': true, 'offer.hasFinancingContingency': false },
  ),
  rule(
    'offer-expired',
    'offer',
    fact('offer.expired', 'eq', true),
    'Recorded expiration passed',
    'The entered expiration has passed. Verify a signed extension before treating the offer as actionable; no jurisdiction-specific deadline is inferred.',
    { 'offer.expired': true },
    { 'offer.expired': false },
  ),
  rule(
    'offer-past-closing',
    'offer',
    fact('offer.closeDays', 'lt', 0),
    'Entered closing date passed',
    'The recorded closing date precedes the analysis clock. Confirm an executed amendment and current transaction status.',
    { 'offer.closeDays': -1 },
    { 'offer.closeDays': 1 },
  ),
];

export function effectiveDomainRules(state?: DomainState, at = new Date().toISOString()): DomainRule[] {
  const reviewed =
    state?.proposals
      .filter(
        proposal =>
          proposal.status === 'approved' &&
          proposal.rule.approval.status === 'approved' &&
          proposal.review?.expiresAt &&
          Date.parse(proposal.review.expiresAt) > Date.parse(at) &&
          testRule(proposal.rule).passed,
      )
      .map(proposal => proposal.rule) ?? [];
  const overrides = new Map(reviewed.map(entry => [entry.id, entry]));
  return [...builtinRules.filter(entry => !overrides.has(entry.id)), ...reviewed].filter(
    entry =>
      Date.parse(entry.effectiveFrom) <= Date.parse(at) &&
      (!entry.effectiveTo || Date.parse(entry.effectiveTo) > Date.parse(at)),
  );
}
export function evaluateDomainRules(
  rules: DomainRule[],
  facts: Record<string, FactValue>,
  options: { category: 'cma' | 'offer'; regionId: string; asOf: string; perspective?: 'seller' | 'buyer' },
): RuleFinding[] {
  return rules
    .filter(
      entry =>
        entry.category === options.category &&
        (entry.regionIds.includes('*') || entry.regionIds.includes(options.regionId)) &&
        Date.parse(entry.effectiveFrom) <= Date.parse(options.asOf) &&
        (!entry.effectiveTo || Date.parse(entry.effectiveTo) > Date.parse(options.asOf)),
    )
    .map(entry => {
      validateExpression(entry.condition);
      const truth = evaluateExpression(entry.condition, facts);
      const exceptionTruths = entry.exceptions.map(exception => evaluateExpression(exception.condition, facts));
      const exceptions = entry.exceptions.filter((_, index) => exceptionTruths[index] === true);
      const state =
        exceptions.length && truth === true
          ? 'exception'
          : truth === 'unknown' || (truth === true && exceptionTruths.includes('unknown'))
            ? 'insufficient-data'
            : truth
              ? 'triggered'
              : 'not-triggered';
      return {
        ruleId: entry.id,
        ruleVersion: entry.version,
        title: entry.title,
        state,
        severity: entry.severity,
        classification: entry.classification,
        explanation:
          options.perspective === 'seller'
            ? (entry.sellerExplanation ?? entry.explanation)
            : options.perspective === 'buyer'
              ? (entry.buyerExplanation ?? entry.explanation)
              : entry.explanation,
        observedFacts: Object.fromEntries(
          [
            ...new Set([
              ...expressionFacts(entry.condition),
              ...entry.exceptions.flatMap(exception => expressionFacts(exception.condition)),
            ]),
          ]
            .filter(name => facts[name] !== undefined)
            .map(name => [name, facts[name]]),
        ),
        evidenceIds: entry.evidence.map(source => source.id),
        approvalStatus: entry.approval.status,
        exceptionLabels: exceptions.map(exception => exception.label),
      };
    });
}
export function cmaDomainFacts(cma: CmaResult): Record<string, FactValue> {
  const ratios = cma.comps
    .map(comp => {
      const price = cma.inputSnapshot?.candidates.find(property => property.id === comp.propertyId)?.soldPrice;
      return price && price > 0 ? comp.grossAdjustment / price : null;
    })
    .filter((value): value is number => value !== null);
  return {
    'cma.compCount': cma.comps.length,
    'cma.maxGrossAdjustmentRatio': ratios.length === cma.comps.length && ratios.length ? Math.max(...ratios) : null,
    'cma.relativeRangeWidth': cma.estimate > 0 ? (cma.high - cma.low) / cma.estimate : null,
    'cma.manualTrend': cma.assumptions.monthlyTrend !== 0,
  };
}
export function explainCma(cma: CmaResult): Explainability {
  return {
    known: [
      `${cma.comps.length} eligible closed sales; analysis frozen ${cma.asOf}.`,
      `Calculation version ${cma.version}; checksum ${cma.calculationHash}.`,
    ],
    computed: [
      {
        label: 'Adjusted-comparable estimate',
        value: cma.estimate,
        formula: 'Sum(adjusted closing price × normalized distance/age/size weight)',
        evidenceIds: cma.comps.map(comp => comp.propertyId),
      },
      {
        label: 'Empirical range width',
        value: cma.high - cma.low,
        formula: 'Maximum minus minimum adjusted comparable price; not a confidence interval',
        evidenceIds: cma.sourceIds,
      },
    ],
    assumptions: [
      'Feature rates, time trend, distance/age/size filters and rule thresholds are explicit analyst choices, not learned market facts.',
    ],
    unknowns: [
      'Condition verification, concessions, title, legal use, unobserved quality and representativeness of the supplied sales.',
      'No calibrated sale probability, days-to-sale forecast, or expert agreement measurement is available.',
    ],
    professionalDecision: [
      'Inspect comp eligibility, adjustment sensitivity and conflicting evidence before selecting a client-facing recommendation.',
    ],
    evidenceIds: [
      ...new Set([cma.subjectId, ...cma.comps.map(comp => comp.propertyId), ...cma.sourceIds, cma.calculationHash]),
    ],
  };
}
export function createDomainState(): DomainState {
  return { version: 1, proposals: [], evaluations: [], safetyEvents: [] };
}
export const ruleDigest = (ruleDefinition: DomainRule) => calculationChecksum(ruleDefinition);

/** Read-only, permission-scoped evidence for assistant retrieval; no model-generated arithmetic or legal conclusions. */
export function summarizeDomainContext(
  original: Workspace,
  context: { propertyId?: string; cmaId?: string; transactionId?: string } = {},
) {
  const research = scopeWorkspaceForAccess(original, 'research'),
    valuation = scopeWorkspaceForAccess(original, 'valuation');
  const transaction = context.transactionId
    ? research.transactions.find(record => record.id === context.transactionId)
    : undefined;
  const propertyId = context.propertyId ?? transaction?.propertyId;
  const cma = context.cmaId
    ? valuation.cmas.find(record => record.id === context.cmaId && (!propertyId || record.propertyId === propertyId))
    : propertyId
      ? [...valuation.cmas]
          .filter(record => record.propertyId === propertyId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      : undefined;
  const regionId =
    research.fabric?.records.find(record => (record.propertyId ?? record.id) === (propertyId ?? cma?.propertyId))
      ?.regionId ??
    research.fabric?.selectedRegionId ??
    'austin';
  const rules = effectiveDomainRules(research.domain);
  const findings = cma
    ? evaluateDomainRules(rules, cmaDomainFacts(cma.result), {
        category: 'cma',
        regionId,
        asOf: new Date().toISOString(),
      })
    : [];
  const citations = cma
    ? [
        {
          id: cma.id,
          label: 'Frozen computed CMA evidence',
          detail: `Computed estimate ${cma.result.estimate}; empirical range ${cma.result.low}–${cma.result.high}; checksum ${cma.result.calculationHash}. Not an appraisal, confidence interval or guaranteed outcome.`,
        },
        ...findings
          .filter(finding => finding.state === 'triggered' || finding.state === 'insufficient-data')
          .map(finding => ({
            id: finding.ruleId,
            label: `${finding.title} · ${finding.approvalStatus}`,
            detail: `${finding.explanation} Classification ${finding.classification}; rule ${finding.ruleVersion}.`,
          })),
      ]
    : [];
  if (transaction)
    citations.push({
      id: transaction.id,
      label: 'Recorded transaction workflow',
      detail: `${transaction.milestones.length} entered milestones, ${transaction.milestones.filter(milestone => milestone.status === 'complete').length} marked complete. Entered reminders do not establish legal deadlines.`,
    });
  return {
    facts: {
      version: DOMAIN_VERSION,
      regionId,
      findings,
      cmaExplainability: cma ? explainCma(cma.result) : undefined,
      transaction: transaction
        ? {
            id: transaction.id,
            recordedMilestones: transaction.milestones.length,
            completedMilestones: transaction.milestones.filter(milestone => milestone.status === 'complete').length,
          }
        : undefined,
    },
    citations,
    missingInformation: [
      'Built-in practice rules have not received independent expert validation; no jurisdiction-specific legal deadline is inferred.',
      ...(!cma ? ['No authorized matching saved CMA was retrieved for this context.'] : []),
      ...(context.transactionId && !transaction
        ? ['The requested transaction is unavailable in the authorized context.']
        : []),
      'Document interpretation, legal applicability, verified condition and contract-specific remedies require professional review.',
    ],
  };
}
