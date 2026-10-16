import { authorized, endpoint } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { getWorkspace, readDocument } from '@/lib/db';
import { find } from '@/lib/service';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
import { MAX_DOCUMENT_BYTES } from '@/lib/upload-limits';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = await authorized(request);
    const { id } = await context.params;
    const raw = await getWorkspace(user.tenantId);
    const workspace = scopeWorkspaceForAccess(raw);
    if (raw.documents.some(record => record.id === id) && !workspace.documents.some(record => record.id === id))
      throw new HttpError(403, 'Current source permissions do not permit this document context.');
    const record = find(workspace.documents, id, 'Document');
    const bytes = await readDocument(user.tenantId, id);
    if (!bytes) throw new HttpError(404, 'Document bytes are unavailable.');
    if (process.env.VERCEL === '1' && bytes.length > MAX_DOCUMENT_BYTES)
      throw new HttpError(
        413,
        'This older document exceeds the direct download limit. Contact the workspace administrator to retrieve the preserved original.',
      );
    const name = record.name.replace(/[^\w. -]/g, '_');
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': record.mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
}
