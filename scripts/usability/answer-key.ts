/**
 * Writes the facilitators' answer key from the prepared states on this commit.
 *
 *   npm run usability:answer-key
 *
 * The key changes whenever the brief, the sample or the finance engine does; a unit test fails until it is
 * regenerated, so sessions are always scored against what participants actually saw.
 */
import { writeFileSync } from 'node:fs';
import { answerKeyMarkdown } from '../../src/lib/usability-study';
import { ANSWER_KEY } from './files';

writeFileSync(ANSWER_KEY, answerKeyMarkdown());
console.log(`Wrote ${ANSWER_KEY}.`);
