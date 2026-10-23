import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFieldsAllowed,
  assertSourceUse,
  ASCENT_POLICY,
  PUBLIC_SOURCES,
  publicSource,
  sourceCoverage,
  SourcePermissionError,
} from '../src/lib/sources/registry';
import {
  cachedIngest,
  clearIngestionCache,
  ingest,
  manifestContentKey,
  reconcile,
  resetIngestionState,
  type Fetcher,
} from '../src/lib/sources/ingest';
import {
  dcPermitsAdapter,
  dcSalesAdapter,
  dcTaxExtractAdapter,
  disabledAdapter,
  femaFloodAdapter,
  fhfaIndexAdapter,
  mdSdatAdapter,
  montgomeryAddressKey,
  montgomeryPermitsAdapter,
} from '../src/lib/sources/adapters';
import { isoDay, observation } from '../src/lib/sources/observations';
import { coveredHome } from '../src/lib/sources/property-check';
import { buildEvidenceTimeline } from '../src/lib/evidence-timeline';
import { dcValuationInputs } from '../src/lib/providers/dc-public-records';
import { marylandData, marylandValuationInputs } from '../src/lib/providers/maryland-public-records';
import type { StudioEvidence } from '../src/lib/demo-studio';

const NOW = new Date('2026-10-22T12:00:00Z');
type Reply = { status?: number; body?: unknown; throws?: string };
/** A scripted fetcher: each call takes the next reply, and every URL is recorded. */
function scripted(replies: Reply[]) {
  const urls: string[] = [];
  const fetcher: Fetcher = async url => {
    urls.push(url);
    const reply = replies.shift() ?? { status: 500 };
    if (reply.throws) throw new Error(reply.throws);
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {})),
    };
  };
  return { fetcher, urls };
}
const context = (fetcher: Fetcher) => ({ fetcher, now: () => NOW, sleep: async () => {} });
const features = (rows: Record<string, unknown>[]) => ({ features: rows.map(attributes => ({ attributes })) });
const saleRow = (overrides: Record<string, unknown> = {}) => ({
  SSL: '0800    0842',
  SALE_DATE: 1628827200000,
  SALE_PRICE: 1233082,
  QUALIFIED: 'Q',
  SALE_CODE: '01',
  GIS_LAST_MOD_DTTM: 1792660572000,
  ...overrides,
});
test.beforeEach(() => {
  resetIngestionState();
  clearIngestionCache();
});

test('every source has dated license evidence, and disabled sources name the permission they need', () => {
  assert.ok(PUBLIC_SOURCES.length >= 10);
  assert.equal(new Set(PUBLIC_SOURCES.map(source => source.id)).size, PUBLIC_SOURCES.length);
  for (const source of PUBLIC_SOURCES) {
    assert.match(source.license.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.license.evidence.length > 20, source.id);
    if (source.status === 'disabled') {
      assert.ok(source.requiredPermission && source.disabledReason, source.id);
      assert.ok(
        Object.values(source.uses).every(allowed => !allowed),
        `${source.id} grants no use while disabled`,
      );
      assert.equal(source.access.endpoint, null);
    } else assert.ok(source.attribution, source.id);
  }
  // Phase C stays disabled until written permission is recorded; Prince George's permits until a license is stated.
  for (const id of [
    'fairfax-county-records',
    'arlington-county-records',
    'loudoun-county-records',
    'prince-georges-permits',
  ])
    assert.equal(publicSource(id).status, 'disabled');
  assert.equal(sourceCoverage().find(item => item.id === 'prince-georges-permits')?.permitted.length, 0);
});

test('permissions fail closed: disabled sources, unpermitted uses and refreshed records in valuation all throw', () => {
  assert.throws(() => assertSourceUse('fairfax-county-records', 'display'), SourcePermissionError);
  assert.throws(() => assertSourceUse('no-such-source', 'display'), /no permission record/);
  assert.doesNotThrow(() => assertSourceUse('dc-property-sales', 'monitoring'));
  // A license that permits valuation does not override Ascent's rule for records refreshed after a validated snapshot.
  assert.equal(ASCENT_POLICY.refreshedRecordsInValuation, false);
  assert.throws(() => assertSourceUse('dc-property-sales', 'valuation'), /never added to an estimate/);
  // Owner names and other personal fields are outside every allowlist.
  assert.throws(
    () => assertFieldsAllowed(publicSource('dc-property-sales'), ['SSL', 'SALE_CURR_OWNER']),
    /SALE_CURR_OWNER/,
  );
  assert.throws(() => assertFieldsAllowed(publicSource('dc-tax-extract'), ['OWNERNAME']), /OWNERNAME/);
  for (const source of PUBLIC_SOURCES)
    assert.deepEqual(
      source.fields.requested.filter(field => source.fields.neverRequested.includes(field)),
      [],
      source.id,
    );
});

