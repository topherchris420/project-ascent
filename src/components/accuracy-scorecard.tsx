import { CheckCircle2, CircleX } from 'lucide-react';
import { kingCountyBenchmark, valuationBenchmark, type ValuationBenchmark } from '@/lib/valuation-safeguards';

type Criterion = ValuationBenchmark['acceptance'][number];
const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const points = (value: number) => `${(Math.abs(value) * 100).toFixed(1)} pts`;
const month = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const span = (window: { from: string; to: string }) => `${month(window.from)}–${month(window.to)}`;
const threshold = (item: Criterion) => {
  if (item.id === 'A7' || item.id === 'A8') return '95% upper bound below 0';
  const show = (value: number) => (item.id === 'A4' || item.id === 'A5' ? `${value}` : pct(value, 0));
  if (item.min !== undefined && item.max !== undefined) return `${show(item.min)}–${show(item.max)}`;
  return item.min !== undefined ? `≥ ${show(item.min)}` : `≤ ${show(item.max!)}`;
};
const measured = (item: Criterion) =>
  item.id === 'A4'
    ? item.value.toFixed(1)
    : item.id === 'A5'
      ? item.value.toFixed(3)
      : item.id === 'A7' || item.id === 'A8'
        ? `${(item.value * 100).toFixed(2)} pts`
        : pct(item.value, 2);

/** Passes whose own 95% interval reaches past the bar: met on this sample, not with statistical margin. */
function narrowPasses(benchmark: ValuationBenchmark) {
  const notes: string[] = [];
  const { primary, acceptance } = benchmark;
  const bar = (id: string) => acceptance.find(item => item.id === id);
  const a2 = bar('A2');
  if (a2?.passed && a2.max !== undefined && primary.mdapeCi95[1] > a2.max)
    notes.push(`median error ${pct(primary.mdapeCi95[0])}–${pct(primary.mdapeCi95[1])}`);
  const a3 = bar('A3');
  if (a3?.passed && a3.min !== undefined && primary.ppe10Ci95[0] < a3.min)
    notes.push(`share within ±10% ${pct(primary.ppe10Ci95[0])}–${pct(primary.ppe10Ci95[1])}`);
  return notes;
}

/** Published, pre-registered out-of-sample accuracy, misses included. Every figure comes from a committed report. */
export function AccuracyScorecard({ benchmark = valuationBenchmark }: { benchmark?: ValuationBenchmark }) {
  const primary = benchmark.primary;
  const zip = benchmark.paired.find(item => item.baseline === 'baseline-zip-median')!;
  const ppsf = benchmark.paired.find(item => item.baseline === 'baseline-median-ppsf')!;
  const passed = benchmark.acceptance.filter(item => item.passed).length;
  const narrow = narrowPasses(benchmark);
  const other = kingCountyBenchmark;
  return (
    <div className="lp-accuracy">
      <div className="lp-accuracy-stats">
        <div className="lp-accuracy-stat">
          <strong>{pct(primary.mdape)}</strong>
          <span>
            median error on {benchmark.holdout.sales.toLocaleString('en-US')} unseen {benchmark.market.label} sales
          </span>
          <small>
            95% CI {pct(primary.mdapeCi95[0])}–{pct(primary.mdapeCi95[1])}
          </small>
        </div>
        <div className="lp-accuracy-stat">
          <strong>{pct(primary.ppe10)}</strong>
          <span>within ±10% of the recorded price</span>
          <small>{pct(primary.ppe20)} within ±20%</small>
        </div>
        <div className="lp-accuracy-stat">
          <strong>{pct(benchmark.intervals.calibratedCoverage)}</strong>
          <span>of sales inside the calibrated {pct(benchmark.intervals.target, 0)} range</span>
          <small>the raw comparable envelope held {pct(benchmark.intervals.envelopeCoverage)}</small>
        </div>
        <div className="lp-accuracy-stat">
          <strong>{points(ppsf.mdapeDelta)}</strong>
          <span>lower median error than median $/sqft of the same sales</span>
          <small>{points(zip.mdapeDelta)} better than a trailing ZIP median</small>
        </div>
      </div>
      <div className="lp-accuracy-card">
        <div className="lp-accuracy-card-head">
          <h3>Pre-registered criteria · {benchmark.market.label}</h3>
          <span className={benchmark.accepted ? 'lp-accuracy-verdict pass' : 'lp-accuracy-verdict fail'}>
            {passed} of {benchmark.acceptance.length} met
          </span>
        </div>
        <ul className="lp-accuracy-list">
          {benchmark.acceptance.map(item => (
            <li key={item.id}>
              {item.passed ? (
                <CheckCircle2 size={16} className="pass" aria-hidden="true" />
              ) : (
                <CircleX size={16} className="fail" aria-hidden="true" />
              )}
              <span className="sr-only">{item.passed ? 'Met: ' : 'Not met: '}</span>
              <span className="lp-accuracy-label">{item.label}</span>
              <span className="lp-accuracy-value">
                {measured(item)} <em>target {threshold(item)}</em>
              </span>
            </li>
          ))}
        </ul>
        <p className="lp-accuracy-caveat">
          These figures use the {benchmark.market.label}-calibrated settings, which could value{' '}
          {pct(primary.valuedShare)} of the holdout sales. With Ascent&apos;s general default settings, the median error
          on the same sales was {pct(benchmark.shipped.mdape)}.
        </p>
        {narrow.length > 0 && (
          <p className="lp-accuracy-caveat">
            Met narrowly: the 95% intervals for {narrow.join(' and ')} include values on the wrong side of the bar.
          </p>
        )}
        <p className="lp-accuracy-foot">
          {benchmark.dataset.label} ({benchmark.dataset.license} public records). Rates were fitted on{' '}
          {span(benchmark.windows.fit)}, search filters chosen on {span(benchmark.windows.select)}, the interval
          calibrated on {span(benchmark.windows.calibrate)}, then {span(benchmark.windows.test)} was scored once.
          Thresholds were fixed before scoring and have not moved. Report{' '}
          <code title={benchmark.reportDigest}>{benchmark.reportDigest.slice(0, 19)}…</code> reproduces with{' '}
          <code>npm run validate:valuation -- --verify</code>.
        </p>
        {other.reportDigest !== benchmark.reportDigest && (
          <p className="lp-accuracy-foot">
            Also published: {other.market.label}, {span(other.windows.test)}, {pct(other.primary.mdape)} median error on{' '}
            {other.holdout.sales.toLocaleString('en-US')} sales, {other.acceptance.filter(item => item.passed).length}{' '}
            of {other.acceptance.length} criteria met. Results do not transfer between markets.
          </p>
        )}
      </div>
    </div>
  );
}
