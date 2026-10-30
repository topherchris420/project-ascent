import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ROWS,
  parseMoney,
  parseSalesQuery,
  salesWindow,
  summarizeSales,
  type SalesRecord,
} from '../src/lib/market-search';

const places = {
  marylandCities: ['SILVER SPRING', 'MONTGOMERY VILLAGE', 'FORT WASHINGTON', 'BETHESDA', 'DISTRICT HEIGHTS'],
  zipsByMarket: {
    dc: new Set(['20002', '20009']),
    'dc-condos': new Set(['20009', '20001']),
    maryland: new Set(['20910', '20886']),
  },
};
const LATEST = '2026-10-07';
const parse = (text: string) => parseSalesQuery(text, places, LATEST);

test('prices need a unit or a dollar sign; bare small numbers are not guessed', () => {
  assert.equal(parseMoney('$725k'), 725_000);
  assert.equal(parseMoney('1.2m'), 1_200_000);
  assert.equal(parseMoney('650,000'), 650_000);
  assert.equal(parseMoney('$1 million'), 1_000_000);
  assert.equal(parseMoney('700'), null);
  assert.equal(parseMoney('$700'), null, 'below the $1,000 floor');
});

test('a plain question becomes explicit filters and is read back', () => {
  const parsed = parse('2 bed condos in 20009 under $700k sold in the last 6 months');
  assert.deepEqual(parsed.filters.markets, ['dc-condos']);
  assert.deepEqual(parsed.filters.zips, ['20009']);
  assert.equal(parsed.filters.maxPrice, 700_000);
  assert.equal(parsed.filters.minBeds, 2);
  assert.equal(parsed.filters.maxBeds, 2);
  assert.equal(parsed.filters.months, 6);
  assert.deepEqual(parsed.ignored, []);
  assert.ok(parsed.readBack.includes('Exactly 2 bedrooms'));
  assert.ok(parsed.readBack.includes('ZIP 20009'));
});

test('room ranges are never read as prices, and price ranges share a unit', () => {
  const rooms = parse('3 to 4 bed houses in DC');
  assert.equal(rooms.filters.minBeds, 3);
  assert.equal(rooms.filters.maxBeds, 4);
  assert.equal(rooms.filters.minPrice, null);
  assert.ok(rooms.readBack.includes('3 to 4 bedrooms'));
  const prices = parse('houses in silver spring $500-750k');
  assert.equal(prices.filters.minPrice, 500_000);
  assert.equal(prices.filters.maxPrice, 750_000);
  assert.deepEqual(prices.filters.cities, ['SILVER SPRING']);
  assert.deepEqual(prices.filters.markets, ['maryland']);
});

test('city names win over county and jurisdiction words inside them', () => {
  const village = parse('Montgomery Village');
  assert.deepEqual(village.filters.cities, ['MONTGOMERY VILLAGE']);
  assert.deepEqual(village.filters.counties, []);
  const fort = parse('fort washington houses');
  assert.deepEqual(fort.filters.cities, ['FORT WASHINGTON']);
  assert.deepEqual(fort.filters.markets, ['maryland'], '"Washington" inside a Maryland city is not DC');
});

test('what the records cannot answer is reported, not dropped', () => {
  const parsed = parse('homes for sale near metro with a finished basement and a garage in capitol hill 700k');
  const terms = parsed.ignored.map(item => item.term);
  for (const term of ['basement', 'parking', 'transit or walkability', '700k']) assert.ok(terms.includes(term), term);
  assert.ok(
    terms.some(term => term.includes('capitol')),
    'unknown words are listed',
  );
  assert.ok(parsed.notes.some(note => note.includes('not homes for sale now')));
  assert.equal(parsed.filters.maxPrice, null, 'a price without a direction is not applied');
});

test('room counts leave Maryland out and say so', () => {
  const parsed = parse('3 bedroom houses in maryland');
  assert.deepEqual(parsed.filters.markets, []);
  assert.ok(parsed.notes.some(note => note.includes('Maryland records do not include bedrooms')));
  const condo = parse('condos in bethesda');
  assert.deepEqual(condo.filters.markets, []);
  assert.ok(condo.notes.some(note => note.includes('Maryland condominiums are not in')));
});

