import type { ValuationProperty, Source } from './types';

// Invented records for the hero sample. They run through the same engine as the workspace.
export const SAMPLE_AS_OF = '2026-10-15T12:00:00.000Z';
export const SAMPLE_SOURCE = 'source-synthetic-landing';
const place = { city: 'Arlington', state: 'VA', zip: '22205', sourceId: SAMPLE_SOURCE };
export const sampleSubject: ValuationProperty = {
  ...place,
  id: 'landing-subject',
  address: '1200 Example Linden Court',
  lat: 38.8816,
  lng: -77.1145,
  beds: 4,
  baths: 3,
  sqft: 2180,
  condition: 4,
  status: 'active',
};
const sold = (
  id: string,
  address: string,
  lat: number,
  lng: number,
  beds: number,
  baths: number,
  sqft: number,
  condition: number,
  soldAt: string,
  soldPrice: number,
): ValuationProperty => ({
  ...place,
  id,
  address,
  lat,
  lng,
  beds,
  baths,
  sqft,
  condition,
  status: 'sold',
  soldAt: `${soldAt}T12:00:00.000Z`,
  soldPrice,
});
export const sampleCandidates: ValuationProperty[] = [
  sold('landing-c1', '1186 Example Linden Court', 38.8829, -77.1131, 4, 3, 2120, 4, '2026-09-02', 952000),
  sold('landing-c2', '1231 Example Linden Court', 38.8801, -77.1162, 4, 2.5, 2240, 3, '2026-08-14', 938000),
  sold('landing-c3', '905 Example Aspen Street', 38.8862, -77.1098, 3, 3, 2010, 4, '2026-07-21', 905000),
  sold('landing-c4', '1414 Example Cedar Lane', 38.8774, -77.1201, 4, 3, 2310, 5, '2026-09-26', 1018000),
  sold('landing-c5', '702 Example Birch Way', 38.8893, -77.1187, 5, 3, 2400, 3, '2026-06-30', 969000),
  sold('landing-c6', '1320 Example Maple Row', 38.8838, -77.1076, 4, 3.5, 2195, 4, '2026-10-03', 981000),
  sold('landing-c7', '1098 Example Walnut Place', 38.8808, -77.1119, 4, 3, 2150, 4, '2026-03-11', 890000),
  {
    ...place,
    id: 'landing-a1',
    address: '1250 Example Linden Court',
    lat: 38.8812,
    lng: -77.1151,
    beds: 4,
    baths: 3,
    sqft: 2205,
    condition: 4,
    status: 'active',
    price: 989000,
  },
];

export const sampleSources: Source[] = [
  {
    id: SAMPLE_SOURCE,
    label: 'Ascent authored fictional practice records',
    kind: 'synthetic',
    observedAt: SAMPLE_AS_OF,
    license: 'Fictional demonstration; may be displayed and exported. No real property rights implied.',
    confidence: 0,
  },
];
