import { searchMarylandAddresses, marylandData } from '@/lib/providers/maryland-public-records';
export const runtime = 'nodejs';

/** Public address search over bundled Maryland SDAT/MDP public records (public domain). No account or live lookup. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const headers = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
  if (query.length > 100)
    return Response.json(
      { error: 'Search with a street address of at most 100 characters.' },
      { status: 400, headers },
    );
  return Response.json(
    { results: searchMarylandAddresses(query), attribution: marylandData().provenance.attribution },
    { headers },
  );
}
