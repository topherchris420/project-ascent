import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { calculateCma, compareOffers, evaluateOutcomes, simulatePricing, summarizeMarket } from '../src/lib/analytics';
import { createDemoWorkspace } from '../src/lib/seed';
import { activePropertyIds, applyFabricProjection, bootstrapFabric, regionalAssumptions } from '../src/lib/fabric';

async function main() {
const workspace = createDemoWorkspace();
const subject = workspace.properties[0];
const cma = calculateCma(subject, workspace.properties, {}, workspace.asOf);
const trials = 200;
const measure = (fn: () => unknown) => {
  for (let warmup = 0; warmup < 20; warmup++) fn();
  const durations: number[] = [];
  for (let index = 0; index < trials; index++) { const start = performance.now(); fn(); durations.push(performance.now() - start); }
  durations.sort((a, b) => a - b);
  return { trials, medianMs: Number(durations[Math.floor(trials * 0.5)].toFixed(4)), p95Ms: Number(durations[Math.floor(trials * 0.95)].toFixed(4)), maxMs: Number(durations.at(-1)!.toFixed(4)) };
};
const national = createDemoWorkspace(); const fabric = bootstrapFabric(national); applyFabricProjection(national, { credentialVerified: false });
const regionalBenchmarks = ['dmv','austin'].map(regionId => {
  const ids = new Set(activePropertyIds(fabric, regionId)); const properties = national.properties.filter(property => ids.has(property.id)); const subject = properties.find(property => property.status === 'active')!;
  const assumptions = regionalAssumptions(regionId); const result = calculateCma(subject,properties,assumptions,national.asOf);
  return { regionId, mode:'synthetic', properties:properties.length, comparableCount:result.comps.length, estimate:result.estimate, checksum:result.calculationHash, timing:measure(()=>calculateCma(subject,properties,assumptions,national.asOf)) };
});
const result = {
  generatedAt: new Date().toISOString(), runtime: process.version, platform: `${process.platform}-${process.arch}`, datasetAsOf: workspace.asOf,
  scope: 'Local in-process synthetic-fixture microbenchmarks only. No network, AI-provider, database, browser, or Homesolo measurements. Timing is machine-specific and is not a claim of competitive superiority.',
  dataset: { properties: workspace.properties.length, comparables: cma.comps.length, offers: workspace.offers.length, outcomes: workspace.outcomes.length },
  methods: { warmup: 20, trials, clock: 'node:perf_hooks performance.now', outlierPolicy: 'none removed' },
  timings: { cma: measure(() => calculateCma(subject, workspace.properties, {}, workspace.asOf)), market: measure(() => summarizeMarket(workspace.properties, workspace.asOf)), scenario: measure(() => simulatePricing(cma, 725000)), offers: measure(() => compareOffers(workspace.offers, workspace.asOf)) },
  regionalBenchmarks,
  reproducibility: { cmaChecksum: cma.calculationHash, estimate: cma.estimate, empiricalAdjustedCompRange: [cma.low, cma.high] },
  syntheticRetrospectiveEvaluation: evaluateOutcomes(workspace.cmas, workspace.outcomes),
  missingBenchmarks: ['Live-market accuracy/calibration and paired baseline', 'End-to-end task completion against Homesolo', 'AI factual grounding against a human-adjudicated question set', 'Live integration freshness and error rates', 'Database and storage performance under concurrent tenant load', 'Production report/browser response time'],
};
await mkdir('evidence', { recursive: true });
await writeFile('evidence/benchmark-results.json', `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
