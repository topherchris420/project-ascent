import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDcPermit,
  classifyMontgomeryPermit,
  dcPermitStatus,
  displayName,
  inferFloor,
  montgomeryPermitStatus,
  permitBeforeSale,
  permitText,
  propertyFactsSchema,
  PROPERTY_FACTS_VERSION,
  renovationSignals,
  structureLabel,
  type PermitRecord,
  type PropertyFacts,
} from '../src/lib/property-facts';
import { dcFactsData, dcValuationInputs } from '../src/lib/providers/dc-public-records';
import {
  condoFactsData,
  condoValuationInputs,
  searchCondoAddresses,
} from '../src/lib/providers/dc-condo-public-records';
import { marylandData, marylandFactsData, marylandValuationInputs } from '../src/lib/providers/maryland-public-records';
import { buildHomeDecisionBrief } from '../src/lib/home-decision-brief';
import { FRESHNESS_POLICY, snapshotAge } from '../src/lib/data-freshness';
import { calculateStudio, type StudioEvidence } from '../src/lib/demo-studio';
import { dcDefaultState } from '../src/lib/dc-studio';
import { condoDefaultState } from '../src/lib/dc-condo-studio';
import { marylandDefaultState } from '../src/lib/maryland-studio';
import { briefRecord, createHomeSnapshot, emptyOwnerNotes } from '../src/lib/homeowner-passport';
import { renderHomeownerReport } from '../src/lib/homeowner-report';
import { emptyFinance } from '../src/lib/homeowner-finance';

type Inputs = NonNullable<ReturnType<typeof dcValuationInputs>>;
const evidenceOf = (inputs: Pick<Inputs, 'subject' | 'candidates' | 'sources' | 'asOf' | 'snapshot' | 'facts'>) =>
  ({
    subject: inputs.subject,
    candidates: inputs.candidates,
    sources: inputs.sources,
    asOf: inputs.asOf,
    snapshot: inputs.snapshot,
    facts: inputs.facts,
  }) as StudioEvidence;
const permit = (patch: Partial<PermitRecord>): PermitRecord => ({
  id: 'P1',
  issued: '2023-04-13',
  kind: 'renovation',
  work: 'Alteration and repair',
  status: 'completed',
  statusLabel: 'Completed',
  finaled: null,
  declaredValue: null,
  scope: 'home',
  ...patch,
});
const facts = (records: PermitRecord[], years: PropertyFacts['years'], closeOutRecorded: boolean): PropertyFacts => ({
  version: PROPERTY_FACTS_VERSION,
  sources: [],
  recorded: [],
  years,
  permits: { source: 'test', since: '2016-01-01', coverage: '', closeOutRecorded, statusNote: '', records },
  permitGap: null,
  building: null,
  comparables: {},
  later: null,
});