test('a disabled source sends no request and returns a disabled manifest with its required permission', async () => {
  const { fetcher, urls } = scripted([]);
  const { manifest, observations } = await ingest(
    disabledAdapter('prince-georges-permits'),
    { parcelId: '1' },
    context(fetcher),
  );
  assert.equal(manifest.status, 'disabled');
  assert.equal(urls.length, 0);
  assert.equal(observations.length, 0);
  assert.match(manifest.permission!.required!, /open license/);
});

test('adapters request only allowlisted fields, from validated identifiers', async () => {
  const { fetcher, urls } = scripted([{ body: features([saleRow()]) }]);
  await ingest(dcSalesAdapter, { parcelId: '0800____0842' }, context(fetcher));
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get('where'), "SSL='0800    0842'");
  assert.equal(url.searchParams.get('outFields'), 'SSL,SALE_DATE,SALE_PRICE,QUALIFIED,SALE_CODE,GIS_LAST_MOD_DTTM');
  assert.doesNotMatch(urls[0], /OWNER/i);
  // An identifier that could change the query is rejected before any request.
  const bad = await ingest(dcSalesAdapter, { parcelId: "0271' OR '1'='1" }, context(scripted([]).fetcher));
  assert.equal(bad.manifest.status, 'failed');
  assert.match(bad.manifest.errors[0], /Invalid District parcel/);
  const md = await ingest(mdSdatAdapter, { parcelId: '1; DROP' }, context(scripted([{ body: {} }]).fetcher));
  assert.equal(md.manifest.status, 'failed');
});

test('transaction, recording, publication and observation dates stay separate, and blanks stay unknown', async () => {
  const { fetcher } = scripted([
    {
      body: features([
        {
          SSL: '0800    0842',
          ASSESSMENT: 1196870,
          NEWTOTAL: 1190650,
          OLDTOTAL: null,
          ANNUALTAX: 9391.82,
          TAXRATE: 0.85,
          CLASSTYPE: '1B',
          SALEPRICE: 1233082,
          SALEDATE: 1628827200000,
          DEEDDATE: 1629000000000,
          EXTRACTDAT: 1789358400000,
        },
      ]),
    },
  ]);
  const { observations } = await ingest(dcTaxExtractAdapter, { parcelId: '0800____0842' }, context(fetcher));
  const transfer = observations.find(item => item.kind === 'recorded-transfer')!;
  assert.deepEqual(
    { ...transfer.dates },
    {
      transaction: '2021-08-13',
      recorded: '2021-08-15',
      effective: null,
      published: '2026-09-14T04:00:00.000Z',
      observed: NOW.toISOString(),
    },
  );
  const assessment = observations.find(item => item.kind === 'assessment')!;
  assert.equal(assessment.values.priorYearTotal, null, 'a blank cell is unknown, never zero');
  assert.equal(assessment.values.currentTotal, 1196870);
});

test('a republished row keeps its fingerprint; a corrected price changes it', () => {
  const base = {
    sourceId: 'dc-property-sales',
    kind: 'recorded-transfer' as const,
    parcelId: 'p',
    identity: 'p:2026-01-01',
    values: { price: 100 },
    dates: {
      transaction: '2026-01-01',
      recorded: null,
      effective: null,
      published: '2026-10-01T00:00:00Z',
      observed: 'a',
    },
  };
  const republished = observation({
    ...base,
    dates: { ...base.dates, published: '2026-10-22T00:00:00Z', observed: 'b' },
  });
  assert.equal(observation(base).fingerprint, republished.fingerprint);
  assert.notEqual(observation(base).fingerprint, observation({ ...base, values: { price: 101 } }).fingerprint);
});

