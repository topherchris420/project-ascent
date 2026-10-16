import { authorized, endpoint, json } from '@/lib/api';
import { aiMetrics } from '@/lib/inference/ledger';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => json(await aiMetrics(await authorized(request))));
}
