import { z } from 'zod';
import { authorized, endpoint, json, rateLimit, readJson } from '@/lib/api';
import { createGrant, listGrants } from '@/lib/rooms';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return endpoint(async () => json(await listGrants(await authorized(request), (await context.params).id)));
}
/** Creates one collaborator's invitation. The private link is returned once; no email is sent. */
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    await rateLimit(request, 'room-invite', 20, user);
    return json(await createGrant(user, (await context.params).id, await readJson(request, z.unknown())), 201);
  });
}
