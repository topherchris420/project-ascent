import { endpoint, json, rateLimit, readJson } from '@/lib/api';
import { authorizeVerificationReview, reviewLicenseVerification, verificationResponse, verificationReviewSchema } from '@/lib/verification';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return endpoint(async () => {
    // Service bearer authentication only. A browser session or workspace owner role cannot approve a license.
    authorizeVerificationReview(request);
    await rateLimit(request, 'verification-review', 20);
    const input = await readJson(request, verificationReviewSchema);
    const { workspace } = await reviewLicenseVerification(input);
    return json(verificationResponse(workspace));
  });
}
