import { z } from 'zod';
import { endpoint, json, rateLimit, readJson, verifyOrigin } from '@/lib/api';
import { authenticate, sessionCookie } from '@/lib/auth';
import { beginMfa, enableMfa, securityStatus } from '@/lib/account-security';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => json(await securityStatus(await authenticate(request, true))));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    verifyOrigin(request);
    const actor = await authenticate(request, true);
    await rateLimit(request, 'mfa-enrollment', 6, actor);
    const input = await readJson(
      request,
      z.discriminatedUnion('action', [
        z.object({ action: z.literal('setup'), password: z.string().min(1).max(1024) }),
        z.object({ action: z.literal('enable'), code: z.string().regex(/^\d{6}$/) }),
      ]),
    );
    return input.action === 'setup'
      ? json(await beginMfa(actor, input.password))
      : json(await enableMfa(actor, input.code), 200, { 'Set-Cookie': sessionCookie('', true) });
  });
}
