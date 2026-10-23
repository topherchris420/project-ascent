import { z } from 'zod';
import { authorized, endpoint, json, rateLimit, readJson } from '@/lib/api';
import { acceptGrant } from '@/lib/rooms';
export const runtime = 'nodejs';

/** Accepts a room invitation for the signed-in account, whose email must match the invitation. */
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    await rateLimit(request, 'room-accept', 10, user);
    return json(await acceptGrant(user, await readJson(request, z.unknown())));
  });
}
