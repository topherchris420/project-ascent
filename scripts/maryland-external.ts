/** Files of the external Maryland test, shared by its registration, data lock, scoring and supplement. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const EXTERNAL = {
  registration: 'evidence/maryland-external-protocol-registration.json',
  lock: 'evidence/maryland-external-data-lock.json',
  dataset: 'evidence/datasets/maryland-external-sales.csv.gz',
  counties: 'evidence/datasets/maryland-external-parcel-counties.csv.gz',
  provenance: 'evidence/datasets/maryland-external.provenance.json',
  report: 'evidence/valuation-validation-maryland-external.json',
  samples: 'evidence/valuation-validation-maryland-external-samples.csv.gz',
  benchmark: 'evidence/valuation-benchmark-maryland-external.json',
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
