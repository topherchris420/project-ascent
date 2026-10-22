import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson, digestOf, type VerificationCheck } from './valuation-validation';

/**
 * Independent replication records: an outside researcher's signed account of what they reproduced from
 * Ascent's published validation studies and how they assess the methodology. A record names the exact
 * commit reviewed, rates every area of the rubric below (or says it was not assessed), and carries the
 * digest of a narrative assessment committed beside it. Records are verified on every
 * `npm run validate:valuation -- --check`; unfavorable conclusions are published like any other.
 */
export const REPLICATION_SCHEMA = 'ascent-replication-record-1';

/** What a replication can attempt, from minutes of work to days. */
export const replicationLevels = [
  {
    id: 'rederive',
    title: 'Re-derive every published figure from the per-sale samples',
    how: 'python3 -I scripts/replication/rederive.py, or your own code from the data dictionary',
  },
  {
    id: 'rerun',
    title: 'Re-run the valuation engine from the bundled datasets and require byte-identical reports',
    how: 'npm run validate:valuation -- --verify --market <id>',
  },
  {
    id: 'reimplement',
    title: 'Reimplement the method independently and compare per-sale estimates',
    how: 'docs/replication/method-specification.md',
  },
  {
    id: 'refetch',
    title: 'Re-fetch the source records and compare them with the bundled snapshots',
    how: 'scripts/datasets/*.py and the provenance files',
  },
] as const;
export type ReplicationLevel = (typeof replicationLevels)[number]['id'];

/** The methodology questions every record answers. Each is rated, or explicitly marked not assessed. */
export const replicationRubric = [
  {
    id: 'data-provenance',
    title: 'Data provenance and screening',
    question:
      'Are the datasets what their provenance files claim (sources, licenses, fingerprints), and are the import and screening rules blind to sale prices and valuation errors?',
  },
  {
    id: 'leakage',
    title: 'Look-ahead and leakage',
    question:
      'Could a holdout price or any later information reach an estimate: same-day or later sales, the home’s own sales, or characteristics recorded after a sale?',
  },
  {
    id: 'windows-and-selection',
    title: 'Windows, fitting and selection',
    question:
      'Are the fit, selection, calibration and test windows disjoint and ordered, and was each choice made only on its own window?',
  },
  {
    id: 'preregistration',
    title: 'Pre-registration integrity',
    question:
      'Do the protocol digests, registrations, data locks and commit history show that thresholds and analyses were fixed before scoring?',
  },
  {
    id: 'metrics',
    title: 'Metric definitions and arithmetic',
    question:
      'Are MdAPE, PPE10, COD, PRD, median signed error and interval coverage defined and computed as stated, consistent with the IAAO Standard on Ratio Studies where cited?',
  },
  {
    id: 'baselines',
    title: 'Baselines and comparisons',
    question:
      'Are the median $/sqft and trailing ZIP-median baselines fair, correctly implemented and compared on the same sales?',
  },
  {
    id: 'uncertainty',
    title: 'Uncertainty and intervals',
    question:
      'Are the bootstrap intervals and the split-conformal interval valid for these data, given correlated sales (shared buildings, neighborhoods, periods) and possible non-exchangeability?',
  },
  {
    id: 'interpretation',
    title: 'Reporting and interpretation',
    question:
      'Do the documentation and the product report passes, narrow passes and failures faithfully, without overstating accuracy or certainty?',
  },
  {
    id: 'generalization',
    title: 'Scope of claims',
    question:
      'Do the claims stay within the markets, periods, property types and configurations that were actually tested?',
  },
  {
    id: 'verdict-policy',
    title: 'Home Decision Brief verdict policy',
    question:
      'Does the registered supplement support how the product uses its verdict policy to state, limit or decline a value?',
  },
] as const;
export type RubricArea = (typeof replicationRubric)[number]['id'];
const rubricIds = replicationRubric.map(item => item.id) as [RubricArea, ...RubricArea[]];

