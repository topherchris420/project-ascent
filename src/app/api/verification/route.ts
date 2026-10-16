import { authorized, endpoint, json, readJson } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { submitLicenseVerification, verificationResponse, verificationSubmissionSchema } from '@/lib/verification';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request);
    return json(verificationResponse(await getWorkspace(actor.tenantId)));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const actor = await authorized(request, true);
    const input = await readJson(request, verificationSubmissionSchema);
    const { workspace } = await submitLicenseVerification(actor, input);
    return json(verificationResponse(workspace), 202);
  });
}
