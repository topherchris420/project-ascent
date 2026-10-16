import { actionSchema, executeAction } from '@/lib/service';
import { authorized, endpoint, json, readJson } from '@/lib/api';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const action = await readJson(request, actionSchema);
    const result = await executeAction(user, action);
    const workspace = scopeWorkspaceForAccess(result.workspace);
    return json({
      workspace,
      result:
        action.type === 'saveCma'
          ? workspace.cmas.find(record => record.id === (result.result as { id?: string } | null)?.id) || null
          : action.type === 'draftCounter'
            ? workspace.approvals.find(record => record.id === (result.result as { id?: string } | null)?.id)
              ? result.result
              : null
            : result.result,
    });
  });
}
