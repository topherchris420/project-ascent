/** Server-only, one request per operation. Application authorization/budgeting belongs to the service. */
import { z } from 'zod';
import {
  PropertyProviderError,
  type PropertyDataProvider,
  type PropertyLookupQuery,
  type PropertySearchQuery,
  type SaleListingsQuery,
  type ValuationQuery,
  type MarketStatisticsQuery,
  type ProviderProperty,
  type ProviderSaleListing,
  type ProviderComparable,
  type ProviderValuation,
  type ProviderMarketPeriod,
  type ProviderMarketStatistics,
  type ProviderCoverage,
  type ProviderResult,
  type ProviderEndpoint,
  type ProviderPropertyType,
  type ProviderPage,
} from './property-provider';

const propertyTypes = [
  'Single Family',
  'Condo',
  'Townhouse',
  'Manufactured',
  'Multi-Family',
  'Apartment',
  'Land',
] as const;
const cleanText = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const amount = z.number().finite().nonnegative().max(1e12);
const optionalAmount = amount.nullish();
const date = z
  .string()
  .max(40)
  .refine(
    v =>
      /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v.slice(0, 10),
  );
const commonQuery = {
  address: cleanText.optional(),
  city: cleanText.optional(),
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  zipCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  radius: z.number().positive().max(100).optional(),
  propertyType: z.enum(propertyTypes).optional(),
  bedrooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().min(0).max(100).optional(),
  squareFootage: z.number().int().positive().max(1e8).optional(),
  lotSize: z.number().positive().max(1e12).optional(),
  yearBuilt: z.number().int().min(1000).max(2200).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(10_000).default(0),
  includeTotalCount: z.boolean().default(true),
};
function geographicQuery(
  q: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
  },
  ctx: z.RefinementCtx,
) {
  const geo = q.latitude !== undefined || q.longitude !== undefined;
  if (geo && (q.latitude === undefined || q.longitude === undefined || q.radius === undefined))
    ctx.addIssue({ code: 'custom', message: 'Coordinates require both values and an explicit bounded radius.' });
  if (q.radius && !q.address && !geo)
    ctx.addIssue({ code: 'custom', message: 'Radius requires an address or coordinate pair.' });
  if (!q.address && !q.zipCode && !(q.city && q.state) && !geo)
    ctx.addIssue({ code: 'custom', message: 'Use an address, ZIP, city and state, or bounded coordinate query.' });
  if (q.city && !q.state) ctx.addIssue({ code: 'custom', message: 'City search requires a state.' });
}
const propertyQuery = z
  .object({ ...commonQuery, saleDateRange: z.number().int().min(1).max(3650).optional() })
  .strict()
  .superRefine(geographicQuery);
const listingQuery = z
  .object({
    ...commonQuery,
    status: z.enum(['Active', 'Inactive']).default('Active'),
    price: amount.optional(),
    daysOld: z.number().int().min(1).max(3650).optional(),
  })
  .strict()
  .superRefine(geographicQuery);
const valuationQuery = z
  .object({
    address: cleanText.optional(),
    latitude: commonQuery.latitude,
    longitude: commonQuery.longitude,
    propertyType: commonQuery.propertyType,
    bedrooms: commonQuery.bedrooms,
    bathrooms: commonQuery.bathrooms,
    squareFootage: commonQuery.squareFootage,
    maxRadius: z.number().positive().max(100).default(5),
    daysOld: z.number().int().min(1).max(3650).default(180),
    compCount: z.number().int().min(5).max(25).default(5),
    lookupSubjectAttributes: z.boolean().default(true),
  })
  .strict()
  .superRefine((q, ctx) => {
    const geo = q.latitude !== undefined || q.longitude !== undefined;
    if (!q.address && (q.latitude === undefined || q.longitude === undefined))
      ctx.addIssue({ code: 'custom', message: 'An address or complete coordinate pair is required.' });
    if (geo && (q.latitude === undefined || q.longitude === undefined))
      ctx.addIssue({ code: 'custom', message: 'Incomplete coordinate pair.' });
  });
const marketQuery = z
  .object({ zipCode: z.string().regex(/^\d{5}$/), historyRange: z.number().int().min(1).max(36).default(12) })
  .strict();
