import { authorized, endpoint, json } from '@/lib/api';
import { requireOwner } from '@/lib/platform';
import { discoverGroqModels } from '@/lib/inference/provider';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request, true);
    requireOwner(actor);
    return json({
      models: await discoverGroqModels(),
      capabilitySource: 'Explicit local registry intersected with account models response',
      cache: 'Account metadata only; five-minute TTL and concurrent discovery coalescing',
      providerPrivacyVerified: false,
    });
  });
}
