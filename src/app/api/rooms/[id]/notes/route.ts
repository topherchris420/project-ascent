import { z } from 'zod';
import { authorized, endpoint, json, readJson } from '@/lib/api';
import { addNote } from '@/lib/rooms';
export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    return json(await addNote(user, (await context.params).id, await readJson(request, z.unknown())));
  });
}
