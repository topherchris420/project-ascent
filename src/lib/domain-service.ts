import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace } from './db';
import { appendAudit } from './service';
import { hasVerifiedLicense } from './platform';
import { activePropertyIds, regionConfig, scopeWorkspaceForAccess } from './fabric';
import {
  builtinRules,
  cmaDomainFacts,
  createDomainState,
  effectiveDomainRules,
  evaluateDomainRules,
  explainCma,
  factRegistry,
  ruleDigest,
  testRule,
  validateExpression,
} from './domain';
import { analyzeOfferRisks } from './offer-risk';
import { fairHousingAuditSummary, inspectFairHousing } from './fair-housing';
import type {
  DomainEvidence,
  DomainEvaluation,
  DomainRule,
  FactValue,
  FairHousingSurface,
  RuleExpression,
} from './domain-types';
import type { Actor, Workspace } from './types';

const scalar = z.union([z.string().max(300), z.number().finite(), z.boolean(), z.null()]);
const expression: z.ZodType<RuleExpression> = z.lazy(() =>
  z.union([
    z.strictObject({
      fact: z.string().min(1).max(100),
      op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'in']),
      value: z.union([scalar, z.array(scalar).min(1).max(20)]).optional(),
    }),
    z.strictObject({ all: z.array(expression).min(1).max(12) }),
    z.strictObject({ any: z.array(expression).min(1).max(12) }),
    z.strictObject({ not: expression }),
  ]),
);
const iso = z.iso.datetime({ offset: true });
const https = z
  .url()
  .max(2000)
  .refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Evidence must use HTTPS without credentials.');
const evidence = z.strictObject({
  id: z.string().min(1).max(100),
  label: z.string().min(3).max(500),
  url: https.optional(),
  retrievedAt: iso,
  kind: z.enum(['official', 'analyst', 'expert']),
});
const ruleSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,80}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().trim().min(3).max(150),
  category: z.enum(['cma', 'offer']),
  classification: z.enum(['legal', 'professional-practice', 'judgment']),
  regionIds: z.array(z.string().min(1).max(50)).min(1).max(20),
  effectiveFrom: iso,
  effectiveTo: iso.optional(),
  condition: expression,
  exceptions: z
    .array(z.strictObject({ id: z.string().max(80), label: z.string().min(3).max(500), condition: expression }))
    .max(10),
  severity: z.enum(['info', 'review']),
  explanation: z.string().min(10).max(2000),
  sellerExplanation: z.string().max(2000).optional(),
  buyerExplanation: z.string().max(2000).optional(),
  assumptions: z.array(z.string().max(500)).max(20),
  professionalDecision: z.string().min(10).max(1000),
  evidence: z.array(evidence).min(1).max(10),
  tests: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(80),
        facts: z.record(z.string().max(100), scalar),
        expectedTriggered: z.boolean(),
      }),
    )
    .min(2)
    .max(50),
});
const surfaces = z.enum([
  'client-preferences',
  'search',
  'advertising',
  'client-communication',
  'assistant-input',
  'assistant-output',
]);
export const domainActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('checkSafety'), text: z.string().max(20000), surface: surfaces }),
  z.strictObject({
    action: z.literal('evaluate'),
    context: z.enum(['cma', 'offers']),
    propertyId: z.string().max(100).optional(),
    currentCmaId: z.string().max(100).optional(),
    perspective: z.enum(['seller', 'buyer']).optional(),
  }),
  z.strictObject({ action: z.literal('proposeRule'), rule: ruleSchema }),
  z.strictObject({
    action: z.literal('proposePractice'),
    title: z.string().trim().min(3).max(150),
    jurisdiction: z.string().min(1).max(50),
    fact: z.string().min(1).max(100),
    operator: z.enum(['gt', 'lt', 'eq']),
    value: z.union([z.number().finite(), z.boolean(), z.string().max(300)]),
    evidenceUrl: https,
    exceptions: z.array(z.string().trim().min(3).max(300)).max(10).optional(),
  }),
]);
const limitations = [
  'Built-in rules are explicitly unreviewed analyst-practice assumptions, not law or independently validated expertise.',
  'Rule cases verify deterministic execution, not scientific validity, legal applicability or expert agreement.',
  'No expert participation or professional review outcome is fabricated. Qualified independent reviews require a configured trusted service.',
  'State-specific legal deadlines, lender concession limits, earnest-money minimums and closing probabilities are not inferred.',
  'Fair-housing checks are deterministic triage with documented blind spots; an allow decision is not a compliance certification.',
];

