import { authorized, endpoint, json, readJson } from '@/lib/api';
import { executeMigrationAction, getMigrationSnapshot, migrationActionSchema } from '@/lib/migration';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => json(await getMigrationSnapshot(await authorized(request)))); }
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); return json(await executeMigrationAction(actor, await readJson(request, migrationActionSchema))); }); }
