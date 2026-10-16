import type { Property } from './types';

/** Registry keys are extensible; adding a jurisdiction does not change analytical engines. */
export type RegionId = string;
export type RegionConfig = {
  id: RegionId;
  name: string;
  states: string[];
  countyFips: string[];
  center: { lat: number; lng: number };
  description: string;
};
export type FabricUse = 'research' | 'valuation' | 'market' | 'export';
export type FabricLicense = {
  label: string;
  allowedUses: FabricUse[];
  exportAllowed: boolean;
  retentionDays: number;
  expiresAt?: string;
  termsUrl?: string;
  deploymentScope?: 'local-development' | 'production';
  requiresProfessionalVerification?: boolean;
  providerGrantIds?: string[];
  contractReview?: { reviewedBy: string; reviewedAt: string; expiresAt: string; licenseReference: string };
};
export type FabricSource = {
  id: string;
  providerId: string;
  label: string;
  kind: 'synthetic' | 'public' | 'licensed';
  adapter: 'reso' | 'assessor' | 'census' | 'rentcast';
  regionIds: RegionId[];
  observedAt: string;
  expectedUpdateHours: number;
  license: FabricLicense;
  documentationUrl: string;
};
export type PropertyFacts = Pick<
  Property,
  | 'beds'
  | 'baths'
  | 'sqft'
  | 'lotSqft'
  | 'yearBuilt'
  | 'condition'
  | 'status'
  | 'price'
  | 'soldPrice'
  | 'listedAt'
  | 'soldAt'
  | 'dom'
  | 'description'
  | 'history'
>;
export type FabricProvenance = {
  sourceId: string;
  externalId: string;
  observedAt: string;
  fields: string[];
  checksum: string;
};
export type CanonicalProperty = {
  id: string;
  regionId: RegionId;
  propertyId?: string;
  countyFips?: string;
  parcelId?: string;
  address?: string;
  unit?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  facts: Partial<PropertyFacts>;
  provenance: FabricProvenance[];
  versions: { at: string; checksum: string; sourceId: string; changedFields: string[] }[];
  missingFields: string[];
  quality: { score: number; explanations: string[] };
  updatedAt: string;
  synthetic: boolean;
};
export type ProviderGrant = {
  id: string;
  providerId: string;
  regionIds: RegionId[];
  allowedUses: FabricUse[];
  verifiedAt: string;
  verifiedBy: string;
  expiresAt: string;
};
export type FabricAccessContext = {
  credentialVerified: boolean;
  credentialRegionIds?: RegionId[];
  credentialExpiresAt?: string;
};
export type IngestRun = {
  id: string;
  sourceId: string;
  regionId: RegionId;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed' | 'denied';
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  quarantined: number;
  errors: string[];
};
export type QuarantineRecord = {
  id: string;
  runId: string;
  sourceId: string;
  externalId?: string;
  reason: string;
  candidateIds: string[];
  at: string;
  checksum: string;
};
export type FabricState = {
  version: 1;
  selectedRegionId: RegionId;
  dataMode: 'demo' | 'authorized';
  records: CanonicalProperty[];
  sources: FabricSource[];
  runs: IngestRun[];
  quarantine: QuarantineRecord[];
  grants: ProviderGrant[];
};
export type RegionCoverage = {
  regionId: RegionId;
  records: number;
  projectable: number;
  closedSales: number;
  capabilities: { propertyResearch: boolean; cma: boolean; market: boolean; licensedFeed: boolean };
  limitations: string[];
  sourceIds: string[];
};
export type SourceAccess = {
  sourceId: string;
  allowed: boolean;
  reasons: string[];
  freshness: { ageHours: number | null; status: 'fresh' | 'stale' | 'unknown'; explanation: string };
};
export type NormalizedIncoming = {
  externalId: string;
  identity: Pick<
    CanonicalProperty,
    'countyFips' | 'parcelId' | 'address' | 'unit' | 'city' | 'state' | 'zip' | 'lat' | 'lng'
  >;
  facts: Partial<PropertyFacts>;
  observedAt: string;
};
