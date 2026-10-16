import { authorized, endpoint, json, readJson } from '@/lib/api';
import { grantReviewSchema, reviewProviderGrant } from '@/lib/fabric-service';
export const runtime = 'nodejs';
export async function POST(request: Request) { return endpoint(async () => { const actor = await authorized(request, true); const input = await readJson(request, grantReviewSchema); return json(await reviewProviderGrant(actor, input, request.headers.get('x-data-grant-review-secret'))); }); }
