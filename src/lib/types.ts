import type { PlatformState } from './platform-types';
import type { FabricState } from './fabric-types';
import type { DomainState } from './domain-types';
import type { TrustState } from './trust-types';
import type { MigrationState } from './migration-types';
import type { ProductState } from './product-types';
import type { AiState } from './ai-types';
import type { PropertyProviderState } from './property-provider-types';
import type { ReleaseAssessment } from './valuation-safeguards';
export type Role = 'owner' | 'agent' | 'viewer';
export type Actor = { id: string; tenantId: string; name: string; email: string; role: Role };
export type Source = {
  id: string;
  label: string;
  kind: 'synthetic' | 'licensed' | 'public' | 'user';
  observedAt: string;
  license: string;
  confidence: number;
};
export type Property = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  condition: number;
  status: 'active' | 'sold' | 'pending' | 'withdrawn';
  price: number;
  soldPrice?: number;
  listedAt: string;
  soldAt?: string;
  dom: number;
  sourceId: string;
  description: string;
  history: { date: string; event: string; price?: number }[];
};
export type ValuationProperty = Pick<
  Property,
  'id' | 'address' | 'city' | 'state' | 'zip' | 'lat' | 'lng' | 'beds' | 'baths' | 'sqft' | 'sourceId'
> &
  Partial<
    Omit<Property, 'id' | 'address' | 'city' | 'state' | 'zip' | 'lat' | 'lng' | 'beds' | 'baths' | 'sqft' | 'sourceId'>
  >;
