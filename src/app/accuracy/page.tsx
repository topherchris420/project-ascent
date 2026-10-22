import Link from 'next/link';
import { AccuracyScorecard } from '@/components/accuracy-scorecard';
import { ReplicationStatus } from '@/components/replication-status';
import { marylandBenchmark, marylandRevisedBenchmark } from '@/lib/maryland-studio';
import { condoBenchmark } from '@/lib/dc-condo-studio';
import externalJson from '@/lib/valuation-benchmark-maryland-external.json';
import type { ValuationBenchmark } from '@/lib/valuation-safeguards';
import '../landing.css';

const marylandExternalBenchmark = externalJson as unknown as ValuationBenchmark;
export const metadata = { title: 'Published accuracy experiments · Ascent' };
export default function Page() {
  return (
    <main className="landing">
      <section className="lp-section">
        <div className="lp-wrap">
          <Link href="/">Return to Ascent</Link>
          <h1>Published accuracy experiments</h1>
          <p>
            Results are internal, reproducible measurements. Whether any outside researcher has reproduced them is shown
            below. Failed results remain public. Each population and time window has its own criteria; results do not
            transfer between them.
          </p>
          <ReplicationStatus />
          <h2>Maryland · revised model</h2>
          <AccuracyScorecard benchmark={marylandRevisedBenchmark} />
          <h2>Maryland · original failed experiment, unchanged</h2>
          <AccuracyScorecard benchmark={marylandBenchmark} />
          <h2>Maryland method · four other counties, registered before download</h2>
          <AccuracyScorecard benchmark={marylandExternalBenchmark} />
          <h2>DC condominiums · separate population test</h2>
          <AccuracyScorecard benchmark={condoBenchmark} />
        </div>
      </section>
    </main>
  );
}
