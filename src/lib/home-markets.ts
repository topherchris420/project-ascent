import { CONDO_ACCURACY_NOTICE } from './dc-condo-studio';

/** What each market's public records do not cover, shown in the studio passport and the Homeowner OS alike. */
export const MISSING_EVIDENCE = {
  dc: 'No MLS listing history, active competition, concessions, interior condition or owner information. Permits show authorized work, not finished work, and never unpermitted work. Condominiums and multi-unit buildings are not covered, and recent sales can take weeks to be recorded.',
  'dc-condos': CONDO_ACCURACY_NOTICE,
  maryland:
    'No bedrooms, bathrooms, MLS listing history, concessions, interior condition or owner information. The state condition field is blank for almost every home here. Prince George’s permits carry no open license, so none are shown. Only the latest three transfers per parcel are retained; older history is incomplete. Condominiums and multi-unit homes are excluded. Current assessor facts can postdate sales.',
} as const;
