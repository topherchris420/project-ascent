import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSalesRecords } from '../src/lib/sales-search-build';
import { SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_PROVENANCE, searchRecordedSales } from '../src/lib/market-search-data';

test('the /sales snapshot is rebuilt from the bundled DC, condo and Maryland snapshots', () => {
  const { provenance } = buildSalesRecords();
  const committed = JSON.parse(readFileSync(join(SALES_SNAPSHOT_DIR, SALES_SNAPSHOT_PROVENANCE), 'utf8'));
  assert.deepEqual(committed, provenance, 'The /sales snapshot is out of date. Run: npm run datasets:sales-search');
});

test('a Maryland-only window ends at the newest Maryland sale, not the newest DC sale', () => {
  const result = searchRecordedSales('houses in maryland');
  const maryland = result.snapshots.find(snapshot => snapshot.market === 'maryland')!;
  assert.deepEqual(result.parsed.filters.markets, ['maryland']);
  assert.equal(result.summary.window.until, maryland.latestSale);
  const window = result.parsed.readBack.at(-1) ?? '';
  assert.ok(window.includes(maryland.latestSale.slice(0, 4)), window);
  assert.ok(result.summary.count > 0);
});
