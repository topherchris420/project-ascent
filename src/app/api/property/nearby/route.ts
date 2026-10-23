import { allowPublicCheck, coveredHome, nearbyLaterSales } from '@/lib/sources/property-check';
import { ASCENT_POLICY } from '@/lib/sources/registry';
export const runtime = 'nodejs';

/** Qualified recorded sales near a covered home, dated after its snapshot. Shown and monitored, never priced. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const home = coveredHome(params.get('market') ?? '', params.get('parcel') ?? '');
  if (!home)
    return Response.json(
      { error: 'Only a home in a covered public-record snapshot can be checked.' },
      { status: 404, headers },
    );
  const radius = Number(params.get('radius') ?? '0.5');
  if (!Number.isFinite(radius) || radius <= 0 || radius > 2)
    return Response.json({ error: 'Choose a radius from 0.1 to 2 miles.' }, { status: 400, headers });
  if (!allowPublicCheck(request))
    return Response.json({ error: 'Too many live checks. Try again in one minute.' }, { status: 429, headers });
  return Response.json({ home, ...(await nearbyLaterSales(home, radius)), policy: ASCENT_POLICY.note }, { headers });
}
