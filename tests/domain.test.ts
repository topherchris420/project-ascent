import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  builtinRules,
  cmaDomainFacts,
  createDomainState,
  effectiveDomainRules,
  evaluateDomainRules,
  evaluateExpression,
  explainCma,
  testRule,
  validateExpression,
} from '../src/lib/domain';
import { analyzeOfferRisk, offerDomainFacts } from '../src/lib/offer-risk';
import {
  authorizeDomainReview,
  executeDomainAction,
  getDomainSnapshot,
  reviewDomainRule,
} from '../src/lib/domain-service';
import { bootstrapFabric, demoSource, scopeWorkspaceForAccess } from '../src/lib/fabric';
import { createDemoWorkspace } from '../src/lib/seed';
import { DEMO_AS_OF } from '../src/lib/analytics';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { ensurePlatform } from '../src/lib/platform';
import { verifyAudit } from '../src/lib/service';
import type { DomainEvaluation, DomainRule, RuleExpression } from '../src/lib/domain-types';

process.env.SQLITE_PATH = resolve('.data', `domain-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(async () => {
  await closeDatabase();
});
const ruleOptions = { category: 'cma' as const, regionId: 'austin', asOf: DEMO_AS_OF };

test('DSL evaluates bounded boolean combinations and preserves unknown inputs', () => {
  const expression: RuleExpression = {
    all: [{ fact: 'cma.compCount', op: 'lt', value: 3 }, { not: { fact: 'cma.manualTrend', op: 'eq', value: true } }],
  };
  validateExpression(expression);
  assert.equal(evaluateExpression(expression, { 'cma.compCount': 2, 'cma.manualTrend': false }), true);
  assert.equal(evaluateExpression(expression, { 'cma.compCount': 3 }), false);
  assert.equal(evaluateExpression(expression, { 'cma.compCount': 2 }), 'unknown');
  assert.equal(
    evaluateExpression(
      {
        any: [
          { fact: 'cma.compCount', op: 'lt', value: 3 },
          { fact: 'cma.manualTrend', op: 'eq', value: true },
        ],
      },
      { 'cma.compCount': 2 },
    ),
    true,
  );
});

test('DSL rejects arbitrary fields, prototype paths, code operators, incompatible types and excessive depth', () => {
  assert.throws(() => validateExpression({ fact: 'client.religion', op: 'eq', value: 'any' }), /Unsupported fact/);
  assert.throws(() => validateExpression({ fact: '__proto__', op: 'exists' }), /Unsupported fact/);
  assert.throws(
    () => validateExpression({ fact: 'cma.compCount', op: 'eval' as 'eq', value: 'process.exit()' }),
    /Unsupported/,
  );
  assert.throws(() => validateExpression({ fact: 'cma.compCount', op: 'eq', value: 'three' }), /fact type/);
  assert.throws(() => validateExpression({ fact: 'cma.manualTrend', op: 'gt', value: true }), /numeric/);
  let expression: RuleExpression = { fact: 'cma.compCount', op: 'lt', value: 3 };
  for (let depth = 0; depth < 8; depth++) expression = { not: expression };
  assert.throws(() => validateExpression(expression), /depth/);
});

test('all built-in practice rules are versioned, sourced, dated, explicitly unreviewed and pass positive/negative cases', () => {
  assert.equal(builtinRules.length, 11);
  for (const rule of builtinRules) {
    assert.equal(rule.approval.status, 'unreviewed');
    assert.notEqual(rule.classification, 'legal');
    assert.ok(rule.evidence.length);
    assert.ok(rule.effectiveFrom);
    assert.ok(rule.assumptions.some(assumption => assumption.includes('not law')));
    assert.equal(testRule(rule).passed, true, rule.id);
  }
});

test('exceptions and missing evidence are explicit instead of becoming a false confident rule result', () => {
  const rule: DomainRule = {
    ...structuredClone(builtinRules[0]),
    exceptions: [
      {
        id: 'verified-trend-exception',
        label: 'Synthetic exception label for interpreter verification, not a legal exception.',
        condition: { fact: 'cma.manualTrend', op: 'eq', value: true },
      },
    ],
  };
  assert.equal(
    evaluateDomainRules([rule], { 'cma.compCount': 2, 'cma.manualTrend': true }, ruleOptions)[0].state,
    'exception',
  );
  assert.equal(evaluateDomainRules([rule], { 'cma.compCount': 2 }, ruleOptions)[0].state, 'insufficient-data');
  assert.equal(
    evaluateDomainRules([rule], { 'cma.compCount': 2, 'cma.manualTrend': false }, ruleOptions)[0].state,
    'triggered',
  );
  assert.equal(testRule(rule).passed, false, 'A purported positive case cannot silently omit exception evidence.');
});

test('CMA facts and explanations derive from frozen arithmetic and identify unavailable raw-input evidence', () => {
  const cma = createDemoWorkspace().cmas.find(record => record.id === 'cma-01')!.result;
  const facts = cmaDomainFacts(cma);
  assert.equal(facts['cma.compCount'], 7);
  assert.equal(facts['cma.manualTrend'], false);
  assert.ok(Number(facts['cma.maxGrossAdjustmentRatio']) >= 0);
  const explanation = explainCma(cma);
  assert.equal(explanation.computed[0].value, cma.estimate);
  assert.ok(explanation.evidenceIds.includes(cma.calculationHash));
  assert.ok(explanation.unknowns.some(value => value.includes('No calibrated sale probability')));
  assert.equal(cmaDomainFacts({ ...cma, inputSnapshot: undefined })['cma.maxGrossAdjustmentRatio'], null);
});

test('offer risk evaluates interactions from both parties without a universal score or invented lender limits', () => {
  const offer = { ...createDemoWorkspace().offers[0], contingencies: ['Inspection: verify actual agreement'] };
  const seller = analyzeOfferRisk(offer, { perspective: 'seller', asOf: DEMO_AS_OF }),
    buyer = analyzeOfferRisk(offer, { perspective: 'buyer', asOf: DEMO_AS_OF });
  const triggered = seller.findings.filter(finding => finding.state === 'triggered').map(finding => finding.ruleId);
  assert.ok(triggered.includes('offer-financing-no-contingency'));
  assert.ok(triggered.includes('offer-financing-appraisal'));
  assert.ok(triggered.includes('offer-financing-concessions'));
  assert.ok(triggered.includes('offer-deposit-exposure'));
  assert.notEqual(
    seller.findings.find(finding => finding.ruleId === 'offer-financing-no-contingency')!.explanation,
    buyer.findings.find(finding => finding.ruleId === 'offer-financing-no-contingency')!.explanation,
  );
  assert.equal(seller.explainability.computed[0].value, 730000);
  assert.equal('riskScore' in seller, false);
  assert.ok(seller.explainability.unknowns.some(value => value.includes('program limits')));
  const cash = analyzeOfferRisk(createDemoWorkspace().offers[1], { asOf: DEMO_AS_OF });
  assert.ok(
    !cash.findings.some(finding => finding.ruleId.startsWith('offer-financing') && finding.state === 'triggered'),
  );
});

test('offer chronology and contingency tags remain evidence, not inferred legal deadlines or guarantees', () => {
  const offer = {
    ...createDemoWorkspace().offers[2],
    expiresAt: '2026-10-14T00:00:00.000Z',
    closeDate: '2026-10-13T00:00:00.000Z',
  };
  const facts = offerDomainFacts(offer, DEMO_AS_OF);
  assert.equal(facts['offer.expired'], true);
  assert.equal(facts['offer.hasSaleContingency'], true);
  const result = analyzeOfferRisk(offer, { asOf: DEMO_AS_OF });
  assert.ok(result.findings.some(finding => finding.ruleId === 'offer-past-closing' && finding.state === 'triggered'));
  assert.ok(result.explainability.computed.some(entry => entry.formula.includes('not a legal deadline')));
});

test('pending proposals do not alter active practice rules and expired independent reviews lose authority', () => {
  const state = createDomainState(),
    definition = { ...structuredClone(builtinRules[0]), id: 'independent-test-rule' };
  state.proposals.push({
    id: 'proposal',
    rule: definition,
    proposedAt: DEMO_AS_OF,
    proposedBy: 'proposer',
    status: 'pending',
    testResult: testRule(definition),
  });
  assert.ok(!effectiveDomainRules(state, DEMO_AS_OF).some(rule => rule.id === definition.id));
  const proposal = state.proposals[0];
  proposal.status = 'approved';
  proposal.rule.approval.status = 'approved';
  proposal.review = {
    reviewerId: 'independent',
    reviewerName: 'Synthetic reviewer',
    qualification: 'test-only',
    reviewedAt: DEMO_AS_OF,
    expiresAt: '2026-10-16T00:00:00.000Z',
    evidence: [],
    reason: 'Synthetic unit test of expiry only.',
  };
  assert.ok(effectiveDomainRules(state, DEMO_AS_OF).some(rule => rule.id === definition.id));
  assert.ok(!effectiveDomainRules(state, '2026-10-17T00:00:00.000Z').some(rule => rule.id === definition.id));
});

async function account() {
  return register({
    name: 'Domain Test Owner',
    email: `${randomUUID()}@example.test`,
    password: 'long test password 12345',
  });
}
const proposalInput = {
  action: 'proposePractice',
  title: 'Synthetic sparse evidence proposal',
  jurisdiction: 'austin',
  fact: 'cma.compCount',
  operator: 'lt',
  value: 3,
  evidenceUrl: 'https://www.hud.gov/stat/fheo/rights-obligations',
  exceptions: ['Human review may require additional verified sales.'],
};
function reviewInput(tenantId: string, proposalId: string) {
  return {
    tenantId,
    proposalId,
    decision: 'approved',
    reviewerId: 'independent-test-reviewer',
    reviewerName: 'Synthetic Independent Reviewer',
    qualification: 'licensed-real-estate-professional',
    credentialEvidence: {
      url: 'https://official.example/test-license',
      reference: 'Synthetic credential fixture, no real expert claimed.',
      verifiedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    evidence: [
      {
        id: 'test-independent-evidence',
        label: 'Synthetic review evidence, not actual expert validation',
        url: 'https://official.example/practice-reference',
        retrievedAt: '2026-10-15T00:00:00.000Z',
        kind: 'expert',
      },
    ],
    reviewExpiresAt: '2027-01-01T00:00:00.000Z',
    reason: 'Synthetic governance test only; does not claim a real expert reviewed a rule.',
  };
}

test('proposal persistence cannot forge approval and current qualification is independent of owner role', async () => {
  const session = await account();
  const proposed = await executeDomainAction(session.user, proposalInput);
  assert.ok('proposal' in proposed);
  const proposal = proposed.proposal!;
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.rule.approval.status, 'unreviewed');
  assert.equal(proposal.testResult.passed, true);
  const input = reviewInput(session.user.tenantId, proposal.id);
  await assert.rejects(reviewDomainRule({ ...input, reviewerId: session.user.id }), /cannot independently approve/);
  await assert.rejects(reviewDomainRule(input), /current workspace license/);
  await mutateWorkspace(session.user, workspace => {
    ensurePlatform(workspace).verification = {
      status: 'verified',
      reviewedBy: 'Synthetic verifier',
      reviewedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      evidence: [{ url: 'https://official.example/test-license' }],
    };
    return null;
  });
  const reviewed = await reviewDomainRule(input);
  assert.equal(reviewed.proposal.status, 'approved');
  assert.equal(reviewed.proposal.rule.approval.status, 'approved');
  assert.ok(reviewed.rules.some(rule => rule.id === proposal.rule.id));
  assert.equal(verifyAudit(await getWorkspace(session.user.tenantId)), true);
  await assert.rejects(reviewDomainRule(input), /pending proposal/);
});

test('failed rule cases and legal classification cannot gain authority from a successful owner session', async () => {
  const session = await account(),
    badRule = structuredClone(builtinRules[0]);
  const { approval: _, ...rawRule } = badRule;
  rawRule.id = 'bad-case-test-rule';
  rawRule.tests[0].expectedTriggered = false;
  const proposed = await executeDomainAction(session.user, { action: 'proposeRule', rule: rawRule });
  assert.ok('proposal' in proposed);
  assert.equal(proposed.proposal!.testResult.passed, false);
  await assert.rejects(
    reviewDomainRule(reviewInput(session.user.tenantId, proposed.proposal!.id)),
    /automated positive and negative/,
  );
  await assert.rejects(
    executeDomainAction(session.user, {
      action: 'proposeRule',
      rule: { ...rawRule, id: 'legal-no-source', classification: 'legal' },
    }),
    /official primary source/,
  );
  await assert.rejects(executeDomainAction({ ...session.user, role: 'viewer' }, proposalInput), /viewing only/);
  assert.throws(
    () =>
      authorizeDomainReview(
        new Request('http://localhost/api/domain/review', { headers: { cookie: 'owner=true' } }),
        'independent-service-secret-at-least-32-characters',
      ),
    /reviewer service credentials/,
  );
});

test('safety checks audit only structured findings and domain evaluation validates authorized context', async () => {
  const session = await account(),
    text = 'Private Person private@example.test wants no Muslim tenants.';
  const safety = await executeDomainAction(session.user, {
    action: 'checkSafety',
    text,
    surface: 'client-preferences',
  });
  assert.ok('assessment' in safety);
  assert.equal(safety.assessment!.decision, 'block');
  const stored = await getWorkspace(session.user.tenantId);
  assert.ok(stored.domain!.safetyEvents.length);
  assert.ok(!JSON.stringify(stored.domain).includes('private@example.test'));
  assert.ok(!stored.audit.some(entry => entry.details.includes('Private Person')));
  const result = await executeDomainAction(session.user, {
    action: 'evaluate',
    context: 'cma',
    propertyId: 'property-01',
    currentCmaId: 'cma-01',
  });
  assert.ok('evaluation' in result);
  assert.equal(
    result.evaluation!.calculationChecksums[0],
    stored.cmas.find(record => record.id === 'cma-01')!.result.calculationHash,
  );
  await assert.rejects(
    executeDomainAction(session.user, { action: 'evaluate', context: 'cma', currentCmaId: 'other-tenant-cma' }),
    /authorized saved CMA/,
  );
  await assert.rejects(
    executeDomainAction(session.user, {
      action: 'evaluate',
      context: 'cma',
      propertyId: 'property-02',
      currentCmaId: 'cma-01',
    }),
    /contexts differ/,
  );
  await assert.rejects(
    getDomainSnapshot(session.user, { propertyId: 'other-tenant-property' }),
    /authorized workspace/,
  );
});

test('raw workspace scoping removes persisted domain, trust and migration copies after provider revocation', () => {
  const workspace = createDemoWorkspace(),
    fabric = bootstrapFabric(workspace),
    platform = ensurePlatform(workspace),
    source = {
      ...demoSource('austin'),
      id: 'domain-restricted',
      providerId: 'domain-provider',
      kind: 'licensed' as const,
    };
  fabric.sources.push(source);
  workspace.sources.push({
    id: source.id,
    kind: 'licensed',
    label: 'Test restricted source',
    observedAt: DEMO_AS_OF,
    license: 'Synthetic access-control fixture only.',
    confidence: 0,
  });
  platform.verification = {
    status: 'verified',
    reviewedBy: 'Synthetic verifier',
    reviewedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    evidence: [{ url: 'https://official.example/test' }],
  };
  platform.providerGrants.push({
    id: 'domain-grant',
    providerId: source.providerId,
    regionIds: ['austin'],
    allowedUses: ['research', 'valuation', 'export'],
    licenseReference: 'Test only',
    terms: 'Synthetic grant fixture only.',
    issuedAt: '2026-10-01T00:00:00.000Z',
    verifiedAt: '2026-10-01T00:00:00.000Z',
    reviewedBy: 'Independent test operator',
    expiresAt: '2027-01-01T00:00:00.000Z',
  });
  const property = {
    ...workspace.properties[0],
    id: 'restricted-property',
    sourceId: source.id,
    description: 'RESTRICTED-COPY-MARKER',
  };
  workspace.properties.push(property);
  const cma = structuredClone(workspace.cmas.find(record => record.id === 'cma-01')!);
  cma.id = 'restricted-cma';
  cma.propertyId = property.id;
  cma.result.subjectId = property.id;
  cma.result.sourceIds.push(source.id);
  cma.result.inputSnapshot!.subject = property;
  workspace.cmas.push(cma);
  const evaluation: DomainEvaluation = {
    id: 'restricted-evaluation',
    at: DEMO_AS_OF,
    context: 'cma',
    regionId: 'austin',
    entityIds: [cma.id],
    findings: [],
    explainability: {
      known: ['RESTRICTED-COPY-MARKER'],
      computed: [
        { label: 'Restricted computed price', value: 999777, formula: 'Synthetic scope test', evidenceIds: [cma.id] },
      ],
      assumptions: [],
      unknowns: [],
      professionalDecision: [],
      evidenceIds: [cma.id],
    },
    calculationChecksums: [],
  };
  workspace.domain = { ...createDomainState(), evaluations: [evaluation] };
  workspace.trust = {
    version: 1,
    tickets: [
      {
        id: 'linked-ticket',
        kind: 'professional-review',
        title: 'RESTRICTED-COPY-MARKER',
        context: { cmaId: cma.id },
        message: 'RESTRICTED-COPY-MARKER',
        response: 'RESTRICTED-COPY-MARKER',
        status: 'responded',
        createdAt: DEMO_AS_OF,
        submittedBy: 'test',
        category: 'review',
      },
      {
        id: 'unlinked-ticket',
        kind: 'support',
        title: 'RESTRICTED-COPY-MARKER',
        context: {},
        message: 'RESTRICTED-COPY-MARKER',
        response: 'RESTRICTED-COPY-MARKER',
        status: 'responded',
        createdAt: DEMO_AS_OF,
        submittedBy: 'test',
        category: 'support',
      },
    ],
    feedback: [
      {
        id: 'linked-feedback',
        target: 'report',
        usefulness: 1,
        reasonCode: 'clear',
        at: DEMO_AS_OF,
        context: { cmaId: cma.id },
      },
    ],
  };
  workspace.migration = {
    version: 1,
    previews: [],
    commits: [
      {
        id: 'test-commit',
        previewId: 'test-preview',
        kind: 'notes',
        createdAt: DEMO_AS_OF,
        createdBy: 'test',
        rollbackUntil: '2026-10-16T00:00:00.000Z',
        status: 'committed',
        created: 0,
        updated: 1,
        skipped: 0,
        operations: [
          {
            entity: 'note',
            targetId: 'client-01',
            created: false,
            before: { note: 'RESTRICTED-COPY-MARKER' },
            after: { note: 'RESTRICTED-COPY-MARKER' },
          },
        ],
      },
    ],
    documentRefs: [],
  };
  assert.ok(scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF).domain!.evaluations.length);
  platform.providerGrants[0].revokedAt = DEMO_AS_OF;
  const encoded = JSON.stringify(scopeWorkspaceForAccess(workspace, 'research', DEMO_AS_OF));
  assert.ok(!encoded.includes('RESTRICTED-COPY-MARKER'));
  assert.ok(!encoded.includes('999777'));
  assert.ok(
    workspace.domain.evaluations.length,
    'Durable history is preserved; only authorized read projections change.',
  );
});
