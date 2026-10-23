import { mlsBridgeStatus } from '@/lib/mls-bridge';
export const runtime = 'nodejs';

/** The MLS Bridge's status: disabled until a written agreement is on file. */
export async function GET() {
  return Response.json(mlsBridgeStatus(new Date()), {
    headers: { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
  });
}