test('windows anchor to the latest recorded sale, not today', () => {
  assert.deepEqual(salesWindow(parse('dc houses').filters, LATEST), { since: '2025-10-08', until: LATEST });
  assert.deepEqual(salesWindow(parse('dc houses in 2024').filters, LATEST), {
    since: '2024-01-01',
    until: '2024-12-31',
  });
  assert.deepEqual(salesWindow(parse('dc houses since 2025').filters, LATEST), {
    since: '2025-01-01',
    until: LATEST,
  });
  assert.equal(parse('sold in the last 90 days in 20009').filters.months, 3);
});

const sale = (overrides: Partial<SalesRecord>, index: number): SalesRecord => ({
  market: 'dc',
  saleId: `s-${index}`,
  parcelId: `p-${index}`,
  soldOn: '2026-09-01',
  price: 500_000,
  beds: 3,
  baths: 2,
  sqft: 1000,
  zip: '20002',
  address: `${index} A STREET NE`,
  city: null,
  county: null,
  ...overrides,
});

test('summaries hand-check: medians, quartiles, $/sq ft and small-group suppression', () => {
  const sales = [
    sale({ price: 400_000, sqft: 800 }, 1),
    sale({ price: 500_000, sqft: 1000 }, 2),
    sale({ price: 600_000, sqft: null }, 3),
    sale({ price: 700_000, sqft: 1400, beds: 4 }, 4),
    sale({ price: 800_000, sqft: 1600, soldOn: '2026-08-15' }, 5),
    sale({ price: 900_000, market: 'maryland', beds: null, baths: null, zip: '20910', city: 'SILVER SPRING' }, 6),
    sale({ price: 950_000, soldOn: '2024-01-01' }, 7),
  ];
  const filters = parse('dc houses').filters;
  const summary = summarizeSales(sales, filters, LATEST);
  assert.equal(summary.count, 5, 'Maryland and the out-of-window sale are excluded');
  assert.equal(summary.medianPrice, 600_000);
  assert.equal(summary.lowerQuartile, 500_000);
  assert.equal(summary.upperQuartile, 700_000);
  assert.equal(summary.withArea, 4);
  assert.equal(summary.medianPricePerSqft, null, 'four sales with an area are too few for a median');
  const fifth = summarizeSales([...sales, sale({ price: 450_000, sqft: 900 }, 8)], filters, LATEST);
  assert.equal(fifth.medianPricePerSqft, 500, 'every sale with an area sold at $500/sq ft');
  const four = summary.byBedrooms.find(group => group.key === '4')!;
  assert.equal(four.count, 1);
  assert.equal(four.medianPrice, null, 'a single sale has no median shown');
  assert.equal(summary.byMonth.map(group => group.key).join(), '2026-08,2026-09');
  assert.equal(summary.rows[0].soldOn, '2026-09-01');
  assert.equal(summarizeSales(sales, filters, LATEST, 'price-high').rows[0].price, 800_000);
  assert.equal(summarizeSales(sales, filters, LATEST, 'ppsf-low').rows.at(-1)?.sqft, null, 'no area sorts last');
});

test('the sale list is capped and the cap is reported', () => {
  const many = Array.from({ length: MAX_ROWS + 7 }, (_, i) => sale({}, i));
  const summary = summarizeSales(many, parse('dc houses').filters, LATEST);
  assert.equal(summary.count, MAX_ROWS + 7);
  assert.equal(summary.rows.length, MAX_ROWS);
  assert.equal(summary.shown, MAX_ROWS);
});

test('ZIP codes are never read as prices', () => {
  for (const query of [
    'condos in 20009 and 20001',
    '20009 to 20001 condos',
    'houses near 20910',
    'houses around 20002',
  ]) {
    const parsed = parse(query);
    assert.equal(parsed.filters.minPrice, null, query);
    assert.equal(parsed.filters.maxPrice, null, query);
    assert.ok(parsed.filters.zips.length > 0, query);
    assert.ok(!parsed.notes.some(note => /within 10%/.test(note)), query);
  }
  assert.equal(parse('houses near $700k in 20002').filters.maxPrice, 770_000, 'a price with a unit still reads as one');
});

