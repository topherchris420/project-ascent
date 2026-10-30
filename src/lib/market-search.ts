/**
 * Recorded-sales search: a plain-English question read into explicit filters over the bundled public-record sales,
 * then summarized. The parser is deterministic and reads every filter back; words it cannot search on are reported,
 * never silently dropped. These are completed sales recorded by the District and the State, not homes for sale now:
 * active listings need an MLS license Ascent does not have.
 */
export const SALES_SEARCH_VERSION = 'ascent-sales-search-1';
export const salesMarkets = ['dc', 'dc-condos', 'maryland'] as const;
export type SalesMarket = (typeof salesMarkets)[number];
export const salesMarketLabels: Record<SalesMarket, string> = {
  dc: 'DC houses',
  'dc-condos': 'DC condos',
  maryland: 'Maryland houses',
};
export type MarylandCounty = 'MONT' | 'PRIN';
export const countyLabels: Record<MarylandCounty, string> = {
  MONT: 'Montgomery County',
  PRIN: 'Prince George’s County',
};

export type SalesFilters = {
  markets: SalesMarket[];
  zips: string[];
  /** Maryland city names as recorded by the State, upper case. */
  cities: string[];
  counties: MarylandCounty[];
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  minBaths: number | null;
  maxBaths: number | null;
  minSqft: number | null;
  maxSqft: number | null;
  /** Inclusive ISO dates; null start means the default window before the latest recorded sale. */
  since: string | null;
  until: string | null;
  months: number;
};
export type ParsedSalesQuery = {
  query: string;
  filters: SalesFilters;
  /** Each applied filter in plain words, in the order a reader would check them. */
  readBack: string[];
  /** Words that name something these records cannot be searched by, with the reason. */
  ignored: { term: string; reason: string }[];
  notes: string[];
};

export const DEFAULT_MONTHS = 12;
export const MAX_MONTHS = 84;
export const MAX_QUERY_LENGTH = 200;
export const MIN_GROUP_FOR_MEDIAN = 5;
export const MAX_ZIP_GROUPS = 12;
/** Ascent's Maryland comparable-sale rules skip recorded prices under this; the search applies the same floor. */
export const MARYLAND_MIN_PRICE = 50_000;

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/** "$725k", "1.2m", "650,000", "$1 million" → dollars; null when the text carries no price unit or is too small. */
export function parseMoney(raw: string): number | null {
  const match = raw
    .toLowerCase()
    .replace(/\s+/g, '')
    .match(/^\$?(\d+(?:,\d{3})*(?:\.\d+)?)(k|m|mm|thousand|million)?$/);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  const scale = match[2] === 'k' || match[2] === 'thousand' ? 1e3 : match[2] ? 1e6 : 1;
  const value = Math.round(base * scale);
  if (!Number.isFinite(value)) return null;
  // A bare small number ("under 700") is ambiguous; ask for a unit rather than guess thousands.
  if (scale === 1 && !raw.includes('$') && value < 10_000) return null;
  if (value < 1_000 || value > 100_000_000) return null;
  return value;
}

const MONEY = String.raw`\$?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:k|m|mm|thousand|million)?\b`;
const AREA_UNIT = String.raw`(?:sq\.?\s*f(?:ee)?t|sqft|square\s+f(?:ee|oo)t|sf)\b`;

