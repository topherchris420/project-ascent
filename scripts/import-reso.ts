import { fetchResoProperties } from '../src/lib/providers/reso';
import { closeDatabase, mutateWorkspace, syncPropertyLocations, transaction } from '../src/lib/db';
import { appendAudit, refreshGraph } from '../src/lib/service';
import type { Actor } from '../src/lib/types';

async function main() {
  throw new Error('Standalone RESO import is disabled. Use the independently verified, provider-grant-aware Fabric service.');
  const required = ['MLS_BASE_URL', 'MLS_ALLOWED_ORIGINS', 'MLS_TOKEN', 'MLS_LICENSE', 'MLS_CONDITION_MAP_JSON', 'MLS_TENANT_ID', 'MLS_USER_ID'] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`${key} must be explicitly configured; credentials are never discovered automatically.`);
  const actors = await transaction(null, (tx) => tx.query<{ id: string; tenant_id: string; name: string; email: string; role: Actor['role'] }>('SELECT id,tenant_id,name,email,role FROM users WHERE id=$1 AND tenant_id=$2', [process.env.MLS_USER_ID!, process.env.MLS_TENANT_ID!]));
  if (!actors[0] || actors[0].role !== 'owner') throw new Error('An existing owner actor in the explicitly selected tenant is required.');
  const row = actors[0]; const actor: Actor = { id: row.id, tenantId: row.tenant_id, name: row.name, email: row.email, role: row.role };
  const data = await fetchResoProperties({ baseUrl: process.env.MLS_BASE_URL!, allowedOrigins: process.env.MLS_ALLOWED_ORIGINS!.split(',').map((value) => value.trim()), token: process.env.MLS_TOKEN!, license: process.env.MLS_LICENSE!, conditionMap: JSON.parse(process.env.MLS_CONDITION_MAP_JSON!) as Record<string, number> });
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply-requested' : 'preview-only', fetched: data.fetched, eligible: data.properties.length, skipped: data.skipped.length, truncated: data.truncated, observedAt: data.observedAt }));
  if (!process.argv.includes('--apply')) { console.log('Preview only: no customer records or credentials are printed and nothing was persisted.'); return; }
  if (!data.properties.length || data.truncated) throw new Error('Import refused: zero eligible records or a truncated snapshot. Narrow the licensed provider scope; no partial market snapshot will be promoted.');
  await mutateWorkspace(actor, async (workspace, tx) => {
    if (workspace.properties.length || workspace.clients.length || workspace.offers.length || workspace.transactions.length || workspace.cmas.length || workspace.documents.length || workspace.outcomes.length) throw new Error('Import requires an empty workspace. Existing demo and professional records will never be overwritten. Create a new empty workspace first.');
    workspace.properties = data.properties; workspace.sources = data.sources; workspace.asOf = data.observedAt; workspace.mode = 'licensed';
    await syncPropertyLocations(tx, actor.tenantId, workspace); appendAudit(workspace, actor, 'importLicensedResoSnapshot', data.sources[0].id, `${data.properties.length} validated records; ${data.skipped.length} skipped. Explicit owner invocation; provider licensing remains binding.`); refreshGraph(workspace);
  });
  console.log(`Imported ${data.properties.length} validated licensed records into the selected empty tenant.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Import failed'); process.exitCode = 1; }).finally(closeDatabase);
