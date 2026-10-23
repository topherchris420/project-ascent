/**
 * Refreshes the public sources that report records newer than the bundled snapshots, and writes a dated, reproducible
 * ingestion record with a data-quality report. It never changes a snapshot, a fingerprint or an estimate.
 *
 *   npm run sources:refresh                 run every refresh and write evidence/ingestion/<date>.json
 *   npm run sources:refresh -- --check      re-run and report whether each source still returns the recorded content
 *   npm run sources:refresh -- --dry-run    run and print without writing
 *
 * The record keeps each manifest, every normalized observation (parcel, dates and price; never an owner) and the
 * quality measures: coverage of covered homes, field completeness, duplicates, conflicts, unresolved identities and
 * how stale the newest record is. A later --check that differs means the live source changed, which is expected.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dcSalesAdapter, fhfaIndexAdapter, mdSdatAdapter, WASHINGTON_MSAD } from '../../src/lib/sources/adapters';
import { ingest, type IngestionResult } from '../../src/lib/sources/ingest';
import { canonicalJson, sha256 } from '../../src/lib/sources/observations';
import { publicSource, SOURCE_REGISTRY_VERSION } from '../../src/lib/sources/registry';
import { dcData } from '../../src/lib/providers/dc-public-records';
import { condoData } from '../../src/lib/providers/dc-condo-public-records';
import { marylandData } from '../../src/lib/providers/maryland-public-records';

const DIRECTORY = join(process.cwd(), 'evidence', 'ingestion');
const args = new Set(process.argv.slice(2));
const DAY = 86_400_000;

type Run = { label: string; market: string; result: IngestionResult; covered: Set<string>[] };

function quality(run: Run, now: number) {
  const { manifest, observations } = run.result;
  const transfers = observations.filter(item => item.kind === 'recorded-transfer');
  const resolved = transfers.filter(item => run.covered.some(set => set.has(item.parcelId ?? '')));
  const withPrice = transfers.filter(item => typeof item.values.price === 'number');
  const newest =
    transfers
      .map(item => item.dates.transaction!)
      .toSorted()
      .at(-1) ?? null;
  return {
    received: manifest.received,
    valid: manifest.valid,
    invalidByReason: manifest.invalid,
    fieldCompleteness: transfers.length ? Number((withPrice.length / transfers.length).toFixed(4)) : null,
    duplicates: manifest.duplicates,
    conflicts: manifest.conflicts.length,
    coveredHomes: resolved.length,
    unresolvedIdentities: transfers.length - resolved.length,
    unresolvedNote:
      'An unresolved identity is a lot outside Ascent’s covered homes (commercial, multi-unit, outside the counties or filtered when the snapshot was built), not necessarily an error.',
    newestTransaction: newest,
    newestTransactionAgeDays: newest ? Math.floor((now - Date.parse(`${newest}T00:00:00Z`)) / DAY) : null,
    sourcePublishedAt: manifest.publishedAt,
  };
}

async function runAll(now: Date) {
  const context = { now: () => now };
  const dc = dcData();
  const condos = condoData();
  const md = marylandData();
  const dcAfter = [dc.salesProvenance.lastSale!, condos.salesProvenance.lastSale].toSorted()[0];
  const runs: Run[] = [
    {
      label: 'District qualified sales after the earlier snapshot',
      market: 'dc and dc-condos',
      result: await ingest(dcSalesAdapter, { after: dcAfter }, context),
      covered: [new Set(dc.parcels.keys()), new Set(condos.parcels.keys())],
    },
    {
      label: 'Montgomery and Prince George’s transfers after the Maryland snapshot',
      market: 'maryland',
      result: await ingest(mdSdatAdapter, { after: md.provenance.lastSale }, context),
      covered: [new Set(md.parcels.keys())],
    },
    {
      label: `Price index for ${WASHINGTON_MSAD.name}`,
      market: 'regional',
      result: await ingest(fhfaIndexAdapter, { cbsa: WASHINGTON_MSAD.cbsa }, context),
      covered: [],
    },
  ];
  return {
    runs,
    snapshots: {
      dcHouses: dc.salesProvenance.lastSale,
      dcCondos: condos.salesProvenance.lastSale,
      maryland: md.provenance.lastSale,
    },
  };
}

function latestRecord() {
  if (!existsSync(DIRECTORY)) return null;
  const file = readdirSync(DIRECTORY)
    .filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .toSorted()
    .at(-1);
  return file ? { file, record: JSON.parse(readFileSync(join(DIRECTORY, file), 'utf8')) } : null;
}

async function main() {
  const now = new Date();
  const { runs, snapshots } = await runAll(now);
  if (args.has('--check')) {
    const previous = latestRecord();
    if (!previous) throw new Error('No ingestion record to check; run without --check first.');
    for (const run of runs) {
      const before = previous.record.runs.find(
        (item: { sourceId: string; scope: string }) =>
          item.sourceId === run.result.manifest.sourceId && item.scope === run.result.manifest.scope,
      );
      const same = before?.manifest.contentSha256 === run.result.manifest.contentSha256;
      console.log(
        `${same ? 'REPRODUCED' : before ? 'CHANGED   ' : 'NEW       '} ${run.result.manifest.sourceId} · ${run.result.manifest.scope} · ${run.result.manifest.status} · ${run.result.manifest.observations} records${
          same
            ? ''
            : before
              ? ` (recorded ${before.manifest.observations} on ${previous.file.slice(0, 10)}; the live source changed)`
              : ''
        }`,
      );
    }
    return;
  }
  const record = {
    version: 'ascent-ingestion-record-1',
    registryVersion: SOURCE_REGISTRY_VERSION,
    createdAt: now.toISOString(),
    command: 'npm run sources:refresh',
    policy:
      'Observations are shown and monitored only. They are never added to an estimate; the bundled snapshots and their fingerprints are unchanged.',
    snapshots,
    runs: runs.map(run => ({
      label: run.label,
      market: run.market,
      sourceId: run.result.manifest.sourceId,
      scope: run.result.manifest.scope,
      attribution: publicSource(run.result.manifest.sourceId).attribution,
      manifest: run.result.manifest,
      quality: quality(run, now.getTime()),
      observations: run.result.observations,
    })),
  };
  const digest = sha256(canonicalJson(record.runs.map(run => run.manifest.contentSha256)));
  for (const run of record.runs)
    console.log(
      `${run.sourceId} · ${run.manifest.status} · ${run.manifest.observations} records · covered ${run.quality.coveredHomes} · conflicts ${run.quality.conflicts} · duplicates ${run.quality.duplicates}${
        run.manifest.errors.length ? ` · ${run.manifest.errors.join('; ')}` : ''
      }`,
    );
  console.log(`content digest ${digest}`);
  if (args.has('--dry-run')) return;
  mkdirSync(DIRECTORY, { recursive: true });
  const path = join(DIRECTORY, `${now.toISOString().slice(0, 10)}.json`);
  writeFileSync(path, `${JSON.stringify({ ...record, contentSha256: digest }, null, 2)}\n`);
  console.log(`wrote ${path}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
