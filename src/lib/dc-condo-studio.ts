import { defaultStudioState, type StudioState } from './demo-studio';
import { validatedAssumptions, type ValuationBenchmark } from './valuation-safeguards';
import benchmarkJson from './valuation-benchmark-dc-condos.json';
export const condoBenchmark = benchmarkJson as unknown as ValuationBenchmark;
export const condoDefaultState = () => defaultStudioState(validatedAssumptions(condoBenchmark));
export function condoReportHref(parcel: string, state: StudioState, format?: 'json') {
  const query = new URLSearchParams({ parcel, state: JSON.stringify(state) });
  if (format) query.set('format', format);
  return `/api/dc-condos/report?${query}`;
}
export const CONDO_ACCURACY_NOTICE = `Condo accuracy was tested separately and failed: on ${condoBenchmark.holdout.sales.toLocaleString('en-US')} past condo sales kept out of building the method, the median error was ${(condoBenchmark.primary.mdape * 100).toFixed(2)}% and ${condoBenchmark.acceptance.filter(c => c.passed).length} of 9 accuracy criteria were met. Treat condo figures as a rough starting point; DC house results do not apply. The range shown is the spread of adjusted sales, not a tested range. Floor, view, parking, HOA dues, reserves, special assessments, amenities and interior condition are not in the records, and the District does not record condo condition, so it is not adjusted for.`;
