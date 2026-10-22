/** Files of the external Maryland test, shared by its registration, data lock, scoring and supplement. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../src/lib/providers/dc-public-records';
import {
  abstentionStudy,
  countySlices,
  supplementPlan,
  transportStudy,
  type StudyRow,
} from '../src/lib/valuation-supplement';
import { digestOf, type ValidationReport } from '../src/lib/valuation-validation';
import type { EvidenceVerdict } from '../src/lib/valuation-verdict';

export const EXTERNAL = {
  registration: 'evidence/maryland-external-protocol-registration.json',
  lock: 'evidence/maryland-external-data-lock.json',
  dataset: 'evidence/datasets/maryland-external-sales.csv.gz',
  counties: 'evidence/datasets/maryland-external-parcel-counties.csv.gz',
  provenance: 'evidence/datasets/maryland-external.provenance.json',
  report: 'evidence/valuation-validation-maryland-external.json',
  samples: 'evidence/valuation-validation-maryland-external-samples.csv.gz',
  // Beside the other in-app benchmarks: the deployed app cannot read evidence/.
  benchmark: 'src/lib/valuation-benchmark-maryland-external.json',
  supplement: 'evidence/valuation-maryland-external-supplement.json',
  supplementSamples: 'evidence/valuation-maryland-external-supplement-samples.csv.gz',
  procedure: ['scripts/datasets/fetch-maryland.py', 'scripts/datasets/fetch-maryland-external.py'],
} as const;

/** Code that decides the supplementary results; its digests are registered, and any later change is reported. */
export const ANALYSIS = [
  'src/lib/valuation-supplement.ts',
  'src/lib/valuation-verdict.ts',
  'src/lib/valuation-safeguards.ts',
  'scripts/maryland-external-supplement.ts',
] as const;

/** Line endings are normalized so the digest is the same on every checkout. */
export const textDigest = (path: string) =>
  `sha256-${createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex')}`;

const gunzipText = (path: string) => gunzipSync(readFileSync(path)).toString('utf8');

/**
 * Checks the committed supplement without re-running it: registration and digests, every estimate against the
 * published report samples, and the verdict-policy, county and transport results re-derived from its samples.
 */
export function supplementChecks(report: ValidationReport) {
  if (!existsSync(EXTERNAL.supplement)) return [];
  const { digest, ...body } = JSON.parse(readFileSync(EXTERNAL.supplement, 'utf8'));
  const registration = JSON.parse(readFileSync(EXTERNAL.registration, 'utf8'));
  const text = gunzipText(EXTERNAL.supplementSamples);
  const [header, ...lines] = parseCsv(text);
  const field = (row: string[], key: string) => row[header.indexOf(key)];
  const amount = (row: string[], key: string) => (field(row, key) === '' ? null : Number(field(row, key)));
  const range = (row: string[], low: string, high: string) => {
    const [from, to] = [amount(row, low), amount(row, high)];
    return from === null || to === null ? null : { low: from, high: to };
  };
  const rows: StudyRow[] = lines.map(row => ({
    saleId: field(row, 'sale_id'),
    county: field(row, 'county'),
    actual: Number(field(row, 'actual')),
    estimate: amount(row, 'estimate'),
    comps: Number(field(row, 'comps')),
    verdict: (field(row, 'verdict') || null) as EvidenceVerdict | null,
    review: field(row, 'review') ? field(row, 'review').split(';') : [],
    interval: range(row, 'interval_low', 'interval_high'),
  }));
  const transported = lines.map(row => ({
    estimate: amount(row, 'transport_estimate'),
    actual: Number(field(row, 'actual')),
    interval: range(row, 'transport_low', 'transport_high'),
  }));
  const [sampleHeader, ...sampleRows] = parseCsv(gunzipText(EXTERNAL.samples));
  const estimate = sampleHeader.indexOf(`estimate:${report.protocol.primaryVariant}`);
  const published = new Map(sampleRows.map(row => [row[sampleHeader.indexOf('sale_id')], row[estimate]]));
  const changed: string[] = body.analysisChangedSinceRegistration;
  return [
    {
      label: 'Supplement registration',
      passed:
        body.planDigest === registration.supplementDigest &&
        body.baseReportDigest === report.reportDigest &&
        body.shippedReportDigest === supplementPlan.transport.reportDigest,
      detail: `Registered plan ${body.planDigest}, run on this report. Analysis code changed after registration: ${changed.join(', ') || 'none'}.`,
    },
    {
      label: 'Supplement digest',
      passed: digest === digestOf(body) && body.samplesDigest === digestOf(text),
      detail: `${digest}; samples ${body.samplesDigest}.`,
    },
    {
      label: 'Supplement estimates',
      passed:
        rows.length === published.size && rows.every(row => String(row.estimate ?? '') === published.get(row.saleId)),
      detail: `All ${rows.length} holdout estimates equal the published report samples.`,
    },
    {
      label: 'Recomputed verdict-policy study',
      passed: digestOf(abstentionStudy(rows)) === digestOf(body.abstention),
      detail: body.abstention.hypotheses
        .map((item: { id: string; outcome: string }) => `${item.id} ${item.outcome}`)
        .join('; '),
    },
    {
      label: 'Recomputed county slices and transport',
      passed:
        digestOf(countySlices(rows)) === digestOf(body.counties) &&
        digestOf(transportStudy(transported)) === digestOf(body.transport),
      detail: 'Vertical-equity candidates also use calibration-window estimates; the supplement digest covers them.',
    },
  ];
}