test('exact duplicates are counted and dropped; same-identity disagreements are kept and reported as conflicts', async () => {
  const { fetcher } = scripted([
    { body: features([saleRow(), saleRow({ GIS_LAST_MOD_DTTM: 1 }), saleRow({ SALE_PRICE: 0, QUALIFIED: 'U' })]) },
  ]);
  const { manifest, observations } = await ingest(dcSalesAdapter, { parcelId: '0800____0842' }, context(fetcher));
  assert.equal(manifest.duplicates, 1, 'a republished copy of the same sale is a duplicate');
  assert.equal(manifest.conflicts.length, 1);
  assert.equal(manifest.conflicts[0].identity, '0800____0842:2021-08-13');
  assert.equal(observations.length, 2);
  const direct = reconcile([...observations, ...observations]);
  assert.equal(direct.duplicates, 2);
});

test('the same records give the same manifest digest whatever order or time they arrive in', async () => {
  const rows = [saleRow(), saleRow({ SALE_DATE: 1543208400000, SALE_PRICE: 1200000 })];
  const first = await ingest(
    dcSalesAdapter,
    { parcelId: '0800____0842' },
    context(scripted([{ body: features(rows) }]).fetcher),
  );
  resetIngestionState();
  const later = await ingest(
    dcSalesAdapter,
    { parcelId: '0800____0842' },
    {
      ...context(scripted([{ body: features(rows.toReversed()) }]).fetcher),
      now: () => new Date('2026-11-01T00:00:00Z'),
    },
  );
  assert.equal(first.manifest.contentSha256, later.manifest.contentSha256);
  // The manifest content key ignores run timestamps but the observed time is not part of any fingerprint.
  assert.notEqual(first.manifest.startedAt, later.manifest.startedAt);
  assert.equal(manifestContentKey(first.manifest), manifestContentKey(later.manifest));
});

test('invalid rows are counted by reason and never normalized', async () => {
  const { fetcher } = scripted([
    {
      body: features([
        saleRow(),
        saleRow({ SALE_DATE: null }),
        saleRow({ SALE_PRICE: 'n/a' }),
        saleRow({ SSL: '9999    0001' }),
      ]),
    },
  ]);
  const { manifest } = await ingest(dcSalesAdapter, { parcelId: '0800____0842' }, context(fetcher));
  assert.deepEqual(manifest.invalid, {
    'missing or invalid sale date': 1,
    'missing or invalid price': 1,
    'different lot': 1,
  });
  assert.equal(manifest.valid, 1);
  assert.equal(manifest.observations, 1);
});

test('transient failures retry with backoff; permanent errors and outages are reported, never simulated', async () => {
  const waits: number[] = [];
  const retried = scripted([{ throws: 'socket hang up' }, { status: 503 }, { body: features([saleRow()]) }]);
  const ok = await ingest(
    dcSalesAdapter,
    { parcelId: '0800____0842' },
    {
      ...context(retried.fetcher),
      sleep: async ms => void waits.push(ms),
    },
  );
  assert.equal(ok.manifest.status, 'complete');
  assert.equal(retried.urls.length, 3);
  assert.ok(waits.includes(500) && waits.includes(1000), 'exponential backoff between attempts');

  resetIngestionState();
  const forbidden = scripted([{ status: 403 }, { body: features([saleRow()]) }]);
  const denied = await ingest(dcSalesAdapter, { parcelId: '0800____0842' }, context(forbidden.fetcher));
  assert.equal(denied.manifest.status, 'failed');
  assert.equal(forbidden.urls.length, 1, 'a 4xx is not retried');

  resetIngestionState();
  const down = await ingest(
    dcSalesAdapter,
    { parcelId: '0800____0842' },
    context(scripted([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]).fetcher),
  );
  assert.equal(down.manifest.status, 'failed');
  assert.equal(down.observations.length, 0);
  assert.match(down.manifest.errors[0], /HTTP 500 after 4 attempts/);

  resetIngestionState();
  const arcgisError = await ingest(
    dcSalesAdapter,
    { parcelId: '0800____0842' },
    context(scripted([{ body: { error: { message: 'Invalid query' } } }]).fetcher),
  );
  assert.equal(arcgisError.manifest.status, 'failed', 'an error inside a 200 reply is a failure, not an empty result');
});

