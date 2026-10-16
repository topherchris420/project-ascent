import { authorized, endpoint, json, readJson } from '@/lib/api';
import { apiKeyActionSchema, listApiKeys, manageApiKey } from '@/lib/enterprise';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => json(await listApiKeys(await authorized(request)))); }
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); return json(await manageApiKey(actor, await readJson(request, apiKeyActionSchema))); }); }
