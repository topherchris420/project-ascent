import { defaultStudioState, type StudioState } from './demo-studio';
import { validatedAssumptions, type ValuationBenchmark } from './valuation-safeguards';
import benchmarkJson from './valuation-benchmark-maryland.json';
import revisedJson from './valuation-benchmark-maryland-v2.json';

export const marylandBenchmark = benchmarkJson as unknown as ValuationBenchmark;
export const marylandRevisedBenchmark = revisedJson as unknown as ValuationBenchmark;
export const MD_PARCEL_PATTERN = /^\d{10,12}$/;
export const MD_GRADE_MAX = 9;
export const MD_GRADE_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Economy',
  3: 'Below average',
  4: 'Average',
  5: 'Above average',
  6: 'Good',
  7: 'Very good',
  8: 'Excellent',
  9: 'Superior',
};
export const marylandDefaultState = () => defaultStudioState(validatedAssumptions(marylandRevisedBenchmark));
export const marylandVerdict = () => {
  const met = marylandRevisedBenchmark.acceptance.filter(item => item.passed).length;
  return `${met} of 9 accuracy criteria met${marylandRevisedBenchmark.accepted ? '' : ' — did not meet the acceptance criteria'}.`;
};
export function marylandReportHref(parcel: string, state: StudioState, format?: 'json') {
  const query = new URLSearchParams({ parcel, state: JSON.stringify(state) });
  if (format) query.set('format', format);
  return `/api/maryland/report?${query}`;
}
