import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csvRecords,
  dcData,
  normalizeDcAddress,
  parseCsv,
  searchDcAddresses,
} from '../src/lib/providers/dc-public-records';
import { condoData, searchCondoAddresses } from '../src/lib/providers/dc-condo-public-records';
import { marylandData, searchMarylandAddresses } from '../src/lib/providers/maryland-public-records';
import { AddressIndex, firstByOrder } from '../src/lib/providers/address-index';

// The implementations these replaced, kept verbatim as the reference for exact equivalence.
const SUFFIXES: Record<string, string> = {
  ST: 'STREET',
  AVE: 'AVENUE',
  AV: 'AVENUE',
  RD: 'ROAD',
  PL: 'PLACE',
  CT: 'COURT',
  TER: 'TERRACE',
  TERR: 'TERRACE',
  DR: 'DRIVE',
  BLVD: 'BOULEVARD',
  LN: 'LANE',
  CIR: 'CIRCLE',
  PKWY: 'PARKWAY',
  SQ: 'SQUARE',
  HWY: 'HIGHWAY',
  ALY: 'ALLEY',
  CRES: 'CRESCENT',
  WY: 'WAY',
};
const referenceNormalize = (value: string) =>
  value
    .toUpperCase()
    .replace(/,?\s*(WASHINGTON)?,?\s*(DC|D\.C\.)?\s*(\d{5})?\s*$/, '')
    .replace(/[.,#]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => SUFFIXES[token] ?? token)
    .join(' ');
function referenceParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(cells => cells.length > 1 || cells[0]);
}
type Entry = { key: string; parcelId: string };
const referenceMatches = (entries: readonly Entry[], terms: string[]) =>
  entries.filter(entry => {
    const words = entry.key.split(' ');
    return terms.every((term, i) =>
      i === terms.length - 1 ? words.some(word => word.startsWith(term)) : words.includes(term),
    );
  });

/** Deterministic pseudo-random strings mixing address words, punctuation, locality tails and Unicode spaces. */
function* edgeCases(count: number) {
  const pieces = [
    '313',
    'shepherd',
    'St',
    'NW',
    'n.w.',
    'Washington',
    'WASHINGTON',
    'DC',
    'D.C.',
    'dc',
    '20011',
    '2001',
    ',',
    '.',
    '#',
    '#4',
    ' ',
    '  ',
    '\t',
    '\n',
    ' ',
    ' ',
    '　',
    '﻿',
    '\u0085',
    'Ave',
    'av',
    'TERR',
    'é',
    'ß',
    'Wy',
    'Unit',
    'Apt',
    '1/2',
    '-',
    'ASH',
    'TOWN',
    'CODA',
    '😀',
    'MD',
    'Takoma Park',
  ];
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  yield '';
  yield 'WASHINGTON DC 20016';
  yield ', dc';
  for (let n = 0; n < count; n++) {
    let value = '';
    for (let k = next() % 9; k >= 0; k--) value += pieces[next() % pieces.length] + (next() % 3 ? ' ' : '');
    yield value;
  }
}

test('address normalization is unchanged for every bundled address and adversarial input', () => {
  const inputs = new Set<string>(edgeCases(5000));
  for (const parcel of dcData().parcels.values()) [parcel.address, ...parcel.aliases].forEach(a => inputs.add(a));
  for (const condo of condoData().parcels.values()) inputs.add(condo.address);
  for (const p of marylandData().parcels.values())
    inputs.add(`${p.address} ${p.city} ${p.zip}`.replace(/\bMARYLAND\b|\bMD\b/gi, ''));
  assert.ok(inputs.size > 600000);
  const differences = [...inputs].filter(value => normalizeDcAddress(value) !== referenceNormalize(value));
  assert.deepEqual(differences, []);
});

test('the quote-free CSV fast path returns the same rows as the character parser', () => {
  const samples = ['', '\n', 'a', 'a,b', 'a,b\n', 'a,b\r\nc,d\r\n', 'a\rb\r\n\nc', ',\n,,\n', 'h1,h2\nx\n\ny,\n'];
  for (const text of samples) assert.deepEqual(parseCsv(text), referenceParse(text), JSON.stringify(text));
  const quoted = 'a,"b,c"\n"d ""e""",f\r\n"multi\nline",g';
  assert.deepEqual(parseCsv(quoted), referenceParse(quoted));
  assert.deepEqual(csvRecords('id,name\n1,Ann\n2\n'), [
    { id: '1', name: 'Ann' },
    { id: '2', name: '' },
  ]);
});

test('the word index returns exactly the entries the original scan matched, in index order', () => {
  const entries: Entry[] = [
    { key: '313 SHEPHERD STREET NW', parcelId: 'a' },
    { key: '313 SHEPHERD STREET NW', parcelId: 'b' },
    { key: '3130 SHERIDAN STREET NW', parcelId: 'c' },
    { key: '1 1 ST NE', parcelId: 'd' },
    { key: '', parcelId: 'e' },
  ];
  const index = new AddressIndex(entries);
  for (const terms of [
    ['313'],
    ['313', 'SHE'],
    ['SHEPHERD', 'STREET', 'N'],
    ['1', '1'],
    ['1'],
    ['31'],
    ['ZZ'],
    ['313', 'ZZ'],
  ])
    assert.deepEqual(
      index.matches(terms).map(i => entries[i]),
      referenceMatches(entries, terms),
      terms.join(' '),
    );
  const people = [5, 3, 5, 1, 3, 9].map((score, order) => ({ score, order }));
  const stable = [...people].sort((a, b) => a.score - b.score);
  for (const limit of [0, 1, 2, 4, 6, 10])
    assert.deepEqual(
      firstByOrder(people, limit, (a, b) => a.score - b.score),
      stable.slice(0, Math.max(0, limit)),
    );
});

test('DC, condo and Maryland searches return the original results for real queries', () => {
  const reference = (entries: readonly Entry[], wanted: string, rank: (entry: Entry, terms: string[]) => number) => {
    if (wanted.length < 3) return [];
    const terms = wanted.split(' ');
    const seen = new Set<string>();
    const kept = referenceMatches(entries, terms).filter(
      entry => !seen.has(entry.parcelId) && seen.add(entry.parcelId),
    );
    return kept
      .map(entry => ({ entry, score: rank(entry, terms) }))
      .sort((a, b) => a.score - b.score || a.entry.key.localeCompare(b.entry.key, 'en', { numeric: true }))
      .slice(0, 8)
      .map(item => item.entry.parcelId);
  };
  const queries = [
    '313 Shepherd',
    '3400 Macomb St NW',
    '2123 California',
    'connecticut',
    '1 st',
    '100',
    'MAPLE',
    '7300 Maple',
    '6100 Perry',
    'takoma park 20912',
    'oak',
    'georgia ave',
    'Washington DC 20016',
    '12 street',
    'zz',
  ];
  const dc = dcData().index().entries,
    condos = condoData().index().entries,
    md = marylandData().index().entries;
  const startsFirst = (wanted: string) => (entry: Entry) => Number(!entry.key.startsWith(wanted));
  const mdNormalize = (q: string) => normalizeDcAddress(q.replace(/\bMARYLAND\b|\bMD\b/gi, ''));
  for (const query of queries) {
    const wanted = normalizeDcAddress(query);
    assert.deepEqual(
      searchDcAddresses(query).map(r => r.parcelId),
      reference(dc, wanted, (entry, terms) =>
        entry.key.startsWith(wanted) ? 0 : entry.key.split(' ')[0] === terms[0] ? 1 : 2,
      ),
      `DC ${query}`,
    );
    assert.deepEqual(
      searchCondoAddresses(query).map(r => r.parcelId),
      reference(condos, wanted, startsFirst(wanted)),
      `condos ${query}`,
    );
    const mdWanted = mdNormalize(query);
    assert.deepEqual(
      searchMarylandAddresses(query).map(r => r.parcelId),
      reference(md, mdWanted, startsFirst(mdWanted)),
      `Maryland ${query}`,
    );
  }
});
