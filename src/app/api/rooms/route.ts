import { z } from 'zod';
import { authorized, endpoint, json, readJson } from '@/lib/api';
import { createRoom, listRooms } from '@/lib/rooms';
export const runtime = 'nodejs';

/** The rooms you own and the rooms shared with you. */
export async function GET(request: Request) {
  return endpoint(async () => json(await listRooms(await authorized(request))));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    return json(await createRoom(user, await readJson(request, z.unknown())), 201);
  });
}
