import { timingSafeEqual } from 'node:crypto';
import { endpoint, json } from '@/lib/api';
import { HttpError } from '@/lib/auth';
import { deliverAuthMail } from '@/lib/account-security';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
    const actual = Buffer.from(request.headers.get('authorization') || '');
    if (
      (process.env.CRON_SECRET?.length || 0) < 32 ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new HttpError(401, 'Unauthorized');
    return json(await deliverAuthMail());
  });
}
