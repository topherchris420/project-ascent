export type FactValue = string | number | boolean | null;
export type RuleExpression =
  | { fact: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'in'; value?: FactValue | FactValue[] }
  | { all: RuleExpression[] }
  | { any: RuleExpression[] }
  | { not: RuleExpression };
export type DomainEvidence = {
  id: string;
  label: string;
  url?: string;
  retrievedAt: string;
  kind: 'official' | 'analyst' | 'expert';
};
export type RuleTestCase = { id: string; facts: Record<string, FactValue>; expectedTriggered: boolean };
export type DomainRule = {
  id: string;
  version: string;
  title: string;
  category: 'cma' | 'offer';
  classification: 'legal' | 'professional-practice' | 'judgment';
  regionIds: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  condition: RuleExpression;
  exceptions: { id: string; label: string; condition: RuleExpression }[];
  severity: 'info' | 'review';
  explanation: string;
  sellerExplanation?: string;
  buyerExplanation?: string;
  assumptions: string[];
  professionalDecision: string;
  evidence: DomainEvidence[];
  tests: RuleTestCase[];
  approval: {
    status: 'unreviewed' | 'approved';
    reviewerId?: string;
    reviewedAt?: string;
    qualification?: string;
    reviewExpiresAt?: string;
  };
};
export type RuleTestResult = { passed: boolean; total: number; failures: string[] };
export type RuleProposal = {
  id: string;
  rule: DomainRule;
  proposedBy: string;
  proposedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  testResult: RuleTestResult;
  review?: {
    reviewerId: string;
    reviewerName: string;
    qualification: string;
    reviewedAt: string;
    expiresAt?: string;
    credentialEvidence?: { url: string; reference: string; verifiedAt: string; expiresAt: string };
    evidence: DomainEvidence[];
    reason: string;
  };
};
export type Explainability = {
  known: string[];
  computed: { label: string; value: number | string; formula: string; evidenceIds: string[] }[];
  assumptions: string[];
  unknowns: string[];
  professionalDecision: string[];
  evidenceIds: string[];
};
export type RuleFinding = {
  ruleId: string;
  ruleVersion: string;
  title: string;
  state: 'triggered' | 'not-triggered' | 'insufficient-data' | 'exception';
  severity: 'info' | 'review';
  classification: DomainRule['classification'];
  explanation: string;
  observedFacts: Record<string, FactValue>;
  evidenceIds: string[];
  approvalStatus: 'unreviewed' | 'approved';
  exceptionLabels: string[];
};
export type OfferRisk = {
  offerId: string;
  perspective: 'seller' | 'buyer';
  findings: RuleFinding[];
  explainability: Explainability;
};
export type DomainEvaluation = {
  id: string;
  at: string;
  context: 'cma' | 'offers';
  regionId: string;
  entityIds: string[];
  findings: RuleFinding[];
  explainability: Explainability;
  calculationChecksums: string[];
};
export type FairHousingSurface =
  'client-preferences' | 'search' | 'advertising' | 'client-communication' | 'assistant-input' | 'assistant-output';
export type FairHousingInspection = {
  decision: 'allow' | 'review' | 'block';
  findings: {
    code: string;
    layer: 'intent' | 'protected-trait' | 'proxy' | 'steering' | 'advertising' | 'accommodation' | 'context';
    severity: 'review' | 'block';
    reason: string;
  }[];
  explanation: string;
  policyVersion: string;
  sourceIds: string[];
};
export type DomainState = {
  version: 1;
  proposals: RuleProposal[];
  evaluations: DomainEvaluation[];
  safetyEvents: {
    id: string;
    at: string;
    actorId: string;
    surface: FairHousingSurface;
    decision: FairHousingInspection['decision'];
    codes: string[];
    policyVersion: string;
  }[];
};