test('permits are classified by their structured fields only', () => {
  assert.deepEqual(classifyDcPermit('CONSTRUCTION', 'ALTERATION AND REPAIR'), {
    kind: 'renovation',
    work: 'Alteration and repair',
  });
  assert.equal(classifyDcPermit('CONSTRUCTION', 'ADDITION ALTERATION REPAIR').kind, 'addition');
  assert.equal(classifyDcPermit('CONSTRUCTION', 'RAZE').kind, 'demolition');
  assert.equal(classifyDcPermit('CONSTRUCTION', 'DECK').kind, 'exterior');
  assert.deepEqual(classifyDcPermit('SUPPLEMENTAL', 'MECHANICAL'), {
    kind: 'systems',
    work: 'Heating, cooling or ventilation work',
  });
  assert.equal(classifyDcPermit('POST CARD', 'BUILDING').kind, 'minor');
  assert.equal(dcPermitStatus('PERMIT ISSUED'), 'issued');
  assert.equal(dcPermitStatus('PERMIT RENEWED'), 'issued');
  assert.equal(dcPermitStatus('RAZE FINAL APPROVED - CLO'), 'completed');
  assert.equal(dcPermitStatus('EXPIRED'), 'expired');
  assert.equal(dcPermitStatus('REVIEW IN PROCESS'), 'other');
  assert.deepEqual(classifyMontgomeryPermit('ALTER', 'SINGLE FAMILY DWELLING'), {
    kind: 'renovation',
    work: 'Alteration (single family dwelling)',
  });
  assert.equal(classifyMontgomeryPermit('ADD', 'TOWNHOUSE').kind, 'addition');
  assert.deepEqual(classifyMontgomeryPermit('CONSTRUCT', 'DECK'), {
    kind: 'exterior',
    work: 'Deck (new construction)',
  });
  // A final-only application closes out earlier work; it is listed but never counted as new major work.
  assert.deepEqual(classifyMontgomeryPermit('FINAL ONLY AP', 'SINGLE FAMILY DWELLING'), {
    kind: 'approval',
    work: 'Final approval (single family dwelling)',
  });
  assert.equal(montgomeryPermitStatus('Finaled'), 'completed');
  assert.equal(montgomeryPermitStatus('Stop Work'), 'stop-work');
  assert.equal(structureLabel('Row Inside'), 'Rowhouse, inside');
  assert.equal(structureLabel('End Unit'), 'Townhouse, end unit');
  assert.equal(displayName('904  H STREET CONDOMINIUM'), '904 H Street Condominium');
  assert.equal(displayName('THE BRIGHTON CONDOMINIUM'), 'The Brighton Condominium');
});

test('a condo floor is inferred only from a numbered unit, and always labeled as an inference', () => {
  assert.equal(inferFloor('2501 M STREET NW Unit 601').floor, 6);
  assert.equal(inferFloor('1 Example Way Unit 1203').floor, 12);
  assert.equal(inferFloor('1 Example Way Unit PH3').floor, 'penthouse');
  for (const address of ['2123 California Street NW Unit A1', '1 Example Way Unit 12', '1 Example Way'])
    assert.equal(inferFloor(address).floor, null);
  assert.match(inferFloor('2501 M STREET NW Unit 601').basis, /^Inferred from unit number 601/);
});

test('renovation signals compare permits with the recorded years, and only reliable sources flag close-out', () => {
  const old = permit({ id: 'old', issued: '2019-02-01', status: 'issued' });
  const expired = permit({ id: 'expired', issued: '2024-06-01', status: 'expired' });
  const recent = permit({ id: 'recent', issued: '2026-03-01', status: 'issued' });
  const stopped = permit({ id: 'stop', status: 'stop-work', finaled: '2023-12-19' });
  const deck = permit({ id: 'deck', kind: 'exterior', status: 'expired' });
  const asOf = '2026-10-17T00:00:00Z';
  const district = renovationSignals(
    facts([old, expired, recent, deck], { built: 1950, remodeled: 2020, effective: null }, false),
    asOf,
  );
  assert.deepEqual(
    district.sinceRecord.map(item => item.id),
    ['expired', 'recent'],
  );
  assert.deepEqual(district.unresolved, []);
  const county = renovationSignals(
    facts([old, expired, recent, deck, stopped], { built: 1950, remodeled: null, effective: null }, true),
    asOf,
  );
  assert.deepEqual(
    county.unresolved.map(item => item.id),
    ['old', 'expired'],
  );
  assert.equal(county.recordYear, 1950);
  assert.equal(permitText(stopped).includes('final approval (Dec 2023) is also recorded'), true);
  assert.deepEqual(renovationSignals(undefined, asOf).major, []);
  // A record still in review is listed, but it is not evidence that work was authorized.
  const pending = permit({ id: 'pending', issued: '2025-01-01', status: 'other', statusLabel: 'Review in process' });
  assert.deepEqual(
    renovationSignals(facts([pending], { built: 1950, remodeled: 2020, effective: null }, true), asOf).major,
    [],
  );
  assert.equal(permitBeforeSale([pending], '2025-06-01'), undefined);
});

