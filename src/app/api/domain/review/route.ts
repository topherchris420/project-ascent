import { endpoint, json, rateLimit, readJson } from '@/lib/api';
import { authorizeDomainReview, domainReviewSchema, reviewDomainRule } from '@/lib/domain-service';
export const runtime = 'nodejs';
export async function POST(request: Request) { return endpoint(async () => { authorizeDomainReview(request); await rateLimit(request, 'domain-review', 20); return json(await reviewDomainRule(await readJson(request, domainReviewSchema))); }); }
