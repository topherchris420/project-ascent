import { endpoint, json } from '@/lib/api';
import { integrationCmas } from '@/lib/enterprise';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => json(await integrationCmas(request)));
}
