/**
 * Where a reader is in the Home Decision Brief, from layout measurements only,
 * so the question bar can be tested without a browser.
 */

/** The question being read: the last one whose top has passed the reading line (viewport px). */
export function readingIndex(questionTops: number[], readingLine: number): number {
  let index = 0;
  questionTops.forEach((top, i) => {
    if (top <= readingLine) index = i;
  });
  return index;
}

/**
 * The bar appears once the brief's own question links have scrolled under the
 * top edge, and leaves before the last question does, so it never floats over
 * the sections that follow the brief.
 */
export function questionBarVisible({
  jumpBottom,
  listBottom,
  topOffset,
  barHeight,
}: {
  /** Bottom of the brief's question-link row, viewport px. */
  jumpBottom: number;
  /** Bottom of the question list, viewport px. */
  listBottom: number;
  /** Where the bar sticks: 0, or the height of a sticky header above it. */
  topOffset: number;
  barHeight: number;
}): boolean {
  return jumpBottom < topOffset && listBottom > topOffset + barHeight + 24;
}
