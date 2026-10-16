import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Property, Source } from '../types';

/** Bounded RESO OData Property consumer. Provider-specific metadata/field availability must be verified.
 * Standard references: https://transport.reso.org/proposals/web-api-core/
 * https://www.reso.org/knowledge-base/reso-data-dictionary-faq/
 * RESO supplies standards, not MLS records or a license. No provider access is implied.
 */
export type ResoConfig = { baseUrl: string; allowedOrigins: string[]; token: string; license: string; conditionMap: Record<string, number>; maxPages?: number; maxRecords?: number };
export type ResoImport = { properties: Property[]; sources: Source[]; observedAt: string; fetched: number; skipped: { row: number; reason: string }[]; truncated: boolean };
const number = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite());
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)), 'Invalid provider date');
const recordSchema = z.object({
  ListingKey: z.string().min(1).max(255), UnparsedAddress: z.string().min(1).max(500), City: z.string().min(1).max(150), StateOrProvince: z.string().min(1).max(100), PostalCode: z.string().min(1).max(30),
  Latitude: number.pipe(z.number().min(-90).max(90)), Longitude: number.pipe(z.number().min(-180).max(180)), BedroomsTotal: number.pipe(z.number().int().min(0).max(50)), BathroomsTotalInteger: number.pipe(z.number().min(0).max(50)),
  LivingArea: number.pipe(z.number().positive().max(1e7)), LotSizeSquareFeet: number.pipe(z.number().min(0).max(1e10)), YearBuilt: number.pipe(z.number().int().min(1600).max(new Date().getUTCFullYear() + 10)),
  PropertyCondition: z.union([z.string(), z.array(z.string()).min(1)]), StandardStatus: z.enum(['Active', 'Closed', 'Pending', 'ActiveUnderContract', 'Withdrawn', 'Canceled', 'Expired']),
  ListPrice: number.pipe(z.number().positive().max(1e10)), ClosePrice: number.nullish(), ListingContractDate: date, CloseDate: date.nullish(), DaysOnMarket: number.pipe(z.number().int().min(0).max(10000)), ModificationTimestamp: date, PublicRemarks: z.string().max(20000).nullish(),
}).refine((record) => record.StandardStatus !== 'Closed' || !!record.CloseDate && typeof record.ClosePrice === 'number' && record.ClosePrice > 0, 'Closed sale requires documented close date and price.');
const fields = ['ListingKey', 'UnparsedAddress', 'City', 'StateOrProvince', 'PostalCode', 'Latitude', 'Longitude', 'BedroomsTotal', 'BathroomsTotalInteger', 'LivingArea', 'LotSizeSquareFeet', 'YearBuilt', 'PropertyCondition', 'StandardStatus', 'ListPrice', 'ClosePrice', 'ListingContractDate', 'CloseDate', 'DaysOnMarket', 'ModificationTimestamp', 'PublicRemarks'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function checkedUrl(value: string, config: ResoConfig, resourcePath: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !config.allowedOrigins.includes(url.origin) || url.pathname !== resourcePath) throw new Error('RESO URL must use the configured HTTPS origin and Property resource path.');
  return url;
}

