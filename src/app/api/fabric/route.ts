import { authorized, endpoint, json, readJson } from '@/lib/api';
import { executeFabricAction, fabricActionSchema, getFabricSnapshot } from '@/lib/fabric-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return endpoint(async () => json(await getFabricSnapshot(await authorized(request)))); }
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); const action = await readJson(request, fabricActionSchema); return json(await executeFabricAction(actor, action)); }); }
