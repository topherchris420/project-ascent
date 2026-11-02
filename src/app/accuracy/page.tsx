import type { Metadata } from 'next';
import { AccuracyScorecard } from '@/components/accuracy-scorecard';
import { ReplicationStatus } from '@/components/replication-status';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { marylandBenchmark, marylandRevisedBenchmark } from '@/lib/maryland-studio';
import { condoBenchmark } from '@/lib/dc-condo-studio';
import externalJson from '@/lib/valuation-benchmark-maryland-external.json';
import { valuationBenchmark, type ValuationBenchmark } from '@/lib/valuation-safeguards';
import '../landing.css';

const marylandExternalBenchmark = externalJson as unknown as ValuationBenchmark;

export const metadata: Metadata = {
  title: 'Published accuracy experiments · Ascent',
  description:
    'Every pre-registered valuation study Ascent has run, including the ones that failed: held-out sales, median error, criteria met and what each result does not show.',
};

/** Every published study, in coverage order: the validated DC market first, failures alongside it, none omitted. */
const STUDIES: readonly { id: string; title: string; short: string; benchmark: ValuationBenchmark }[] = [
  {
    id: 'dc-houses',
    title: 'Washington, DC · houses and rowhomes',
    short: 'DC houses and rowhomes',
    benchmark: valuationBenchmark,
  },
  {
    id: 'maryland-revised',
    title: 'Maryland · revised model',
    short: 'Montgomery & Prince George’s, revised',
    benchmark: marylandRevisedBenchmark,
  },
  {
    id: 'maryland-original',
    title: 'Maryland · original failed experiment, unchanged',
    short: 'Montgomery & Prince George’s, original',
    benchmark: marylandBenchmark,
  },
  {
    id: 'maryland-external',
    title: 'Maryland method · four other counties, registered before download',
    short: 'Four other Maryland counties',
    benchmark: marylandExternalBenchmark,
  },
  {
    id: 'dc-condos',
    title: 'DC condominiums · separate population test',
    short: 'DC condominiums',
    benchmark: condoBenchmark,
  },
];

// Two decimals, as in each study's criteria list: 9.98% must not read as the 10% bar itself.
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

export default function AccuracyPage() {
  return (
    <div className="studio-page accuracy-page">
      <a className="skip-link" href="#accuracy-main">
        Skip to the published results
      </a>
      <SiteHeader label="Accuracy" current="accuracy" />
      <main id="accuracy-main" className="landing accuracy-main">
        <section className="lp-section">
          <div className="lp-wrap">
            <span className="lp-eyebrow">The published record</span>
            <h1>Published accuracy experiments</h1>
            <p>
              Results are internal, reproducible measurements. Whether any outside researcher has reproduced them is
              shown below. Failed results remain public. Each population and time window has its own criteria; results
              do not transfer between them.
            </p>

            <div className="accuracy-summary">
              <div className="accuracy-table-wrap" role="region" aria-labelledby="accuracy-summary-title" tabIndex={0}>
                <table className="accuracy-table">
                  <caption id="accuracy-summary-title">{STUDIES.length} pre-registered studies at a glance</caption>
                  <thead>
                    <tr>
                      <th scope="col">Study</th>
                      <th scope="col" className="num">
                        Held-out sales
                      </th>
                      <th scope="col" className="num">
                        Median error
                      </th>
                      <th scope="col" className="num">
                        Within ±10%
                      </th>
                      <th scope="col" className="num">
                        Criteria met
                      </th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STUDIES.map(({ id, short, benchmark }) => {
                      const met = benchmark.acceptance.filter(item => item.passed).length;
                      return (
                        <tr key={id}>
                          <th scope="row">
                            <a href={`#${id}`}>{short}</a>
                          </th>
                          <td className="num">{benchmark.holdout.sales.toLocaleString('en-US')}</td>
                          <td className="num">{pct(benchmark.primary.mdape)}</td>
                          <td className="num">{pct(benchmark.primary.ppe10)}</td>
                          <td className="num">
                            {met} of {benchmark.acceptance.length}
                          </td>
                          <td>
                            <span className={`accuracy-result ${benchmark.accepted ? 'pass' : 'fail'}`}>
                              {benchmark.accepted ? 'Met acceptance' : 'Did not meet acceptance'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="accuracy-fine">
                Median error describes the group of sales tested, not the likely error for any particular home. These
                are not appraisals, guarantees or independently certified results.
              </p>
            </div>

            <ReplicationStatus />

            {STUDIES.map(({ id, title, benchmark }) => (
              <section key={id} id={id} className="accuracy-study" aria-labelledby={`${id}-title`}>
                <h2 id={`${id}-title`}>{title}</h2>
                <AccuracyScorecard benchmark={benchmark} />
              </section>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
