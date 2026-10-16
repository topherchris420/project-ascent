import { authorized, endpoint } from '@/lib/api';
import { mutateWorkspace } from '@/lib/db';
import { appendAudit, find } from '@/lib/service';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
import { recordProductAction } from '@/lib/product';
import { GET as report } from '@/app/api/report/route';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request);
    const cmaId = new URL(request.url).searchParams.get('cmaId') || '';
    const response = await report(request);
    if (response.ok)
      await mutateWorkspace(actor, workspace => {
        find(scopeWorkspaceForAccess(workspace, 'export').cmas, cmaId, 'CMA');
        appendAudit(
          workspace,
          actor,
          'trustReportExport',
          cmaId,
          'Permission-checked client report actually generated; no client delivery occurred.',
        );
        recordProductAction(workspace, actor, 'trustReportExport', cmaId);
      });
    return response;
  });
}
