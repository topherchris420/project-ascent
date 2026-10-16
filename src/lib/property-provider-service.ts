import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calculateCma } from './analytics';
import { HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace, transaction } from './db';
import { bootstrapFabric } from './fabric';
import { ensurePlatform, hasVerifiedLicense } from './platform';
import { appendAudit } from './service';
import { recordProductAction } from './product';
import { RentCastProvider } from './providers/rentcast';
import { FixturePropertyProvider } from './providers/fixture-property';
import { buildProviderCmaInputs } from './providers/normalize-property';
import { consolidateProviderRecords, type ProviderRecordEntry } from './providers/record-quality';
import {
  PropertyProviderError,
  type PropertyDataProvider,
  type ProviderProperty,
  type ProviderResult,
  type ProviderValuation,
  type ProviderMarketStatistics,
  type ProviderSaleListing,
} from './providers/property-provider';
import type { Actor, CmaAssumptions, Workspace } from './types';
import type { FabricUse } from './fabric-types';
import type {
  PropertyProviderAction,
  PropertyProviderCache,
  PropertyProviderPolicy,
  PropertyProviderState,
} from './property-provider-types';

const safeText = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const location = {
  address: safeText.optional(),
  city: safeText.max(100).optional(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  zipCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
};
const facts = {
  propertyType: z
    .enum(['Single Family', 'Condo', 'Townhouse', 'Manufactured', 'Multi-Family', 'Apartment', 'Land'])
    .optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().min(0).max(50).optional(),
  squareFootage: z.number().positive().max(1000000).optional(),
};
const area = (value: {
  address?: string;
  zipCode?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}) =>
  !!value.address ||
  !!value.zipCode ||
  (!!value.city && !!value.state) ||
  (value.latitude !== undefined && value.longitude !== undefined);
const search = z
  .strictObject({
    ...location,
    ...facts,
    radius: z.number().positive().max(25).optional(),
    lotSize: z.number().positive().max(1e9).optional(),
    yearBuilt: z.number().int().min(1700).max(2100).optional(),
    saleDateRange: z.number().int().min(1).max(3650).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(1000).default(0),
    includeTotalCount: z.boolean().optional(),
  })
  .refine(area, 'Provide an address, ZIP, city and state, or coordinates.');
const listings = z
  .strictObject({
    ...location,
    ...facts,
    radius: z.number().positive().max(25).optional(),
    lotSize: z.number().positive().max(1e9).optional(),
    yearBuilt: z.number().int().min(1700).max(2100).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(1000).default(0),
    includeTotalCount: z.boolean().optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    price: z.number().positive().max(1e9).optional(),
    daysOld: z.number().int().min(1).max(3650).optional(),
  })
  .refine(area);
const valuation = z
  .strictObject({
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    ...facts,
    maxRadius: z.number().positive().max(25).optional(),
    daysOld: z.number().int().min(1).max(3650).optional(),
    compCount: z.number().int().min(5).max(25).default(10),
    lookupSubjectAttributes: z.boolean().optional(),
  })
  .refine(value => !!value.address || (value.latitude !== undefined && value.longitude !== undefined));
const fixture = z.boolean().default(false);
const assumptions = z.strictObject({
  sqftRate: z.number().min(0).max(1000).optional(),
  bedroomValue: z.number().min(0).max(1e6).optional(),
  bathroomValue: z.number().min(0).max(1e6).optional(),
  monthlyTrend: z.number().min(-0.1).max(0.1).optional(),
  maxDistanceMiles: z.number().positive().max(100).optional(),
  maxAgeDays: z.number().int().min(1).max(1825).optional(),
  maxSizeRatio: z.number().min(1).max(3).optional(),
});
export const propertyProviderActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('getProperty'), query: z.strictObject({ address: safeText }), fixture }),
  z.strictObject({ action: z.literal('searchProperties'), query: search, fixture }),
  z.strictObject({ action: z.literal('getSaleListings'), query: listings, fixture }),
  z.strictObject({ action: z.literal('getComparables'), query: valuation, fixture }),
  z.strictObject({ action: z.literal('getValuation'), query: valuation, fixture }),
  z.strictObject({
    action: z.literal('getMarketStatistics'),
    query: z.strictObject({
      zipCode: z.string().regex(/^\d{5}$/),
      historyRange: z.number().int().min(1).max(24).optional(),
    }),
    fixture,
  }),
  z.strictObject({
    action: z.literal('saveCma'),
    subjectId: safeText,
    comparableIds: z.array(safeText).max(50).optional(),
    fixture,
    omitUnobservedCondition: z.literal(true),
    assumptions: assumptions.default({}),
  }),
]);
const policySchema = z.strictObject({
  providerId: z.literal('rentcast'),
  version: safeText,
  reviewedBy: safeText,
  reviewedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  licenseReference: safeText,
  termsUrl: z.url().refine(url => new URL(url).protocol === 'https:'),
  allowedUses: z.array(z.enum(['research', 'valuation', 'market', 'export'])).min(1),
  retentionHours: z.number().positive().max(8760),
  cacheTtlMinutes: z.number().int().min(1).max(10080),
  requiresProfessionalVerification: z.boolean(),
  deploymentScope: z.enum(['local-development', 'production']).optional(),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
    : JSON.stringify(value);
const bounded = (name: string, fallback: number, max: number) => {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
};
function budgetConfig() {
  const cost = Number(process.env.PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD),
    dollars = Number(process.env.PROPERTY_PROVIDER_MONTHLY_BUDGET_USD);
  const costMicros = Number.isFinite(cost) && cost > 0 && cost <= 1000 ? Math.ceil(cost * 1e6) : 0;
  const budgetMicros = Number.isFinite(dollars) && dollars > 0 && dollars <= 1e6 ? Math.floor(dollars * 1e6) : 0;
  const globalLimit = bounded('PROPERTY_PROVIDER_MONTHLY_REQUEST_LIMIT', 50, 1000000);
  // Conservative cent rounding keeps the shared SQL integer counter bounded and never rounds a reserve down.
  const costCents = Math.ceil(costMicros / 10000),
    budgetCents = Math.floor(budgetMicros / 10000);
  return {
    globalLimit,
    tenantLimit: bounded('PROPERTY_PROVIDER_TENANT_MONTHLY_REQUEST_LIMIT', 20, 100000),
    userLimit: bounded('PROPERTY_PROVIDER_USER_MONTHLY_REQUEST_LIMIT', 10, 100000),
    concurrency: bounded('PROPERTY_PROVIDER_MAX_CONCURRENCY', 2, 20),
    costMicros,
    budgetMicros,
    costCents,
    budgetCents,
    effectiveGlobalLimit: costCents ? Math.min(globalLimit, Math.floor(budgetCents / costCents)) : 0,
  };
}
export function propertyProviderPolicy(at = new Date().toISOString()): PropertyProviderPolicy | undefined {
  try {
    const policy = policySchema.parse(JSON.parse(process.env.PROPERTY_PROVIDER_POLICY_JSON || 'null'));
    if (
      (policy.deploymentScope === 'local-development' && process.env.NODE_ENV === 'production') ||
      Date.parse(policy.reviewedAt) > Date.parse(at) ||
      Date.parse(policy.expiresAt) <= Date.parse(at)
    )
      return undefined;
    return policy;
  } catch {
    return undefined;
  }
}
export function ensurePropertyProvider(workspace: Workspace): PropertyProviderState {
  return (workspace.providerData ??= {
    version: 1,
    cache: [],
    reservations: [],
    usage: { period: new Date().toISOString().slice(0, 7), requests: 0, reservedCostUsd: 0, perUser: {} },
    usageHistory: [],
  });
}
function currentUsage(state: PropertyProviderState) {
  const period = new Date().toISOString().slice(0, 7);
  if (state.usage.period !== period) {
    state.usageHistory = [...state.usageHistory, state.usage].slice(-24);
    state.usage = { period, requests: 0, reservedCostUsd: 0, perUser: {} };
  }
  return state.usage;
}
export function assertPropertyProviderAccess(
  workspace: Workspace,
  policy: PropertyProviderPolicy | undefined,
  use: FabricUse,
  at = new Date().toISOString(),
  boundGrantId?: string,
) {
  if (
    !policy ||
    Date.parse(policy.reviewedAt) > Date.parse(at) ||
    Date.parse(policy.expiresAt) <= Date.parse(at) ||
    !policy.allowedUses.includes(use)
  )
    throw new HttpError(403, 'A current independently reviewed provider contract permitting this use is required.');
  if (policy.requiresProfessionalVerification && !hasVerifiedLicense(workspace, at))
    throw new HttpError(403, 'This provider contract requires current independent professional verification.');
  const grant = ensurePlatform(workspace).providerGrants.find(
    grant =>
      (!boundGrantId || grant.id === boundGrantId) &&
      grant.providerId === policy.providerId &&
      grant.regionIds.includes('us') &&
      grant.allowedUses.includes(use) &&
      !grant.revokedAt &&
      !!grant.reviewedBy &&
      !!grant.licenseReference &&
      Date.parse(grant.verifiedAt) <= Date.parse(at) &&
      Date.parse(grant.issuedAt) <= Date.parse(at) &&
      Date.parse(grant.expiresAt) > Date.parse(at),
  );
  if (!grant)
    throw new HttpError(
      403,
      'A current operator-reviewed national provider grant for this use is required; payment does not grant data rights.',
    );
  return grant;
}
const useFor = (action: PropertyProviderAction): FabricUse =>
  action === 'getValuation' || action === 'getComparables'
    ? 'valuation'
    : action === 'getMarketStatistics'
      ? 'market'
      : 'research';
const sourceId = (cache: Pick<PropertyProviderCache, 'fixture' | 'policyVersion'>) =>
  cache.fixture ? 'rentcast-fixture-v1' : `rentcast-${hash(cache.policyVersion).slice(0, 16)}`;
function cacheAllowed(workspace: Workspace, cache: PropertyProviderCache, policy: PropertyProviderPolicy | undefined) {
  if (
    !Number.isFinite(Date.parse(cache.observedAt)) ||
    Date.parse(cache.observedAt) > Date.now() ||
    !Number.isFinite(Date.parse(cache.expiresAt)) ||
    Date.parse(cache.expiresAt) <= Date.now()
  )
    return false;
  if (cache.fixture) return true;
  try {
    return (
      cache.policyVersion === policy?.version &&
      Date.parse(cache.observedAt) + policy!.retentionHours * 3600000 > Date.now() &&
      assertPropertyProviderAccess(workspace, policy, useFor(cache.action), new Date().toISOString(), cache.grantId)
        .id === cache.grantId
    );
  } catch {
    return false;
  }
}
function prune(state: PropertyProviderState) {
  state.cache = state.cache.filter(cache => Date.parse(cache.expiresAt) > Date.now()).slice(0, 20);
  state.reservations = state.reservations.slice(-200);
  for (const reservation of state.reservations)
    if (reservation.status === 'pending' && Date.parse(reservation.leaseExpiresAt) <= Date.now()) {
      reservation.status = 'failed';
      reservation.errorCode = 'timeout';
    }
}
export function purgePropertyProviderData(workspace: Workspace) {
  const state = ensurePropertyProvider(workspace),
    policy = propertyProviderPolicy();
  prune(state);
  state.cache = state.cache.filter(cache => cacheAllowed(workspace, cache, policy));
}
function snapshot(workspace: Workspace, actor: Actor, globalUsed: { requests: number; reservedCents: number }) {
  const state = ensurePropertyProvider(workspace),
    policy = propertyProviderPolicy(),
    budget = budgetConfig();
  prune(state);
  const usage = currentUsage(state);
  const blockers: string[] = [];
  if (!process.env.RENTCAST_API_KEY) blockers.push('A server-side provider key is required.');
  if (process.env.PROPERTY_PROVIDER_ENABLED !== 'true') blockers.push('Live requests are disabled by the operator.');
  if (actor.role === 'viewer') blockers.push('Your viewing role cannot initiate provider requests.');
  if (!budget.costCents || !budget.budgetCents || !budget.effectiveGlobalLimit || !budget.concurrency)
    blockers.push('Positive request, spend and concurrency limits are required.');
  const permissions = (['research', 'valuation', 'market', 'export'] as const).map(use => {
    try {
      assertPropertyProviderAccess(workspace, policy, use);
      return { use, allowed: true, reason: 'Current provider policy and tenant grant permit this use.' };
    } catch (error) {
      return {
        use,
        allowed: false,
        reason: error instanceof HttpError ? error.message : 'Provider access requires review.',
      };
    }
  });
  const remaining = {
    shared: Math.max(
      0,
      Math.min(
        budget.effectiveGlobalLimit - globalUsed.requests,
        budget.costCents ? Math.floor((budget.budgetCents - globalUsed.reservedCents) / budget.costCents) : 0,
      ),
    ),
    tenant: Math.max(0, budget.tenantLimit - usage.requests),
    user: Math.max(0, budget.userLimit - (usage.perUser[actor.id] || 0)),
  };
  const readiness = {
    configurationReady: blockers.length === 0,
    canRequestNewData:
      blockers.length === 0 &&
      permissions.some(permission => permission.allowed && permission.use !== 'export') &&
      Math.min(remaining.shared, remaining.tenant, remaining.user) > 0,
    blockers,
    permissions,
    remaining,
    subscriptionStatus: 'not-probed' as const,
    note: 'These are local configuration and current authorization checks, not a paid connectivity probe or automatic verification of the provider subscription. Cached authorized results can still be reused after quota exhaustion.',
  };
  const threshold = bounded('PROPERTY_PROVIDER_BUDGET_WARNING_PERCENT', 85, 100) || 85,
    warnings: string[] = [];
  if (budget.effectiveGlobalLimit && (globalUsed.requests / budget.effectiveGlobalLimit) * 100 >= threshold)
    warnings.push('Application-observed shared request allowance is approaching or at its configured limit.');
  if (budget.budgetCents && (globalUsed.reservedCents / budget.budgetCents) * 100 >= threshold)
    warnings.push('Application-observed shared spend reserve is approaching or at its configured cap.');
  if (budget.userLimit && ((usage.perUser[actor.id] || 0) / budget.userLimit) * 100 >= threshold)
    warnings.push('Your monthly provider request allowance is approaching or at its configured limit.');
  const attempts = state.reservations.filter(item => !item.fixture),
    durations = attempts.flatMap(item => (item.durationMs === undefined ? [] : [item.durationMs]));
  const health = {
    liveVerified: attempts.some(item => item.status === 'succeeded'),
    retainedAttempts: attempts.length,
    succeeded: attempts.filter(item => item.status === 'succeeded').length,
    failed: attempts.filter(item => item.status === 'failed').length,
    pending: attempts.filter(item => item.status === 'pending').length,
    latencySamples: durations.length,
    averageLatencyMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    lastRequest: state.reservations.at(-1)
      ? {
          action: state.reservations.at(-1)!.action,
          fixture: state.reservations.at(-1)!.fixture,
          at: state.reservations.at(-1)!.at,
          status: state.reservations.at(-1)!.status,
          errorCode: state.reservations.at(-1)!.errorCode,
          durationMs: state.reservations.at(-1)!.durationMs,
        }
      : null,
    note: 'Latency measures transport and normalization for retained application attempts only, including failed attempts. No paid health probe or background query is issued.',
  };
  const records: ProviderRecordEntry[] = [],
    valuations: {
      valuation: ProviderValuation;
      sourceId: string;
      fixture: boolean;
      observedAt: string;
      expiresAt: string;
    }[] = [],
    markets: {
      market: ProviderMarketStatistics;
      sourceId: string;
      fixture: boolean;
      observedAt: string;
      expiresAt: string;
    }[] = [],
    listings: {
      listing: ProviderSaleListing;
      sourceId: string;
      fixture: boolean;
      observedAt: string;
      expiresAt: string;
    }[] = [];
  for (const cache of state.cache.filter(cache => cacheAllowed(workspace, cache, policy))) {
    const meta = {
      sourceId: sourceId(cache),
      fixture: cache.fixture,
      observedAt: cache.observedAt,
      expiresAt: cache.expiresAt,
    };
    const result = cache.data as ProviderResult<unknown>;
    const values = Array.isArray(result.data) ? result.data : [result.data];
    for (const value of values) {
      if (!value || typeof value !== 'object') continue;
      const kind = (value as { kind?: string }).kind;
      if (kind === 'property-record')
        records.push({ ...meta, record: value as ProviderProperty, origin: 'property-record' });
      if (kind === 'provider-estimate') {
        const valuation = value as ProviderValuation;
        valuations.push({ ...meta, valuation });
        if (valuation.subject) records.push({ ...meta, record: valuation.subject, origin: 'avm-subject' });
      }
      if (kind === 'sale-listing-market') markets.push({ ...meta, market: value as ProviderMarketStatistics });
      if (kind === 'sale-listing') listings.push({ ...meta, listing: value as ProviderSaleListing });
    }
  }
  return {
    configured: !!process.env.RENTCAST_API_KEY,
    enabled: process.env.PROPERTY_PROVIDER_ENABLED === 'true',
    readiness,
    policy: policy ?? null,
    budget: {
      monthlyRequestLimit: budget.globalLimit,
      effectiveRequestLimit: budget.effectiveGlobalLimit,
      tenantLimit: budget.tenantLimit,
      perUserLimit: budget.userLimit,
      monthlyBudgetUsd: budget.budgetCents / 100,
      reservedCostPerRequestUsd: budget.costCents / 100,
      globallyObservedRequests: globalUsed.requests,
      globallyReservedCostUsd: globalUsed.reservedCents / 100,
      warningPercent: threshold,
      warnings,
      note: 'Application-observed usage only. Shared-key external usage is unknown; use a dedicated key and reconcile the provider dashboard. Configured upper-bound reserves round up to a cent and are not invoices.',
    },
    usage: {
      period: usage.period,
      tenantRequests: usage.requests,
      userRequests: usage.perUser[actor.id] || 0,
      reservedCostUsd: usage.reservedCostUsd,
    },
    health,
    records: consolidateProviderRecords(records),
    valuations,
    markets,
    listings,
  };
}
function globalKey() {
  return `property-provider:rentcast:${hash(process.env.RENTCAST_API_KEY || 'unconfigured').slice(0, 24)}:${new Date().toISOString().slice(0, 7)}`;
}
async function globalUsage() {
  return transaction(null, async tx => {
    const values = await tx.query<{ key: string; count: number }>(
      'SELECT key,count FROM rate_limits WHERE key=$1 OR key=$2',
      [globalKey(), `${globalKey()}:spend`],
    );
    return {
      requests: Number(values.find(value => value.key === globalKey())?.count || 0),
      reservedCents: Number(values.find(value => value.key === `${globalKey()}:spend`)?.count || 0),
    };
  });
}
export async function getPropertyProviderSnapshot(actor: Actor) {
  const workspace = (
    await mutateWorkspace(actor, workspace => {
      purgePropertyProviderData(workspace);
      return workspace;
    })
  ).result;
  return snapshot(workspace, actor, await globalUsage());
}
export type PropertyProviderSnapshot = Awaited<ReturnType<typeof getPropertyProviderSnapshot>>;
const running = new Map<string, Promise<unknown>>();
export async function executePropertyProviderAction(
  actor: Actor,
  raw: unknown,
  injected?: PropertyDataProvider,
): Promise<unknown> {
  requireEditor(actor);
  const input = propertyProviderActionSchema.parse(raw);
  if (input.action === 'saveCma') return saveProviderCma(actor, input);
  const key = hash(`${actor.tenantId}:${input.fixture ? 'fixture' : 'live'}:${input.action}:${stable(input.query)}`);
  const active = running.get(key);
  if (active) {
    const complete = (await active) as { result: unknown };
    return { ...(await getPropertyProviderSnapshot(actor)), result: complete.result };
  }
  const operation = queryProvider(actor, input, key, injected);
  running.set(key, operation);
  try {
    return await operation;
  } finally {
    running.delete(key);
  }
}
type QueryInput = Exclude<z.infer<typeof propertyProviderActionSchema>, { action: 'saveCma' }>;
async function queryProvider(actor: Actor, input: QueryInput, key: string, injected?: PropertyDataProvider) {
  const policy = propertyProviderPolicy(),
    limits = budgetConfig(),
    requestId = randomUUID(),
    lockKey = `${globalKey()}:inflight:${requestId}`;
  const started = await mutateWorkspace(actor, async (workspace, tx) => {
    const state = ensurePropertyProvider(workspace);
    prune(state);
    const usage = currentUsage(state);
    if (!input.fixture && (!process.env.RENTCAST_API_KEY || process.env.PROPERTY_PROVIDER_ENABLED !== 'true'))
      throw new HttpError(
        503,
        'Live property data is disabled or unconfigured. The explicitly synthetic fixture remains available.',
      );
    const grant = input.fixture ? undefined : assertPropertyProviderAccess(workspace, policy, useFor(input.action));
    const cached = state.cache.find(cache => cache.key === key && cacheAllowed(workspace, cache, policy));
    if (cached) return { cached };
    const pending = state.reservations.find(
      item => item.key === key && item.status === 'pending' && Date.parse(item.leaseExpiresAt) > Date.now(),
    );
    if (pending) return { pending: pending.id };
    if (!input.fixture) {
      if (!limits.costMicros || !limits.budgetMicros || !limits.effectiveGlobalLimit)
        throw new HttpError(
          503,
          'Explicit positive per-request cost ceiling and approved monthly spend budget are required before live requests.',
        );
      if (usage.requests >= limits.tenantLimit || (usage.perUser[actor.id] || 0) >= limits.userLimit)
        throw new HttpError(429, 'The monthly tenant or user property-provider allowance is exhausted.');
      // This global row locks reservations across workers and tenants, within the same transaction as tenant metering.
      const global = await tx.query<{ count: number }>(
        'INSERT INTO rate_limits(key,count,expires_at) VALUES($1,0,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count RETURNING count',
        [globalKey(), new Date(`${usage.period}-01T00:00:00Z`).getTime() + 32 * 86400000],
      );
      if (global[0].count >= limits.effectiveGlobalLimit)
        throw new HttpError(429, 'Application-observed monthly provider request or spend cap is exhausted.');
      const spend = await tx.query<{ count: number }>(
        'INSERT INTO rate_limits(key,count,expires_at) VALUES($1,0,$2) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count RETURNING count',
        [`${globalKey()}:spend`, new Date(`${usage.period}-01T00:00:00Z`).getTime() + 32 * 86400000],
      );
      if (Number(spend[0].count) + limits.costCents > limits.budgetCents)
        throw new HttpError(429, 'Application-observed monthly provider spend cap is exhausted.');
      const pendingGlobal = await tx.query<{ active: number }>(
        'SELECT COALESCE(SUM(count),0) AS active FROM rate_limits WHERE key LIKE $1 AND expires_at>$2',
        [`${globalKey()}:inflight:%`, Date.now()],
      );
      if (Number(pendingGlobal[0].active) >= limits.concurrency)
        throw new HttpError(429, 'Provider concurrency is full. Retry after current requests finish.');
      await tx.query('UPDATE rate_limits SET count=count+1 WHERE key=$1 RETURNING count', [globalKey()]);
      await tx.query('UPDATE rate_limits SET count=count+$1 WHERE key=$2 RETURNING count', [
        limits.costCents,
        `${globalKey()}:spend`,
      ]);
      await tx.query('INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,$2)', [lockKey, Date.now() + 60000]);
      usage.requests++;
      usage.perUser[actor.id] = (usage.perUser[actor.id] || 0) + 1;
      usage.reservedCostUsd = Math.round((usage.reservedCostUsd + limits.costCents / 100) * 100) / 100;
      state.policy = policy;
    }
    state.reservations.push({
      id: requestId,
      key,
      action: input.action,
      fixture: input.fixture,
      actorId: actor.id,
      at: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      status: 'pending',
      estimatedCostUsd: input.fixture ? 0 : limits.costCents / 100,
    });
    appendAudit(
      workspace,
      actor,
      'reservePropertyProvider',
      requestId,
      `${input.fixture ? 'Synthetic fixture' : 'Live provider'} ${input.action}; bounded reservation, no query text logged. Failed attempts retain the conservative reservation.`,
    );
    return { grantId: grant?.id };
  });
  if ('cached' in started.result && started.result.cached)
    return {
      ...(await getPropertyProviderSnapshot(actor)),
      result: {
        action: input.action,
        mode: input.fixture ? 'fixture' : 'live',
        cached: true,
        requestId: started.result.cached.id,
        observedAt: started.result.cached.observedAt,
        expiresAt: started.result.cached.expiresAt,
        data: started.result.cached.data,
      },
    };
  if ('pending' in started.result)
    return {
      ...(await getPropertyProviderSnapshot(actor)),
      result: {
        action: input.action,
        mode: input.fixture ? 'fixture' : 'live',
        cached: false,
        pending: true,
        requestId: started.result.pending,
      },
    };
  const transportStarted = performance.now();
  try {
    const provider =
      injected ??
      (input.fixture ? new FixturePropertyProvider() : new RentCastProvider({ apiKey: process.env.RENTCAST_API_KEY }));
    const result = await dispatch(provider, input);
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 512000)
      throw new PropertyProviderError(
        'invalid-response',
        'Normalized provider result exceeded the private cache bound.',
      );
    const observedAt = new Date().toISOString(),
      minutes = input.fixture ? 60 : Math.min(policy!.cacheTtlMinutes, policy!.retentionHours * 60),
      expiresAt = new Date(
        Math.min(Date.now() + minutes * 60000, input.fixture ? Infinity : Date.parse(policy!.expiresAt)),
      ).toISOString();
    const cached: PropertyProviderCache = {
      id: requestId,
      key,
      action: input.action,
      fixture: input.fixture,
      observedAt,
      expiresAt,
      policyVersion: input.fixture ? 'synthetic-fixture-v1' : policy!.version,
      grantId: 'grantId' in started.result ? started.result.grantId : undefined,
      data: result,
    };
    await mutateWorkspace(actor, async (workspace, tx) => {
      const state = ensurePropertyProvider(workspace);
      if (!input.fixture) {
        const currentPolicy = propertyProviderPolicy();
        const currentGrant = assertPropertyProviderAccess(
          workspace,
          currentPolicy,
          useFor(input.action),
          new Date().toISOString(),
          cached.grantId,
        );
        if (currentPolicy?.version !== policy?.version || currentGrant.id !== cached.grantId)
          throw new HttpError(403, 'Provider rights changed while the request was running. Result discarded.');
      }
      state.cache.unshift(cached);
      prune(state);
      const reservation = state.reservations.find(item => item.id === requestId)!;
      reservation.status = 'succeeded';
      reservation.durationMs = Math.round(performance.now() - transportStarted);
      reservation.completedAt = new Date().toISOString();
      await tx.query('DELETE FROM rate_limits WHERE key=$1', [lockKey]);
      appendAudit(
        workspace,
        actor,
        'completePropertyProvider',
        requestId,
        `${input.action} completed; licensed estimates and asking prices remain distinct from recorded sales.`,
      );
    });
    return {
      ...(await getPropertyProviderSnapshot(actor)),
      result: {
        action: input.action,
        mode: input.fixture ? 'fixture' : 'live',
        cached: false,
        requestId,
        observedAt,
        expiresAt,
        data: result,
      },
    };
  } catch (error) {
    await mutateWorkspace(actor, async (workspace, tx) => {
      const reservation = ensurePropertyProvider(workspace).reservations.find(item => item.id === requestId);
      if (reservation) {
        reservation.status = 'failed';
        reservation.durationMs = Math.round(performance.now() - transportStarted);
        reservation.completedAt = new Date().toISOString();
        reservation.errorCode =
          error instanceof HttpError && error.status === 403
            ? 'permission'
            : error instanceof PropertyProviderError && error.code === 'timeout'
              ? 'timeout'
              : error instanceof PropertyProviderError && error.code === 'invalid-response'
                ? 'invalid-response'
                : 'provider';
      }
      await tx.query('DELETE FROM rate_limits WHERE key=$1', [lockKey]);
      appendAudit(
        workspace,
        actor,
        'failPropertyProvider',
        requestId,
        'Provider attempt failed or rights changed. Conservative reserved usage retained; no raw response or query logged.',
      );
    });
    if (error instanceof HttpError) throw error;
    if (error instanceof PropertyProviderError)
      throw new HttpError(
        error.code === 'rate-limited' ? 429 : error.code === 'not-found' ? 404 : 502,
        `Property provider ${error.code}. No retry was issued; the conservative reservation remains counted.`,
      );
    throw new HttpError(
      502,
      'The property provider request failed. No retry was issued; reserved usage remains counted.',
    );
  }
}
function dispatch(provider: PropertyDataProvider, input: QueryInput): Promise<ProviderResult<unknown>> {
  switch (input.action) {
    case 'getProperty':
      return provider.getProperty(input.query);
    case 'searchProperties':
      return provider.searchProperties(input.query);
    case 'getSaleListings':
      return provider.getSaleListings(input.query);
    case 'getComparables':
      return provider.getComparables(input.query);
    case 'getValuation':
      return provider.getValuation(input.query);
    case 'getMarketStatistics':
      return provider.getMarketStatistics(input.query);
  }
}
async function saveProviderCma(
  actor: Actor,
  input: Extract<z.infer<typeof propertyProviderActionSchema>, { action: 'saveCma' }>,
) {
  const changed = await mutateWorkspace(actor, workspace => {
    const state = ensurePropertyProvider(workspace),
      policy = propertyProviderPolicy(),
      accessible = state.cache.filter(cache => {
        if (cache.fixture !== input.fixture || !cacheAllowed(workspace, cache, policy)) return false;
        if (input.fixture) return true;
        try {
          return (
            assertPropertyProviderAccess(workspace, policy, 'valuation', new Date().toISOString(), cache.grantId).id ===
            cache.grantId
          );
        } catch {
          return false;
        }
      });
    if (!input.fixture) assertPropertyProviderAccess(workspace, policy, 'valuation');
    const recordEntries: ProviderRecordEntry[] = accessible.flatMap(cache => {
      const data = (cache.data as ProviderResult<unknown>).data,
        items = Array.isArray(data) ? data : [data],
        meta = {
          sourceId: sourceId(cache),
          fixture: cache.fixture,
          observedAt: cache.observedAt,
          expiresAt: cache.expiresAt,
        };
      return items.flatMap((value): ProviderRecordEntry[] =>
        !value || typeof value !== 'object'
          ? []
          : (value as { kind?: string }).kind === 'property-record'
            ? [{ ...meta, record: value as ProviderProperty, origin: 'property-record' }]
            : (value as { kind?: string }).kind === 'provider-estimate' && (value as ProviderValuation).subject
              ? [{ ...meta, record: (value as ProviderValuation).subject!, origin: 'avm-subject' }]
              : [],
      );
    });
    const records = consolidateProviderRecords(recordEntries).map(entry => entry.record);
    const subject = records.find(record => record.id === input.subjectId);
    if (!subject)
      throw new HttpError(
        404,
        'The subject is not present in the current authorized provider cache. Query the property first.',
      );
    const candidates = input.comparableIds
      ? input.comparableIds.map(id => {
          const candidate = records.find(record => record.id === id);
          if (!candidate)
            throw new HttpError(404, 'A selected comparable is not present in the current authorized provider cache.');
          return candidate;
        })
      : records;
    const source = `${input.fixture ? 'rentcast-fixture-bundle' : 'rentcast-bundle'}-${hash(
      accessible
        .map(cache => cache.id)
        .sort()
        .join(':'),
    ).slice(0, 16)}`;
    const grantIds = input.fixture
      ? undefined
      : [...new Set(accessible.map(cache => cache.grantId).filter((id): id is string => !!id))];
    const observedAt = accessible.map(cache => cache.observedAt).sort()[0];
    const retentionExpiry = input.fixture
      ? undefined
      : new Date(
          Math.min(Date.parse(policy!.expiresAt), Date.parse(observedAt) + policy!.retentionHours * 3600000),
        ).toISOString();
    const asOf = new Date().toISOString(),
      normalized = buildProviderCmaInputs(subject, candidates, {
        sourceId: source,
        asOf,
        omitUnobservedCondition: true,
      });
    if (!normalized.subject)
      throw new HttpError(
        422,
        'The provider subject lacks required geographic or physical evidence. No values were invented.',
      );
    if (!normalized.comparables.length)
      throw new HttpError(
        422,
        'No eligible recorded closed sales with price and date. AVM comparable listings and asking prices cannot substitute for closed-sale evidence.',
      );
    let result;
    try {
      result = calculateCma(
        normalized.subject,
        normalized.comparables,
        { ...input.assumptions, conditionValue: 0 } as Partial<CmaAssumptions>,
        asOf,
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('No eligible closed comparables'))
        throw new HttpError(
          422,
          'No recorded closed sales satisfy the selected distance, age and size assumptions. Review filters or obtain eligible evidence.',
        );
      throw error;
    }
    if (!result.comps.length)
      throw new HttpError(
        422,
        'No eligible recorded closed sales with price and date. AVM comparable listings and asking prices cannot substitute for closed-sale evidence.',
      );
    const fabric = bootstrapFabric(workspace);
    if (!workspace.sources.some(record => record.id === source))
      workspace.sources.push({
        id: source,
        kind: input.fixture ? 'synthetic' : 'licensed',
        label: input.fixture ? 'Clearly synthetic property-provider fixture' : 'RentCast licensed provider data',
        observedAt,
        license: input.fixture ? 'Synthetic local testing only; no real property claims.' : policy!.licenseReference,
        confidence: 0,
      });
    if (!fabric.sources.some(record => record.id === source))
      fabric.sources.push({
        id: source,
        providerId: input.fixture ? 'synthetic-rentcast' : 'rentcast',
        label: input.fixture ? 'Synthetic provider fixture' : 'RentCast licensed provider',
        kind: input.fixture ? 'synthetic' : 'licensed',
        adapter: 'rentcast',
        regionIds: ['us'],
        observedAt,
        expectedUpdateHours: 24,
        documentationUrl: 'https://developers.rentcast.io/reference/introduction',
        license: {
          label: input.fixture ? 'Clearly synthetic fixture' : policy!.licenseReference,
          allowedUses: input.fixture ? ['research', 'valuation', 'market', 'export'] : policy!.allowedUses,
          exportAllowed: input.fixture || policy!.allowedUses.includes('export'),
          retentionDays: input.fixture ? 30 : Math.ceil(policy!.retentionHours / 24),
          expiresAt: retentionExpiry,
          deploymentScope: input.fixture ? undefined : policy!.deploymentScope,
          termsUrl: input.fixture ? undefined : policy!.termsUrl,
          requiresProfessionalVerification: input.fixture ? undefined : policy!.requiresProfessionalVerification,
          contractReview: input.fixture
            ? undefined
            : {
                reviewedBy: policy!.reviewedBy,
                reviewedAt: policy!.reviewedAt,
                expiresAt: policy!.expiresAt,
                licenseReference: policy!.licenseReference,
              },
        },
      });
    const sourcePolicy = fabric.sources.find(record => record.id === source)!;
    if (grantIds) sourcePolicy.license.providerGrantIds = grantIds;
    const cma = {
      id: randomUUID(),
      name: `${input.fixture ? 'SYNTHETIC DEMO — ' : ''}Provider evidence CMA`,
      propertyId: result.subjectId,
      createdAt: asOf,
      result,
      providerContext: {
        normalizationWarnings: normalized.warnings,
        incomplete: normalized.incomplete,
        recordIds: [...new Set([subject.id, ...candidates.map(candidate => candidate.id)])],
      },
    };
    workspace.cmas.push(cma);
    appendAudit(
      workspace,
      actor,
      'saveCma',
      cma.id,
      'Provider-cache recorded-sales CMA saved with immutable inputs; explicit zero condition adjustment; no AVM/listing prices used as sales.',
    );
    recordProductAction(workspace, actor, 'saveCma', cma.id);
    return { cma };
  });
  return { ...(await getPropertyProviderSnapshot(actor)), result: changed.result };
}
