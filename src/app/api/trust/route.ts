import { authorized, endpoint, json, readJson } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { executeTrustAction, trustActionSchema, trustSnapshot } from '@/lib/trust';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request);
    return json(trustSnapshot(await getWorkspace(actor.tenantId), actor));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request, true);
    const changed = await executeTrustAction(actor, await readJson(request, trustActionSchema));
    return json(changed.result);
  });
}
