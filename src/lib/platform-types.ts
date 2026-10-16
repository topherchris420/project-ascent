export type PlanId = 'free' | 'pro' | 'team' | 'enterprise';
export type LicenseVerification = {
  status: 'unsubmitted' | 'pending' | 'verified' | 'rejected' | 'expired';
  submissionId?: string;
  submittedBy?: string;
  state?: string;
  licenseNumber?: string;
  legalName?: string;
  submittedAt?: string;
  reviewedAt?: string;
  expiresAt?: string;
  evidence?: { url: string; reference?: string }[];
  reviewedBy?: string;
  reason?: string;
};
export type ProviderGrant = {
  id: string;
  providerId: string;
  regionIds: string[];
  allowedUses: string[];
  licenseReference: string;
  terms: string;
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string;
  reviewedBy: string;
  revokedAt?: string;
};
export type BillingState = {
  status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unconfigured';
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  lastEventCreated?: number;
  lastEventId?: string;
  lastEventPrecedence?: number;
};
export type UsageMetric = 'aiRequests' | 'fabricQueries';
export type UsageEvent = {
  id: string;
  metric: string;
  units: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd: number;
  at: string;
  reference?: string;
};
export type MonthlyUsage = {
  period: string;
  aiRequests: number;
  fabricQueries: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  events: UsageEvent[];
};
export type PlatformState = {
  version: 1;
  plan: PlanId;
  billing: BillingState;
  verification: LicenseVerification;
  providerGrants: ProviderGrant[];
  usage: MonthlyUsage;
  usageHistory?: MonthlyUsage[];
};
export type Entitlements = {
  plan: PlanId;
  seats: number;
  aiRequestsPerMonth: number;
  fabricQueriesPerMonth: number;
  licensedData: boolean;
  basicCmaUnlimited: true;
  costRatesConfigured: boolean;
};
export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  permanentFree: boolean;
  configured: boolean;
  priceLabel: string;
  seats: number;
  aiRequestsPerMonth: number;
  fabricQueriesPerMonth: number;
};