/** Things buyers ask for that recorded sales do not contain, each with the reason. */
const UNSEARCHABLE: { pattern: RegExp; term: string; reason: string; impliesHouse?: true }[] = [
  {
    pattern: /\b(?:cheap|cheapest|affordable|inexpensive|expensive|luxury|pricey)\b/,
    term: 'cheap or expensive',
    reason: 'Give a price instead, for example “under $500k” or “over $1m”.',
  },
  {
    pattern: /\b(?:finished\s+)?basements?\b/,
    term: 'basement',
    reason: 'Sale records do not say whether a home has a basement.',
  },
  {
    pattern: /\b(?:garages?|parking|driveway|carport)\b/,
    term: 'parking',
    reason: 'Sale records do not record parking or garages.',
  },
  { pattern: /\bpools?\b/, term: 'pool', reason: 'Sale records do not record pools.' },
  {
    pattern: /\b(?:yards?|gardens?|backyard|patio|deck|balcon(?:y|ies))\b/,
    term: 'outdoor space',
    reason: 'Sale records do not describe outdoor space.',
  },
  {
    pattern: /\b(?:renovated|updated|remodel(?:ed)?|new\s+kitchen|move[-\s]in\s+ready|fixer(?:[-\s]upper)?)\b/,
    term: 'condition or updates',
    reason: 'Interior condition and updates are not in these sale records.',
  },
  {
    pattern: /\b(?:schools?|school\s+district)\b/,
    term: 'schools',
    reason: 'Ascent has no school-boundary data.',
  },
  {
    pattern: /\b(?:metro|subway|train|transit|walkable|walk\s+score)\b/,
    term: 'transit or walkability',
    reason: 'Ascent has no transit or walkability data.',
  },
  { pattern: /\b(?:views?|waterfront|water\s+view)\b/, term: 'views', reason: 'Sale records do not describe views.' },
  {
    pattern: /\b(?:fireplaces?|elevators?|pets?|pet[-\s]friendly|doorman|gym|amenit(?:y|ies))\b/,
    term: 'features or amenities',
    reason: 'Sale records do not list features or building amenities.',
  },
  { pattern: /\b(?:hoa|condo\s+fees?|dues)\b/, term: 'fees', reason: 'Association fees are not in these records.' },
  {
    pattern: /\b(?:townho(?:use|me)s?|row\s*houses?|rowhomes?|detached|semi[-\s]detached|duplex)\b/,
    term: 'house style',
    reason: 'This search does not yet separate townhouses from detached houses; all covered houses are included.',
    impliesHouse: true,
  },
  {
    pattern: /\b(?:near(?!\s+\$?\d)|close\s+to|within\s+\d+(?:\.\d+)?\s*(?:mi|miles?|blocks?))\b/,
    term: 'distance from a place',
    reason: 'Search by ZIP code, Maryland city or county instead. To see sales near one address, open that home.',
  },
];
const ACTIVE_LISTING = /\b(?:for\s+sale|on\s+the\s+market|listed|listings?|active|available|open\s+houses?|asking)\b/;
const RENTAL = /\b(?:rent(?:al|als|ing)?|lease|for\s+rent)\b/;
const everywhere = (pattern: RegExp) => new RegExp(pattern.source, 'g');
/** A five-digit DC or Maryland ZIP code, unless it carries a $ or a price unit. */
const ZIP = /(?<![$\d.,])\b(2[01]\d{3})\b(?![.,]\d)(?!\s*(?:k|m|mm|thousand|million)\b)/;
const YEAR = String.raw`20[0-3]\d`;
const COMPARISON = String.raw`more than|over|above|greater than|fewer than|less than|under|below|at most|up to|no more than|at least|min(?:imum)?(?:\s+of)?|max(?:imum)?(?:\s+of)?`;
const BEDS = String.raw`(?:-\s*)?(?:bed(?:room)?s?|br|bd)\b`;
const BATHS = String.raw`(?:-\s*)?(?:bath(?:room)?s?|ba)\b`;
/** "more than 3" → above, "under 3" → below, "at most 3" → ceiling, "at least 3" → floor. */
const direction = (word: string) =>
  /more|over|above|greater/.test(word)
    ? 'above'
    : /fewer|less|under|below/.test(word)
      ? 'below'
      : /at most|up to|no more|max/.test(word)
        ? 'ceiling'
        : 'floor';

const STOPWORDS = new Set(
  'a an and any are at by every for from home homes house houses i in is it its last me of on or past recent recently show sold sales sale that the their them there these this those to under over was were what which with within year years month months week weeks day days property properties real estate find search list all ago plus than more less least most up between around about near see me my we our you your who where how much price prices priced cost costs costing sell selling sells sq ft square feet foot sqft beds bed bedroom bedrooms br bd bath baths bathroom bathrooms ba dollars below above dc d.c d.c. washington district maryland md county moco pg condo condos condominium condominiums apartment apartments unit units studio studios single family single-family'.split(
    ' ',
  ),
);

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shiftMonths = (iso: string, months: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return isoDay(date.getTime() + DAY_MS);
};

export type SalesPlaces = {
  /** Maryland cities in the snapshot, upper case as recorded. */
  marylandCities: readonly string[];
  /** ZIP codes present in each market's sales. */
  zipsByMarket: Readonly<Record<SalesMarket, ReadonlySet<string>>>;
};

/**
 * Reads a question into filters. `latestSale` anchors relative windows ("last 6 months") to the newest recorded sale
 * in the selected markets, because the snapshot is dated and today's date would silently shorten every window.
 */
