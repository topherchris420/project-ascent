import { calculationChecksum } from '../analytics';
import type { ValuationProperty } from '../types';
import type { ProviderProperty, ProviderRecordedSale } from './property-provider';

export type ProviderNormalization = { value: ValuationProperty | null; missingFields: string[]; warnings: string[]; evidence: { providerId: string; recordId: string; sale?: ProviderRecordedSale } };
type Options = { sourceId: string; asOf: string; conditionAssumption?: number; role?: 'subject' | 'comparable' };
const finite = (value: unknown, minimum: number) => typeof value === 'number' && Number.isFinite(value) && value >= minimum;
function dateValue(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const parsed = Date.parse(value);
  const calendar = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(parsed) && Number.isFinite(calendar) && new Date(calendar).toISOString().slice(0, 10) === value.slice(0, 10) ? parsed : null;
}
function latestRecordedSale(record: ProviderProperty, asOf: number): ProviderRecordedSale | undefined {
  return (Array.isArray(record.sales) ? record.sales : []).filter((sale) => sale.kind === 'recorded-sale' && ['history', 'lastSale'].includes(sale.sourceField) && finite(sale.price, 0.01) && dateValue(sale.date) !== null && dateValue(sale.date)! <= asOf).sort((a, b) => dateValue(b.date)! - dateValue(a.date)!)[0];
}

/** Provider property records only. Listings and AVM comparables are not evidence of closed sales. */
export function normalizeProviderProperty(record: ProviderProperty, options: Options): ProviderNormalization {
  const warnings = ['Provider-reported property/sale fields require professional verification. Asking prices and automated value estimates are never treated as closing prices.'];
  const missingFields: string[] = [];
  const evidence = { providerId: record?.providerId ?? 'unknown', recordId: record?.id ?? 'unknown' };
  const asOf = dateValue(options.asOf);
  if (asOf === null) throw new Error('Normalization requires a valid ISO analysis date.');
  if (!options.sourceId.trim()) throw new Error('An authorized source reference is required.');
  if (record?.kind !== 'property-record') return { value: null, missingFields: ['property-record'], warnings: [...warnings, 'Sale listings and AVM estimates/comparables cannot be normalized as recorded-sale CMA inputs.'], evidence };
  const facts = record.facts ?? {}, address = record.address ?? { formatted: '' };
  for (const [key, value] of Object.entries({ id: record.id, address: address.formatted, city: address.city, state: address.state, zip: address.zipCode })) if (typeof value !== 'string' || !value.trim()) missingFields.push(key);
  const latitude = record.location?.latitude, longitude = record.location?.longitude;
  if (!finite(latitude, -90) || latitude! > 90) missingFields.push('latitude');
  if (!finite(longitude, -180) || longitude! > 180) missingFields.push('longitude');
  if (!finite(facts.bedrooms, 0)) missingFields.push('bedrooms');
  if (!finite(facts.bathrooms, 0)) missingFields.push('bathrooms');
  if (!finite(facts.squareFootage, 0.01)) missingFields.push('squareFootage');
  if (options.conditionAssumption !== undefined && (!finite(options.conditionAssumption, 0) || options.conditionAssumption > 5)) throw new Error('An explicitly supplied analyst condition assumption must be between 0 and 5.');
  const sale = options.role === 'comparable' ? latestRecordedSale(record, asOf) : undefined;
  if (options.role === 'comparable' && !sale) missingFields.push('recorded sale with positive price and date on/before asOf');
  if (missingFields.length) return { value: null, missingFields, warnings, evidence };
  const id = `provider-${calculationChecksum({ sourceId: options.sourceId, providerId: record.providerId, recordId: record.id, ...(sale ? { recordedSaleDate: sale.date } : {}) })}`;
  const value: ValuationProperty = { id, sourceId: options.sourceId, address: address.formatted, city: address.city!, state: address.state!, zip: address.zipCode!, lat: latitude!, lng: longitude!, beds: facts.bedrooms!, baths: facts.bathrooms!, sqft: facts.squareFootage! };
  const recordedHistory = record.sales.filter((entry) => entry.kind === 'recorded-sale' && ['history', 'lastSale'].includes(entry.sourceField) && dateValue(entry.date) !== null && dateValue(entry.date)! <= asOf).map((entry) => ({ date: entry.date, event: `Provider ${record.providerId} property record ${record.id}; recorded-sale source ${entry.sourceField}; verify underlying record`, ...(finite(entry.price, 0.01) ? { price: entry.price } : {}) }));
  if (recordedHistory.length) value.history = recordedHistory;
  if (finite(facts.lotSize, 0)) value.lotSqft = facts.lotSize;
  if (finite(facts.yearBuilt, 1)) value.yearBuilt = facts.yearBuilt;
  if (options.conditionAssumption !== undefined) {
    value.condition = options.conditionAssumption;
    warnings.push('Condition is an explicitly supplied analyst assumption, not an inspected provider fact; retain this distinction in professional explanations.');
  } else warnings.push('Condition is unknown. Calculation requires explicit conditionValue=0 consent or separately verified condition evidence; no default condition score is inserted.');
  if (sale) {
    value.status = 'sold'; value.soldPrice = sale.price; value.soldAt = sale.date;
    value.history = [{ date: sale.date, event: `Provider ${record.providerId} property record ${record.id}; recorded-sale source ${sale.sourceField}; verify underlying record`, price: sale.price }];
    warnings.push('The comparable represents a historical recorded-sale observation, not the current listing status. Listing-contract date and days on market remain unavailable.');
  }
  return { value, missingFields: [], warnings, evidence: { ...evidence, ...(sale ? { sale: structuredClone(sale) } : {}) } };
}

export function buildProviderCmaInputs(subject: ProviderProperty, candidates: ProviderProperty[], options: { sourceId: string; asOf: string; omitUnobservedCondition: true; conditionAssumption?: number }) {
  if (options.omitUnobservedCondition !== true) throw new Error('Unobserved provider condition may not be silently filled.');
  const normalizedSubject = normalizeProviderProperty(subject, { ...options, role: 'subject' });
  const incomplete: { id: string; missingFields: string[] }[] = normalizedSubject.value ? [] : [{ id: subject.id, missingFields: normalizedSubject.missingFields }];
  const comparables: ValuationProperty[] = [], warnings = [...normalizedSubject.warnings];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.id === subject.id && candidate.providerId === subject.providerId) { warnings.push('The subject property was excluded from its own comparable set.'); continue; }
    if (subject.facts.propertyType && candidate.facts?.propertyType && subject.facts.propertyType !== candidate.facts.propertyType) { incomplete.push({ id: candidate.id, missingFields: ['compatible property type; no cross-type value adjustment is inferred'] }); continue; }
    const normalized = normalizeProviderProperty(candidate, { ...options, role: 'comparable' });
    warnings.push(...normalized.warnings);
    if (!normalized.value) { incomplete.push({ id: candidate.id, missingFields: normalized.missingFields }); continue; }
    if (seen.has(normalized.value.id)) { warnings.push('A duplicate recorded-sale observation was excluded, preventing duplicate comparable weighting.'); continue; }
    seen.add(normalized.value.id); comparables.push(normalized.value);
  }
  if (!subject.facts.propertyType || candidates.some((candidate) => !candidate.facts?.propertyType)) warnings.push('Property type is missing for at least one record; a professional must verify comparability before relying on results.');
  return { subject: normalizedSubject.value, comparables, incomplete, warnings: [...new Set(warnings)] };
}
