import { createHash } from 'node:crypto';

/**
 * One normalized record from a public source, as Ascent observed it. Four dates are kept apart because they mean
 * different things: when a sale happened, when its deed was recorded, when the source last published the record
 * and when Ascent fetched it. A recently fetched or republished record is not evidence of a recent sale.
 */
export const OBSERVATION_VERSION = 'ascent-observation-1';
export type ObservationKind =
  'recorded-transfer' | 'assessment' | 'property-tax' | 'permit' | 'flood-zone' | 'price-index';
export type ObservationValue = string | number | boolean | null;
export type ObservationDates = {
  /** When the transfer or contract happened, as the source states it. */
  transaction: string | null;
  /** When the deed was dated or recorded, if the source publishes it. */
  recorded: string | null;
  /** The record's own effective date: a permit's issue date, an assessment's date, an index quarter's end. */
  effective: string | null;
  /** When the source last published or modified the record. */
  published: string | null;
  /** When Ascent fetched it. */
  observed: string;
};
export type Observation = {
  sourceId: string;
  kind: ObservationKind;
  /** The home this record is about, in Ascent's parcel form; null for area-level records such as an index. */
  parcelId: string | null;
  /** Stable identity within the source, built from content rather than row numbers the source reassigns. */
  identity: string;
  values: Record<string, ObservationValue>;
  dates: ObservationDates;
  /** SHA-256 of the identity, values and substantive dates; publication and fetch times are excluded. */
  fingerprint: string;
};

/** JSON with sorted keys, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * A republished row with a new modification time keeps its fingerprint; a corrected price or status changes it.
 */
export function observationFingerprint(observation: Omit<Observation, 'fingerprint'>) {
  const { transaction, recorded, effective } = observation.dates;
  return sha256(
    canonicalJson({
      version: OBSERVATION_VERSION,
      sourceId: observation.sourceId,
      kind: observation.kind,
      identity: observation.identity,
      parcelId: observation.parcelId,
      values: observation.values,
      dates: { transaction, recorded, effective },
    }),
  );
}
export function observation(input: Omit<Observation, 'fingerprint'>): Observation {
  return { ...input, fingerprint: observationFingerprint(input) };
}

/** Milliseconds since the epoch (ArcGIS dates) or an ISO-like string, to a UTC calendar date; invalid → null. */
export function isoDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time =
    typeof value === 'number'
      ? value
      : /^\d{4}\.\d{2}\.\d{2}$/.test(String(value))
        ? Date.parse(`${String(value).replaceAll('.', '-')}T00:00:00Z`)
        : Date.parse(String(value).length === 10 ? `${value}T00:00:00Z` : String(value));
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}
export function isoTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = typeof value === 'number' ? (value < 1e11 ? value * 1000 : value) : Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
/** A finite number from a source cell, or null. Blank cells stay unknown, never zero. */
export function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

/** District SSL ("0271    0073") in the bundled snapshots' form ("0271____0073"). */
export const dcParcel = (ssl: unknown) => (typeof ssl === 'string' ? ssl.replace(/ /g, '_') : '');
/** Ascent's parcel form back to the District's SSL, for a query. */
export const dcSsl = (parcelId: string) => parcelId.replace(/_/g, ' ');
