import type { FabricUse } from './fabric-types';

export type PropertyProviderAction = 'getProperty' | 'searchProperties' | 'getSaleListings' | 'getComparables' | 'getValuation' | 'getMarketStatistics';
export type PropertyProviderPolicy = { providerId: 'rentcast'; version: string; reviewedBy: string; reviewedAt: string; expiresAt: string; licenseReference: string; termsUrl: string; allowedUses: FabricUse[]; retentionHours: number; cacheTtlMinutes: number; requiresProfessionalVerification: boolean };
export type PropertyProviderCache = { id: string; key: string; action: PropertyProviderAction; fixture: boolean; observedAt: string; expiresAt: string; policyVersion: string; grantId?: string; data: unknown };
export type PropertyProviderReservation = { id: string; key: string; action: PropertyProviderAction; fixture: boolean; actorId: string; at: string; leaseExpiresAt: string; status: 'pending' | 'succeeded' | 'failed'; estimatedCostUsd: number; durationMs?: number; completedAt?: string; errorCode?: 'provider' | 'permission' | 'timeout' | 'invalid-response' };
export type PropertyProviderUsage = { period: string; requests: number; reservedCostUsd: number; perUser: Record<string, number> };
export type PropertyProviderState = { version: 1; cache: PropertyProviderCache[]; reservations: PropertyProviderReservation[]; usage: PropertyProviderUsage; usageHistory: PropertyProviderUsage[]; policy?: PropertyProviderPolicy };
