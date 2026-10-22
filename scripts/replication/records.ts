/** Signed independent replication records on disk, shared by `validate:valuation --check` and the signing tool. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  REPLICATION_SCHEMA,
  replicationRecordSchema,
  replicationRubric,
  replicationSummary,
  verifyReplicationRecord,
  type PublishedReport,
  type ReplicationSummary,
} from '../../src/lib/replication';
import { digestOf, type ValidationReport } from '../../src/lib/valuation-validation';

export const REPLICATIONS = 'evidence/replications';
/** Beside the in-app benchmarks: the deployed accuracy page cannot read evidence/. */
export const REPLICATION_SUMMARIES = 'src/lib/replication-records.json';

/** Every published validation report, as the Python re-derivation finds them. */
export function publishedReports(): PublishedReport[] {
  return readdirSync('evidence')
    .filter(name => /^valuation-validation.*\.json$/.test(name))
    .sort()
    .map(name => {
      const report = JSON.parse(readFileSync(`evidence/${name}`, 'utf8')) as ValidationReport;
      return { protocolId: report.protocol.id, reportDigest: report.reportDigest };
    });
}

export const readAssessment = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

export function recordFiles() {
  return existsSync(REPLICATIONS)
    ? readdirSync(REPLICATIONS)
        .filter(name => name.endsWith('.json'))
        .sort()
    : [];
}

/** Summaries of the records that verify, in file order: exactly what the accuracy page displays. */
export function verifiedSummaries(published = publishedReports()): ReplicationSummary[] {
  return recordFiles().flatMap(name => {
    const raw = JSON.parse(readFileSync(`${REPLICATIONS}/${name}`, 'utf8'));
    return verifyReplicationRecord(raw, published, readAssessment).every(check => check.passed)
      ? [replicationSummary(replicationRecordSchema.parse(raw))]
      : [];
  });
}

export function replicationChecks() {
  const published = publishedReports();
  const files = recordFiles();
  const checks = files.flatMap(name =>
    verifyReplicationRecord(JSON.parse(readFileSync(`${REPLICATIONS}/${name}`, 'utf8')), published, readAssessment),
  );
  const summaries = verifiedSummaries(published);
  const committed = existsSync(REPLICATION_SUMMARIES) ? JSON.parse(readFileSync(REPLICATION_SUMMARIES, 'utf8')) : null;
  checks.push({
    label: 'In-app replication summaries',
    passed: committed !== null && digestOf(committed) === digestOf(summaries),
    detail: `${summaries.length} verified record${summaries.length === 1 ? '' : 's'}; ${REPLICATION_SUMMARIES} shows exactly these.`,
  });
  return { records: files.length, checks };
}

export function writeSummaries() {
  writeFileSync(REPLICATION_SUMMARIES, `${JSON.stringify(verifiedSummaries(), null, 2)}\n`);
}

/** Marks every field of a draft the reviewer must complete; the signing tool refuses drafts that still contain it. */
export const PLACEHOLDER = 'REPLACE';

/** A draft with every field present; the reviewer replaces each REPLACE text and every outcome they attempted. */
export function blankDraft(commit = `${PLACEHOLDER}-with-the-40-character-commit-you-reviewed`) {
  return {
    schema: REPLICATION_SCHEMA,
    reviewer: {
      name: `${PLACEHOLDER}: your name`,
      affiliation: `${PLACEHOLDER}: your organization, or "Independent"`,
      keyPublishedAt: `https://${PLACEHOLDER}.example/where-you-publish-your-public-key`,
    },
    independence: {
      statement: `${PLACEHOLDER}: how you are independent of Ascent and its maintainers`,
      conflicts: `${PLACEHOLDER}: any financial, professional or personal relationship, or "None"`,
      compensation: `${PLACEHOLDER}: who paid you and how much, or "Unpaid"`,
    },
    commit,
    environment: `${PLACEHOLDER}: operating system, Node.js and Python versions, hardware`,
    studies: publishedReports().map(report => ({
      ...report,
      rederive: 'not-attempted',
      rerun: 'not-attempted',
      reimplement: 'not-attempted',
      refetch: 'not-attempted',
      notes: '',
    })),
    findings: replicationRubric.map(item => ({
      area: item.id,
      rating: 'not-assessed',
      summary: `Not assessed. (${item.question})`,
    })),
    conclusion: {
      reproduction: 'none',
      methodology: 'not-assessed',
      statement: `${PLACEHOLDER}: your overall conclusion in your own words, including anything you could not reproduce`,
    },
  };
}
