import { DC_PARCEL_PATTERN } from '@/lib/dc-studio';
import { dcValuationInputs } from '@/lib/providers/dc-public-records';
export const runtime = 'nodejs';

/** The subject and nearby recorded sales for one DC parcel, as of the bundled snapshot. */
export async function GET(request: Request) {
  const parcel = new URL(request.url).searchParams.get('parcel') ?? '';
  const headers = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
  const inputs = DC_PARCEL_PATTERN.test(parcel) ? dcValuationInputs(parcel) : null;
  if (!inputs)
    return Response.json(
      { error: 'That parcel is not in the District single-family snapshot. Search by street address instead.' },
      { status: 404, headers },
    );
  const { parcel: record, ...payload } = inputs;
  return Response.json({ parcelId: record.parcelId, yearBuilt: record.yearBuilt, ...payload }, { headers });
}
