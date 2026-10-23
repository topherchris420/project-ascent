import { authorized, endpoint, json, readMultipart } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { uploadRoomDocument } from '@/lib/rooms';
export const runtime = 'nodejs';

/** Owner upload: a PDF or plain-text file of at most 4 MB, encrypted at rest in the owner's tenant. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const data = await readMultipart(request);
    const file = data.get('file');
    const section = data.get('section');
    if (!(file instanceof File) || typeof section !== 'string' || section.length > 40)
      throw new HttpError(400, 'Provide a file and the section it belongs to.');
    const result = await uploadRoomDocument(
      user,
      (await context.params).id,
      { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
      section,
    );
    return json(result, 201);
  });
}
