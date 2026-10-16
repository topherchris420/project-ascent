import { endpoint, json } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { processStripeWebhook } from '@/lib/billing';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    if (Number(request.headers.get('content-length') || 0) > 200000 || !request.body)
      throw new HttpError(413, 'Webhook exceeds the permitted size.');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 200000) {
        await reader.cancel();
        throw new HttpError(413, 'Webhook exceeds the permitted size.');
      }
      chunks.push(next.value);
    }
    return json(
      await processStripeWebhook(Buffer.concat(chunks).toString('utf8'), request.headers.get('stripe-signature')),
    );
  });
}