const outcome = z.enum(['reproduced', 'differs', 'not-attempted']);
const prose = (min: number, max: number) => z.string().trim().min(min).max(max);
export const replicationRecordSchema = z
  .object({
    schema: z.literal(REPLICATION_SCHEMA),
    reviewer: z
      .object({
        name: prose(2, 200),
        affiliation: prose(2, 300),
        publicKeyPem: z.string().max(1000),
        /** Where the reviewer publishes this key, so readers can tie the signature to the person. */
        keyPublishedAt: z.url().max(500),
      })
      .strict(),
    independence: z
      .object({
        statement: prose(20, 4000),
        conflicts: prose(2, 4000),
        compensation: prose(2, 2000),
      })
      .strict(),
    /** The exact commit the reviewer worked from. */
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    environment: prose(2, 2000),
    studies: z
      .array(
        z
          .object({
            protocolId: prose(1, 200),
            reportDigest: z.string().regex(/^sha256-[0-9a-f]{64}$/),
            rederive: outcome,
            rerun: outcome,
            reimplement: outcome,
            refetch: outcome,
            notes: z.string().max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    findings: z
      .array(
        z
          .object({
            area: z.enum(rubricIds),
            rating: z.enum(['no-concern', 'minor', 'major', 'critical', 'not-assessed']),
            summary: prose(2, 4000),
          })
          .strict(),
      )
      .length(replicationRubric.length),
    conclusion: z
      .object({
        reproduction: z.enum(['all', 'some', 'none']),
        methodology: z.enum(['sound', 'sound-with-reservations', 'unsound', 'not-assessed']),
        statement: prose(20, 8000),
      })
      .strict(),
    assessment: z
      .object({
        file: z.string().regex(/^evidence\/replications\/[a-z0-9][a-z0-9-]*\.md$/),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    signedAt: z.iso.datetime(),
    signature: z.string().max(200),
  })
  .strict();
export type ReplicationRecord = z.infer<typeof replicationRecordSchema>;
export type ReplicationStudy = ReplicationRecord['studies'][number];

/** The exact bytes a reviewer signs: everything in the record except the signature. */
export const replicationMessage = (record: Omit<ReplicationRecord, 'signature'>) =>
  `ascent-replication-record-v1\n${canonicalJson({ ...record, signature: undefined })}`;

/** Line endings are normalized so a Windows checkout verifies the same assessment text. */
export const assessmentDigest = (text: string) =>
  createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

/** A study counts as reproduced when some level reproduced it and no level found a difference. */
export const studyReproduced = (study: ReplicationStudy) => {
  const levels = [study.rederive, study.rerun, study.reimplement, study.refetch];
  return levels.includes('reproduced') && !levels.includes('differs');
};
export function reproductionSummary(studies: ReplicationStudy[]): ReplicationRecord['conclusion']['reproduction'] {
  const reproduced = studies.filter(studyReproduced).length;
  return reproduced === studies.length ? 'all' : reproduced === 0 ? 'none' : 'some';
}

export type PublishedReport = { protocolId: string; reportDigest: string };
/**
 * Every check a record must pass before the product displays it: shape, the rubric answered in full, studies
 * that exist, a conclusion consistent with its own study results, the committed assessment and the signature.
 */
export function verifyReplicationRecord(
  raw: unknown,
  published: readonly PublishedReport[],
  readAssessment: (file: string) => string | null,
): VerificationCheck[] {
  const parsed = replicationRecordSchema.safeParse(raw);
  const name =
    typeof raw === 'object' && raw && 'reviewer' in raw
      ? String((raw as { reviewer?: { name?: unknown } }).reviewer?.name ?? 'unknown reviewer')
      : 'unknown reviewer';
  if (!parsed.success)
    return [
      {
        label: `Replication by ${name}: format`,
        passed: false,
        detail: parsed.error.issues
          .slice(0, 3)
          .map(issue => `${issue.path.join('.') || 'record'}: ${issue.message}`)
          .join('; '),
      },
    ];
  const record = parsed.data;
  const label = (what: string) => `Replication by ${record.reviewer.name}: ${what}`;
  const checks: VerificationCheck[] = [];
  const areas = new Set(record.findings.map(item => item.area));
  checks.push({
    label: label('rubric'),
    passed: areas.size === replicationRubric.length,
    detail: `${areas.size} of ${replicationRubric.length} areas rated or marked not assessed.`,
  });
  const unknown = record.studies.filter(
    study =>
      !published.some(report => report.reportDigest === study.reportDigest && report.protocolId === study.protocolId),
  );
  checks.push({
    label: label('studies'),
    passed: !unknown.length && new Set(record.studies.map(study => study.reportDigest)).size === record.studies.length,
    detail: unknown.length
      ? `Not a published report: ${unknown.map(study => study.reportDigest.slice(0, 19)).join(', ')}.`
      : `${record.studies.length} published report${record.studies.length === 1 ? '' : 's'}, each named once.`,
  });
  const summary = reproductionSummary(record.studies);
  checks.push({
    label: label('conclusion'),
    passed: summary === record.conclusion.reproduction,
    detail: `Study results say ${summary} reproduced; the conclusion says ${record.conclusion.reproduction}.`,
  });
  const text = readAssessment(record.assessment.file);
  const intact = text !== null && assessmentDigest(text) === record.assessment.sha256;
  checks.push({
    label: label('assessment'),
    passed: intact,
    detail:
      text === null
        ? `${record.assessment.file} is missing.`
        : intact
          ? `${record.assessment.file} matches its digest.`
          : `${record.assessment.file} changed after it was signed.`,
  });
  let signed = false;
  let detail = 'Ed25519 signature verifies against the stated public key.';
  try {
    const key = createPublicKey(record.reviewer.publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') detail = 'The public key is not an Ed25519 key.';
    else {
      const { signature, ...body } = record;
      signed = verifySignature(null, Buffer.from(replicationMessage(body)), key, Buffer.from(signature, 'base64'));
      if (!signed) detail = 'Signature does not verify.';
    }
  } catch {
    detail = 'Public key or signature is malformed.';
  }
  checks.push({ label: label('signature'), passed: signed, detail });
  return checks;
}

/** What the product displays for a verified record; the full record and assessment stay in the repository. */
export type ReplicationSummary = {
  recordDigest: string;
  reviewer: string;
  affiliation: string;
  keyPublishedAt: string;
  signedAt: string;
  commit: string;
  reproduction: ReplicationRecord['conclusion']['reproduction'];
  methodology: ReplicationRecord['conclusion']['methodology'];
  statement: string;
  studies: { protocolId: string; reproduced: boolean }[];
  concerns: Record<'minor' | 'major' | 'critical', number>;
  assessmentFile: string;
};
export function replicationSummary(record: ReplicationRecord): ReplicationSummary {
  const count = (rating: 'minor' | 'major' | 'critical') =>
    record.findings.filter(item => item.rating === rating).length;
  return {
    recordDigest: digestOf(record),
    reviewer: record.reviewer.name,
    affiliation: record.reviewer.affiliation,
    keyPublishedAt: record.reviewer.keyPublishedAt,
    signedAt: record.signedAt,
    commit: record.commit,
    reproduction: record.conclusion.reproduction,
    methodology: record.conclusion.methodology,
    statement: record.conclusion.statement,
    studies: record.studies.map(study => ({ protocolId: study.protocolId, reproduced: studyReproduced(study) })),
    concerns: { minor: count('minor'), major: count('major'), critical: count('critical') },
    assessmentFile: record.assessment.file,
  };
}