test('paging stops at the source’s page cap and says so; the hourly ceiling defers instead of hammering', async () => {
  const pageSize = publicSource('dc-property-sales').refresh.pageSize;
  const full = features(
    Array.from({ length: pageSize }, (_, i) =>
      saleRow({ SSL: `${String(i).padStart(4, '0')}    0001`, SALE_DATE: 1790000000000 }),
    ),
  );
  const replies = Array.from({ length: 40 }, () => ({ body: full }));
  const { manifest } = await ingest(dcSalesAdapter, { after: '2026-10-07' }, context(scripted(replies).fetcher));
  assert.equal(manifest.status, 'partial');
  assert.equal(manifest.pages, publicSource('dc-property-sales').refresh.maxPagesPerRun);
  assert.match(manifest.errors[0], /page limit/);

  resetIngestionState();
  const ceiling = publicSource('fema-flood-hazard').refresh.hourlyCeiling;
  const many = scripted(
    Array.from({ length: ceiling + 5 }, () => ({ body: features([{ FLD_ZONE: 'X', SFHA_TF: 'F' }]) })),
  );
  let deferred = 0;
  for (let i = 0; i <= ceiling; i++) {
    const run = await ingest(
      femaFloodAdapter,
      { parcelId: 'p', lat: 38.9, lng: -77 + i / 1000 },
      context(many.fetcher),
    );
    if (run.manifest.status === 'deferred') deferred++;
  }
  assert.equal(deferred, 1);
  assert.equal(many.urls.length, ceiling);
});

test('the shared cache answers repeat questions without a request, and failures are cached only briefly', async () => {
  const replies = scripted([
    { body: features([saleRow()]) },
    { status: 500 },
    { status: 500 },
    { status: 500 },
    { status: 500 },
  ]);
  const first = await cachedIngest(dcSalesAdapter, { parcelId: '0800____0842' }, context(replies.fetcher));
  const second = await cachedIngest(dcSalesAdapter, { parcelId: '0800____0842' }, context(replies.fetcher));
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(replies.urls.length, 1);
  const thirteenHours = { ...context(replies.fetcher), now: () => new Date(NOW.getTime() + 13 * 3_600_000) };
  const expired = await cachedIngest(dcSalesAdapter, { parcelId: '0800____0842' }, thirteenHours);
  assert.equal(expired.cached, false);
  assert.equal(expired.manifest.status, 'failed');
});

test('District permits apply the importer’s kind and status rules; years without a layer are reported', async () => {
  const permit = (overrides: Record<string, unknown>) => ({
    PERMIT_ID: 'B2600001',
    ISSUE_DATE: 1770000000000,
    PERMIT_TYPE_NAME: 'CONSTRUCTION',
    PERMIT_SUBTYPE_NAME: 'ALTERATION AND REPAIR',
    APPLICATION_STATUS_NAME: 'PERMIT ISSUED',
    SSL: '0800    0842',
    LASTMODIFIEDDATE: 1790000000000,
    ...overrides,
  });
  const { manifest, observations } = await ingest(
    dcPermitsAdapter,
    { parcelId: '0800____0842', year: 2026 },
    context(
      scripted([
        {
          body: features([
            permit({}),
            permit({ PERMIT_ID: 'S1', PERMIT_TYPE_NAME: 'SIGN', PERMIT_SUBTYPE_NAME: 'SIGN' }),
            permit({ PERMIT_ID: 'C1', APPLICATION_STATUS_NAME: 'CANCELED' }),
          ]),
        },
      ]).fetcher,
    ),
  );
  assert.deepEqual(manifest.invalid, { 'kind not kept': 1, 'canceled, withdrawn or revoked': 1 });
  assert.deepEqual(observations[0].values, {
    permitKind: 'renovation',
    work: 'Alteration and repair',
    status: 'issued',
    statusLabel: 'Permit issued',
  });
  const missing = await ingest(
    dcPermitsAdapter,
    { parcelId: '0800____0842', year: 2031 },
    context(scripted([]).fetcher),
  );
  assert.equal(missing.manifest.status, 'failed');
  assert.match(missing.manifest.errors[0], /No District permit layer is configured for 2031/);
});

