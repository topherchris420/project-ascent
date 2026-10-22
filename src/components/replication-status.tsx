import type { ReplicationSummary } from '@/lib/replication';
import recordsJson from '@/lib/replication-records.json';

const records = recordsJson as unknown as ReplicationSummary[];
const REPO = 'https://github.com/topherchris420/project-ascent/blob/master';
const reproductionText: Record<ReplicationSummary['reproduction'], string> = {
  all: 'Reproduced every study it covered',
  some: 'Reproduced some of the studies it covered',
  none: 'Did not reproduce the studies it covered',
};
const methodologyText: Record<ReplicationSummary['methodology'], string> = {
  sound: 'Methodology judged sound',
  'sound-with-reservations': 'Methodology judged sound, with reservations',
  unsound: 'Methodology judged unsound',
  'not-assessed': 'Methodology not assessed',
};
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Outside replications of the published studies, verified on every evidence check; none is shown as a pass by default. */
export function ReplicationStatus() {
  return (
    <section className="lp-accuracy-card lp-replication" aria-labelledby="replication-title">
      <h2 id="replication-title">Independent replication</h2>
      {records.length === 0 ? (
        <>
          <p data-testid="replication-none">
            <strong>No outside researcher has reproduced these results or assessed the methodology yet.</strong> Until
            one does, treat every figure on this page as reproducible internal validation, not independent confirmation.
          </p>
          <p>
            Ascent publishes a replication kit for outside quantitative researchers: one command that re-checks every
            report, an independent Python re-derivation of every published figure, a method specification for
            reimplementing the valuations, and a signed record for their conclusions. Unfavorable conclusions are
            published like favorable ones.
          </p>
        </>
      ) : (
        <ul className="lp-replication-list">
          {records.map(record => (
            <li key={record.recordDigest}>
              <h3>
                {record.reviewer}, {record.affiliation}
              </h3>
              <p className="lp-accuracy-foot">
                Signed {day(record.signedAt)} · reviewed commit <code>{record.commit.slice(0, 12)}</code> ·{' '}
                <a href={record.keyPublishedAt}>reviewer’s published key</a>
              </p>
              <p>
                <strong>{reproductionText[record.reproduction]}.</strong> {methodologyText[record.methodology]}.
                {record.concerns.critical + record.concerns.major + record.concerns.minor > 0 &&
                  ` Concerns raised: ${record.concerns.critical} critical, ${record.concerns.major} major, ${record.concerns.minor} minor.`}
              </p>
              <blockquote>{record.statement}</blockquote>
              <p className="lp-accuracy-foot">
                <a href={`${REPO}/${record.assessmentFile}`}>Read the full assessment</a> ·{' '}
                {record.studies
                  .map(study => `${study.protocolId} ${study.reproduced ? 'reproduced' : 'not reproduced'}`)
                  .join('; ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="lp-accuracy-foot">
        <a href={`${REPO}/docs/independent-replication.md`}>How to replicate these studies</a> · Signed records are
        checked by <code>npm run validate:valuation -- --check</code>.
      </p>
    </section>
  );
}
