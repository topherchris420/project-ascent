import { authorized, endpoint, json } from '@/lib/api';
import { deleteRoomDocument, readRoomDocument } from '@/lib/rooms';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string; documentId: string }> };

/** Downloads a document when the owner's grant allows it; every download is audited. */
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    const user = await authorized(request);
    const { id, documentId } = await context.params;
    const { document, bytes } = await readRoomDocument(user, id, documentId);
    const name = document.name.replace(/[^\w. -]/g, '_');
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': document.mime,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return endpoint(async () => {
    const user = await authorized(request, true);
    const { id, documentId } = await context.params;
    return json(await deleteRoomDocument(user, id, documentId));
  });
}
