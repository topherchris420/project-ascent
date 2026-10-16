import { authorized, endpoint, json, readJson } from '@/lib/api';
import { domainActionSchema, executeDomainAction, getDomainSnapshot } from '@/lib/domain-service';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request);
    const options = z
      .object({ propertyId: z.string().max(100).optional(), perspective: z.enum(['seller', 'buyer']).optional() })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(await getDomainSnapshot(actor, options));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request, true);
    return json(await executeDomainAction(actor, await readJson(request, domainActionSchema)));
  });
}
