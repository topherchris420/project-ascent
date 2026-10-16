import { authorized, endpoint, json } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
import { getFabricSnapshot } from '@/lib/fabric-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request);
    const workspace =
      new URL(request.url).searchParams.get('initialize') === '1'
        ? (await getFabricSnapshot(user)).workspace
        : scopeWorkspaceForAccess(await getWorkspace(user.tenantId));
    return json({ user, workspace });
  });
}
