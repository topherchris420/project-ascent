/** Where the comprehension study's registration, results and published reports live. */
export const REGISTRATION = 'evidence/usability/registration.json';
/** One directory per study: results.json as entered, report.json as analyzed. */
export const RESULTS_DIRECTORY = 'evidence/usability';
export const ANSWER_KEY = 'docs/usability/answer-key.md';
export const resultsPath = (studyId: string) => `${RESULTS_DIRECTORY}/${studyId}/results.json`;
export const reportPath = (studyId: string) => `${RESULTS_DIRECTORY}/${studyId}/report.json`;
export const publishedPath = (studyId: string) => `docs/usability/results-${studyId}.md`;