export type ClientFollowUp = {
  id: string;
  title: string;
  dueAt: string;
  status: 'pending' | 'complete';
  createdAt: string;
  completedAt?: string;
  propertyId?: string;
};
export const clientStages = ['lead', 'active', 'under-contract', 'closed', 'lost'] as const;
export const clientRoles = ['buyer', 'seller', 'buyer-seller', 'investor', 'renter', 'lender', 'other'] as const;
export type ClientStage = (typeof clientStages)[number];
export type ClientRole = (typeof clientRoles)[number];
export type Client = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role?: ClientRole;
  stage: ClientStage;
  budget: number;
  preferences: string;
  savedPropertyIds: string[];
  timeline: { date: string; note: string }[];
  followUps?: ClientFollowUp[];
};
export type Offer = {
  id: string;
  propertyId: string;
  buyer: string;
  price: number;
  sellerCredit: number;
  financing: 'cash' | 'conventional' | 'fha' | 'va';
  downPercent: number;
  earnestMoney: number;
  contingencies: string[];
  closeDate: string;
  expiresAt: string;
  status: 'received' | 'counter-draft' | 'accepted' | 'declined';
};
/** A professional's weekly record of buyer response to an active listing. Counts are entered, never inferred. */
export type ListingCheckIn = {
  id: string;
  propertyId: string;
  weekOf: string;
  showings: number;
  secondShowings: number;
  offers: number;
  feedback: string;
  createdAt: string;
};
export type DateTextEvidence = {
  page?: number;
  start: number;
  end: number;
  quote: string;
  offsetBasis: 'normalized-page-text';
};
export type ContractDateIssue = {
  code:
    | 'missing-anchor'
    | 'conflicting-anchors'
    | 'conflicting-period'
    | 'ambiguous-direction'
    | 'unsupported-period'
    | 'invalid-date'
    | 'analysis-limit';
  message: string;
  evidence?: DateTextEvidence;
  anchors?: { date: string; kind: string; evidence: DateTextEvidence }[];
};
export type Milestone = {
  id: string;
  title: string;
  dueAt: string;
  status: 'pending' | 'complete';
  sourceId?: string;
  dateEvidence?: {
    candidateIndex: number;
    proposedDate: string;
    page?: number;
    rule?: string;
    extractionVersion?: string;
  };
};
export type Transaction = {
  id: string;
  propertyId: string;
  clientId: string;
  stage: 'preparing' | 'under-contract' | 'closed';
  milestones: Milestone[];
  notes: string;
};
export type DocumentRecord = {
  id: string;
  transactionId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  extractedDates: {
    date: string;
    context: string;
    approved: boolean;
    /** Contract event suggested from nearby wording. */
    label?: string;
    /** Stated in the text, or computed from a stated anchor date and a relative term. */
    basis?: 'stated' | 'computed';
    rule?: string;
    evidence?: DateTextEvidence;
    anchor?: { kind: string; date: string; evidence: DateTextEvidence };
    warnings?: string[];
    approvedDate?: string;
    approvedBy?: string;
    approvedAt?: string;
    reviewNote?: string;
    milestoneId?: string;
  }[];
  /** Characters of text read from the file; 0 means nothing was machine-readable. */
  textLength?: number;
  textExtraction?: {
    status: 'complete' | 'partial' | 'no-text' | 'unreadable';
    pagesRead: number;
    totalPages?: number;
    warnings: string[];
  };
  dateAnalysis?: { version: string; issues: ContractDateIssue[] };
};
export type CmaAssumptions = {
  sqftRate: number;
  bedroomValue: number;
  bathroomValue: number;
  conditionValue: number;
  monthlyTrend: number;
  maxDistanceMiles: number;
  maxAgeDays: number;
  maxSizeRatio: number;
};
export type CompAdjustment = {
  propertyId: string;
  distanceMiles: number;
  ageDays: number;
  grossAdjustment: number;
  netAdjustment: number;
  adjustedPrice: number;
  weight: number;
  adjustments: { factor: string; amount: number; explanation: string }[];
  warnings: string[];
};
export type CmaResult = {
  version: string;
  asOf: string;
  subjectId: string;
  assumptions: CmaAssumptions;
  comps: CompAdjustment[];
  excluded: { propertyId: string; reason: string }[];
  estimate: number;
  low: number;
  high: number;
  strategies: { conservative: number; moderate: number; aggressive: number };
  warnings: string[];
  sourceIds: string[];
  calculationHash: string;
  inputSnapshot?: { subject: ValuationProperty; candidates: ValuationProperty[] };
};
export type CmaRecord = {
  id: string;
  name: string;
  propertyId: string;
  createdAt: string;
  result: CmaResult;
  providerContext?: {
    normalizationWarnings: string[];
    incomplete: { id: string; missingFields: string[] }[];
    recordIds: string[];
  };
  /** Release gate result recorded when the analysis was saved. */
  release?: ReleaseAssessment;
  approvedAt?: string;
  /** What the approver saw and accepted: the gate decision at approval time and the review items acknowledged. */
  approval?: {
    decision: ReleaseAssessment['decision'];
    acknowledgedChecks: string[];
    policyVersion: string;
    approvedBy: string;
  };
};
export type SearchCriteria = {
  minBedrooms?: number;
  minBathrooms?: number;
  minSqft?: number;
  state?: string;
  zip?: string;
  status?: Property['status'] | 'all';
};
export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  maxPrice: number;
  clientId?: string;
  createdAt: string;
  criteria?: SearchCriteria;
};
export type Alert = {
  id: string;
  propertyId?: string;
  clientId?: string;
  searchId?: string;
  title: string;
  explanation: string;
  severity: 'info' | 'review';
  sourceIds: string[];
  createdAt: string;
  read: boolean;
  fingerprint: string;
};
export type GraphNode = {
  id: string;
  type: string;
  label: string;
  sourceIds: string[];
  validFrom: string;
  validTo?: string;
  confidence: number;
};
export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  sourceIds: string[];
  validFrom: string;
  confidence: number;
};
export type Outcome = {
  id: string;
  propertyId: string;
  cmaId: string;
  forecastAt: string;
  observedAt: string;
  actualPrice: number;
  notes: string;
};
export type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  at: string;
  details: string;
  previousHash: string;
  hash: string;
};
export type Approval = {
  id: string;
  kind: 'counteroffer' | 'communication' | 'pricing';
  entityId: string;
  draft: string;
  status: 'draft' | 'approved';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
};
export type Workspace = {
  schemaVersion: 1;
  mode: 'demo' | 'licensed';
  asOf: string;
  properties: Property[];
  sources: Source[];
  clients: Client[];
  offers: Offer[];
  transactions: Transaction[];
  documents: DocumentRecord[];
  cmas: CmaRecord[];
  savedSearches: SavedSearch[];
  alerts: Alert[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  outcomes: Outcome[];
  approvals: Approval[];
  listingCheckIns?: ListingCheckIn[];
  audit: AuditEvent[];
  platform?: PlatformState;
  fabric?: FabricState;
  domain?: DomainState;
  trust?: TrustState;
  migration?: MigrationState;
  product?: ProductState;
  ai?: AiState;
  providerData?: PropertyProviderState;
  settings: { retentionDays: number; organization: string };
};
export type MarketSummary = {
  active: number;
  sold: number;
  pending: number;
  withdrawn: number;
  medianDom: number;
  medianPrice: number;
  monthsSupply: number | null;
  absorption: number | null;
  priceReductions: number;
  sampleSize: number;
  warnings: string[];
  sourceIds: string[];
};
export type Scenario = {
  listPrice: number;
  difference: number;
  differencePercent: number;
  position: string;
  estimatedNet: number;
  costAssumptions: { commissionPercent: number; closingPercent: number; concessions: number };
  warnings: string[];
  evidenceIds: string[];
};
export type AssistantResponse = {
  mode: 'evidence' | 'model';
  answer: string;
  citations: { id: string; label: string; detail: string }[];
  missingInformation: string[];
  suggestedActions: string[];
  computed: boolean;
  tools: string[];
};
