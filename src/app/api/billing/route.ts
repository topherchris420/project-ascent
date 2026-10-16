import { z } from 'zod';
import { authorized, endpoint, json, rateLimit, readJson } from '@/lib/api';
import { billingSnapshot, openCheckout, openPortal } from '@/lib/billing';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => json(await billingSnapshot(await authorized(request))));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request, true);
    await rateLimit(request, 'billing', 8, actor);
    const input = await readJson(
      request,
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('checkout'), planId: z.enum(['pro', 'team', 'enterprise']) }),
        z.object({ action: z.literal('portal') }),
      ]),
    );
    return json(input.action === 'checkout' ? await openCheckout(actor, input.planId) : await openPortal(actor));
  });
}
