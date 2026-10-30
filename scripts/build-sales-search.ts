/**
 * Rebuilds the /sales snapshot from the bundled DC, DC condo and Maryland snapshots.
 *
 *   npm run datasets:sales-search             write src/datasets/sales-search/
 *   npm run datasets:sales-search -- --check  fail if the committed snapshot no longer matches its sources
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildSalesRecords } from '../src/lib/sales-search-build';
import { SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_FILE, SALES_SNAPSHOT_PROVENANCE } from '../src/lib/market-search-data';

const { text, provenance } = buildSalesRecords();
const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
const provenancePath = join(SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_PROVENANCE);

if (process.argv.includes('--check')) {
  const committed = readFileSync(provenancePath, 'utf8').replace(/\r\n/g, '\n');
  if (committed !== provenanceText) {
    console.error('The /sales snapshot is out of date. Run: npm run datasets:sales-search');
    process.exit(1);
  }
  console.log(`Sales search snapshot matches its sources (${provenance.rows.toLocaleString('en-US')} sales).`);
} else {
  mkdirSync(SALES_SNAPSHOT_DIR, { recursive: true });
  writeFileSync(join(SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_FILE), gzipSync(text, { level: 9 }));
  writeFileSync(provenancePath, provenanceText);
  console.log(`Wrote ${provenance.rows.toLocaleString('en-US')} sales to ${SALES_SNAPSHOT_DIR}.`);
}
