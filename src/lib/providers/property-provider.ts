/** Server-provider contract. Estimates and asking prices never masquerade as recorded sales. */
export type PropertyProviderId = 'rentcast' | (string & {});
export type ProviderEndpoint = '/properties' | '/listings/sale' | '/avm/value' | '/markets' | 'coverage';
export type ProviderPropertyType =
  'Single Family' | 'Condo' | 'Townhouse' | 'Manufactured' | 'Multi-Family' | 'Apartment' | 'Land';
export interface ProviderAddress {
  formatted: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  stateFips?: string;
  countyFips?: string;
}
export interface ProviderFacts {
  propertyType?: ProviderPropertyType;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  garageSpaces?: number;
  hoaMonthlyFee?: number;
}
export interface ProviderRecordedSale {
  kind: 'recorded-sale';
  date: string;
  price?: number;
  sourceField: 'history' | 'lastSale';
}
export interface ProviderProperty {
  kind: 'property-record';
  id: string;
  providerId: PropertyProviderId;
  address: ProviderAddress;
  location?: { latitude: number; longitude: number };
  facts: ProviderFacts;
  sales: ProviderRecordedSale[];
  /** Missing condition is intentional: this provider does not establish inspected condition. */
  assessorId?: string;
  subdivision?: string;
  zoning?: string;
  assessments?: { year: number; value?: number; land?: number; improvements?: number }[];
  taxes?: { year: number; total?: number }[];
}
export interface ProviderListingEvent {
  event: string;
  date: string;
  askingPrice?: number;
}
export interface ProviderSaleListing {
  kind: 'sale-listing';
  id: string;
  providerId: PropertyProviderId;
  address: ProviderAddress;
  location?: { latitude: number; longitude: number };
  facts: ProviderFacts;
  status?: 'Active' | 'Inactive';
  askingPrice?: number;
  listedAt?: string;
  removedAt?: string;
  lastSeenAt?: string;
  daysOnMarket?: number;
  listingType?: string;
  history?: ProviderListingEvent[];
}
export interface ProviderComparable extends ProviderSaleListing {
  distanceMiles?: number;
  correlation?: number;
}
export interface ProviderValuation {
  kind: 'provider-estimate';
  estimate: number;
  rangeLow?: number;
  rangeHigh?: number;
  subject?: ProviderProperty;
  comparables: ProviderComparable[];
  /** Provider-claimed interval, not locally calibrated or a guaranteed sale outcome. */
  intervalClaim?: { coverage: number; source: string };
}
export interface ProviderMarketPeriod {
  date?: string;
  averageAskingPrice?: number;
  medianAskingPrice?: number;
  minAskingPrice?: number;
  maxAskingPrice?: number;
  averageDaysOnMarket?: number;
  medianDaysOnMarket?: number;
  totalListings?: number;
  newListings?: number;
}
export interface ProviderMarketStatistics {
  kind: 'sale-listing-market';
  zipCode: string;
  lastUpdatedAt?: string;
  current?: ProviderMarketPeriod;
  history: ProviderMarketPeriod[];
}
export interface ProviderCoverage {
  country: 'US';
  status: 'documented-unverified';
  supportedEndpoints: ProviderEndpoint[];
  limitations: string[];
  documentationUrl: string;
  liveConnectionVerified: false;
}
export interface ProviderProvenance {
  providerId: PropertyProviderId;
  endpoint: ProviderEndpoint;
  retrievedAt: string;
  schemaVersion: 'rentcast-normalized-v1' | 'synthetic-fixture-v1';
  requestId?: string;
  /** Real provider data remains licensed even when originally sourced from public records. */
  dataKind: 'licensed-provider' | 'provider-documentation' | 'synthetic';
}
export interface ProviderPage {
  offset: number;
  limit: number;
  returned: number;
  total?: number;
  nextOffset?: number;
  hasMore: boolean;
  hasMoreIsEstimate: boolean;
}
export interface ProviderResult<T> {
  data: T;
  provenance: ProviderProvenance;
  warnings: string[];
  page?: ProviderPage;
}
export interface PropertyLookupQuery {
  address: string;
}
export interface PropertySearchQuery {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  propertyType?: ProviderPropertyType;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  saleDateRange?: number;
  limit?: number;
  offset?: number;
  includeTotalCount?: boolean;
}
export interface SaleListingsQuery extends Omit<PropertySearchQuery, 'saleDateRange'> {
  status?: 'Active' | 'Inactive';
  price?: number;
  daysOld?: number;
}
export interface ValuationQuery {
  address?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: ProviderPropertyType;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  maxRadius?: number;
  daysOld?: number;
  compCount?: number;
  lookupSubjectAttributes?: boolean;
}
export interface MarketStatisticsQuery {
  zipCode: string;
  historyRange?: number;
}
export type PropertyProviderErrorCode =
  | 'not-configured'
  | 'invalid-query'
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'provider-error'
  | 'invalid-response';
export class PropertyProviderError extends Error {
  constructor(
    public readonly code: PropertyProviderErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'PropertyProviderError';
  }
}
export interface PropertyDataProvider {
  readonly id: PropertyProviderId;
  getProperty(query: PropertyLookupQuery): Promise<ProviderResult<ProviderProperty | null>>;
  searchProperties(query: PropertySearchQuery): Promise<ProviderResult<ProviderProperty[]>>;
  getSaleListings(query: SaleListingsQuery): Promise<ProviderResult<ProviderSaleListing[]>>;
  /** AVM-selected sale LISTINGS, not verified closed-sale comparables. One billable AVM call. */
  getComparables(query: ValuationQuery): Promise<ProviderResult<ProviderComparable[]>>;
  getValuation(query: ValuationQuery): Promise<ProviderResult<ProviderValuation>>;
  getMarketStatistics(query: MarketStatisticsQuery): Promise<ProviderResult<ProviderMarketStatistics>>;
  /** Documentation metadata only; never incurs a health-check/provider request. */
  getCoverage(): Promise<ProviderResult<ProviderCoverage>>;
}
