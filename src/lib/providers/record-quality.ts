import type { ProviderProperty } from './property-provider';
export type ProviderRecordEntry = {
  record: ProviderProperty;
  sourceId: string;
  fixture: boolean;
  observedAt: string;
  expiresAt: string;
  origin: 'property-record' | 'avm-subject';
};
const fields = (record: ProviderProperty): Record<string, unknown> => ({
  address: record.address.formatted,
  city: record.address.city,
  state: record.address.state,
  zip: record.address.zipCode,
  latitude: record.location?.latitude,
  longitude: record.location?.longitude,
  bedrooms: record.facts.bedrooms,
  bathrooms: record.facts.bathrooms,
  squareFootage: record.facts.squareFootage,
  lotSize: record.facts.lotSize,
  propertyType: record.facts.propertyType,
});

/** Prefer complete record-endpoint evidence over an AVM subject stub; never blend conflicting observations. */
export function consolidateProviderRecords(entries: ProviderRecordEntry[]) {
  const groups = new Map<string, ProviderRecordEntry[]>();
  for (const entry of entries) {
    const key = JSON.stringify([entry.fixture, entry.record.providerId, entry.record.id]);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return [...groups.values()].map(group => {
    const ordered = group.toSorted(
      (a, b) =>
        Number(b.origin === 'property-record') - Number(a.origin === 'property-record') ||
        b.observedAt.localeCompare(a.observedAt),
    );
    const selected = ordered[0],
      values = fields(selected.record);
    const missingFields = Object.keys(values).filter(key => values[key] === undefined || values[key] === '');
    const conflictingFields = Object.keys(values).filter(
      key =>
        new Set(
          group
            .map(entry => fields(entry.record)[key])
            .filter(value => value !== undefined && value !== '')
            .map(value => JSON.stringify(value)),
        ).size > 1,
    );
    return {
      ...selected,
      quality: {
        missingFields,
        conflictingFields,
        observationCount: group.length,
        identity: 'Provider ID and address only; cross-provider parcel identity not verified.',
      },
    };
  });
}
