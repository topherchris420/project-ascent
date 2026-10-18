import { MD_PARCEL_PATTERN } from '@/lib/maryland-studio';
import { marylandValuationInputs } from '@/lib/providers/maryland-public-records';
export const runtime = 'nodejs';

/** The subject and nearby recorded sales for one covered Maryland parcel, as of the bundled snapshot. */
export async function GET(request: Request) {
  const parcel = new URL(request.url).searchParams.get('parcel') ?? '';
  const headers = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
  const inputs = MD_PARCEL_PATTERN.test(parcel) ? marylandValuationInputs(parcel) : null;
  if (!inputs)
    return Response.json(
      { error: 'That parcel is not in the Maryland single-family snapshot. Search by street address instead.' },
      { status: 404, headers },
    );
  const { parcel: record, ...payload } = inputs;
  return Response.json({ parcelId: record.parcelId, yearBuilt: record.yearBuilt, ...payload }, { headers });
}
