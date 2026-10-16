import test from 'node:test';
import assert from 'node:assert/strict';
import { RentCastProvider } from '../src/lib/providers/rentcast';
import {
  createFixturePropertyProvider,
  FIXTURE_PROPERTY_ADDRESS,
  fixturePropertyRecords,
} from '../src/lib/providers/fixture-property';
import { PropertyProviderError } from '../src/lib/providers/property-provider';

const record = {
  id: 'test-provider-id',
  formattedAddress: '100 Schema Test Street, Arlington, VA 22207',
  addressLine1: '100 Schema Test Street',
  city: 'Arlington',
  state: 'VA',
  zipCode: '22207',
  stateFips: '51',
  countyFips: '013',
  latitude: 38.9,
  longitude: -77.1,
  propertyType: 'Single Family',
  bedrooms: 3,
  bathrooms: 2.5,
  squareFootage: 2000,
  lotSize: 6000,
  yearBuilt: 1984,
  lastSaleDate: '2026-06-10T00:00:00.000Z',
  lastSalePrice: 700000,
  history: { '2026-06-10': { event: 'Sale', date: '2026-06-10T00:00:00.000Z', price: 700000 } },
  taxAssessments: { '2026': { year: 2026, value: 650000, land: 300000, improvements: 350000 } },
  propertyTaxes: { '2026': { year: 2026, total: 6500 } },
  owner: { names: ['Sensitive Owner'], mailingAddress: { formattedAddress: 'private mailing address' } },
  ownerOccupied: true,
};
const listing = {
  ...record,
  status: 'Inactive',
  price: 745000,
  listedDate: '2026-04-10T00:00:00.000Z',
  removedDate: '2026-06-01T00:00:00.000Z',
  daysOnMarket: 52,
  history: { '2026-04-10': { event: 'Sale Listing', price: 745000, listedDate: '2026-04-10T00:00:00.000Z' } },
  listingAgent: { name: 'Sensitive Agent', email: 'agent-private@example.invalid' },
  listingOffice: { phone: '555-555-0100' },
  builder: { phone: '555-555-0200' },
};
const json = (value: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', ...headers } });
const rejectCode = (code: PropertyProviderError['code']) => (error: unknown) =>
  error instanceof PropertyProviderError && error.code === code;

test('property client uses fixed HTTPS endpoint, server key and documented query logging suppression; strips owner/contact data', async () => {
  let calls = 0;
  const client = new RentCastProvider({
    apiKey: 'test-server-key',
    fetcher: async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://api.rentcast.io');
      assert.equal(url.pathname, '/v1/properties');
      assert.equal(url.searchParams.get('suppressLogging'), 'true');
      assert.equal(url.searchParams.get('limit'), '1');
      assert.equal(new Headers(init?.headers).get('X-Api-Key'), 'test-server-key');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.cache, 'no-store');
      return json([record], { 'x-request-id': 'fixture-request' });
    },
  });
  const r = await client.getProperty({ address: record.formattedAddress });
  assert.equal(calls, 1);
  assert.equal(r.data?.kind, 'property-record');
  assert.equal(r.data?.facts.bathrooms, 2.5);
  assert.equal(r.data?.sales[0].price, 700000);
  assert.deepEqual(r.data?.assessments, [{ year: 2026, value: 650000, land: 300000, improvements: 350000 }]);
  assert.deepEqual(r.data?.taxes, [{ year: 2026, total: 6500 }]);
  assert.equal(r.provenance.dataKind, 'licensed-provider');
  assert.equal(r.provenance.requestId, 'fixture-request');
  assert.equal(r.data?.address.stateFips! + r.data?.address.countyFips!, '51013');
  assert.doesNotMatch(JSON.stringify(r), /Sensitive|mailingAddress|ownerOccupied|test-server-key/);
});
test('strict geographic, pagination and field bounds reject inputs before any request', async () => {
  let calls = 0;
  const client = new RentCastProvider({
    apiKey: 'test',
    fetcher: async () => {
      calls++;
      return json([]);
    },
  });
  for (const q of [
    {},
    { state: 'VA' },
    { city: 'Arlington' },
    { zipCode: '22207', limit: 101 },
    { zipCode: '22207', offset: 10001 },
    { latitude: 38.9, longitude: -77.1 },
    { address: 'valid', radius: 101 },
    { zipCode: '22207', url: 'https://evil.invalid' },
    { zipCode: '22207', owner: 'person' },
    { zipCode: '22207', bedrooms: -1 },
  ])
    await assert.rejects(client.searchProperties(q as never), rejectCode('invalid-query'));
  await assert.rejects(client.getValuation({ latitude: 38.9 }), rejectCode('invalid-query'));
  await assert.rejects(client.getValuation({ address: 'valid', compCount: 4 }), rejectCode('invalid-query'));
  await assert.rejects(client.getMarketStatistics({ zipCode: '22207', historyRange: 37 }), rejectCode('invalid-query'));
  assert.equal(calls, 0);
});
test('pagination is explicit and bounded, reads total count without automatically buying another page', async () => {
  let calls = 0;
  const client = new RentCastProvider({
    apiKey: 'test',
    fetcher: async () => {
      calls++;
      return json([record], { 'x-total-count': '3' });
    },
  });
  const r = await client.searchProperties({ zipCode: '22207', limit: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(r.page, {
    offset: 0,
    limit: 1,
    returned: 1,
    total: 3,
    nextOffset: 1,
    hasMore: true,
    hasMoreIsEstimate: false,
  });
  const noTotal = new RentCastProvider({ apiKey: 'test', fetcher: async () => json([record]) });
  assert.equal((await noTotal.searchProperties({ zipCode: '22207', limit: 1 })).page?.hasMoreIsEstimate, true);
});
test('sale listing asking/history prices and inactive status never become recorded closed sales', async () => {
  const client = new RentCastProvider({
    apiKey: 'test',
    fetcher: async input => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/v1/listings/sale');
      assert.equal(url.searchParams.get('status'), 'Inactive');
      return json([listing]);
    },
  });
  const r = await client.getSaleListings({ zipCode: '22207', status: 'Inactive' });
  assert.equal(r.data[0].kind, 'sale-listing');
  assert.equal(r.data[0].askingPrice, 745000);
  assert.equal(r.data[0].history?.[0].askingPrice, 745000);
  assert.equal('sales' in r.data[0], false);
  assert.match(r.warnings.join(' '), /not sold/);
  assert.doesNotMatch(JSON.stringify(r), /Sensitive|Agent|agent-private|listingOffice|builder/);
});
test('AVM estimate and its listing comparables remain distinct; comparables require only one AVM request', async () => {
  let calls = 0;
  const client = new RentCastProvider({
    apiKey: 'test',
    fetcher: async input => {
      calls++;
      assert.equal(new URL(String(input)).pathname, '/v1/avm/value');
      return json({
        price: 725000,
        priceRangeLow: 690000,
        priceRangeHigh: 760000,
        subjectProperty: record,
        comparables: [{ ...listing, distance: 0.3, correlation: 0.98 }],
      });
    },
  });
  const r = await client.getValuation({ address: record.formattedAddress });
  assert.equal(r.data.kind, 'provider-estimate');
  assert.equal(r.data.estimate, 725000);
  assert.equal(r.data.comparables[0].kind, 'sale-listing');
  assert.equal(r.data.comparables[0].askingPrice, 745000);
  assert.equal(r.data.subject?.sales[0].price, 700000);
  assert.equal(r.data.intervalClaim?.coverage, 0.85);
  assert.match(r.warnings.join(' '), /not locally calibrated/);
  const comps = await client.getComparables({ address: record.formattedAddress });
  assert.equal(calls, 2);
  assert.equal(comps.data.length, 1);
  assert.equal('sales' in comps.data[0], false);
});
test('ZIP market maps active listing aggregates, keeps real update date and missing statistics explicit', async () => {
  const client = new RentCastProvider({
    apiKey: 'test',
    fetcher: async input => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/v1/markets');
      assert.equal(url.searchParams.get('dataType'), 'Sale');
      assert.equal(url.searchParams.get('historyRange'), '12');
      return json({
        zipCode: '22207',
        saleData: {
          lastUpdatedDate: '2026-09-30T00:00:00.000Z',
          medianPrice: 745000,
          totalListings: 21,
          newListings: 6,
          history: {
            '2026-08': { date: '2026-08-01T00:00:00.000Z', medianPrice: 750000 },
            '2026-09': { date: '2026-09-01T00:00:00.000Z', medianPrice: 745000 },
          },
        },
      });
    },
  });
  const r = await client.getMarketStatistics({ zipCode: '22207' });
  assert.equal(r.data.kind, 'sale-listing-market');
  assert.equal(r.data.current?.medianAskingPrice, 745000);
  assert.equal(r.data.lastUpdatedAt, '2026-09-30T00:00:00.000Z');
  assert.equal(r.data.history.length, 2);
  assert.match(r.warnings.join(' '), /not closed/);
  const absent = new RentCastProvider({ apiKey: 'test', fetcher: async () => json({ zipCode: '22207' }) });
  const empty = await absent.getMarketStatistics({ zipCode: '22207' });
  assert.equal(empty.data.current, undefined);
  assert.match(empty.warnings.join(' '), /unavailable/);
});
test('documented HTTP errors are sanitized and never automatically retried, including rate limits and billable timeouts', async () => {
  for (const [status, code] of [
    [400, 'invalid-query'],
    [401, 'authentication'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'provider-error'],
    [504, 'timeout'],
  ] as const) {
    let calls = 0;
    const client = new RentCastProvider({
      apiKey: 'secret-test-token',
      fetcher: async () => {
        calls++;
        return new Response('PRIVATE raw address and secret-test-token', { status, headers: { 'retry-after': '3' } });
      },
    });
    try {
      await client.searchProperties({ zipCode: '22207' });
      assert.fail('expected provider error');
    } catch (error) {
      assert.ok(error instanceof PropertyProviderError);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.equal(error.retryAfterSeconds, 3);
      assert.doesNotMatch(error.message, /PRIVATE|secret-test-token|22207/);
    }
    assert.equal(calls, 1);
  }
});
test('timeouts, malformed/oversized responses and invalid fields fail safely without retry or raw response leakage', async () => {
  let calls = 0;
  const timeout = new RentCastProvider({
    apiKey: 'test',
    timeoutMs: 100,
    fetcher: async (_input, init) => {
      calls++;
      return await new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('private provider detail')), { once: true }),
      );
    },
  });
  await assert.rejects(timeout.searchProperties({ zipCode: '22207' }), rejectCode('timeout'));
  assert.equal(calls, 1);
  for (const body of [
    'not JSON',
    JSON.stringify([{ ...record, bedrooms: 'three' }]),
    JSON.stringify([{ ...record, lastSaleDate: '2026-02-30' }]),
  ]) {
    const invalid = new RentCastProvider({ apiKey: 'test', fetcher: async () => new Response(body) });
    await assert.rejects(invalid.searchProperties({ zipCode: '22207' }), rejectCode('invalid-response'));
  }
  const huge = new RentCastProvider({
    apiKey: 'test',
    fetcher: async () => new Response('[]', { headers: { 'content-length': String(5 * 1024 * 1024) } }),
  });
  await assert.rejects(huge.searchProperties({ zipCode: '22207' }), rejectCode('invalid-response'));
  const wrongZip = new RentCastProvider({ apiKey: 'test', fetcher: async () => json({ zipCode: '99999' }) });
  await assert.rejects(wrongZip.getMarketStatistics({ zipCode: '22207' }), rejectCode('invalid-response'));
});
test('key absence and coverage metadata do not trigger health or paid requests; synthetic fixtures never substitute unrelated addresses', async () => {
  let calls = 0;
  const client = new RentCastProvider({
    apiKey: '',
    fetcher: async () => {
      calls++;
      return json([]);
    },
  });
  const coverage = await client.getCoverage();
  assert.equal(coverage.data.liveConnectionVerified, false);
  assert.equal(coverage.data.status, 'documented-unverified');
  await assert.rejects(client.searchProperties({ zipCode: '22207' }), rejectCode('not-configured'));
  assert.equal(calls, 0);
  const fixture = createFixturePropertyProvider();
  const subject = await fixture.getProperty({ address: FIXTURE_PROPERTY_ADDRESS });
  assert.equal(subject.provenance.dataKind, 'synthetic');
  assert.equal(subject.data?.address.formatted, FIXTURE_PROPERTY_ADDRESS);
  assert.equal((await fixture.getProperty({ address: 'an unrelated property' })).data, null);
  await assert.rejects(fixture.getValuation({ address: 'an unrelated property' }), rejectCode('not-found'));
  assert.equal(fixturePropertyRecords().length, 7);
  assert.ok(
    fixturePropertyRecords()
      .slice(1)
      .every(p => p.sales.some(s => s.price && s.date.startsWith('2026-'))),
  );
  assert.equal(
    (await fixture.getValuation({ address: FIXTURE_PROPERTY_ADDRESS })).data.comparables[0].kind,
    'sale-listing',
  );
});
