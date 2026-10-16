import {
  PropertyProviderError,
  type PropertyDataProvider,
  type PropertyLookupQuery,
  type PropertySearchQuery,
  type SaleListingsQuery,
  type ValuationQuery,
  type MarketStatisticsQuery,
  type ProviderProperty,
  type ProviderComparable,
  type ProviderValuation,
  type ProviderCoverage,
  type ProviderMarketStatistics,
  type ProviderResult,
  type ProviderEndpoint,
} from './property-provider';

export const FIXTURE_PROPERTY_ADDRESS = '4821 Example Ridge Road, Arlington, VA 22207';
export const FIXTURE_PROPERTY_AS_OF = '2026-10-01T12:00:00.000Z';
/** Entirely invented records for software acceptance checks. No real property or outcome claim. */
export function fixturePropertyRecords(): ProviderProperty[] {
  return Array.from({ length: 7 }, (_, index) => ({
    kind: 'property-record',
    id: `fixture-property-${index + 1}`,
    providerId: 'fixture',
    address: {
      formatted:
        index === 0 ? FIXTURE_PROPERTY_ADDRESS : `${4821 + index * 10} Example Ridge Road, Arlington, VA 22207`,
      line1: `${4821 + index * 10} Example Ridge Road`,
      city: 'Arlington',
      state: 'VA',
      zipCode: '22207',
      county: 'Arlington',
      stateFips: '51',
      countyFips: '013',
    },
    location: { latitude: 38.903 + index * 0.002, longitude: -77.137 + index * 0.001 },
    facts: {
      propertyType: 'Single Family',
      bedrooms: 3 + (index === 4 ? 1 : 0),
      bathrooms: 2,
      squareFootage: 1900 + index * 35,
      lotSize: 6000 + index * 100,
      yearBuilt: 1980 + index,
      garageSpaces: 1,
    },
    sales: [
      {
        kind: 'recorded-sale',
        date:
          index === 0
            ? '2022-05-10T00:00:00.000Z'
            : `2026-0${9 - Math.floor(index / 2)}-${String(10 + index).padStart(2, '0')}T00:00:00.000Z`,
        price: index === 0 ? 520000 : 690000 + index * 9500,
        sourceField: 'history',
      },
    ],
    assessorId: `SYNTHETIC-${index + 1}`,
    assessments: [{ year: 2026, value: 650000 + index * 5000, land: 300000, improvements: 350000 + index * 5000 }],
    taxes: [{ year: 2026, total: 6500 + index * 50 }],
  }));
}
function fixtureListings(): ProviderComparable[] {
  return fixturePropertyRecords()
    .slice(1)
    .map((p, index) => ({
      kind: 'sale-listing',
      id: `fixture-listing-${index + 1}`,
      providerId: 'fixture',
      address: p.address,
      location: p.location,
      facts: p.facts,
      status: 'Active',
      askingPrice: 720000 + index * 12000,
      listedAt: '2026-09-10T00:00:00.000Z',
      lastSeenAt: FIXTURE_PROPERTY_AS_OF,
      daysOnMarket: 21,
      distanceMiles: 0.2 + index * 0.1,
      correlation: 0.98 - index * 0.02,
      history: [{ event: 'Sale Listing', date: '2026-09-10T00:00:00.000Z', askingPrice: 720000 + index * 12000 }],
    }));
}
function envelope<T>(data: T, endpoint: ProviderEndpoint): ProviderResult<T> {
  return {
    data,
    provenance: {
      providerId: 'fixture',
      endpoint,
      retrievedAt: FIXTURE_PROPERTY_AS_OF,
      schemaVersion: 'synthetic-fixture-v1',
      dataKind: 'synthetic',
    },
    warnings: [
      'Synthetic software demonstration: all addresses, facts, transactions, asking prices and estimates in this fixture are invented. No provider call or real-world validation occurred.',
    ],
  };
}
function filtered(query: PropertySearchQuery) {
  return fixturePropertyRecords().filter(
    p =>
      (!query.address || p.address.formatted.toLowerCase() === query.address.trim().toLowerCase()) &&
      (!query.zipCode || p.address.zipCode === query.zipCode) &&
      (!query.state || p.address.state === query.state) &&
      (!query.city || p.address.city === query.city) &&
      (!query.propertyType || p.facts.propertyType === query.propertyType) &&
      (!query.bedrooms || p.facts.bedrooms === query.bedrooms),
  );
}
function paged<T>(
  items: T[],
  query: { offset?: number; limit?: number },
  endpoint: ProviderEndpoint,
): ProviderResult<T[]> {
  const offset = query.offset ?? 0,
    limit = query.limit ?? 20;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new PropertyProviderError('invalid-query', 'The fixture query is outside supported bounds.');
  const data = items.slice(offset, offset + limit),
    hasMore = offset + data.length < items.length;
  return {
    ...envelope(data, endpoint),
    page: {
      offset,
      limit,
      returned: data.length,
      total: items.length,
      hasMore,
      hasMoreIsEstimate: false,
      ...(hasMore ? { nextOffset: offset + data.length } : {}),
    },
  };
}
export class FixturePropertyProvider implements PropertyDataProvider {
  readonly id = 'fixture';
  async getProperty(query: PropertyLookupQuery) {
    return envelope(filtered(query)[0] ?? null, '/properties');
  }
  async searchProperties(query: PropertySearchQuery) {
    return paged(filtered(query), query, '/properties');
  }
  async getSaleListings(query: SaleListingsQuery) {
    return paged(
      fixtureListings().filter(
        p =>
          (!query.zipCode || p.address.zipCode === query.zipCode) &&
          (!query.address || p.address.formatted.toLowerCase() === query.address.trim().toLowerCase()) &&
          (!query.status || p.status === query.status),
      ),
      query,
      '/listings/sale',
    );
  }
  async getValuation(query: ValuationQuery): Promise<ProviderResult<ProviderValuation>> {
    const subject = query.address ? filtered({ address: query.address })[0] : undefined;
    if (!subject) throw new PropertyProviderError('not-found', 'No matching synthetic fixture address.');
    return envelope(
      {
        kind: 'provider-estimate',
        estimate: 725000,
        rangeLow: 690000,
        rangeHigh: 760000,
        subject,
        comparables: fixtureListings().slice(0, query.compCount ?? 5),
      },
      '/avm/value',
    );
  }
  async getComparables(query: ValuationQuery) {
    const r = await this.getValuation(query);
    return { ...r, data: r.data.comparables };
  }
  async getMarketStatistics(query: MarketStatisticsQuery): Promise<ProviderResult<ProviderMarketStatistics>> {
    if (query.zipCode !== '22207')
      throw new PropertyProviderError('not-found', 'No matching synthetic fixture ZIP code.');
    return envelope(
      {
        kind: 'sale-listing-market',
        zipCode: '22207',
        lastUpdatedAt: FIXTURE_PROPERTY_AS_OF,
        current: {
          medianAskingPrice: 745000,
          averageAskingPrice: 750000,
          medianDaysOnMarket: 30,
          totalListings: 24,
          newListings: 7,
        },
        history: [
          { date: '2026-08-01T00:00:00.000Z', medianAskingPrice: 752000, totalListings: 22, newListings: 8 },
          { date: '2026-09-01T00:00:00.000Z', medianAskingPrice: 745000, totalListings: 24, newListings: 7 },
        ],
      },
      '/markets',
    );
  }
  async getCoverage(): Promise<ProviderResult<ProviderCoverage>> {
    return envelope(
      {
        country: 'US',
        status: 'documented-unverified',
        supportedEndpoints: ['/properties', '/listings/sale', '/avm/value', '/markets'],
        limitations: [
          'Fictional Arlington, VA example only. No national data coverage or provider connection is demonstrated.',
        ],
        documentationUrl: 'https://developers.rentcast.io/reference/introduction',
        liveConnectionVerified: false,
      },
      'coverage',
    );
  }
}
export function createFixturePropertyProvider(): PropertyDataProvider {
  return new FixturePropertyProvider();
}