async function readBounded(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Provider returned an empty response.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 5_000_000) { await reader.cancel(); throw new Error('Provider page exceeds 5 MB.'); } chunks.push(next.value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function fetchResoProperties(config: ResoConfig, fetcher: typeof fetch = fetch): Promise<ResoImport> {
  if (!config.token || !config.license.trim() || !config.allowedOrigins.length || !Object.keys(config.conditionMap).length) throw new Error('Explicit provider token, origin allowlist, license terms and professional condition mapping are required.');
  if (Object.values(config.conditionMap).some((value) => !Number.isInteger(value) || value < 1 || value > 5)) throw new Error('Condition mapping values must be integers from 1 through 5.');
  const base = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/');
  if (base.search || base.hash || base.username || base.password) throw new Error('Configure a provider service-root URL without credentials, query, or fragment.');
  const first = new URL('Property', base); const resourcePath = first.pathname;
  first.searchParams.set('$select', fields.join(',')); first.searchParams.set('$top', '200');
  first.searchParams.set('$orderby', 'ModificationTimestamp desc');
  const observedAt = new Date().toISOString();
  const sourceId = `reso-source-${hash(first.origin + config.license + observedAt).slice(0, 24)}`;
  const source: Source = { id: sourceId, label: `Licensed RESO snapshot · ${first.hostname}`, kind: 'licensed', observedAt, license: config.license + ' Provider-specific use, retention, redistribution, AI processing, and reporting restrictions remain binding. Confidence is unassessed (0).', confidence: 0 };
  const result: ResoImport = { properties: [], sources: [source], observedAt, fetched: 0, skipped: [], truncated: false };
  const seenUrls = new Set<string>(); const seenIds = new Set<string>();
  let nextUrl: string | null = first.href;
  const maxPages = Math.min(10, Math.max(1, config.maxPages || 3)); const maxRecords = Math.min(2000, Math.max(1, config.maxRecords || 500));
  for (let page = 0; nextUrl && page < maxPages; page++) {
    const url = checkedUrl(nextUrl, config, resourcePath);
    if (seenUrls.has(url.href)) throw new Error('Provider pagination loop detected.'); seenUrls.add(url.href);
    const response = await fetcher(url.href, { method: 'GET', headers: { authorization: `Bearer ${config.token}`, accept: 'application/json', 'OData-Version': '4.0' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`RESO provider returned HTTP ${response.status}; no records were imported.`);
    const payload = z.object({ value: z.array(z.unknown()).max(5000), '@odata.nextLink': z.string().optional() }).parse(await readBounded(response));
    for (const raw of payload.value) {
      result.fetched++;
      if (result.fetched > maxRecords) { result.truncated = true; break; }
      const parsed = recordSchema.safeParse(raw);
      if (!parsed.success) { result.skipped.push({ row: result.fetched, reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 1000) }); continue; }
      const record = parsed.data;
      const conditions = Array.isArray(record.PropertyCondition) ? record.PropertyCondition : [record.PropertyCondition];
      const condition = conditions.map((value) => config.conditionMap[value]).find((value) => value !== undefined);
      if (condition === undefined) { result.skipped.push({ row: result.fetched, reason: 'Provider condition has no professionally configured analytical mapping; condition was not inferred.' }); continue; }
      const id = `reso-${hash(first.origin + ':' + record.ListingKey).slice(0, 24)}`;
      if (seenIds.has(id)) continue; seenIds.add(id);
      const status: Property['status'] = record.StandardStatus === 'Closed' ? 'sold' : record.StandardStatus === 'Active' ? 'active' : ['Pending', 'ActiveUnderContract'].includes(record.StandardStatus) ? 'pending' : 'withdrawn';
      result.properties.push({ id, address: record.UnparsedAddress, city: record.City, state: record.StateOrProvince, zip: record.PostalCode, lat: record.Latitude, lng: record.Longitude, beds: record.BedroomsTotal, baths: record.BathroomsTotalInteger, sqft: record.LivingArea, lotSqft: record.LotSizeSquareFeet, yearBuilt: record.YearBuilt, condition, status, price: record.ListPrice, soldPrice: record.ClosePrice ?? undefined, listedAt: new Date(record.ListingContractDate).toISOString(), soldAt: record.CloseDate ? new Date(record.CloseDate).toISOString() : undefined, dom: record.DaysOnMarket, sourceId, description: `${record.PublicRemarks || 'No public remarks supplied.'}\nCondition score ${condition}/5 is an operator-defined mapping of provider labels (${conditions.join(', ')}); verify before adjustment. This is a current snapshot, not a complete listing or permit history.`, history: [{ date: new Date(record.ModificationTimestamp).toISOString(), event: `Provider snapshot: ${record.StandardStatus}`, price: status === 'sold' ? record.ClosePrice! : record.ListPrice }] });
    }
    if (result.fetched > maxRecords) { nextUrl = null; break; }
    nextUrl = payload['@odata.nextLink'] ? new URL(payload['@odata.nextLink'], url).href : null;
    if (nextUrl) checkedUrl(nextUrl, config, resourcePath);
  }
  if (nextUrl) result.truncated = true;
  return result;
}
