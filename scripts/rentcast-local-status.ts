import { readFile } from 'node:fs/promises';
import { login } from '../src/lib/auth';
import { closeDatabase } from '../src/lib/db';
import { getPropertyProviderSnapshot } from '../src/lib/property-provider-service';
async function main() {
  const access = JSON.parse(await readFile('.data/rentcast-local-access.json', 'utf8'));
  const { user } = await login(access.email, access.password), status = await getPropertyProviderSnapshot(user);
  console.log(JSON.stringify({ configured: status.configured, enabled: status.enabled, budget: status.budget, usage: status.usage, health: status.health, available: { records: status.records.length, recordsWithSalePrice: status.records.filter(entry => entry.record.sales.some(sale => !!sale.price)).length, recordsWithCoordinates: status.records.filter(entry => !!entry.record.location).length, recordsWithStructure: status.records.filter(entry => entry.record.facts.squareFootage && entry.record.facts.bedrooms !== undefined && entry.record.facts.bathrooms !== undefined).length, saleDates: [...new Set(status.records.flatMap(entry => entry.record.sales.map(sale => sale.date.slice(0, 10))))].sort(), valuations: status.valuations.length, marketZips: status.markets.map(entry => entry.market.zipCode) } }, null, 2));
}
main().catch(() => { console.error('Local status unavailable. No credentials printed.'); process.exitCode = 1; }).finally(closeDatabase);
