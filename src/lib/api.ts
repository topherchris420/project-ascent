import { z, ZodError } from 'zod';
import { authenticate, digest, HttpError } from './auth';
import { consumeRateLimit, DatabaseConfigurationError } from './db';
import { allowedAppOrigins } from './deployment';
import type { Actor } from './types';
import { DOCUMENT_LIMIT_LABEL, MAX_MULTIPART_BYTES } from './upload-limits';

export function json(value: unknown, status = 200, headers?: HeadersInit) {
  const response = Response.json(value, { status, headers });
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const size = Number(request.headers.get('content-length') || '0');
  if (size > 100_000) throw new HttpError(413, 'Request exceeds 100 KB.');
  if (!request.body) throw new HttpError(400, 'JSON body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 100_000) {
      await reader.cancel();
      throw new HttpError(413, 'Request exceeds 100 KB.');
    }
    chunks.push(next.value);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return schema.parse(JSON.parse(body));
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, 'Invalid JSON request.');
    throw error;
  }
}

/** Multipart form data, capped on Content-Length and on streamed bytes to resist chunked oversized requests. */
export async function readMultipart(request: Request, limit = MAX_MULTIPART_BYTES): Promise<FormData> {
  if (Number(request.headers.get('content-length') || 0) > limit)
    throw new HttpError(413, `Document exceeds the ${DOCUMENT_LIMIT_LABEL} upload limit.`);
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
  try {
    return await parsed.formData();
  } catch {
    throw new HttpError(400, 'Use multipart form data.');
  }
}

export function verifyOrigin(request: Request) {
  const production = process.env.NODE_ENV === 'production';
  const allowed = production ? allowedAppOrigins() : [process.env.APP_ORIGIN || new URL(request.url).origin];
  if (production && allowed.length === 0) throw new HttpError(503, 'Application origin is not configured.');
  const origin = request.headers.get('origin');
  const localDevelopment = !production && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin || '');
  if (!origin || (!allowed.includes(origin) && !localDevelopment))
    throw new HttpError(403, 'Request origin is not permitted.');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new HttpError(403, 'Cross-site requests are not permitted.');
}

export async function rateLimit(request: Request, category: string, limit = 80, actor?: Actor) {
  // Only trust a deployment supplied IP when explicitly configured; otherwise all anonymous requests share a safe limit.
  const ip =
    process.env.TRUST_PROXY === 'true'
      ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      : 'local';
  const key = digest(`${category}:${actor ? actor.id : ip}`);
  if (!(await consumeRateLimit(key, limit, 60_000)))
    throw new HttpError(429, 'Too many requests. Try again in one minute.');
}

export async function authorized(request: Request, write = false): Promise<Actor> {
  if (write) verifyOrigin(request);
  const user = await authenticate(request);
  await rateLimit(request, write ? 'write' : 'read', write ? 90 : 180, user);
  return user;
}

export function handleError(error: unknown): Response {
  if (error instanceof DatabaseConfigurationError)
    return json({ error: 'Workspace storage is not configured. Contact your administrator.' }, 503);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: 'Please check the supplied values.',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      },
      400,
    );
  console.error('[Ascent API]', error instanceof Error ? error.message : 'Unknown error');
  return json({ error: 'The request could not be completed. Please retry.' }, 500);
}

export async function endpoint(callback: () => Promise<Response>) {
  try {
    return await callback();
  } catch (error) {
    return handleError(error);
  }
}
