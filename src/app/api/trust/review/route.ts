import { endpoint, json, readJson } from '@/lib/api';
import { reviewTrustRequest, trustReviewSchema } from '@/lib/trust';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () =>
    json((await reviewTrustRequest(request, await readJson(request, trustReviewSchema))).result),
  );
}