function snapshot(raw: Workspace, options: { propertyId?: string; perspective?: 'seller' | 'buyer' } = {}) {
  const workspace = scopeWorkspaceForAccess(raw),
    analytical = scopeWorkspaceForAccess(raw, 'valuation');
  const domain = workspace.domain ?? createDomainState(),
    rules = effectiveDomainRules(domain);
  const regionId = options.propertyId
    ? (workspace.fabric?.records.find(record => (record.propertyId ?? record.id) === options.propertyId)?.regionId ??
      workspace.fabric?.selectedRegionId ??
      'austin')
    : (workspace.fabric?.selectedRegionId ?? 'austin');
  const activeIds = new Set(activePropertyIds(analytical.fabric, regionId));
  const validIds = new Set([
    ...analytical.cmas.map(record => record.id),
    ...analytical.offers.map(record => record.id),
  ]);
  const evaluations = domain.evaluations.filter(
    entry => entry.entityIds.length > 0 && entry.entityIds.every(id => validIds.has(id)),
  );
  return {
    workspace,
    rules,
    proposals: domain.proposals,
    evaluations,
    factCatalog: factRegistry,
    offerRisks: analyzeOfferRisks(
      analytical.offers.filter(offer =>
        options.propertyId
          ? offer.propertyId === options.propertyId
          : !analytical.fabric || activeIds.has(offer.propertyId),
      ),
      { perspective: options.perspective, regionId, asOf: workspace.asOf, rules },
    ),
    limitations,
  };
}
export async function getDomainSnapshot(
  actor: Actor,
  options: { propertyId?: string; perspective?: 'seller' | 'buyer' } = {},
) {
  const workspace = await getWorkspace(actor.tenantId);
  if (
    options.propertyId &&
    !scopeWorkspaceForAccess(workspace).properties.some(property => property.id === options.propertyId)
  )
    throw new HttpError(404, 'Property is unavailable in this authorized workspace.');
  return snapshot(workspace, options);
}
export async function assessAndRecordSafety(actor: Actor, text: string, surface: FairHousingSurface) {
  const assessment = inspectFairHousing(text, { surface });
  await mutateWorkspace(actor, workspace => {
    workspace.domain ??= createDomainState();
    const id = randomUUID();
    workspace.domain.safetyEvents.push({
      id,
      at: new Date().toISOString(),
      actorId: actor.id,
      surface,
      ...fairHousingAuditSummary(assessment),
    });
    workspace.domain.safetyEvents = workspace.domain.safetyEvents.slice(-1000);
    appendAudit(
      workspace,
      actor,
      'inspectFairHousing',
      id,
      `Surface ${surface}; decision ${assessment.decision}; policy ${assessment.policyVersion}; codes ${assessment.findings.map(finding => finding.code).join(', ') || 'none'}. No raw text recorded.`,
    );
    return null;
  });
  return assessment;
}
function practiceRule(
  input: Extract<z.infer<typeof domainActionSchema>, { action: 'proposePractice' }>,
  now: string,
): DomainRule {
  regionConfig(input.jurisdiction);
  const fact = Object.hasOwn(factRegistry, input.fact) ? factRegistry[input.fact] : undefined;
  if (!fact || typeof input.value !== fact.type || (input.operator !== 'eq' && fact.type !== 'number'))
    throw new HttpError(400, 'Use a registered fact with a compatible operator and value.');
  const yes =
    input.operator === 'gt' ? Number(input.value) + 1 : input.operator === 'lt' ? Number(input.value) - 1 : input.value;
  const no =
    input.operator === 'eq'
      ? typeof input.value === 'boolean'
        ? !input.value
        : typeof input.value === 'number'
          ? input.value + 1
          : `${input.value}-different`
      : input.value;
  return {
    id: `practice-${randomUUID()}`,
    version: '1.0.0',
    title: input.title,
    category: input.fact.startsWith('cma.') ? 'cma' : 'offer',
    classification: 'professional-practice',
    regionIds: [input.jurisdiction],
    effectiveFrom: now,
    condition: { fact: input.fact, op: input.operator, value: input.value },
    exceptions: [],
    severity: 'review',
    explanation:
      'Proposed professional-practice review trigger. Its threshold and applicability require independent evidence and review before it can become a reviewed rule.',
    assumptions: [
      'User-proposed threshold; not a statutory requirement or fitted predictive model.',
      ...(input.exceptions ?? []).map(
        label => `Human-review exception claimed by proposer: ${label}. No automatic exception is inferred.`,
      ),
    ],
    professionalDecision:
      'Verify the source, local applicability, appropriate exceptions and impact on actual decisions before approval.',
    evidence: [
      {
        id: `proposed-evidence-${randomUUID()}`,
        label: 'Proposer-supplied source; not independently verified',
        url: input.evidenceUrl,
        retrievedAt: now,
        kind: 'analyst',
      },
    ],
    tests: [
      { id: 'proposed-positive', facts: { [input.fact]: yes }, expectedTriggered: true },
      { id: 'proposed-boundary', facts: { [input.fact]: no }, expectedTriggered: false },
    ],
    approval: { status: 'unreviewed' },
  };
}
export async function executeDomainAction(actor: Actor, raw: unknown) {
  const action = domainActionSchema.parse(raw);
  if (action.action === 'checkSafety')
    return { assessment: await assessAndRecordSafety(actor, action.text, action.surface) };
  requireEditor(actor);
  const changed = await mutateWorkspace(actor, workspace => {
    workspace.domain ??= createDomainState();
    const domain = workspace.domain;
    const now = new Date().toISOString();
    if (action.action === 'proposeRule' || action.action === 'proposePractice') {
      const definition: DomainRule =
        action.action === 'proposePractice'
          ? practiceRule(action, now)
          : { ...action.rule, approval: { status: 'unreviewed' } };
      try {
        validateExpression(definition.condition);
        definition.exceptions.forEach(entry => validateExpression(entry.condition));
      } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : 'Invalid rule expression.');
      }
      definition.regionIds.forEach(id => {
        if (id !== '*') regionConfig(id);
      });
      const assessment = inspectFairHousing(
        `${definition.title} ${definition.explanation} ${definition.professionalDecision}`,
        { surface: 'client-communication' },
      );
      if (assessment.decision !== 'allow')
        throw new HttpError(422, 'Rule wording requires fair-housing clarification before it can be proposed.');
      if (definition.tests.some(entry => Object.keys(entry.facts).some(name => !Object.hasOwn(factRegistry, name))))
        throw new HttpError(400, 'Rule cases may use registered financial/property facts only.');
      if (
        definition.classification === 'legal' &&
        !definition.evidence.some(source => source.kind === 'official' && source.url)
      )
        throw new HttpError(
          400,
          'A legal rule proposal requires an explicit official primary source and qualified legal review.',
        );
      const tests = testRule(definition),
        id = randomUUID();
      if (domain.proposals.some(entry => entry.rule.id === definition.id && entry.rule.version === definition.version))
        throw new HttpError(409, 'This rule ID/version already has an immutable proposal.');
      const proposal = {
        id,
        rule: structuredClone(definition),
        proposedBy: actor.id,
        proposedAt: now,
        status: 'pending' as const,
        testResult: tests,
      };
      domain.proposals.push(proposal);
      appendAudit(
        workspace,
        actor,
        'proposeDomainRule',
        id,
        `Version ${definition.version}; checksum ${ruleDigest(definition)}; automated cases ${tests.passed ? 'pass' : 'fail'}. Pending independent review; no authority granted.`,
      );
      return { proposal };
    }
    const scoped = scopeWorkspaceForAccess(workspace, 'valuation');
    let regionId = workspace.fabric?.selectedRegionId ?? 'austin';
    const rules = effectiveDomainRules(domain, now);
    let evaluation: DomainEvaluation;
    if (action.context === 'cma') {
      const cma = action.currentCmaId
        ? scoped.cmas.find(record => record.id === action.currentCmaId)
        : [...scoped.cmas]
            .filter(record => !action.propertyId || record.propertyId === action.propertyId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!cma) throw new HttpError(404, 'An authorized saved CMA is required.');
      if (action.propertyId && cma.propertyId !== action.propertyId)
        throw new HttpError(400, 'CMA and property contexts differ.');
      regionId =
        workspace.fabric?.records.find(record => (record.propertyId ?? record.id) === cma.propertyId)?.regionId ??
        regionId;
      evaluation = {
        id: randomUUID(),
        at: now,
        context: 'cma',
        regionId,
        entityIds: [cma.id],
        findings: evaluateDomainRules(rules, cmaDomainFacts(cma.result), { category: 'cma', regionId, asOf: now }),
        explainability: explainCma(cma.result),
        calculationChecksums: [cma.result.calculationHash],
      };
    } else {
      if (action.propertyId && !scoped.properties.some(property => property.id === action.propertyId))
        throw new HttpError(404, 'Property is unavailable for this authorized analysis.');
      if (action.propertyId)
        regionId =
          workspace.fabric?.records.find(record => (record.propertyId ?? record.id) === action.propertyId)?.regionId ??
          regionId;
      const activeIds = new Set(activePropertyIds(scoped.fabric, regionId));
      const offers = scoped.offers.filter(offer =>
        action.propertyId ? offer.propertyId === action.propertyId : !scoped.fabric || activeIds.has(offer.propertyId),
      );
      if (!offers.length) throw new HttpError(404, 'No authorized offers are available for this context.');
      const risks = analyzeOfferRisks(offers, {
        perspective: action.perspective,
        regionId,
        asOf: workspace.asOf,
        rules,
      });
      evaluation = {
        id: randomUUID(),
        at: now,
        context: 'offers',
        regionId,
        entityIds: offers.map(offer => offer.id),
        findings: risks.flatMap(risk => risk.findings),
        explainability: {
          known: ['Each offer is evaluated separately using its entered financial and contractual terms.'],
          computed: risks.flatMap(risk =>
            risk.explainability.computed.map(entry => ({ ...entry, label: `${risk.offerId}: ${entry.label}` })),
          ),
          assumptions: [...new Set(risks.flatMap(risk => risk.explainability.assumptions))],
          unknowns: [...new Set(risks.flatMap(risk => risk.explainability.unknowns))],
          professionalDecision: [...new Set(risks.flatMap(risk => risk.explainability.professionalDecision))],
          evidenceIds: [...new Set(risks.flatMap(risk => risk.explainability.evidenceIds))],
        },
        calculationChecksums: [],
      };
    }
    domain.evaluations.push(evaluation);
    domain.evaluations = domain.evaluations.slice(-200);
    appendAudit(
      workspace,
      actor,
      'evaluateDomainRules',
      evaluation.id,
      `${evaluation.context}; ${evaluation.findings.filter(finding => finding.state === 'triggered').length} review triggers; no recommendation action executed.`,
    );
    return { evaluation };
  });
  return { ...snapshot(changed.workspace), ...changed.result };
}

