import { defaultStudioState, type StudioState } from './demo-studio';
import { dcBenchmark, validatedAssumptions } from './valuation-safeguards';
import type { CmaAssumptions } from './types';

/** Client-safe helpers for the DC public-record studio. Data loading stays in providers/dc-public-records. */
export const DC_CONDITION_MAX = 6;
/** DC CAMA condition codes: 1 Poor, 2 Fair, 3 Average, 4 Good, 5 Very Good, 6 Excellent. */
export const DC_CONDITION_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Average',
  4: 'Good',
  5: 'Very good',
  6: 'Excellent',
};
export const DC_PARCEL_PATTERN = /^[A-Za-z0-9_]{4,32}$/;
export const dcDefaultState = (): StudioState =>
  defaultStudioState(validatedAssumptions(dcBenchmark) as CmaAssumptions);

export function dcReportHref(parcelId: string, state: StudioState, format?: 'json') {
  const query = new URLSearchParams({ parcel: parcelId, state: JSON.stringify(state) });
  if (format) query.set('format', format);
  return `/api/dc/report?${query}`;
}
