export type TrustContext = {
  propertyId?: string;
  clientId?: string;
  cmaId?: string;
  transactionId?: string;
  domainProposalId?: string;
};
export type TrustTicket = {
  id: string;
  kind: 'support' | 'professional-review' | 'training';
  title: string;
  category: string;
  context: TrustContext;
  message?: string;
  status: 'open' | 'responded' | 'resolved';
  createdAt: string;
  submittedBy: string;
  response?: string;
  respondedAt?: string;
  resolvedAt?: string;
  professionalReview?: {
    status: 'pending' | 'reviewed' | 'declined';
    reviewerId?: string;
    reviewedAt?: string;
    evidence?: { url: string; reference: string }[];
  };
};
export type TrustFeedback = {
  id: string;
  target: 'academy' | 'assistant' | 'report' | 'support';
  usefulness: number;
  reasonCode: 'clear' | 'actionable' | 'missing-evidence' | 'confusing' | 'not-relevant';
  at: string;
  context: TrustContext;
};
export type TrustState = { version: 1; tickets: TrustTicket[]; feedback: TrustFeedback[] };
export type AcademyTask = {
  id: string;
  title: string;
  description: string;
  nextAction: string;
  complete: boolean;
  evidenceIds: string[];
};