const optionalText = cleanText.nullish();
const rawCommon = {
  id: cleanText,
  formattedAddress: cleanText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullish(),
  zipCode: z
    .string()
    .regex(/^\d{5}$/)
    .nullish(),
  county: optionalText,
  stateFips: z
    .string()
    .regex(/^\d{2}$/)
    .nullish(),
  countyFips: z
    .string()
    .regex(/^\d{3}$/)
    .nullish(),
  latitude: z.number().finite().min(-90).max(90).nullish(),
  longitude: z.number().finite().min(-180).max(180).nullish(),
  propertyType: optionalText,
  bedrooms: optionalAmount,
  bathrooms: optionalAmount,
  squareFootage: optionalAmount,
  lotSize: optionalAmount,
  yearBuilt: z.number().int().min(1000).max(2200).nullish(),
  hoa: z.object({ fee: optionalAmount }).nullish(),
  features: z.object({ garageSpaces: optionalAmount }).nullish(),
};
const rawProperty = z.object({
  ...rawCommon,
  assessorID: optionalText,
  subdivision: optionalText,
  zoning: optionalText,
  lastSaleDate: date.nullish(),
  lastSalePrice: optionalAmount,
  history: z
    .record(z.string(), z.object({ event: z.literal('Sale'), date: date.nullish(), price: optionalAmount }))
    .nullish(),
  taxAssessments: z
    .record(
      z.string(),
      z.object({
        year: z.number().int().min(1000).max(2200),
        value: optionalAmount,
        land: optionalAmount,
        improvements: optionalAmount,
      }),
    )
    .nullish(),
  propertyTaxes: z
    .record(z.string(), z.object({ year: z.number().int().min(1000).max(2200), total: optionalAmount }))
    .nullish(),
});
const rawListing = z.object({
  ...rawCommon,
  status: optionalText,
  price: optionalAmount,
  listingType: optionalText,
  listedDate: date.nullish(),
  removedDate: date.nullish(),
  lastSeenDate: date.nullish(),
  daysOnMarket: optionalAmount,
  distance: optionalAmount,
  correlation: z.number().min(0).max(1).nullish(),
  history: z
    .record(
      z.string(),
      z.object({
        event: z.enum(['Sale Listing', 'Rental Listing']),
        price: optionalAmount,
        listedDate: date.nullish(),
        removedDate: date.nullish(),
      }),
    )
    .nullish(),
});
const rawPeriod = z.object({
  date: date.nullish(),
  averagePrice: optionalAmount,
  medianPrice: optionalAmount,
  minPrice: optionalAmount,
  maxPrice: optionalAmount,
  averageDaysOnMarket: optionalAmount,
  medianDaysOnMarket: optionalAmount,
  totalListings: optionalAmount,
  newListings: optionalAmount,
});
const rawMarket = z.object({
  id: z.string().optional(),
  zipCode: z.string().regex(/^\d{5}$/),
  saleData: rawPeriod
    .extend({ lastUpdatedDate: date.nullish(), history: z.record(z.string(), rawPeriod).nullish() })
    .nullish(),
});
const rawValuation = z
  .object({
    price: amount.positive(),
    priceRangeLow: optionalAmount,
    priceRangeHigh: optionalAmount,
    subjectProperty: rawProperty.partial().nullish(),
    comparables: z.array(rawListing).max(25).default([]),
  })
  .superRefine((r, ctx) => {
    if (
      (r.priceRangeLow != null && r.priceRangeLow > r.price) ||
      (r.priceRangeHigh != null && r.priceRangeHigh < r.price)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid estimate range.' });
  });
type RawCommon = Pick<z.infer<typeof rawListing>, keyof typeof rawCommon>;
function common(r: RawCommon) {
  return {
    id: r.id,
    providerId: 'rentcast' as const,
    address: {
      formatted: r.formattedAddress,
      line1: r.addressLine1 ?? undefined,
      line2: r.addressLine2 ?? undefined,
      city: r.city ?? undefined,
      state: r.state ?? undefined,
      zipCode: r.zipCode ?? undefined,
      county: r.county ?? undefined,
      stateFips: r.stateFips ?? undefined,
      countyFips: r.countyFips ?? undefined,
    },
    location: r.latitude != null && r.longitude != null ? { latitude: r.latitude, longitude: r.longitude } : undefined,
    facts: {
      propertyType: propertyTypes.includes(r.propertyType as ProviderPropertyType)
        ? (r.propertyType as ProviderPropertyType)
        : undefined,
      bedrooms: r.bedrooms ?? undefined,
      bathrooms: r.bathrooms ?? undefined,
      squareFootage: r.squareFootage ?? undefined,
      lotSize: r.lotSize ?? undefined,
      yearBuilt: r.yearBuilt ?? undefined,
      garageSpaces: r.features?.garageSpaces ?? undefined,
      hoaMonthlyFee: r.hoa?.fee ?? undefined,
    },
  };
}
function normalizeProperty(r: z.infer<typeof rawProperty>): ProviderProperty {
  const sales: ProviderProperty['sales'] = [];
  for (const [key, sale] of Object.entries(r.history ?? {}).slice(0, 500)) {
    const parsed = date.safeParse(sale.date ?? key);
    if (parsed.success)
      sales.push({
        kind: 'recorded-sale',
        date: new Date(parsed.data).toISOString(),
        price: sale.price ?? undefined,
        sourceField: 'history',
      });
  }
  if (r.lastSaleDate && !sales.some(s => s.date.slice(0, 10) === r.lastSaleDate!.slice(0, 10)))
    sales.push({
      kind: 'recorded-sale',
      date: new Date(r.lastSaleDate).toISOString(),
      price: r.lastSalePrice ?? undefined,
      sourceField: 'lastSale',
    });
  sales.sort((a, b) => b.date.localeCompare(a.date));
  return {
    ...common(r),
    kind: 'property-record',
    sales,
    assessorId: r.assessorID ?? undefined,
    subdivision: r.subdivision ?? undefined,
    zoning: r.zoning ?? undefined,
    assessments: Object.values(r.taxAssessments ?? {})
      .slice(0, 100)
      .map(a => ({
        year: a.year,
        value: a.value ?? undefined,
        land: a.land ?? undefined,
        improvements: a.improvements ?? undefined,
      }))
      .sort((a, b) => b.year - a.year),
    taxes: Object.values(r.propertyTaxes ?? {})
      .slice(0, 100)
      .map(t => ({ year: t.year, total: t.total ?? undefined }))
      .sort((a, b) => b.year - a.year),
  };
}
function normalizeListing(r: z.infer<typeof rawListing>): ProviderSaleListing {
  return {
    ...common(r),
    kind: 'sale-listing',
    status: r.status === 'Active' || r.status === 'Inactive' ? r.status : undefined,
    askingPrice: r.price ?? undefined,
    listedAt: r.listedDate ?? undefined,
    removedAt: r.removedDate ?? undefined,
    lastSeenAt: r.lastSeenDate ?? undefined,
    daysOnMarket: r.daysOnMarket ?? undefined,
    listingType: r.listingType ?? undefined,
    history: Object.entries(r.history ?? {})
      .slice(0, 500)
      .flatMap(([key, h]) => {
        const parsed = date.safeParse(h.listedDate ?? key);
        return parsed.success && h.event === 'Sale Listing'
          ? [{ event: h.event, date: parsed.data, askingPrice: h.price ?? undefined }]
          : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
function normalizePeriod(p: z.infer<typeof rawPeriod>): ProviderMarketPeriod {
  return {
    date: p.date ?? undefined,
    averageAskingPrice: p.averagePrice ?? undefined,
    medianAskingPrice: p.medianPrice ?? undefined,
    minAskingPrice: p.minPrice ?? undefined,
    maxAskingPrice: p.maxPrice ?? undefined,
    averageDaysOnMarket: p.averageDaysOnMarket ?? undefined,
    medianDaysOnMarket: p.medianDaysOnMarket ?? undefined,
    totalListings: p.totalListings ?? undefined,
    newListings: p.newListings ?? undefined,
  };
}
function valid<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new PropertyProviderError('invalid-query', 'The provider query is invalid or outside supported bounds.');
  return parsed.data;
}
function responseValid<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new PropertyProviderError('invalid-response', 'The provider returned an unsupported or invalid response.');
  return parsed.data;
}
function pagination(query: { limit: number; offset: number }, returned: number, headers: Headers): ProviderPage {
  const raw = headers.get('x-total-count');
  const total = raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
  const hasMore = total !== undefined ? query.offset + returned < total : returned === query.limit;
  return {
    offset: query.offset,
    limit: query.limit,
    returned,
    total,
    hasMore,
    hasMoreIsEstimate: total === undefined,
    ...(hasMore && query.offset + returned <= 10_000 ? { nextOffset: query.offset + returned } : {}),
  };
}
async function boundedJson(response: Response): Promise<unknown> {
  const max = 4 * 1024 * 1024;
  const length = Number(response.headers.get('content-length'));
  if (length > max) {
    await response.body?.cancel();
    throw new PropertyProviderError('invalid-response', 'The provider response exceeds the supported size.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PropertyProviderError('invalid-response', 'The provider returned an empty response.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) {
        await reader.cancel();
        throw new PropertyProviderError('invalid-response', 'The provider response exceeds the supported size.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PropertyProviderError('invalid-response', 'The provider response was not valid JSON.');
  }
}
export interface RentCastOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}
export class RentCastProvider implements PropertyDataProvider {
  readonly id = 'rentcast';
  readonly #apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: RentCastOptions = {}) {
    if (typeof window !== 'undefined') throw new Error('The property provider is server-only.');
    this.#apiKey = options.apiKey ?? process.env.RENTCAST_API_KEY ?? '';
    this.fetcher = options.fetcher ?? fetch;
    const timeout = options.timeoutMs ?? Number(process.env.RENTCAST_TIMEOUT_MS || 8000);
    this.timeoutMs = Number.isFinite(timeout) ? Math.max(100, Math.min(timeout, 15_000)) : 8000;
  }
  private result<T>(
    data: T,
    endpoint: ProviderEndpoint,
    warnings: string[] = [],
    requestId?: string,
  ): ProviderResult<T> {
    return {
      data,
      provenance: {
        providerId: this.id,
        endpoint,
        retrievedAt: new Date().toISOString(),
        schemaVersion: 'rentcast-normalized-v1',
        dataKind: endpoint === 'coverage' ? 'provider-documentation' : 'licensed-provider',
        ...(requestId ? { requestId } : {}),
      },
      warnings,
    };
  }
  private async request(endpoint: Exclude<ProviderEndpoint, 'coverage'>, params: object) {
    if (!this.#apiKey.trim())
      throw new PropertyProviderError('not-configured', 'The property data provider is not configured.');
    const url = new URL(`https://api.rentcast.io/v1${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    url.searchParams.set('suppressLogging', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Api-Key': this.#apiKey },
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) {
        await response.body?.cancel();
        const map: Record<number, PropertyProviderError['code']> = {
          400: 'invalid-query',
          401: 'authentication',
          403: 'forbidden',
          404: 'not-found',
          429: 'rate-limited',
          504: 'timeout',
        };
        const retry = response.headers.get('retry-after');
        const retryAfter = retry && /^\d+$/.test(retry) ? Math.min(Number(retry), 3600) : undefined;
        throw new PropertyProviderError(
          map[response.status] ?? 'provider-error',
          'The property data request could not be completed. No automatic retry was attempted.',
          response.status,
          retryAfter,
        );
      }
      const data = await boundedJson(response);
      const rid = response.headers.get('x-request-id');
      return {
        data,
        headers: response.headers,
        requestId: rid && /^[a-zA-Z0-9._:-]{1,128}$/.test(rid) ? rid : undefined,
      };
    } catch (error) {
      if (error instanceof PropertyProviderError) throw error;
      if (controller.signal.aborted)
        throw new PropertyProviderError(
          'timeout',
          'The property data request timed out. No automatic retry was attempted.',
        );
      throw new PropertyProviderError('network', 'The property data request failed. No automatic retry was attempted.');
    } finally {
      clearTimeout(timeout);
    }
  }
  async getProperty(query: PropertyLookupQuery): Promise<ProviderResult<ProviderProperty | null>> {
    const q = valid(z.object({ address: cleanText }).strict(), query);
    const result = await this.searchProperties({ ...q, limit: 1, includeTotalCount: false });
    return { ...result, data: result.data[0] ?? null };
  }
  async searchProperties(query: PropertySearchQuery): Promise<ProviderResult<ProviderProperty[]>> {
    const q = valid(propertyQuery, query);
    const r = await this.request('/properties', q);
    const records = responseValid(z.array(rawProperty).max(q.limit), r.data).map(normalizeProperty);
    return {
      ...this.result(
        records,
        '/properties',
        ['Recorded sale fields can be absent in non-disclosure states; missing facts and condition are not inferred.'],
        r.requestId,
      ),
      page: pagination(q, records.length, r.headers),
    };
  }
  async getSaleListings(query: SaleListingsQuery): Promise<ProviderResult<ProviderSaleListing[]>> {
    const q = valid(listingQuery, query);
    const r = await this.request('/listings/sale', q);
    const records = responseValid(z.array(rawListing).max(q.limit), r.data).map(normalizeListing);
    return {
      ...this.result(
        records,
        '/listings/sale',
        [
          'Prices are asking prices. Inactive means delisted, not sold; listing history is not a complete within-listing price-change feed.',
        ],
        r.requestId,
      ),
      page: pagination(q, records.length, r.headers),
    };
  }
  async getValuation(query: ValuationQuery): Promise<ProviderResult<ProviderValuation>> {
    const q = valid(valuationQuery, query);
    const r = await this.request('/avm/value', q);
    const raw = responseValid(rawValuation, r.data);
    const comparables: ProviderComparable[] = raw.comparables.map(c => ({
      ...normalizeListing(c),
      distanceMiles: c.distance ?? undefined,
      correlation: c.correlation ?? undefined,
    }));
    const subject =
      raw.subjectProperty?.id && raw.subjectProperty.formattedAddress
        ? normalizeProperty(responseValid(rawProperty, raw.subjectProperty))
        : undefined;
    return this.result(
      {
        kind: 'provider-estimate',
        estimate: raw.price,
        rangeLow: raw.priceRangeLow ?? undefined,
        rangeHigh: raw.priceRangeHigh ?? undefined,
        subject,
        comparables,
        intervalClaim: { coverage: 0.85, source: 'https://developers.rentcast.io/reference/property-valuation-schema' },
      },
      '/avm/value',
      [
        'Provider AVM estimate, not an appraisal or a guaranteed sale result. The provider-claimed interval is not locally calibrated. Comparables are sale listings and are not closed-sale evidence.',
      ],
      r.requestId,
    );
  }
  async getComparables(query: ValuationQuery): Promise<ProviderResult<ProviderComparable[]>> {
    const r = await this.getValuation(query);
    return { ...r, data: r.data.comparables };
  }
  async getMarketStatistics(query: MarketStatisticsQuery): Promise<ProviderResult<ProviderMarketStatistics>> {
    const q = valid(marketQuery, query);
    const r = await this.request('/markets', { ...q, dataType: 'Sale' });
    const raw = responseValid(rawMarket, r.data);
    if (raw.zipCode !== q.zipCode)
      throw new PropertyProviderError('invalid-response', 'The provider returned data for a different ZIP code.');
    return this.result(
      {
        kind: 'sale-listing-market',
        zipCode: raw.zipCode,
        lastUpdatedAt: raw.saleData?.lastUpdatedDate ?? undefined,
        current: raw.saleData ? normalizePeriod(raw.saleData) : undefined,
        history: Object.values(raw.saleData?.history ?? {})
          .map(normalizePeriod)
          .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
          .slice(-q.historyRange),
      },
      '/markets',
      [
        ...(!raw.saleData ? ['Sale listing statistics are unavailable for this ZIP code.'] : []),
        'Statistics describe active sale listings, not closed transactions, absorption, or mortgage rates. Historical gaps can reflect insufficient listing observations.',
      ],
      r.requestId,
    );
  }
  async getCoverage(): Promise<ProviderResult<ProviderCoverage>> {
    return this.result(
      {
        country: 'US',
        status: 'documented-unverified',
        supportedEndpoints: ['/properties', '/listings/sale', '/avm/value', '/markets'],
        limitations: [
          'Provider describes nationwide US coverage, but individual address, field, county and ZIP availability varies.',
          'Closed-sale prices can be missing in non-disclosure states.',
          'No live connection or coverage request has been made by this metadata method.',
        ],
        documentationUrl: 'https://developers.rentcast.io/reference/introduction',
        liveConnectionVerified: false,
      },
      'coverage',
    );
  }
}