export const domainReviewSchema = z.strictObject({
  tenantId: z.uuid(),
  proposalId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  reviewerId: z.string().min(3).max(150),
  reviewerName: z.string().trim().min(3).max(150),
  qualification: z.enum(['licensed-real-estate-professional', 'attorney', 'researcher']),
  credentialEvidence: z.strictObject({
    url: https,
    reference: z.string().min(3).max(300),
    verifiedAt: iso,
    expiresAt: iso,
  }),
  evidence: z.array(evidence).min(1).max(10),
  reviewExpiresAt: iso,
  reason: z.string().trim().min(10).max(2000),
});
export function authorizeDomainReview(request: Request, configuredSecret = process.env.DOMAIN_RULE_REVIEW_SECRET) {
  if (!configuredSecret || configuredSecret.length < 32)
    throw new HttpError(503, 'Independent domain review service is not configured.');
  const actual = /^Bearer (\S{1,512})$/.exec(request.headers.get('authorization') || '')?.[1];
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!actual || !timingSafeEqual(hash(actual), hash(configuredSecret)))
    throw new HttpError(
      401,
      'Independent qualified reviewer service credentials are required; owner role does not approve a rule.',
    );
}
export async function reviewDomainRule(raw: unknown, at = new Date().toISOString()) {
  const input = domainReviewSchema.parse(raw),
    now = Date.parse(at);
  if (
    Date.parse(input.credentialEvidence.verifiedAt) > now ||
    Date.parse(input.credentialEvidence.expiresAt) <= now ||
    Date.parse(input.reviewExpiresAt) <= now ||
    Date.parse(input.reviewExpiresAt) > Math.min(Date.parse(input.credentialEvidence.expiresAt), now + 366 * 86400000)
  )
    throw new HttpError(
      400,
      'Reviewer evidence must be current and review expiry bounded by its credential and 366 days.',
    );
  const reviewer: Actor = {
    id: `domain-review:${createHash('sha256').update(input.reviewerId).digest('hex').slice(0, 24)}`,
    tenantId: input.tenantId,
    name: input.reviewerName,
    email: 'domain-review@system.invalid',
    role: 'owner',
  };
  const changed = await mutateWorkspace(reviewer, workspace => {
    const proposal = workspace.domain?.proposals.find(entry => entry.id === input.proposalId);
    if (!proposal || proposal.status !== 'pending')
      throw new HttpError(409, 'A current pending proposal is required; reviewed proposals are immutable.');
    if (proposal.proposedBy === input.reviewerId)
      throw new HttpError(403, 'The proposer cannot independently approve their own rule.');
    const tests = testRule(proposal.rule);
    if (input.decision === 'approved' && !tests.passed)
      throw new HttpError(422, 'All automated positive and negative cases must pass before approval.');
    if (
      input.decision === 'approved' &&
      proposal.rule.classification === 'legal' &&
      (input.qualification !== 'attorney' || !input.evidence.some(source => source.kind === 'official'))
    )
      throw new HttpError(
        403,
        'A legal rule requires qualified legal review and official evidence; a real-estate license does not establish legal authority.',
      );
    if (
      input.decision === 'approved' &&
      proposal.rule.classification === 'professional-practice' &&
      (!hasVerifiedLicense(workspace, at) || input.qualification !== 'licensed-real-estate-professional')
    )
      throw new HttpError(
        403,
        'Professional-practice approval requires current workspace license verification and an independently credentialed real-estate reviewer.',
      );
    proposal.testResult = tests;
    proposal.status = input.decision;
    proposal.review = {
      reviewerId: input.reviewerId,
      reviewerName: input.reviewerName,
      qualification: input.qualification,
      reviewedAt: at,
      expiresAt: input.reviewExpiresAt,
      credentialEvidence: input.credentialEvidence,
      evidence: input.evidence,
      reason: input.reason,
    };
    if (input.decision === 'approved')
      proposal.rule.approval = {
        status: 'approved',
        reviewerId: input.reviewerId,
        reviewedAt: at,
        qualification: input.qualification,
        reviewExpiresAt: input.reviewExpiresAt,
      };
    appendAudit(
      workspace,
      reviewer,
      input.decision === 'approved' ? 'approveDomainRule' : 'rejectDomainRule',
      proposal.id,
      `Independent service review; ${input.qualification}; rule checksum ${ruleDigest(proposal.rule)}. No market performance or legal correctness guarantee.`,
    );
    return { proposal };
  });
  return { ...snapshot(changed.workspace), ...changed.result };
}
