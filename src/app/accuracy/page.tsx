import Link from 'next/link';
import { AccuracyScorecard } from '@/components/accuracy-scorecard';
import { marylandBenchmark, marylandRevisedBenchmark } from '@/lib/maryland-studio';
import { condoBenchmark } from '@/lib/dc-condo-studio';
import '../landing.css';
export const metadata = { title: 'Published accuracy experiments · Ascent' };
export default function Page() {
  return (
    <main className="landing">
      <section className="lp-section">
        <div className="lp-wrap">
          <Link href="/">Return to Ascent</Link>
          <h1>Published accuracy experiments</h1>
          <p>
            Results are internal, reproducible measurements. Independent professional certification is pending. Failed
            results remain public. Each population and time window has its own criteria; results do not transfer between
            them.
          </p>
          <h2>Maryland · revised model</h2>
          <AccuracyScorecard benchmark={marylandRevisedBenchmark} />
          <h2>Maryland · original failed experiment, unchanged</h2>
          <AccuracyScorecard benchmark={marylandBenchmark} />
          <h2>DC condominiums · separate population test</h2>
          <AccuracyScorecard benchmark={condoBenchmark} />
        </div>
      </section>
    </main>
  );
}
