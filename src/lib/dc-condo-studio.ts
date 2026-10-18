import { defaultAssumptions } from './analytics';
import { defaultStudioState, type StudioState } from './demo-studio';
export const condoDefaultState = () => defaultStudioState({ ...defaultAssumptions, conditionValue: 0 });
export function condoReportHref(parcel: string, state: StudioState, format?: 'json') {
  const query = new URLSearchParams({ parcel, state: JSON.stringify(state) });
  if (format) query.set('format', format);
  return `/api/dc-condos/report?${query}`;
}
export const CONDO_ACCURACY_NOTICE =
  'Condo accuracy has not been validated. DC single-family results do not apply. The displayed range is an uncalibrated comparable envelope. Floor, view, parking rights, HOA dues, reserves, special assessments, amenities and interior condition are not modeled. Condition is unavailable in Condominium CAMA; its adjustment is disabled.';
