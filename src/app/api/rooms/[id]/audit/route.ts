import { authorized, endpoint, json } from '@/lib/api';
import { roomAudit } from '@/lib/rooms';
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => json(await roomAudit(await authorized(request), (await context.params).id)));
}
