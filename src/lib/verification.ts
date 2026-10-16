import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './auth';
import { mutateWorkspace } from './db';
import { ensurePlatform } from './platform';
import type { LicenseVerification } from './platform-types';
import { appendAudit } from './service';
import type { Actor, Workspace } from './types';

export const licenseJurisdictions = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR', 'GU', 'VI', 'AS', 'MP'] as const;
const printable = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Use printable text.');

// These are input-safety rules, not state-specific license validity checks.
export const verificationSubmissionSchema = z.strictObject({
  state: z.enum(licenseJurisdictions),
  licenseNumber: printable(80),
  legalName: printable(150).min(2),
});
export type VerificationSubmission = z.infer<typeof verificationSubmissionSchema>;

const evidenceSchema = z.strictObject({
  url: z.url().max(2000).refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }, 'Use an HTTPS source without credentials.'),
  reference: printable(500),
});
export const verificationReviewSchema = z.strictObject({
  tenantId: z.uuid(),
  submissionId: z.uuid(),
  status: z.enum(['verified', 'rejected']),
  reviewedBy: printable(120),
  evidence: z.array(evidenceSchema).min(1).max(10),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  reason: printable(1000).optional(),
}).superRefine((value, context) => {
  if (value.status === 'verified' && !value.expiresAt) context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Verified access requires a review expiry.' });
  if (value.status === 'rejected' && !value.reason) context.addIssue({ code: 'custom', path: ['reason'], message: 'Explain the review decision.' });
});
export type VerificationReview = z.infer<typeof verificationReviewSchema>;

export const verificationSources = [
  { state: 'DC', label: 'DC DLCP professional license verification', url: 'https://dlcp.dc.gov/page/quick-services', access: 'Official manual lookup; no automated access assumed.' },
  { state: 'MD', label: 'Maryland Real Estate Commission', url: 'https://labor.maryland.gov/license/mrec/', access: 'Official License Search link; no automated access assumed.' },
  { state: 'VA', label: 'Virginia DPOR License Lookup', url: 'https://www.dpor.virginia.gov/LicenseLookup', access: 'Official manual lookup; regulator-list availability does not itself grant API access.' },
  { state: 'ALL', label: 'ARELLO Licensee Verification service', url: 'https://www.arello.com/Information.cfm', access: 'Participating jurisdictions only. Automated web service requires an authorized account and agreed terms.' },
] as const;

export function effectiveVerification(verification: LicenseVerification | undefined, at = new Date().toISOString()): LicenseVerification {
  if (!verification) return { status: 'unsubmitted' };
  if (verification.status === 'verified' && (!verification.reviewedBy || !verification.reviewedAt || !verification.evidence?.length || !verification.expiresAt || !Number.isFinite(Date.parse(verification.expiresAt)) || Date.parse(verification.expiresAt) <= Date.parse(at))) {
    return { ...verification, status: 'expired', reason: 'Verification review has expired. Submit again for review; explorer access continues.' };
  }
  return verification;
}

export function verificationResponse(workspace: Workspace, at = new Date().toISOString()) {
  const verification = effectiveVerification(workspace.platform?.verification, at);
  return {
    verification,
    accessLevel: verification.status === 'verified' ? 'verified' as const : 'explorer' as const,
    provider: { mode: 'manual' as const, automated: false, status: 'not_configured' as const, message: 'No automated verification provider is configured. A trusted reviewer must check authoritative records.' },
    sources: verificationSources,
    message: 'Core tools remain available while review is pending. License verification, payment, brokerage membership and licensed data access are separate decisions.',
  };
}

export async function submitLicenseVerification(actor: Actor, input: unknown) {
  if (actor.role !== 'owner') throw new HttpError(403, 'The workspace owner must submit the professional license for this workspace.');
  const values = verificationSubmissionSchema.parse(input);
  return mutateWorkspace(actor, workspace => {
    const platform = ensurePlatform(workspace);
    const current = effectiveVerification(platform.verification);
    const unchanged = current.state === values.state && current.licenseNumber === values.licenseNumber && current.legalName === values.legalName;
    if (unchanged && (current.status === 'pending' || current.status === 'verified')) return current;
    const verification: LicenseVerification = { ...values, status: 'pending', submissionId: randomUUID(), submittedBy: actor.id, submittedAt: new Date().toISOString() };
    platform.verification = verification;
    appendAudit(workspace, actor, 'submitLicenseVerification', verification.submissionId!, `${values.state} license submitted for authoritative review. No validation or licensed-data permission is implied.`);
    return verification;
  });
}

export function authorizeVerificationReview(request: Request, configuredSecret = process.env.VERIFICATION_REVIEW_SECRET) {
  if (!configuredSecret || configuredSecret.length < 32) throw new HttpError(503, 'Verification review service is not configured.');
  const match = /^Bearer ([^\s]{1,512})$/.exec(request.headers.get('authorization') || '');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  // Equal-length digests avoid length-dependent comparisons of service credentials.
  if (!match || !timingSafeEqual(hash(match[1]), hash(configuredSecret))) throw new HttpError(401, 'Trusted verification reviewer credentials are required.');
}

export async function reviewLicenseVerification(input: unknown, at = new Date().toISOString()) {
  const review = verificationReviewSchema.parse(input);
  const now = Date.parse(at);
  if (review.status === 'verified') {
    const expiry = Date.parse(review.expiresAt!);
    if (expiry <= now || expiry > now + 366 * 86400000) throw new HttpError(400, 'Set review expiry in the future and within 366 days, no later than the actual license expiration.');
  }
  const reviewer: Actor = { id: `license-review:${createHash('sha256').update(review.reviewedBy).digest('hex').slice(0, 24)}`, tenantId: review.tenantId, name: review.reviewedBy, email: 'verification-review@system.invalid', role: 'owner' };
  return mutateWorkspace(reviewer, workspace => {
    const platform = ensurePlatform(workspace);
    const current = platform.verification;
    if (!current?.submissionId || current.submissionId !== review.submissionId) throw new HttpError(409, 'The license submission changed. Review the current submission before deciding.');
    if (review.status === 'verified' && current.status !== 'pending') throw new HttpError(409, 'Only a pending submission can be approved. A new review requires a new submission.');
    if (review.status === 'rejected' && current.status !== 'pending' && current.status !== 'verified') throw new HttpError(409, 'This submission has already been reviewed.');
    const verification: LicenseVerification = { ...current, status: review.status, evidence: review.evidence, reviewedAt: at, reviewedBy: review.reviewedBy, ...(review.status === 'verified' ? { expiresAt: review.expiresAt } : { expiresAt: undefined }), reason: review.reason };
    platform.verification = verification;
    appendAudit(workspace, reviewer, `licenseVerification.${review.status}`, review.submissionId, 'Trusted reviewer decision with source references. Payment and licensed-data entitlements remain independent.');
    return verification;
  });
}
