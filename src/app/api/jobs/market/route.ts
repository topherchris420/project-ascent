import { timingSafeEqual } from 'node:crypto';
import { endpoint, json } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { purgeExpiredAccountSecurity } from '@/lib/account-security';
import { mutateWorkspace, transaction } from '@/lib/db';
import { appendAudit, refreshGraph, runMonitor } from '@/lib/service';
import { runScheduledFabricSync } from '@/lib/fabric-service';
import { purgeMigrationPreviews } from '@/lib/migration';
import { purgePropertyProviderData } from '@/lib/property-provider-service';
import type { Actor } from '@/lib/types';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const secret = process.env.CRON_SECRET;
    const actual = Buffer.from(request.headers.get('authorization') || '');
    const expected = Buffer.from(`Bearer ${secret || ''}`);
    if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new HttpError(401, 'Scheduled job authentication required.');
    await purgeExpiredAccountSecurity();
    const tenants = await transaction(null, tx => tx.query<{ id: string }>('SELECT id FROM tenants'));
    const results = [];
    for (const tenant of tenants) {
      const actor: Actor = {
        id: 'system:monitor',
        tenantId: tenant.id,
        name: 'Scheduled market monitor',
        email: 'system@ascent.invalid',
        role: 'owner',
      };
      try {
        const sync = await runScheduledFabricSync(actor);
        const result = await mutateWorkspace(actor, workspace => {
          purgeMigrationPreviews(workspace);
          purgePropertyProviderData(workspace);
          const result = runMonitor(workspace);
          appendAudit(
            workspace,
            actor,
            'scheduledMarketMonitor',
            'market',
            `Stored evidence evaluated after synchronization status: ${sync.status}. Expired migration staging, undo images and property-provider cache purged.`,
          );
          refreshGraph(workspace);
          return result;
        });
        results.push({ tenantId: tenant.id, sync, ...result.result });
      } catch {
        results.push({ tenantId: tenant.id, error: 'Tenant monitor failed; retry required.' });
      }
    }
    return json({ processed: results.length, results });
  });
}