test('Maryland records carry transfer dates, land-records references and the dataset’s publication time', async () => {
  const { fetcher, urls } = scripted([
    { body: { rowsUpdatedAt: 1791307520 } },
    {
      body: [
        {
          account_id_mdp_field_acctid: '160100000033',
          sales_segment_1_transfer_date_yyyy_mm_dd_mdp_field_tradate_sdat_field_89: '2019.07.02',
          sales_segment_1_consideration_mdp_field_considr1_sdat_field_90: '260000',
          sales_segment_1_how_conveyed_ind_mdp_field_convey1_sdat_field_87:
            'Private arms-length transfer, Improved (1)',
          deed_reference_1_liber_mdp_field_dr1liber_sdat_field_30: '57806',
          deed_reference_1_folio_mdp_field_dr1folio_sdat_field_31: '0285',
          current_assessment_year_total_assessment_sdat_field_172: '329900',
          current_cycle_data_date_assessed_yyyy_mm_mdp_field_lastassd_sdat_field_169: '2024.01',
        },
      ],
    },
  ]);
  const { manifest, observations } = await ingest(mdSdatAdapter, { parcelId: '160100000033' }, context(fetcher));
  assert.equal(urls[0], 'https://opendata.maryland.gov/api/views/ed4q-f8tm.json');
  assert.doesNotMatch(urls[1], /grantor/);
  assert.equal(manifest.publishedAt, '2026-10-06T17:25:20.000Z');
  const transfer = observations.find(item => item.kind === 'recorded-transfer')!;
  assert.equal(transfer.dates.transaction, '2019-07-02');
  assert.equal(transfer.dates.recorded, null, 'the state publishes a book and page, not a recording date');
  assert.deepEqual(transfer.values, {
    price: 260000,
    conveyance: 'Private arms-length transfer, improved',
    deedBook: '57806',
    deedPage: '0285',
  });
  assert.equal(observations.find(item => item.kind === 'assessment')!.dates.effective, '2024-01-01');
});

test('Montgomery permits match the bundled importer’s exact address key', async () => {
  assert.equal(montgomeryAddressKey('21411 Woodfield Rd.', '20882-1234'), '21411 WOODFIELD ROAD|20882');
  assert.equal(montgomeryAddressKey('Woodfield Road', '20882'), '');
  const row = (stno: string, stname: string) => ({
    permitno: `${stno}${stname}`,
    status: 'Finaled',
    stno,
    stname,
    suffix: 'RD',
    zip: '20882',
    issueddate: '2020-11-24T00:00:00.000',
    finaleddate: '2021-10-19T00:00:00.000',
    declaredvaluation: '8500',
    worktype: 'ADD',
    usecode: 'SINGLE FAMILY DWELLING',
  });
  const { manifest, observations } = await ingest(
    montgomeryPermitsAdapter,
    { parcelId: '160100000033', address: '21411 WOODFIELD RD', zip: '20882' },
    context(
      scripted([{ body: { rowsUpdatedAt: 1792642665 } }, { body: [row('21411', 'WOODFIELD'), row('21411', 'OTHER')] }])
        .fetcher,
    ),
  );
  assert.deepEqual(manifest.invalid, { 'different address': 1 });
  assert.equal(observations[0].values.work, 'Addition (single family dwelling)');
  assert.equal(observations[0].values.finaled, '2021-10-19');
});

test('the price index is regional, dated by quarter end, and rejects an unexpected file layout', async () => {
  const file =
    'cbsa\tmetro_name\tyr\tqtr\tindex_nsa\tindex_sa\n47764\t"Washington, DC-MD (MSAD)"\t2026\t2\t419.87\t412.30\n10580\t"Albany"\t2026\t2\t300\t300\n';
  const { observations } = await ingest(
    fhfaIndexAdapter,
    { cbsa: '47764' },
    context(scripted([{ body: file }]).fetcher),
  );
  assert.equal(observations.length, 1);
  assert.equal(observations[0].parcelId, null);
  assert.equal(observations[0].dates.effective, '2026-06-30');
  resetIngestionState();
  const broken = await ingest(
    fhfaIndexAdapter,
    { cbsa: '47764' },
    context(scripted([{ body: 'a,b,c\n1,2,3' }]).fetcher),
  );
  assert.equal(broken.manifest.status, 'failed');
});

test('only homes in a covered snapshot can be checked live', () => {
  assert.ok(coveredHome('dc', '0800____0842'));
  assert.equal(coveredHome('dc', 'nope!'), null);
  assert.equal(coveredHome('dc', '9999____9999'), null);
  assert.equal(coveredHome('virginia', '0800____0842'), null);
  const md = coveredHome('maryland', '160100000033');
  assert.equal(md?.county, 'montgomery');
  assert.equal(isoDay('2026.10.06'), '2026-10-06');
});

