import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeBackup, parseHomeBackup, mergeHomeBackup, MAX_BACKUP_BYTES } from '../src/lib/homeowner-backup';
import { createHomeSnapshot, saveHomeSnapshot, emptyOwnerNotes, evidencePassport } from '../src/lib/homeowner-passport';
import { defaultDemoState, sampleEvidence } from '../src/lib/demo-studio';
import { exampleFinance } from '../src/lib/homeowner-finance';

const snapshot = (day = 18, rent = 3500) =>
  createHomeSnapshot(
    sampleEvidence,
    defaultDemoState,
    { ...exampleFinance(), monthlyRent: rent },
    { ...emptyOwnerNotes(), disputedEvidence: 'Private note' },
    `2026-10-${day}T16:00:00.000Z`,
  );
const profiles = () => saveHomeSnapshot([], snapshot());

test('private backup round-trips frozen evidence, finances, notes and versions without recalculation', () => {
  const original = saveHomeSnapshot(profiles(), snapshot(19));
  const restored = parseHomeBackup(JSON.stringify(createHomeBackup(original)));
  assert.deepEqual(restored, original);
  assert.deepEqual(mergeHomeBackup([], restored).profiles, original);
  assert.equal(restored[0].snapshots[0].notes.disputedEvidence, 'Private note');
});

test('restore is idempotent, retains current working version and does not mutate inputs', () => {
  const current = saveHomeSnapshot([], snapshot(19));
  const incoming = saveHomeSnapshot(profiles(), snapshot(20));
  const before = JSON.stringify({ current, incoming });
  const merged = mergeHomeBackup(current, incoming);
  assert.equal(merged.added, 2);
  assert.equal(merged.profiles[0].snapshots.at(-1)?.id, current[0].snapshots[0].id);
  assert.equal(JSON.stringify({ current, incoming }), before);
  const again = mergeHomeBackup(merged.profiles, incoming);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 2);
  assert.deepEqual(again.profiles, merged.profiles);
});

test('malformed, oversized, public reports, tampering and external return links are refused', () => {
  assert.throws(() => parseHomeBackup('{'), /valid JSON/);
  assert.throws(() => parseHomeBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /too large/);
  assert.throws(() => parseHomeBackup(JSON.stringify(evidencePassport(snapshot()))), /not restorable/);
  assert.throws(() => createHomeBackup([]), /Save a home/);
  for (const corrupt of [
    (data: ReturnType<typeof createHomeBackup>) => {
      data.profiles[0].snapshots[0].finance.monthlyRent = 1;
    },
    (data: ReturnType<typeof createHomeBackup>) => {
      data.profiles[0].href = 'javascript:alert(1)';
    },
    (data: ReturnType<typeof createHomeBackup>) => {
      data.profiles[0].snapshots[0].evidence.sources[0].kind = 'licensed';
    },
  ]) {
    const backup = createHomeBackup(profiles());
    corrupt(backup);
    assert.throws(() => parseHomeBackup(JSON.stringify(backup)), /damaged/);
  }
});

test('capacity failures leave all original versions intact; duplicate restore works at capacity', () => {
  let full = profiles();
  for (let i = 1; i < 10; i++) full = saveHomeSnapshot(full, snapshot(18, 3500 + i));
  const before = JSON.stringify(full);
  assert.throws(() => mergeHomeBackup(full, saveHomeSnapshot([], snapshot(20))), /ten versions/);
  assert.equal(JSON.stringify(full), before);
  assert.equal(mergeHomeBackup(full, profiles()).added, 0);
});

test('duplicate versions inside a backup are restored once', () => {
  const duplicate = saveHomeSnapshot(profiles(), snapshot());
  const merged = mergeHomeBackup([], duplicate);
  assert.equal(merged.added, 1);
  assert.equal(merged.skipped, 1);
});
