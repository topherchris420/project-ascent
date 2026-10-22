import { sampleEvidence, studioStateSchema, type StudioEvidence } from './demo-studio';
import { SAMPLE_AS_OF, SAMPLE_SOURCE } from './pricing-sample';
import type { ValuationProperty } from './types';

/**
 * Prepared states for the Home Decision Brief comprehension study (`ascent-usability-brief-1`). Each opens the
 * practice studio in a known condition at `/demo/study/<state>`, restores nothing and saves no draft, so every
 * task starts from the same fresh page. All records are fictional.
 */
export const STUDY_STATES = ['value', 'abstention', 'finance'] as const;
export type StudyState = (typeof STUDY_STATES)[number];
export const isStudyState = (value: string): value is StudyState => (STUDY_STATES as readonly string[]).includes(value);
export const studyStateLabels: Record<StudyState, string> = {
  value: 'Practice home',
  abstention: 'Practice home with few sales',
  finance: 'Practice home with illustrative finances',
};
export const studyStatePath = (state: StudyState) => `/demo/study/${state}`;
/** How the studio opens in a prepared state. The finance state matches clicking “Try illustrative financial inputs”. */
export type StudySession = { illustrativeFinance: boolean; panel: 'overview' | 'compare' };
export const studySession = (state: StudyState): StudySession => ({
  illustrativeFinance: state === 'finance',
  panel: state === 'finance' ? 'compare' : 'overview',
});

/** A separate fictional home with exactly two eligible recorded sales, so the brief declines to state a value. */
export const SPARSE_STUDY_SUBJECT_ID = 'study-sparse-subject';
const place = { city: 'Arlington', state: 'VA', zip: '22207', sourceId: SAMPLE_SOURCE };
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
export const sparseStudyEvidence: StudioEvidence = {
  subject: {
    ...place,
    id: SPARSE_STUDY_SUBJECT_ID,
    address: '880 Example Quarry Lane',
    lat: 38.9012,
    lng: -77.1405,
    beds: 3,
    baths: 2,
    sqft: 1640,
    condition: 3,
    status: 'active',
  },
  candidates: [
    sold('study-s1', '874 Example Quarry Lane', 38.9016, -77.1398, 3, 2, 1580, 3, '2026-08-21', 742000),
    sold('study-s2', '1015 Example Ridge Road', 38.8961, -77.1452, 3, 2.5, 1720, 4, '2026-06-09', 801000),
    // Older than the 180-day limit: listed, but ruled out by the eligibility rules.
    sold('study-s3', '930 Example Quarry Lane', 38.9027, -77.1419, 3, 2, 1600, 3, '2026-02-17', 705000),
  ],
  sources: sampleEvidence.sources,
  asOf: SAMPLE_AS_OF,
};

export const sparseStudySchema = studioStateSchema(sparseStudyEvidence.candidates.map(p => p.id));

export const studyEvidence = (state: StudyState): StudioEvidence =>
  state === 'abstention' ? sparseStudyEvidence : sampleEvidence;