const evidenceFor = (
  inputs: NonNullable<ReturnType<typeof dcValuationInputs>> | NonNullable<ReturnType<typeof marylandValuationInputs>>,
): StudioEvidence => ({
  subject: inputs.subject,
  candidates: inputs.candidates,
  sources: inputs.sources,
  asOf: inputs.asOf,
  snapshot: inputs.snapshot,
  facts: inputs.facts,
});

test('the evidence timeline merges sources by identity, flags disagreements and keeps newer records out of the estimate', () => {
  const inputs = dcValuationInputs('0800____0842')!;
  const evidence = evidenceFor(inputs);
  const offline = buildEvidenceTimeline({ evidence, parcelId: '0800____0842', now: NOW.getTime() });
  assert.equal(offline.live, null);
  assert.match(offline.gaps[0], /Check the public records now/);
  assert.ok(
    offline.events.some(
      event => event.category === 'source' && /collection date is not a sale date/.test(event.detail),
    ),
  );
  const bundledTransfers = offline.events.filter(event => event.category === 'transfer');
  assert.ok(bundledTransfers.length >= 1);

  const sale = (date: string, price: number, sourceId = 'dc-property-sales', recorded: string | null = null) =>
    observation({
      sourceId,
      kind: 'recorded-transfer',
      parcelId: '0800____0842',
      identity: `0800____0842:${date}`,
      values: { price },
      dates: {
        transaction: date,
        recorded,
        effective: null,
        published: '2026-10-22T09:16:12.000Z',
        observed: NOW.toISOString(),
      },
    });
  const first = bundledTransfers.at(-1)!;
  const timeline = buildEvidenceTimeline({
    evidence,
    parcelId: '0800____0842',
    now: NOW.getTime(),
    live: {
      checkedAt: NOW.toISOString(),
      sources: [
        {
          sourceId: 'dc-tax-extract',
          name: 'Tax',
          status: 'failed',
          cached: false,
          checkedAt: NOW.toISOString(),
          publishedAt: null,
          observations: 0,
          invalid: 0,
          conflicts: 0,
          errors: ['HTTP 500 after 4 attempts.'],
          contentSha256: '',
          attribution: '',
        },
      ],
      observations: [
        sale(first.date!, 999_999, 'dc-tax-extract', first.date!),
        sale('2026-10-15', 1_500_000),
        sale('2017-09-06', 490_000),
        { ...sale('2026-10-16', 1), parcelId: 'another-parcel' },
      ],
    },
  });
  const merged = timeline.events.find(event => event.id === `transfer:${first.date}`)!;
  assert.equal(merged.sources.length, 2);
  assert.match(merged.conflict!, /Sources disagree on the price/);
  const newer = timeline.events.find(event => event.id === 'transfer:2026-10-15')!;
  assert.equal(newer.newSinceSnapshot, true);
  assert.match(newer.detail, /will not use it/);
  const unqualified = timeline.events.find(event => event.id === 'transfer:2017-09-06')!;
  assert.equal(unqualified.newSinceSnapshot, false);
  assert.match(unqualified.detail, /not among the snapshot’s qualified sales/);
  assert.ok(!timeline.events.some(event => event.id === 'transfer:2026-10-16'), 'another parcel’s records are ignored');
  assert.ok(timeline.gaps.some(gap => /could not be checked \(HTTP 500/.test(gap)));
  assert.equal(timeline.counts.newSinceSnapshot, 1);
  assert.equal(timeline.counts.conflicts, 1);
});

test('a Prince George’s timeline states why permits are missing instead of showing none silently', () => {
  const inputs = marylandValuationInputs(findPrinceGeorges())!;
  const timeline = buildEvidenceTimeline({
    evidence: evidenceFor(inputs),
    parcelId: inputs.subject.id,
    now: NOW.getTime(),
  });
  assert.ok(timeline.gaps.some(gap => /open license/i.test(gap)));
});

function findPrinceGeorges() {
  for (const parcel of marylandData().parcels.values()) if (parcel.county === 'PRIN') return parcel.parcelId;
  throw new Error('No Prince George’s parcel in the snapshot.');
}
