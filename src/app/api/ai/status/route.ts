import { authorized, endpoint, json } from '@/lib/api';
import { aiStatus } from '@/lib/inference/ledger';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => json(await aiStatus(await authorized(request)))); }
