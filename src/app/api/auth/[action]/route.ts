import { z } from 'zod';
import { after } from 'next/server';
import { consumeRateLimit } from '@/lib/db';
import { endpoint, json, rateLimit, readJson, verifyOrigin } from '@/lib/api';
import { authenticate, demoSession, digest, HttpError, login, logout, register, sessionCookie } from '@/lib/auth';
import { deliverAuthMail, requestPasswordReset, resetPassword, securityStatus } from '@/lib/account-security';
export const runtime = 'nodejs';
const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
  code: z.string().max(50).optional(),
});
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
    if (action === 'forgot-password') {
      const input = await readJson(request, z.object({ email: z.email().max(254) }));
      await rateLimit(request, `password-reset:${input.email.toLowerCase().trim()}`, 3);
      const result = await requestPasswordReset(input.email);
      after(async () => {
        const delivery = await deliverAuthMail();
        if (delivery.failed) console.error('[Account mail] Delivery failed; request a new reset link.');
      });
      return json(result);
    }
    if (action === 'reset-password') {
      const input = await readJson(
        request,
        z.object({ token: z.string().max(100), password: z.string().min(12).max(1024) }),
      );
      return json(await resetPassword(input.token, input.password), 200, { 'Set-Cookie': sessionCookie('', true) });
    }
    if (action === 'logout') {
      await logout(request);
      return json({ user: null }, 200, { 'Set-Cookie': sessionCookie('', true) });
    }
    let result;
    if (action === 'login') {
      const input = await readJson(request, loginSchema);
      if (!(await consumeRateLimit(`login-account:${digest(input.email.toLowerCase().trim())}`, 10, 60000)))
        throw new HttpError(429, 'Too many sign-in attempts. Try again in one minute.');
      result = await login(input.email, input.password, input.code);
    } else if (action === 'register') {
      // Real accounts always start empty; the seed is never accepted from a request body.
      const { name, email, password, organization } = await readJson(request, registration);
      if (/@demo\.invalid$/i.test(email))
        throw new HttpError(400, 'Use an email address that can receive account recovery messages.');
      result = await register({ name, email, password, organization, seed: 'empty' });
    } else if (action === 'demo') {
      const existing = await authenticate(request).catch(() => null);
      if (existing) return json({ user: existing });
      // Per-request private tenant. Browser retries can safely reuse an existing authenticated demo.
      result = await demoSession();
    } else throw new HttpError(404, 'Authentication operation not found.');
    const security = await securityStatus(result.user);
    return json({ user: result.user, requiresMfaEnrollment: security.required && !security.enabled }, 200, {
      'Set-Cookie': sessionCookie(result.token),
    });
  });
}
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  return endpoint(async () => {
    if ((await context.params).action !== 'me') throw new HttpError(404, 'Not found.');
    return json({ user: await authenticate(request) });
  });
}