test('a comparable notes major permitted work from the three years before its sale', () => {
  const records = [
    permit({ id: 'a', issued: '2022-11-01' }),
    permit({ id: 'b', issued: '2025-05-01', kind: 'addition', work: 'Addition' }),
    permit({ id: 'c', issued: '2025-12-01' }),
    permit({ id: 'd', issued: '2025-06-01', kind: 'systems' }),
  ];
  assert.deepEqual(permitBeforeSale(records, '2025-10-23'), {
    issued: '2025-05-01',
    kind: 'addition',
    work: 'Addition',
  });
  assert.equal(permitBeforeSale(records, '2022-10-01'), undefined);
});

test('the bundled fact and permit files match their provenance, and never reach the engine', () => {
  for (const data of [dcFactsData(), condoFactsData(), marylandFactsData()]) {
    assert.equal(data.facts.size, data.provenance.facts);
    assert.equal(data.facts.total, data.provenance.facts);
    assert.equal(data.permits.total, data.provenance.permits);
  }
  const inputs = dcValuationInputs('3313____0047')!;
  const parsed = propertyFactsSchema.parse(inputs.facts);
  assert.equal(parsed.version, PROPERTY_FACTS_VERSION);
  // The engine sees subject and candidates only: the same calculation with and without facts.
  const withFacts = calculateStudio(evidenceOf(inputs), dcDefaultState());
  const withoutFacts = calculateStudio(evidenceOf({ ...inputs, facts: undefined as never }), dcDefaultState());
  assert.equal(withFacts.calculationHash, withoutFacts.calculationHash);
  assert.ok(!('facts' in inputs.subject));
  assert.ok(
    Object.keys(inputs.facts.comparables).every(id => inputs.candidates.some(candidate => candidate.id === id)),
  );
});

test('a DC house brief shows its recorded facts, permits after the last remodel and newer sales', () => {
  const inputs = dcValuationInputs('0016____0046')!;
  const brief = buildHomeDecisionBrief({ evidence: evidenceOf(inputs), state: dcDefaultState() });
  assert.ok(brief.recorded);
  assert.ok(brief.recorded.facts.some(item => item.label === 'Structure'));
  assert.ok(brief.recorded.permits && brief.recorded.permits.total >= 2);
  assert.match(brief.recorded.permits.statusNote, /no final inspection was recorded/);
  const condition = brief.missingFacts.find(item => item.fact === 'Current interior condition')!;
  assert.match(
    condition.why,
    /A permit for alteration and repair was issued in 2023; the last recorded remodel was in 2012/,
  );
  assert.ok(!brief.missingFacts.some(item => item.fact.startsWith('Whether permitted work')));
  assert.match(brief.reliability.answer, /the live public records listed \d+ qualifying sales? of covered homes/);
  assert.ok(brief.limits.some(item => item.startsWith('Recorded facts and permits come from public records')));
  const lead = buildHomeDecisionBrief({
    evidence: evidenceOf(dcValuationInputs('3313____0047')!),
    state: dcDefaultState(),
  });
  assert.ok(lead.comparables.leading.every(item => item.notes.some(note => note.startsWith('Structure: '))));
});

test('a condo brief names its building, infers the floor with a caveat and marks same-building sales', () => {
  const [match] = searchCondoAddresses('2501 M Street NW Unit 601');
  const inputs = condoValuationInputs(match.parcelId)!;
  assert.equal(inputs.facts.building?.floor, 6);
  const brief = buildHomeDecisionBrief({ evidence: evidenceOf(inputs), state: condoDefaultState() });
  assert.ok(brief.recorded!.facts.some(item => item.label === 'Condominium' && /Westgate/.test(item.value)));
  assert.ok(
    brief.recorded!.facts.some(item => item.label === 'Floor' && item.value === '6 (inferred from the unit number)'),
  );
  const view = brief.missingFacts.find(item => item.fact.startsWith('View, deeded parking'))!;
  assert.match(view.why, /Inferred from unit number 601/);
  const notes = brief.comparables.leading.flatMap(item => item.notes);
  assert.ok(
    notes.some(note => note === 'In the same condominium as this unit' || note === 'In a different condominium'),
  );
});

