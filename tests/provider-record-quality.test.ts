import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidateProviderRecords, type ProviderRecordEntry } from '../src/lib/providers/record-quality';
const entry: ProviderRecordEntry = { sourceId: 'authorized', fixture: false, observedAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-16T00:00:00Z', origin: 'property-record', record: { id: 'one', kind: 'property-record', providerId: 'rentcast', address: { formatted: 'Fictional test address', city: 'Arlington', state: 'VA', zipCode: '22207' }, location: { latitude: 38, longitude: -77 }, facts: { bedrooms: 3, bathrooms: 2, squareFootage: 2400 }, sales: [{ kind: 'recorded-sale', date: '2026-09-01', price: 600000, sourceField: 'lastSale' }] } };
test('AVM subject stubs cannot erase full property sale history; conflicting facts remain visible', () => {
  const stub: ProviderRecordEntry = { ...entry, origin: 'avm-subject', observedAt: '2026-10-15T01:00:00Z', record: { ...entry.record, facts: { squareFootage: 2500 }, sales: [] } };
  const [result] = consolidateProviderRecords([stub, entry]);
  assert.deepEqual(result.record.sales, entry.record.sales); assert.equal(result.record.facts.squareFootage, 2400); assert.deepEqual(result.quality.conflictingFields, ['squareFootage']); assert.ok(result.quality.missingFields.includes('lotSize')); assert.equal(result.quality.observationCount, 2);
});
test('demo/live and separate providers retain separate identity and newest same-origin evidence wins', () => {
  const newer = { ...entry, observedAt: '2026-10-15T02:00:00Z' };
  const results = consolidateProviderRecords([entry, newer, { ...entry, fixture: true }, { ...entry, record: { ...entry.record, providerId: 'future-authorized-provider' } }]);
  assert.equal(results.length, 3); assert.equal(results[0].observedAt, newer.observedAt); assert.equal(results[0].quality.observationCount, 2);
});
