import { authorized, endpoint, json, readJson } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { executeProductAction, productActionSchema, productSnapshot } from '@/lib/product';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => { const actor = await authorized(request); return json(productSnapshot(await getWorkspace(actor.tenantId), actor)); }); }
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); return json((await executeProductAction(actor, await readJson(request, productActionSchema))).result); }); }
