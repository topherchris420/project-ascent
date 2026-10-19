import { after } from 'next/server';
import { searchDcAddresses, dcData } from '@/lib/providers/dc-public-records';
export const runtime = 'nodejs';

/** Public address search over bundled District of Columbia public records (CC BY 4.0). No account or live lookup. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const headers = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
  if (query.length > 100)
    return Response.json(
      { error: 'Search with a street address of at most 100 characters.' },
      { status: 400, headers },
    );
  return Response.json(
    { results: searchDcAddresses(query), attribution: dcData().salesProvenance.attribution },
    { headers },
  );
}

/** A page about to search posts here: the records and search index load after this empty reply. */
export async function POST() {
  after(() => void dcData().index());
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
