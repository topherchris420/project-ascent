import { z } from 'zod';
import { authorized, endpoint, json, readJson } from '@/lib/api';
import { updateSection } from '@/lib/rooms';
export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ id: string; section: string }> }) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const { id, section } = await context.params;
    return json(await updateSection(user, id, section, await readJson(request, z.unknown())));
  });
}
