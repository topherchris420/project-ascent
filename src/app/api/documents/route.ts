import { authorized, endpoint, json, readMultipart } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { uploadDocument } from '@/lib/service';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const data = await readMultipart(request);
    const file = data.get('file');
    const transactionId = data.get('transactionId');
    if (!(file instanceof File) || typeof transactionId !== 'string' || transactionId.length > 100)
      throw new HttpError(400, 'Provide a file and transactionId.');
    const result = await uploadDocument(user, transactionId, {
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return json({ workspace: scopeWorkspaceForAccess(result.workspace), result: result.result });
  });
}
