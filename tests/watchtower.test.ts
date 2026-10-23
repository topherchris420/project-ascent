import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWatch,
  applyCheck,
  checkAllowed,
  dueWatches,
  emptyWatchtower,
  exportWatchtower,
  parseWatchtower,
  removeWatch,
  updateWatch,
  watchStatus,
  WATCH_POLICY,
  type WatchInput,
  type Watchtower,
} from '../src/lib/watchtower';
import { observation, type Observation } from '../src/lib/sources/observations';

const HOME = { market: 'dc' as const, parcelId: '0800____0842', address: '1 Example St NW' };
const KEY = 'dc:0800____0842';
const at = (hours: number) => new Date(Date.UTC(2026, 9, 22, 12) + hours * 3_600_000);
const sale = (date: string, price: number, parcelId = HOME.parcelId): Observation =>
  observation({
    sourceId: 'dc-property-sales',
    kind: 'recorded-transfer',
    parcelId,
    identity: `${parcelId}:${date}`,
    values: { price, qualified: true, saleCode: '01' },
    dates: { transaction: date, recorded: null, effective: null, published: '2026-10-22T09:00:00Z', observed: 'x' },
  });
const flood = (zone: string) =>
  observation({
    sourceId: 'fema-flood-hazard',
    kind: 'flood-zone',
    parcelId: HOME.parcelId,
    identity: `${HOME.parcelId}:flood`,
    values: { zone, subtype: null, specialFloodHazardArea: zone.startsWith('A'), mapArea: null },
    dates: { transaction: null, recorded: null, effective: null, published: null, observed: 'x' },
  });
type SourceStatus = WatchInput['sources'][number];
const ok = (sourceId: string, name = sourceId): SourceStatus => ({
  sourceId,
  name,
  status: 'complete' as const,
  cached: false,
  errors: [],
});
const down = (sourceId: string, name = sourceId): SourceStatus => ({
  sourceId,
  name,
  status: 'failed' as const,
  cached: false,
  errors: ['HTTP 503 after 4 attempts.'],
});
const input = (
  hours: number,
  observations: Observation[],
  sources = [ok('dc-property-sales', 'District sales'), ok('fema-flood-hazard')],
): WatchInput => ({
  checkedAt: at(hours).toISOString(),
  sources,
  observations,
  nearby: null,
});
const watched = (topics = ['own-records', 'flood-zone'] as const): Watchtower =>
  addWatch(emptyWatchtower(), HOME, topics, at(0));

test('the first check sets a baseline without notifications; later checks report only what changed', () => {
  let state = watched();
  let run = applyCheck(state, KEY, input(0, [sale('2019-05-01', 700000), flood('X')]));
  assert.deepEqual(run.events, []);
  state = run.state;
  assert.equal(Object.keys(state.watches[0].baseline!).length, 2);
  assert.equal(watchStatus(state.watches[0], at(1)).state, 'current');

  run = applyCheck(state, KEY, input(13, [sale('2019-05-01', 700000), sale('2026-10-15', 910000), flood('AE')]));
  assert.deepEqual(
    run.events.map(event => [event.kind, event.topic, event.recordDate]),
    [
      ['new', 'own-records', '2026-10-15'],
      ['changed', 'flood-zone', null],
    ],
  );
  assert.match(run.events[0].title, /2026-10-15, \$910,000/);
  for (const event of run.events) {
    assert.match(event.detail, /not a change to your estimate/);
    assert.doesNotMatch(`${event.title} ${event.detail}`, /(value|estimate) (rose|fell|increased|decreased|is now)/i);
  }
});

test('the same change seen again is one event, not two', () => {
  let state = applyCheck(watched(), KEY, input(0, [flood('X')])).state;
  state = applyCheck(state, KEY, input(13, [flood('X'), sale('2026-10-15', 910000)])).state;
  const again = applyCheck(state, KEY, input(26, [flood('X'), sale('2026-10-15', 910000)]));
  assert.equal(again.events.length, 0);
  assert.equal(again.state.events.length, 1);
  assert.equal(new Set(again.state.events.map(event => event.id)).size, again.state.events.length);
});

test('an outage is reported once, never counted as a removal, and recovery is reported', () => {
  let state = applyCheck(watched(), KEY, input(0, [sale('2019-05-01', 700000), flood('X')])).state;
  const outage = applyCheck(
    state,
    KEY,
    input(13, [flood('X')], [down('dc-property-sales', 'District sales'), ok('fema-flood-hazard')]),
  );
  assert.deepEqual(
    outage.events.map(event => event.kind),
    ['source-unavailable'],
  );
  assert.match(outage.events[0].detail, /unknown until it answers again/);
  state = outage.state;
  assert.ok(state.watches[0].baseline![`own-records|dc-property-sales|recorded-transfer|${HOME.parcelId}:2019-05-01`]);
  assert.equal(watchStatus(state.watches[0], at(14)).state, 'unavailable');
  const still = applyCheck(
    state,
    KEY,
    input(26, [flood('X')], [down('dc-property-sales', 'District sales'), ok('fema-flood-hazard')]),
  );
  assert.equal(still.events.length, 0, 'a continuing outage is not announced again');
  const back = applyCheck(still.state, KEY, input(39, [sale('2019-05-01', 700000), flood('X')]));
  assert.deepEqual(
    back.events.map(event => event.kind),
    ['source-restored'],
  );
  assert.equal(watchStatus(back.state.watches[0], at(40)).state, 'current');
});

