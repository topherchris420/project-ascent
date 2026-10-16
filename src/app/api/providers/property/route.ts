import { authorized, endpoint, json, readJson } from '@/lib/api';
import { executePropertyProviderAction, getPropertyProviderSnapshot, propertyProviderActionSchema } from '@/lib/property-provider-service';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => json(await getPropertyProviderSnapshot(await authorized(request)))); }
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); return json(await executePropertyProviderAction(actor, await readJson(request, propertyProviderActionSchema))); }); }