test('Maryland briefs: Montgomery shows final approvals and close-out gaps; Prince George’s says why it has no permits', () => {
  const unresolved = marylandValuationInputs('160100001493')!;
  const brief = buildHomeDecisionBrief({ evidence: evidenceOf(unresolved), state: marylandDefaultState() });
  assert.ok(brief.missingFacts.some(item => item.fact === 'Whether permitted work was finished and closed out'));
  assert.ok(brief.nextSteps.some(item => item.item.includes('Montgomery County’s Department of Permitting Services')));
  assert.match(
    brief.missingFacts.find(item => item.fact === 'Interior condition and updates')!.why,
    /condition field is blank/,
  );
  const prinId = [...marylandData().parcels.values()].find(parcel => parcel.county === 'PRIN')!.parcelId;
  const prin = marylandValuationInputs(prinId)!;
  assert.equal(prin.facts.permits, null);
  const prinBrief = buildHomeDecisionBrief({ evidence: evidenceOf(prin), state: marylandDefaultState() });
  assert.match(
    prinBrief.recorded!.answer,
    /Prince George’s County publishes building permits without a stated open license/,
  );
  assert.ok(prinBrief.missingFacts.some(item => item.fact === 'Lot, permits and location features'));
  assert.match(prinBrief.reliability.answer, /held no qualifying sale dated after this snapshot’s newest/);
});

test('saved passports keep the home’s facts but not the per-comparable notes, and share them publicly', () => {
  const inputs = dcValuationInputs('0016____0046')!;
  const snapshot = createHomeSnapshot(
    evidenceOf(inputs),
    dcDefaultState(),
    emptyFinance(),
    emptyOwnerNotes(),
    '2026-10-22T12:00:00.000Z',
  );
  assert.deepEqual(snapshot.evidence.facts?.comparables, {});
  assert.equal(snapshot.evidence.facts?.recorded.length, inputs.facts.recorded.length);
  const record = briefRecord(snapshot, false)!;
  assert.ok(record.recordedFacts?.permits);
  assert.equal(record.checksum, null);
  const report = renderHomeownerReport(snapshot);
  assert.match(report, /<h3>What the public records show<\/h3>/);
  assert.match(report, /Permits on record, (all|the \d+ most recent of \d+):/);
});

test('a snapshot’s age today follows the published freshness policy', () => {
  const day = 86_400_000;
  const newest = Date.parse('2026-10-07T00:00:00Z');
  assert.deepEqual(FRESHNESS_POLICY, { version: 'ascent-data-freshness-1', currentDays: 45, staleDays: 120 });
  assert.equal(snapshotAge('2026-10-07', newest + 15 * day).status, 'current');
  assert.equal(snapshotAge('2026-10-07', newest + 45 * day).status, 'current');
  assert.equal(snapshotAge('2026-10-07', newest + 46 * day).status, 'aging');
  assert.equal(snapshotAge('2026-10-07', newest + 120 * day).status, 'aging');
  assert.equal(snapshotAge('2026-10-07', newest + 121 * day).status, 'stale');
  assert.match(snapshotAge('2026-10-07', newest + 121 * day).text, /past the 120 days Ascent treats as recent/);
  assert.equal(snapshotAge('2026-10-07', newest - day).days, 0);
  const brief = buildHomeDecisionBrief({
    evidence: evidenceOf(dcValuationInputs('3313____0047')!),
    state: dcDefaultState(),
  });
  assert.match(brief.reliability.newestRecorded ?? '', /^\d{4}-\d{2}-\d{2}$/);
});
