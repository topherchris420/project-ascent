import { authorized, endpoint, json } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { uploadDocument } from '@/lib/service';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
import { DOCUMENT_LIMIT_LABEL, MAX_MULTIPART_BYTES } from '@/lib/upload-limits';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const limit = MAX_MULTIPART_BYTES;
    if (Number(request.headers.get('content-length') || 0) > limit)
      throw new HttpError(413, `Document exceeds the ${DOCUMENT_LIMIT_LABEL} upload limit.`);
    // Cap streamed bytes as well as Content-Length to resist chunked oversized requests.
    if (!request.body) throw new HttpError(400, 'Document upload is empty.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new HttpError(413, `Document exceeds the ${DOCUMENT_LIMIT_LABEL} upload limit.`);
      }
      chunks.push(item.value);
    }
    const body = Buffer.concat(chunks);
    const parsed = new Request(request.url, { method: 'POST', headers: request.headers, body: new Uint8Array(body) });
    let data: FormData;
    try {
      data = await parsed.formData();
    } catch {
      throw new HttpError(400, 'Use multipart form data.');
    }
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
