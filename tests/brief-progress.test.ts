import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBarVisible, readingIndex } from '../src/lib/brief-progress';

test('the question being read is the last one past the reading line', () => {
  const tops = [-900, -200, 140, 820, 1600, 2400, 3100];
  assert.equal(readingIndex(tops, 300), 2);
  assert.equal(readingIndex(tops, 100), 1);
  assert.equal(readingIndex(tops, 5000), 6);
});

test('before the first question reaches the line, the first question is current', () => {
  assert.equal(readingIndex([400, 1200, 2000], 300), 0);
  assert.equal(readingIndex([], 300), 0);
});

test('the bar appears only once the question links have scrolled away', () => {
  const at = (jumpBottom: number, listBottom = 4000) =>
    questionBarVisible({ jumpBottom, listBottom, topOffset: 0, barHeight: 52 });
  assert.equal(at(120), false);
  assert.equal(at(1), false);
  assert.equal(at(-1), true);
});

test('the bar leaves before the last question does', () => {
  const at = (listBottom: number) => questionBarVisible({ jumpBottom: -500, listBottom, topOffset: 0, barHeight: 52 });
  assert.equal(at(400), true);
  assert.equal(at(77), true);
  assert.equal(at(76), false);
  assert.equal(at(-20), false);
});

test('a sticky header above the bar moves both thresholds down', () => {
  const visible = (jumpBottom: number, listBottom: number) =>
    questionBarVisible({ jumpBottom, listBottom, topOffset: 48, barHeight: 52 });
  assert.equal(visible(30, 2000), true);
  assert.equal(visible(60, 2000), false);
  assert.equal(visible(-300, 110), false);
});
