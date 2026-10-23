import { authorized, endpoint, json } from '@/lib/api';
import { revokeGrant } from '@/lib/rooms';
export const runtime = 'nodejs';

/** Revokes a collaborator's access immediately. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string; grantId: string }> }) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const { id, grantId } = await context.params;
    return json(await revokeGrant(user, id, grantId));
  });
}
