import { CheckCircle2, CircleX } from 'lucide-react';
import { valuationBenchmark as benchmark } from '@/lib/valuation-safeguards';

const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const points = (value: number) => `${(Math.abs(value) * 100).toFixed(1)} pts`;
const threshold = (item: (typeof benchmark.acceptance)[number]) => {
  if (item.id === 'A7' || item.id === 'A8') return '95% upper bound below 0';
  const show = (value: number) => (item.id === 'A4' || item.id === 'A5' ? `${value}` : pct(value, 0));
  if (item.min !== undefined && item.max !== undefined) return `${show(item.min)}–${show(item.max)}`;
  return item.min !== undefined ? `≥ ${show(item.min)}` : `≤ ${show(item.max!)}`;
};
const measured = (item: (typeof benchmark.acceptance)[number]) =>
  item.id === 'A4'
    ? item.value.toFixed(1)
    : item.id === 'A5'
      ? item.value.toFixed(3)
      : item.id === 'A7' || item.id === 'A8'
        ? `${(item.value * 100).toFixed(2)} pts`
        : pct(item.value);

/** Published, pre-registered out-of-sample accuracy, failures included. Every figure comes from the committed report. */
export function AccuracyScorecard() {
  const primary = benchmark.primary;
  const zip = benchmark.paired.find(item => item.baseline === 'baseline-zip-median')!;
  const ppsf = benchmark.paired.find(item => item.baseline === 'baseline-median-ppsf')!;
  const passed = benchmark.acceptance.filter(item => item.passed).length;
  return (
    <div className="lp-accuracy">
      <div className="lp-accuracy-stats">
        <div className="lp-accuracy-stat">
          <strong>{pct(primary.mdape)}</strong>
          <span>median error on {benchmark.holdout.sales.toLocaleString('en-US')} unseen sales</span>
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
          <strong>{points(zip.mdapeDelta)}</strong>
          <span>lower median error than a trailing ZIP median</span>
          <small>{points(ppsf.mdapeDelta)} better than median $/sqft of the same sales</small>
        </div>
      </div>
      <div className="lp-accuracy-card">
        <div className="lp-accuracy-card-head">
          <h3>Pre-registered criteria</h3>
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
        <p className="lp-accuracy-foot">
          {benchmark.dataset.label} ({benchmark.dataset.license} public records). Rates were fitted on May–Aug 2014,
          search filters chosen on Sep–Oct, the interval calibrated on Nov–Dec, then {benchmark.holdout.from} to{' '}
          {benchmark.holdout.to} was scored once. Thresholds were fixed before scoring and have not moved. Measured in
          that market only; it is not a claim about any other market. Report{' '}
          <code title={benchmark.reportDigest}>{benchmark.reportDigest.slice(0, 19)}…</code> reproduces with{' '}
          <code>npm run validate:valuation -- --verify</code>.
        </p>
      </div>
    </div>
  );
}
