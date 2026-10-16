import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { ensurePlatform, hasVerifiedLicense } from '../src/lib/platform';
import { executeAction, verifyAudit } from '../src/lib/service';
import { authorizeVerificationReview, effectiveVerification, reviewLicenseVerification, submitLicenseVerification, verificationResponse, verificationReviewSchema, verificationSubmissionSchema } from '../src/lib/verification';
import { GET, POST } from '../src/app/api/verification/route';
import { POST as reviewPost } from '../src/app/api/verification/review/route';

process.env.SQLITE_PATH = resolve('.data', `verification-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
delete process.env.VERIFICATION_REVIEW_SECRET;
after(async () => { await closeDatabase(); });
const owner = () => register({ name: 'Verification Test Owner', email: `${randomUUID()}@example.test`, password: 'isolated test passphrase 1234' });
const form = { state: 'VA', licenseNumber: 'DEMO-000123', legalName: 'Synthetic Test Professional' };
const evidence = [{ url: 'https://www.dpor.virginia.gov/LicenseLookup', reference: 'Synthetic test evidence; no real person or external lookup.' }];
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
const request = (token: string, body?: unknown) => new Request('http://localhost:3040/api/verification', { method: body ? 'POST' : 'GET', headers: { cookie: sessionCookie(token), origin: 'http://localhost:3040', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

test('submission validates form safety without pretending a license number is valid', () => {
  assert.deepEqual(verificationSubmissionSchema.parse(form), form);
  assert.equal(verificationSubmissionSchema.parse({ ...form, licenseNumber: 'Leading 00001 / suffix' }).licenseNumber, 'Leading 00001 / suffix');
  assert.equal(verificationSubmissionSchema.safeParse({ ...form, status: 'verified' }).success, false);
  assert.equal(verificationSubmissionSchema.safeParse({ ...form, state: 'ZZ' }).success, false);
  assert.equal(verificationSubmissionSchema.safeParse({ ...form, legalName: 'Name\nInjected' }).success, false);
  assert.equal(verificationSubmissionSchema.safeParse({ ...form, legalName: ' ' }).success, false);
});

test('pending verification is tenant-persistent, idempotent and leaves free core work usable', async () => {
  const a = await owner(), b = await owner();
  const result = await submitLicenseVerification(a.user, form);
  assert.equal(result.result.status, 'pending');
  assert.ok(result.result.submissionId);
  assert.equal(verificationResponse(result.workspace).accessLevel, 'explorer');
  assert.equal(verificationResponse(result.workspace).provider.automated, false);
  const repeated = await submitLicenseVerification(a.user, form);
  assert.equal(repeated.result.submissionId, result.result.submissionId);
  assert.equal((await getWorkspace(a.user.tenantId)).platform?.verification.status, 'pending');
  assert.equal(verificationResponse(await getWorkspace(b.user.tenantId)).verification.status, 'unsubmitted');
  const saved = await executeAction(a.user, { type: 'saveCma', propertyId: 'property-01', name: 'Works during pending verification' });
  assert.ok(saved.result);
  assert.equal(verifyAudit(saved.workspace), true);
  await assert.rejects(submitLicenseVerification({ ...a.user, role: 'agent' }, form), /owner/);
});

test('review credentials use a configured service secret rather than a user session', () => {
  const serviceSecret = 's'.repeat(48);
  assert.throws(() => authorizeVerificationReview(new Request('http://localhost/review'), undefined), /not configured/);
  assert.throws(() => authorizeVerificationReview(new Request('http://localhost/review', { headers: { authorization: 'Bearer wrong' } }), serviceSecret), /credentials/);
  assert.throws(() => authorizeVerificationReview(new Request('http://localhost/review', { headers: { cookie: 'ascent_session=owner' } }), serviceSecret), /credentials/);
  assert.doesNotThrow(() => authorizeVerificationReview(new Request('http://localhost/review', { headers: { authorization: `Bearer ${serviceSecret}` } }), serviceSecret));
});

test('trusted review requires current submission, evidence and bounded expiry; payment stays independent', async () => {
  const account = await owner();
  const first = await submitLicenseVerification(account.user, form);
  const next = await submitLicenseVerification(account.user, { ...form, licenseNumber: 'DEMO-CHANGED' });
  const input = { tenantId: account.user.tenantId, submissionId: next.result.submissionId, status: 'verified', reviewedBy: 'Synthetic reviewer', evidence, expiresAt: future() };
  await assert.rejects(reviewLicenseVerification({ ...input, submissionId: first.result.submissionId }), /changed/);
  await assert.rejects(reviewLicenseVerification({ ...input, expiresAt: new Date(Date.now() - 1000).toISOString() }), /expiry/);
  await assert.rejects(reviewLicenseVerification({ ...input, expiresAt: new Date(Date.now() + 400 * 86400000).toISOString() }), /expiry/);
  assert.equal(verificationReviewSchema.safeParse({ ...input, evidence: [] }).success, false);
  assert.equal(verificationReviewSchema.safeParse({ ...input, expiresAt: undefined }).success, false);
  assert.equal(verificationReviewSchema.safeParse({ ...input, evidence: [{ url: 'javascript:alert(1)', reference: 'bad' }] }).success, false);
  const reviewed = await reviewLicenseVerification(input);
  assert.equal(hasVerifiedLicense(reviewed.workspace), true);
  assert.equal(verificationResponse(reviewed.workspace).accessLevel, 'verified');
  assert.equal(ensurePlatform(reviewed.workspace).plan, 'free');
  assert.equal(ensurePlatform(reviewed.workspace).providerGrants.length, 0);
  assert.equal(verifyAudit(reviewed.workspace), true);
  await assert.rejects(reviewLicenseVerification(input), /pending/);
  const revoked = await reviewLicenseVerification({ ...input, status: 'rejected', reason: 'Synthetic review revoked; no real license decision.' });
  assert.equal(hasVerifiedLicense(revoked.workspace), false);
  assert.equal(revoked.result.status, 'rejected');
});

test('expired or incomplete review returns explorer without changing a subscription', () => {
  assert.equal(effectiveVerification(undefined).status, 'unsubmitted');
  assert.equal(effectiveVerification({ status: 'verified', expiresAt: future() }).status, 'expired');
  const verified = { status: 'verified' as const, reviewedBy: 'Reviewer', reviewedAt: '2026-01-01T00:00:00Z', evidence, expiresAt: '2026-02-01T00:00:00Z' };
  assert.equal(effectiveVerification(verified, '2026-02-01T00:00:00Z').status, 'expired');
  assert.equal(effectiveVerification(verified, '2026-01-15T00:00:00Z').status, 'verified');
});

test('HTTP verification enforces auth, CSRF, tenant selection and service-only review', async () => {
  assert.equal((await GET(new Request('http://localhost:3040/api/verification'))).status, 401);
  const account = await owner();
  const submitted = await POST(request(account.token, form));
  assert.equal(submitted.status, 202);
  const data = await submitted.json() as { verification: { status: string; submissionId: string }; accessLevel: string };
  assert.equal(data.verification.status, 'pending');
  assert.equal(data.accessLevel, 'explorer');
  assert.equal((await GET(request(account.token))).status, 200);
  assert.equal((await POST(request(account.token, { ...form, tenantId: randomUUID() }))).status, 400);
  const crossOrigin = new Request('http://localhost:3040/api/verification', { method: 'POST', headers: { cookie: sessionCookie(account.token), origin: 'https://other.invalid', 'content-type': 'application/json' }, body: JSON.stringify(form) });
  assert.equal((await POST(crossOrigin)).status, 403);
  assert.equal((await reviewPost(request(account.token, {}))).status, 503);
  process.env.VERIFICATION_REVIEW_SECRET = 'review-test-secret-'.repeat(3);
  try {
    assert.equal((await reviewPost(request(account.token, {}))).status, 401);
    const adminRequest = new Request('http://localhost:3040/api/verification/review', { method: 'POST', headers: { authorization: `Bearer ${process.env.VERIFICATION_REVIEW_SECRET}`, 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: account.user.tenantId, submissionId: data.verification.submissionId, status: 'verified', reviewedBy: 'Synthetic service reviewer', evidence, expiresAt: future() }) });
    const approved = await reviewPost(adminRequest);
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).accessLevel, 'verified');
    assert.equal((await getWorkspace(account.user.tenantId)).platform?.billing.status, 'free');
  } finally { delete process.env.VERIFICATION_REVIEW_SECRET; }
});