test('ranges keep both ends and comparisons keep their direction', () => {
  for (const query of ['dc houses 1,500 to 2,000 sq ft', 'dc houses between 1500 and 2000 sq ft']) {
    const { filters } = parse(query);
    assert.deepEqual([filters.minSqft, filters.maxSqft], [1_500, 2_000], query);
  }
  for (const query of ['2-3 baths in dc', '2 to 3 baths in dc']) {
    const { filters } = parse(query);
    assert.deepEqual([filters.minBaths, filters.maxBaths], [2, 3], query);
  }
  assert.deepEqual(
    [
      parse('dc houses with more than 3 bedrooms').filters.minBeds,
      parse('dc houses with more than 3 bedrooms').filters.maxBeds,
    ],
    [4, null],
  );
  const fewer = parse('dc houses under 3 bedrooms').filters;
  assert.deepEqual([fewer.minBeds, fewer.maxBeds, fewer.maxPrice], [0, 2, null]);
  assert.deepEqual(parse('dc houses up to 2 baths').filters.maxBaths, 2);
});

test('year spans, long windows and bare years are read, never dropped', () => {
  const span = parse('dc houses in 2024 and 2025');
  assert.deepEqual([span.filters.since, span.filters.until], ['2024-01-01', '2025-12-31']);
  const range = parse('sales 2023 to 2025 in 20002');
  assert.deepEqual([range.filters.since, range.filters.until], ['2023-01-01', '2025-12-31']);
  assert.deepEqual(range.filters.zips, ['20002']);
  assert.ok(parse('dc houses in 2023 or 2025').notes.some(note => /every sale from 2023 through 2025/.test(note)));
  assert.equal(parse('last 180 days in 20002').filters.months, 6);
  const long = parse('dc houses in the last 10 years');
  assert.equal(long.filters.months, 84);
  assert.ok(long.notes.some(note => /longest window is 7 years/.test(note)));
  assert.deepEqual(parse('2024 sales in 20002').filters.since, '2024-01-01');
});

test('a number no pattern used is reported, not silently dropped', () => {
  const parsed = parse('dc houses 1500');
  assert.ok(
    parsed.ignored.some(item => item.term.includes('1500')),
    JSON.stringify(parsed.ignored),
  );
});

test('DC plus a Maryland place keeps DC sales and says the place limits Maryland only', () => {
  const parsed = parse('dc or silver spring');
  assert.deepEqual(parsed.filters.markets, ['dc', 'dc-condos', 'maryland']);
  assert.ok(parsed.readBack.includes('Maryland sales in Silver Spring'));
  assert.ok(parsed.notes.some(note => /do not name neighborhoods/.test(note)));
  const sales: SalesRecord[] = [
    sale({ market: 'dc', zip: '20002' }, 1),
    sale({ market: 'maryland', zip: '20910', city: 'SILVER SPRING', county: 'MONT', beds: null, baths: null }, 2),
    sale({ market: 'maryland', zip: '20886', city: 'MONTGOMERY VILLAGE', county: 'MONT', beds: null, baths: null }, 3),
  ];
  assert.deepEqual(
    summarizeSales(sales, parsed.filters, LATEST)
      .rows.map(row => row.saleId)
      .sort(),
    ['s-1', 's-2'],
  );
});

test('place words: "d.c.", "pg" and price adjectives are understood or reported', () => {
  assert.deepEqual(parse('homes in d.c.').filters.markets, ['dc', 'dc-condos']);
  assert.deepEqual(parse('homes in d.c.').ignored, []);
  assert.deepEqual(parse('houses in pg under $500k').filters.counties, ['PRIN']);
  assert.ok(parse('cheap houses in dc').ignored.some(item => item.term === 'cheap or expensive'));
  assert.deepEqual(parse('listed and available condos in dc').ignored, []);
});
