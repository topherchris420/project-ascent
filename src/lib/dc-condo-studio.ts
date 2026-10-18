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
export const CONDO_ACCURACY_NOTICE = `Condo accuracy was tested separately and failed: ${(condoBenchmark.primary.mdape * 100).toFixed(2)}% median error on ${condoBenchmark.holdout.sales.toLocaleString('en-US')} held-out condo sales; ${condoBenchmark.acceptance.filter(c => c.passed).length} of 9 criteria met. DC single-family results do not apply. The displayed range is an uncalibrated comparable envelope. Floor, view, parking rights, HOA dues, reserves, special assessments, amenities and interior condition are not modeled. Condition is unavailable in Condominium CAMA; its adjustment is disabled.`;