export function parseSalesQuery(input: string, places: SalesPlaces, latestSale: string): ParsedSalesQuery {
  const query = input.slice(0, MAX_QUERY_LENGTH).trim();
  let text = ` ${query.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')} `;
  /** Removes each match the handler accepts; a handler returning false leaves its text for later patterns. */
  const take = (pattern: RegExp, onMatch: (groups: (string | undefined)[]) => boolean | void) => {
    text = text.replace(everywhere(pattern), (whole: string, ...rest: unknown[]) =>
      onMatch([whole, ...(rest.slice(0, -2) as (string | undefined)[])]) === false ? whole : ' ',
    );
  };
  const filters: SalesFilters = {
    markets: [],
    zips: [],
    cities: [],
    counties: [],
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    maxBeds: null,
    minBaths: null,
    maxBaths: null,
    minSqft: null,
    maxSqft: null,
    since: null,
    until: null,
    months: DEFAULT_MONTHS,
  };
  const ignored: ParsedSalesQuery['ignored'] = [];
  const notes: string[] = [];
  const unclear: string[] = [];
  const lonePrices: string[] = [];

  if (ACTIVE_LISTING.test(text))
    notes.push(
      'These are completed sales recorded by the District and the State, not homes for sale now. Current listings need an MLS license, which Ascent does not have.',
    );
  if (RENTAL.test(text))
    ignored.push({ term: 'rentals', reason: 'Ascent has recorded sales only, not rents or rental listings.' });
  text = text.replace(everywhere(ACTIVE_LISTING), ' ').replace(everywhere(RENTAL), ' ');

  let namesHouseStyle = false;
  for (const item of UNSEARCHABLE)
    if (item.pattern.test(text)) {
      ignored.push({ term: item.term, reason: item.reason });
      text = text.replace(everywhere(item.pattern), ' ');
      if (item.impliesHouse) namesHouseStyle = true;
    }

  // Area before price, so "over 1,500 sq ft" never reads as a price. Ranges first, so "1,500 to 2,000 sq ft" keeps
  // both bounds.
  const AREA = String.raw`(\d{1,2},\d{3}|\d{3,5})`;
  take(
    new RegExp(
      String.raw`\b(?:between\s+|from\s+)?${AREA}\s*(?:${AREA_UNIT}\s*)?(?:-|–|to|and)\s*${AREA}\s*\+?\s*${AREA_UNIT}`,
    ),
    ([, a = '', b = '']) => {
      const [low, high] = [Number(a.replace(/,/g, '')), Number(b.replace(/,/g, ''))].sort((x, y) => x - y);
      filters.minSqft = low;
      filters.maxSqft = high;
    },
  );
  take(
    new RegExp(
      String.raw`\b(?:(under|below|less than|up to|at most|no more than|over|above|more than|at least|bigger than|larger than|smaller than)\s+)?${AREA}\s*\+?\s*${AREA_UNIT}`,
    ),
    ([, word = 'at least', digits = '']) => {
      const value = Number(digits.replace(/,/g, ''));
      if (/under|below|less|up to|at most|no more|smaller/.test(word)) filters.maxSqft = value;
      else filters.minSqft = value;
    },
  );

  // Bedrooms and bathrooms before prices, so "3 to 4 beds" never reads as a price range.
  take(/\bstudios?\b/, () => {
    filters.minBeds = 0;
    filters.maxBeds = 0;
    if (!filters.markets.includes('dc-condos')) filters.markets.push('dc-condos');
  });
  take(new RegExp(String.raw`\b(${COMPARISON})\s+(\d)\s*${BEDS}`), ([, word = '', count = '']) => {
    const n = Number(count);
    const way = direction(word);
    if (way === 'above') [filters.minBeds, filters.maxBeds] = [n + 1, null];
    else if (way === 'floor') [filters.minBeds, filters.maxBeds] = [n, null];
    else [filters.minBeds, filters.maxBeds] = [0, Math.max(0, way === 'below' ? n - 1 : n)];
  });
  take(/\b(\d)\s*(?:-|–|to|or)\s*(\d)\s*(?:bed(?:room)?s?|br|bd)\b/, ([, low = '', high = '']) => {
    filters.minBeds = Math.min(Number(low), Number(high));
    filters.maxBeds = Math.max(Number(low), Number(high));
  });
  take(
    /\b(at least\s+|min(?:imum)?\s+)?(\d)\s*(\+|or more\s+)?\s*(?:-\s*)?(?:bed(?:room)?s?|br|bd)\b(\s+or more|\s*\+)?/,
    ([, atLeastWords, beds = '', plus, orMore]) => {
      filters.minBeds = Number(beds);
      filters.maxBeds = atLeastWords || plus || orMore ? null : Number(beds);
    },
  );
  take(new RegExp(String.raw`\b(${COMPARISON})\s+(\d(?:\.5)?)\s*${BATHS}`), ([, word = '', count = '']) => {
    const n = Number(count);
    const way = direction(word);
    // Bathrooms are recorded in halves, so "more than 2" starts at 2.5.
    if (way === 'above') filters.minBaths = n + 0.5;
    else if (way === 'floor') filters.minBaths = n;
    else filters.maxBaths = Math.max(0, way === 'below' ? n - 0.5 : n);
  });
  take(new RegExp(String.raw`\b(\d(?:\.5)?)\s*(?:-|–|to|or)\s*(\d(?:\.5)?)\s*${BATHS}`), ([, a = '', b = '']) => {
    [filters.minBaths, filters.maxBaths] = [Number(a), Number(b)].sort((x, y) => x - y);
  });
  take(/\b(?:at least\s+)?(\d(?:\.5)?)\s*\+?\s*(?:-\s*)?(?:bath(?:room)?s?|ba)\b(?:\s+or more)?/, ([, baths = '']) => {
    filters.minBaths = Number(baths);
  });

  // Years before prices and ZIP codes, so "2023 to 2024" is a date range. A list of years is read as one span.
  take(
    new RegExp(
      String.raw`\b(?:(?:sold\s+)?(?:in|during)\s+)?(?:from\s+|between\s+)?(${YEAR})\s*(-|–|to|through|thru|until|and|or|&|,)\s*(${YEAR})\b`,
    ),
    ([whole = '', a = '', joiner = '', b = '']) => {
      const [low, high] = [Number(a), Number(b)].sort((x, y) => x - y);
      filters.since = `${low}-01-01`;
      filters.until = `${high}-12-31`;
      if (high - low > 1 && /and|or|&|,/.test(joiner))
        notes.push(`“${whole.trim()}” is read as every sale from ${low} through ${high}.`);
    },
  );

  // ZIP codes before prices, so "near 20814" or "20009 and 20001" is never read as a price.
  take(ZIP, ([, zip = '']) => {
    if (!filters.zips.includes(zip)) filters.zips.push(zip);
  });

  // Prices: ranges first, then bounds, then "around". A range needs a unit or $ on at least one side.
  take(
    new RegExp(String.raw`\b(?:between\s+)?(${MONEY})\s*(?:-|–|to|and)\s*(${MONEY})`),
    ([whole = '', a = '', b = '']) => {
      let low = parseMoney(a);
      let high = parseMoney(b);
      // "$500-700k": the unit on the upper bound applies to both.
      if (high !== null && low === null) {
        const unit = b.trim().match(/(k|mm|m|thousand|million)$/i)?.[1];
        low = unit ? parseMoney(`${a.trim()}${unit}`) : null;
      }
      if (low === null || high === null) {
        if (!/[$km]|thousand|million/i.test(whole)) return false;
        unclear.push(whole.trim());
        return;
      }
      if (low > high) [low, high] = [high, low];
      filters.minPrice = low;
      filters.maxPrice = high;
    },
  );
  take(
    new RegExp(
      String.raw`\b(under|below|less than|up to|at most|no more than|max(?:imum)?|cheaper than|over|above|more than|at least|min(?:imum)?|starting at)\s+(${MONEY})`,
    ),
    ([whole = '', word = '', amount = '']) => {
      const value = parseMoney(amount);
      if (value === null) {
        unclear.push(whole.trim());
        return;
      }
      if (/under|below|less|up to|at most|no more|max|cheaper/.test(word)) filters.maxPrice = value;
      else filters.minPrice = value;
    },
  );
  take(
    new RegExp(String.raw`\b(?:around|about|roughly|approximately|near)\s+(${MONEY})`),
    ([whole = '', amount = '']) => {
      const value = parseMoney(amount);
      if (value === null) {
        unclear.push(whole.trim());
        return;
      }
      filters.minPrice = Math.round(value * 0.9);
      filters.maxPrice = Math.round(value * 1.1);
      notes.push(`“${whole.trim()}” is read as within 10% of ${usd(value)}.`);
    },
  );
  // A price with no direction ("700k") could be a floor, a ceiling or a target; ask instead of guessing.
  take(
    /(?:\$\d[\d,]*(?:\.\d+)?\s*(?:k|mm|m|thousand|million)?|\b\d[\d,]*(?:\.\d+)?\s*(?:k|mm|m|thousand|million))\b/,
    ([whole = '']) => {
      lonePrices.push(whole.trim());
    },
  );

  // Time windows.
  take(
    /\b(?:in the\s+)?(?:last|past|previous)\s+(\d{1,3})?\s*(day|week|month|year)s?\b/,
    ([, count = '1', unit = '']) => {
      const n = Number(count);
      const months = unit === 'year' ? n * 12 : unit === 'month' ? n : unit === 'week' ? n / 4.345 : n / 30.4;
      filters.months = Math.max(1, Math.min(MAX_MONTHS, Math.round(months)));
      if (months < 1) notes.push('The shortest window is one month; recent sales can take weeks to be recorded.');
      if (months > MAX_MONTHS)
        notes.push(`The longest window is ${MAX_MONTHS / 12} years; use “since” a year to go further back.`);
    },
  );
  take(/\bsince\s+(20\d\d)\b/, ([, year = '']) => {
    filters.since = `${year}-01-01`;
    filters.until = null;
  });
  take(/\b(?:in|during)\s+(20\d\d)\b/, ([, year = '']) => {
    filters.since = `${year}-01-01`;
    filters.until = `${year}-12-31`;
  });
  take(/\bthis year\b/, () => {
    filters.since = `${latestSale.slice(0, 4)}-01-01`;
    filters.until = null;
  });
  // A year on its own ("2024 sales in 20011") is that calendar year.
  take(new RegExp(String.raw`(?<![$\d.,])\b(${YEAR})\b(?!\s*(?:k|m|mm|thousand|million)\b)`), ([, year = '']) => {
    // A second year cannot be applied; leaving it in the text reports it as not recognized.
    if (filters.since !== null) return false;
    filters.since = `${year}-01-01`;
    filters.until = `${year}-12-31`;
  });

  // Place: Maryland cities (longest first, so "Montgomery Village" and "Fort Washington" are not read as a county or
  // as DC), then counties, then jurisdictions. ZIP codes were read before prices.
  const cities = [...places.marylandCities].sort((a, b) => b.length - a.length);
  for (const city of cities) {
    const pattern = new RegExp(String.raw`\b${city.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`);
    if (pattern.test(text)) {
      filters.cities.push(city);
      text = text.replace(new RegExp(pattern.source, 'g'), ' ');
    }
  }
  take(/\b(?:montgomery(?:\s+county)?|moco)\b/, () => {
    if (!filters.counties.includes('MONT')) filters.counties.push('MONT');
  });
  take(/\b(?:prince\s+george'?s?(?:\s+county)?|pg(?:\s+county)?|pgc)\b/, () => {
    if (!filters.counties.includes('PRIN')) filters.counties.push('PRIN');
  });
  const saysDc = /\b(?:dc\b|d\.c\.?(?![a-z])|washington\b|district(?: of columbia)?\b)/.test(text);
  const saysMaryland = /\b(?:maryland|md)\b/.test(text);
  const saysCondo = /\b(?:condo(?:minium)?s?|apartments?|units?|flats?)\b/.test(text);
  const saysHouse = namesHouseStyle || /\b(?:houses?|single[-\s]family|sfh)\b/.test(text);

  // Which records to read.
  const zipMarkets = new Set<SalesMarket>();
  for (const zip of filters.zips)
    for (const market of salesMarkets) if (places.zipsByMarket[market].has(zip)) zipMarkets.add(market);
  const inMaryland = saysMaryland || filters.counties.length > 0 || filters.cities.length > 0;
  const inDc = saysDc;
  let markets: SalesMarket[] = [...salesMarkets];
  if (inDc && !inMaryland) markets = ['dc', 'dc-condos'];
  if (inMaryland && !inDc) markets = ['maryland'];
  if (filters.zips.length) markets = markets.filter(market => zipMarkets.has(market));
  if (saysCondo && !saysHouse) {
    if (markets.includes('maryland') && !markets.includes('dc-condos'))
      notes.push('Maryland condominiums are not in Ascent’s records; only DC condos can be searched.');
    markets = markets.filter(market => market === 'dc-condos');
  } else if (saysHouse && !saysCondo) markets = markets.filter(market => market !== 'dc-condos');
  if (filters.markets.includes('dc-condos') && markets.includes('dc-condos')) markets = ['dc-condos'];
  filters.markets = markets;
  if (filters.zips.length && !zipMarkets.size)
    notes.push(`No recorded sales in Ascent’s DC or Maryland snapshots carry ZIP ${filters.zips.join(', ')}.`);
  if (inDc && (filters.cities.length || filters.counties.length))
    notes.push(
      'DC sale records do not name neighborhoods, so the Maryland places apply to Maryland sales only. To narrow DC sales, add a ZIP code.',
    );

  const asksRooms = [filters.minBeds, filters.maxBeds, filters.minBaths, filters.maxBaths].some(
    value => value !== null,
  );
  if (asksRooms && filters.markets.includes('maryland'))
    notes.push('Maryland records do not include bedrooms or bathrooms, so Maryland is left out when you ask for them.');
  if (asksRooms) filters.markets = filters.markets.filter(market => market !== 'maryland');

  // Whatever is left and meaningful was not understood; say so rather than drop it. Numbers too: a number that no
  // pattern used is part of the question that was not searched.
  const leftovers = text
    .replace(/[^a-z0-9$.,'\s-]/g, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^[.,'-]+|[.,'-]+$/g, ''))
    .filter(word => word && !STOPWORDS.has(word) && (word.length > 1 || /\d/.test(word)));
  if (unclear.length)
    ignored.push({
      term: unclear.join(', '),
      reason: 'Add a unit to a price, for example $700k or $1.2m.',
    });
  if (lonePrices.length)
    ignored.push({
      term: lonePrices.join(', '),
      reason: 'Say under, over, between or around with a price, for example “under $700k”.',
    });
  if (leftovers.length)
    ignored.push({
      term: [...new Set(leftovers)].slice(0, 8).join(', '),
      reason:
        'Not recognized as a place, price, size or date in these records. DC neighborhoods are not named in the records; use a ZIP code.',
    });

  if (filters.since === null) filters.until = null;
  return { query, filters, readBack: describeFilters(filters, latestSale), ignored, notes };
}

export function salesWindow(filters: SalesFilters, latestSale: string) {
  if (filters.since) return { since: filters.since, until: filters.until ?? latestSale };
  return { since: shiftMonths(latestSale, filters.months), until: latestSale };
}

/** Each applied filter in plain words. */
export function describeFilters(filters: SalesFilters, latestSale: string) {
  const lines: string[] = [];
  lines.push(
    filters.markets.length
      ? `Recorded sales of ${filters.markets.map(market => salesMarketLabels[market]).join(', ')}`
      : 'No covered records match these words',
  );
  if (filters.zips.length) lines.push(`ZIP ${filters.zips.join(' or ')}`);
  // With DC also searched, say that a Maryland place limits only the Maryland sales.
  const where = filters.markets.some(market => market !== 'maryland') ? 'Maryland sales in' : 'In';
  if (filters.cities.length)
    lines.push(
      `${where} ${filters.cities.map(city => city.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(' or ')}`,
    );
  if (filters.counties.length)
    lines.push(`${where} ${filters.counties.map(county => countyLabels[county]).join(' or ')}`);
  if (filters.minPrice !== null && filters.maxPrice !== null)
    lines.push(`Sold for ${usd(filters.minPrice)} to ${usd(filters.maxPrice)}`);
  else if (filters.maxPrice !== null) lines.push(`Sold for ${usd(filters.maxPrice)} or less`);
  else if (filters.minPrice !== null) lines.push(`Sold for ${usd(filters.minPrice)} or more`);
  if (filters.minBeds === 0 && filters.maxBeds === 0) lines.push('Studios (no bedroom)');
  else if (filters.minBeds !== null)
    lines.push(
      filters.maxBeds === filters.minBeds
        ? `Exactly ${filters.minBeds} bedroom${filters.minBeds === 1 ? '' : 's'}`
        : filters.maxBeds !== null
          ? `${filters.minBeds} to ${filters.maxBeds} bedrooms`
          : `${filters.minBeds}+ bedrooms`,
    );
  if (filters.minBaths !== null && filters.maxBaths !== null)
    lines.push(
      filters.minBaths === filters.maxBaths
        ? `Exactly ${filters.minBaths} bathroom${filters.minBaths === 1 ? '' : 's'}`
        : `${filters.minBaths} to ${filters.maxBaths} bathrooms`,
    );
  else if (filters.minBaths !== null) lines.push(`${filters.minBaths}+ bathrooms`);
  else if (filters.maxBaths !== null) lines.push(`At most ${filters.maxBaths} bathrooms`);
  if (filters.minSqft !== null && filters.maxSqft !== null)
    lines.push(
      `${filters.minSqft.toLocaleString('en-US')}–${filters.maxSqft.toLocaleString('en-US')} sq ft of recorded living area`,
    );
  else if (filters.minSqft !== null)
    lines.push(`At least ${filters.minSqft.toLocaleString('en-US')} sq ft of recorded living area`);
  else if (filters.maxSqft !== null)
    lines.push(`At most ${filters.maxSqft.toLocaleString('en-US')} sq ft of recorded living area`);
  const window = salesWindow(filters, latestSale);
  lines.push(
    filters.since
      ? `Sold ${longDay(window.since)} – ${longDay(window.until)}`
      : `Sold in the ${filters.months === 12 ? '12 months' : filters.months === 1 ? 'month' : `${filters.months} months`} up to the latest recorded sale (${longDay(latestSale)})`,
  );
  return lines;
}

export const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export type SalesRecord = {
  market: SalesMarket;
  saleId: string;
  parcelId: string;
  soldOn: string;
  price: number;
  /** null where the market's records carry no room counts (Maryland). */
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  zip: string;
  address: string | null;
  city: string | null;
  county: MarylandCounty | null;
};

export function matchesSale(sale: SalesRecord, filters: SalesFilters, window: { since: string; until: string }) {
  if (!filters.markets.includes(sale.market)) return false;
  if (sale.soldOn < window.since || sale.soldOn > window.until) return false;
  if (filters.zips.length && !filters.zips.includes(sale.zip)) return false;
  // Maryland places limit Maryland sales only. DC markets are in the filter only when the question named DC or a DC
  // ZIP, so a DC sale is never dropped for not being in a Maryland city.
  if (sale.market === 'maryland') {
    if (filters.cities.length && !(sale.city && filters.cities.includes(sale.city))) return false;
    if (filters.counties.length && !(sale.county && filters.counties.includes(sale.county))) return false;
  }
  if (filters.minPrice !== null && sale.price < filters.minPrice) return false;
  if (filters.maxPrice !== null && sale.price > filters.maxPrice) return false;
  if (filters.minBeds !== null && (sale.beds === null || sale.beds < filters.minBeds)) return false;
  if (filters.maxBeds !== null && (sale.beds === null || sale.beds > filters.maxBeds)) return false;
  if (filters.minBaths !== null && (sale.baths === null || sale.baths < filters.minBaths)) return false;
  if (filters.maxBaths !== null && (sale.baths === null || sale.baths > filters.maxBaths)) return false;
  if (filters.minSqft !== null && (sale.sqft === null || sale.sqft < filters.minSqft)) return false;
  if (filters.maxSqft !== null && (sale.sqft === null || sale.sqft > filters.maxSqft)) return false;
  return true;
}

/** A typed array sorts numbers natively, several times faster than a comparator over a hundred thousand sales. */
const sortedNumbers = (values: readonly number[]) => Float64Array.from(values).sort();
function sortedMedian(sorted: ArrayLike<number>) {
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export const median = (values: readonly number[]) => sortedMedian(sortedNumbers(values));
/** Nearest-rank percentile on sorted values. */
function percentile(sorted: ArrayLike<number>, p: number) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export type SalesGroup = { key: string; label: string; count: number; medianPrice: number | null };
export const PRICE_BANDS = [
  { max: 300_000, label: 'Under $300k' },
  { max: 500_000, label: '$300k–$500k' },
  { max: 750_000, label: '$500k–$750k' },
  { max: 1_000_000, label: '$750k–$1M' },
  { max: 1_500_000, label: '$1M–$1.5M' },
  { max: Infinity, label: '$1.5M and up' },
] as const;
export const sortOrders = ['newest', 'price-high', 'price-low', 'ppsf-high', 'ppsf-low'] as const;
export type SortOrder = (typeof sortOrders)[number];

export type SalesSummary = {
  version: typeof SALES_SEARCH_VERSION;
  window: { since: string; until: string };
  count: number;
  medianPrice: number | null;
  lowerQuartile: number | null;
  upperQuartile: number | null;
  medianPricePerSqft: number | null;
  /** Sales with a recorded living area, the denominator of the $/sq ft median. */
  withArea: number;
  medianSqft: number | null;
  byMarket: SalesGroup[];
  byPriceBand: SalesGroup[];
  byBedrooms: SalesGroup[];
  byMonth: SalesGroup[];
  byZip: SalesGroup[];
  rows: SalesRecord[];
  shown: number;
};
export const MAX_ROWS = 50;

function grouped(sales: SalesRecord[], keyOf: (sale: SalesRecord) => string | null, labelOf: (key: string) => string) {
  const groups = new Map<string, number[]>();
  for (const sale of sales) {
    const key = keyOf(sale);
    if (key === null) continue;
    const prices = groups.get(key) ?? [];
    prices.push(sale.price);
    groups.set(key, prices);
  }
  return [...groups].map(([key, prices]) => ({
    key,
    label: labelOf(key),
    count: prices.length,
    // A median of a handful of sales reads as a market fact it is not; show the count only.
    medianPrice: prices.length >= MIN_GROUP_FOR_MEDIAN ? median(prices) : null,
  }));
}

const pricePerSqft = (sale: SalesRecord) => (sale.sqft && sale.sqft > 0 ? sale.price / sale.sqft : null);

export function summarizeSales(
  all: readonly SalesRecord[],
  filters: SalesFilters,
  latestSale: string,
  sort: SortOrder = 'newest',
): SalesSummary {
  const window = salesWindow(filters, latestSale);
  const sales = all.filter(sale => matchesSale(sale, filters, window));
  const prices = sortedNumbers(sales.map(sale => sale.price));
  const perSqft = sales.map(pricePerSqft).filter((value): value is number => value !== null);
  const areas = sales.map(sale => sale.sqft).filter((value): value is number => value !== null && value > 0);
  // The same small-sample rule as the groups: too few sales show a count, not a median.
  const enough = prices.length >= MIN_GROUP_FOR_MEDIAN,
    enoughArea = perSqft.length >= MIN_GROUP_FOR_MEDIAN;
  const ordered = [...sales].sort((a, b) => {
    switch (sort) {
      case 'price-high':
        return b.price - a.price;
      case 'price-low':
        return a.price - b.price;
      case 'ppsf-high':
        return (pricePerSqft(b) ?? -1) - (pricePerSqft(a) ?? -1);
      case 'ppsf-low':
        return (pricePerSqft(a) ?? Infinity) - (pricePerSqft(b) ?? Infinity);
      default:
        return b.soldOn < a.soldOn ? -1 : b.soldOn > a.soldOn ? 1 : a.saleId < b.saleId ? -1 : 1;
    }
  });
  const bandOf = (price: number) => PRICE_BANDS.findIndex(band => price < band.max);
  const monthLabel = (key: string) =>
    new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return {
    version: SALES_SEARCH_VERSION,
    window,
    count: sales.length,
    medianPrice: enough ? sortedMedian(prices) : null,
    lowerQuartile: enough ? percentile(prices, 25) : null,
    upperQuartile: enough ? percentile(prices, 75) : null,
    medianPricePerSqft: enoughArea ? median(perSqft) : null,
    withArea: perSqft.length,
    medianSqft: enoughArea ? median(areas) : null,
    byMarket: grouped(
      sales,
      sale => sale.market,
      key => salesMarketLabels[key as SalesMarket],
    ),
    byPriceBand: grouped(
      sales,
      sale => String(bandOf(sale.price)),
      key => PRICE_BANDS[Number(key)].label,
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    byBedrooms: grouped(
      sales,
      sale => (sale.beds === null ? null : String(Math.min(sale.beds, 5))),
      key =>
        key === '0' ? 'No bedroom (studio)' : key === '5' ? '5 or more' : `${key} bedroom${key === '1' ? '' : 's'}`,
    ).sort((a, b) => Number(a.key) - Number(b.key)),
    byMonth: grouped(sales, sale => sale.soldOn.slice(0, 7), monthLabel).sort((a, b) => (a.key < b.key ? -1 : 1)),
    byZip: grouped(
      sales,
      sale => sale.zip || null,
      key => key,
    )
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
      .slice(0, MAX_ZIP_GROUPS),
    rows: ordered.slice(0, MAX_ROWS),
    shown: Math.min(MAX_ROWS, ordered.length),
  };
}

export const SALES_SEARCH_BOUNDARIES = [
  'Completed, government-recorded sales only: not homes for sale now, rents, or sales that have not been recorded yet.',
  'Sale prices are as recorded. Seller credits, concessions and personal property are not shown in these records.',
  `Medians of fewer than ${MIN_GROUP_FOR_MEDIAN} sales are not shown; a count that small does not describe a market.`,
  'Maryland records carry no bedroom or bathroom counts; Maryland condos are not covered.',
  `Maryland sales recorded under ${usd(MARYLAND_MIN_PRICE)} are left out, the same floor Ascent uses when it picks Maryland comparable sales.`,
  'A summary of past sales is not an estimate of any home’s value. Open a home to see its comparable-sale analysis.',
] as const;
