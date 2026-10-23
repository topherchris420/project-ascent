import { authorized, endpoint, json } from '@/lib/api';
import { deleteRoom, getRoom } from '@/lib/rooms';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return endpoint(async () => json(await getRoom(await authorized(request), (await context.params).id)));
}
/** Deletes the room, its documents, collaborators and audit. Downloaded copies are not recalled. */
export async function DELETE(request: Request, context: Context) {
  return endpoint(async () => json(await deleteRoom(await authorized(request, true), (await context.params).id)));
}
