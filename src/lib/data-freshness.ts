/**
 * How current a public-record snapshot is today. The thresholds are review rules, not fitted values: recording
 * lags closing by a few weeks, so a newest sale up to 45 days old is about as current as public records get, and
 * past 120 days, the release gate's own recency limit, no comparable can count as recent any more. The age is
 * computed when the page is viewed, so it is never part of a checksummed brief.
 */
export const FRESHNESS_POLICY = { version: 'ascent-data-freshness-1', currentDays: 45, staleDays: 120 } as const;
export type FreshnessStatus = 'current' | 'aging' | 'stale';

const DAY = 86_400_000;
export function snapshotAge(newestRecordedSale: string, now: number) {
  const days = Math.max(0, Math.floor((now - Date.parse(`${newestRecordedSale.slice(0, 10)}T00:00:00Z`)) / DAY));
  const status: FreshnessStatus =
    days <= FRESHNESS_POLICY.currentDays ? 'current' : days <= FRESHNESS_POLICY.staleDays ? 'aging' : 'stale';
  const ago = `The newest recorded sale here is ${days} day${days === 1 ? '' : 's'} old today.`;
  const text =
    status === 'current'
      ? `${ago} That is about as current as public records get, because recording lags closing by weeks.`
      : status === 'aging'
        ? `${ago} Sales since then are missing; recent closings from an agent would fill the gap.`
        : `${ago} That is past the ${FRESHNESS_POLICY.staleDays} days Ascent treats as recent, so this snapshot no longer describes today’s market without newer sales.`;
  return { days, status, text };
}