test('a record is removed only when its source answered completely', () => {
  let state = applyCheck(
    watched(),
    KEY,
    input(0, [sale('2019-05-01', 700000), sale('2021-01-01', 800000), flood('X')]),
  ).state;
  const run = applyCheck(state, KEY, input(13, [sale('2019-05-01', 700000), flood('X')]));
  assert.deepEqual(
    run.events.map(event => event.kind),
    ['removed'],
  );
  assert.match(run.events[0].title, /2021-01-01/);
  state = run.state;
  assert.equal(Object.keys(state.watches[0].baseline!).length, 2);
});

test('nearby sales are judged by their own check, and a failed home check never empties the baseline', () => {
  let state = watched(['own-records', 'nearby-sales'] as never);
  const nearby = (status: 'complete' | 'failed', sales: Observation[]) => ({
    source: status === 'complete' ? ok('dc-property-sales') : down('dc-property-sales'),
    sales: sales.map(item => ({
      identity: item.identity,
      address: '2 Example St NW',
      distanceMiles: 0.3,
      observation: item,
    })),
  });
  const neighbor = sale('2026-10-14', 1_100_000, '0800____0843');
  state = applyCheck(state, KEY, {
    ...input(0, [sale('2019-05-01', 700000)]),
    nearby: nearby('complete', [neighbor]),
  }).state;
  // The home's own sales check fails while the nearby list answers: the home's records are not removed.
  const run = applyCheck(state, KEY, {
    ...input(13, [], [down('dc-property-sales', 'District sales')]),
    nearby: nearby('complete', [neighbor]),
  });
  assert.ok(!run.events.some(event => event.kind === 'removed'));
  // A sale outside the watch radius is not tracked.
  const far = applyCheck(run.state, KEY, {
    ...input(26, [sale('2019-05-01', 700000)]),
    nearby: {
      ...nearby('complete', [neighbor]),
      sales: [
        { identity: 'z', address: 'far', distanceMiles: 1.9, observation: sale('2026-10-16', 1, '0800____0844') },
      ],
    },
  });
  assert.deepEqual(
    far.events.map(event => [event.kind, event.topic]),
    [
      ['removed', 'nearby-sales'],
      ['source-restored', 'source'],
    ],
  );
});

test('the schedule and the device quota bound how often sources are asked', () => {
  let state = applyCheck(watched(), KEY, input(0, [flood('X')])).state;
  assert.equal(checkAllowed(state, state.watches[0], at(11)).allowed, false);
  assert.match(checkAllowed(state, state.watches[0], at(11)).reason, /12 hours/);
  assert.equal(checkAllowed(state, state.watches[0], at(12)).allowed, true);
  assert.equal(watchStatus(state.watches[0], at(1)).nextCheckAfter, at(12).toISOString());
  state = { ...state, usage: { day: at(13).toISOString().slice(0, 10), checks: WATCH_POLICY.dailyChecksPerDevice } };
  assert.match(checkAllowed(state, state.watches[0], at(13)).reason, /checks for today/);
  assert.equal(watchStatus(state.watches[0], at(73)).state, 'stale');
  assert.throws(() => {
    let many = emptyWatchtower();
    for (let i = 0; i <= WATCH_POLICY.maxWatches; i++)
      many = addWatch(many, { ...HOME, parcelId: `0800____${String(i).padStart(4, '0')}` }, ['own-records'], at(0));
  }, /up to 10 homes/);
});

test('pausing stops checks; deleting removes the watch and all of its history; export carries everything', () => {
  let state = applyCheck(watched(), KEY, input(0, [flood('X')])).state;
  state = applyCheck(state, KEY, input(13, [flood('AE')])).state;
  state = updateWatch(state, KEY, { paused: true });
  assert.equal(watchStatus(state.watches[0], at(30)).state, 'paused');
  assert.deepEqual(dueWatches(state, at(30)), []);
  const exported = exportWatchtower(state, at(30));
  assert.equal(exported.events.length, 1);
  assert.equal(exported.watches[0].checks.length, 2);
  assert.match(exported.policy.schedule, /no background process/);
  assert.deepEqual(parseWatchtower(JSON.stringify(state)), state);
  const removed = removeWatch(state, KEY);
  assert.deepEqual(removed.watches, []);
  assert.deepEqual(removed.events, []);
  assert.throws(() => parseWatchtower('{"version":"other"}'));
  assert.deepEqual(parseWatchtower(null), emptyWatchtower());
});

test('records about another lot are never attributed to the watched home', () => {
  const state = applyCheck(watched(), KEY, input(0, [flood('X')])).state;
  const run = applyCheck(state, KEY, input(13, [flood('X'), sale('2026-10-15', 1, '9999____0001')]));
  assert.deepEqual(run.events, []);
});
