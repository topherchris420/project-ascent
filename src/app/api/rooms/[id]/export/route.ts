import { authorized, endpoint, json } from '@/lib/api';
import { exportRoom } from '@/lib/rooms';
export const runtime = 'nodejs';

/** The owner's private export of one room. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const record = await exportRoom(await authorized(request), (await context.params).id);
    return json(record, 200, { 'Content-Disposition': 'attachment; filename="ascent-transaction-room.json"' });
  });
}
