import { checkHomeSources, coveredHome, allowPublicCheck } from '@/lib/sources/property-check';
import { ASCENT_POLICY } from '@/lib/sources/registry';
export const runtime = 'nodejs';

/**
 * A live check of the public sources covering one home in the bundled snapshots. Answers are cached per source and
 * question, so repeated visits never multiply requests to a public server. Nothing returned reaches an estimate.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const home = coveredHome(params.get('market') ?? '', params.get('parcel') ?? '');
  if (!home)
    return Response.json(
      { error: 'Only a home in a covered public-record snapshot can be checked. Search by street address instead.' },
      { status: 404, headers },
    );
  if (!allowPublicCheck(request))
    return Response.json({ error: 'Too many live checks. Try again in one minute.' }, { status: 429, headers });
  const result = await checkHomeSources(home);
  return Response.json({ ...result, policy: ASCENT_POLICY.note }, { headers });
}
