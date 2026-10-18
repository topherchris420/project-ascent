import { z } from 'zod';
import { endpoint, json, rateLimit, readJson, verifyOrigin } from '@/lib/api';
import { sessionCookie } from '@/lib/auth';
import { acceptInvitation } from '@/lib/platform';
import { securityStatus } from '@/lib/account-security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    verifyOrigin(request);
    await rateLimit(request, 'invitation-acceptance', 15);
    const input = await readJson(
      request,
      z.object({ token: z.string().max(200), name: z.string().max(150), password: z.string().max(1024) }),
    );
    const result = await acceptInvitation(input);
    const security = await securityStatus(result.user);
    return json({ user: result.user, requiresMfaEnrollment: security.required && !security.enabled }, 200, {
      'Set-Cookie': sessionCookie(result.token),
    });
  });
}
