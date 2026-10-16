import { z } from 'zod';
import { endpoint, json, rateLimit, readJson, verifyOrigin } from '@/lib/api';
import { authenticate, demoSession, HttpError, login, logout, register, sessionCookie } from '@/lib/auth';
export const runtime = 'nodejs';
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });
const registration = loginSchema.extend({
  name: z.string().trim().min(2).max(150),
  password: z.string().min(12, 'Use at least 12 characters.').max(1024),
  organization: z.string().trim().min(1).max(150).optional(),
});
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return endpoint(async () => {
    verifyOrigin(request);
    await rateLimit(request, 'auth', 20);
    const { action } = await context.params;
    if (action === 'logout') {
      await logout(request);
      return json({ user: null }, 200, { 'Set-Cookie': sessionCookie('', true) });
    }
    let result;
    if (action === 'login') {
      const input = await readJson(request, loginSchema);
      result = await login(input.email, input.password);
    } else if (action === 'register') result = await register(await readJson(request, registration));
    else if (action === 'demo') {
      const existing = await authenticate(request).catch(() => null);
      if (existing) return json({ user: existing });
      // Per-request private tenant. Browser retries can safely reuse an existing authenticated demo.
      result = await demoSession();
    } else throw new HttpError(404, 'Authentication operation not found.');
    return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(result.token) });
  });
}
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  return endpoint(async () => {
    if ((await context.params).action !== 'me') throw new HttpError(404, 'Not found.');
    return json({ user: await authenticate(request) });
  });
}
