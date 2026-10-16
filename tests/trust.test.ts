import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { executeAction, verifyAudit } from '../src/lib/service';
import {
  academyTasks,
  executeTrustAction,
  reviewTrustRequest,
  trustActionSchema,
  trustSnapshot,
} from '../src/lib/trust';
import { reviewLicenseVerification, submitLicenseVerification } from '../src/lib/verification';
import { GET, POST } from '../src/app/api/trust/route';
import { GET as report } from '../src/app/api/trust/report/route';
import type { CmaRecord } from '../src/lib/types';
process.env.SQLITE_PATH = resolve('.data', `trust-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
delete process.env.APP_ORIGIN;
after(async () => closeDatabase());
const owner = () =>
  register({
    name: 'Trust Test Owner',
    email: `${randomUUID()}@example.test`,
    password: 'private trust passphrase 1234',
  });
const request = (token: string, body?: unknown) =>
  new Request('http://localhost:3040/api/trust', {
    method: body ? 'POST' : 'GET',
    headers: { cookie: sessionCookie(token), origin: 'http://localhost:3040', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test('Academy ignores seeded CMAs and derives completion from actual saved, inspected and approved workflow evidence', async () => {
  const account = await owner();
  let workspace = await getWorkspace(account.user.tenantId);
  assert.ok(academyTasks(workspace, account.user).every(task => !task.complete));
  await executeTrustAction(account.user, { action: 'inspectCma', cmaId: workspace.cmas[0].id });
  await executeAction(account.user, { type: 'approveCma', id: workspace.cmas[0].id });
  assert.ok(academyTasks(await getWorkspace(account.user.tenantId), account.user).every(task => !task.complete));
  const saved = await executeAction(account.user, {
    type: 'saveCma',
    propertyId: 'property-01',
    name: 'Actual user pricing decision',
  });
  const cma = saved.result as CmaRecord;
  const evidence = await executeTrustAction(account.user, { action: 'inspectCma', cmaId: cma.id });
  assert.ok((evidence.result.result as { calculationHash: string }).calculationHash);
  await executeAction(account.user, { type: 'approveCma', id: cma.id });
  workspace = await getWorkspace(account.user.tenantId);
  const tasks = academyTasks(workspace, account.user);
  for (const id of ['save-cma', 'inspect-evidence', 'review-cma'])
    assert.equal(tasks.find(task => task.id === id)!.complete, true);
  assert.ok(academyTasks(workspace, { ...account.user, id: 'other-member' }).every(task => !task.complete));
  assert.equal(trustActionSchema.safeParse({ action: 'completeTask', id: 'save-cma' }).success, false);
  assert.equal(verifyAudit(workspace), true);
});

test('support, training and review are honest private queues, tenant-bound and cannot self-certify a professional review', async () => {
  const account = await owner(),
    other = await owner();
  const workspace = await getWorkspace(account.user.tenantId);
  const support = await executeTrustAction(account.user, {
    action: 'requestSupport',
    category: 'workflow',
    title: 'Inspect adjustment evidence',
    message: 'Private support question',
    context: { cmaId: workspace.cmas[0].id },
  });
  const ticket = (support.result.result as { ticket: { id: string } }).ticket;
  assert.equal(support.result.service.externalExperts, false);
  assert.equal(trustSnapshot(await getWorkspace(other.user.tenantId), other.user).tickets.length, 0);
  await assert.rejects(executeTrustAction(other.user, { action: 'resolveTicket', id: ticket.id }), /not found/);
  await assert.rejects(
    executeTrustAction(account.user, {
      action: 'requestSupport',
      category: 'data',
      title: 'Wrong context',
      context: { cmaId: 'foreign-cma' },
    }),
    /not found/,
  );
  const training = await executeTrustAction(account.user, { action: 'requestTraining', topic: 'pricing' });
  assert.equal((training.result.result as { ticket: { status: string } }).ticket.status, 'open');
  assert.equal(training.result.service.trainingScheduling, false);
  const review = await executeTrustAction(account.user, {
    action: 'requestReview',
    context: { cmaId: workspace.cmas[0].id },
  });
  const reviewId = (review.result.result as { ticket: { id: string } }).ticket.id;
  const resolved = await executeTrustAction(account.user, { action: 'resolveTicket', id: reviewId });
  assert.equal(
    (resolved.result.result as { ticket: { professionalReview: { status: string } } }).ticket.professionalReview.status,
    'pending',
  );
  await assert.rejects(
    executeTrustAction({ ...account.user, role: 'viewer' }, { action: 'requestTraining', topic: 'offers' }),
    /viewing only/i,
  );
  assert.ok(!JSON.stringify((await getWorkspace(account.user.tenantId)).audit).includes('Private support question'));
});

test('only independent verified reviewers behind the separately configured service credential can record professional review', async () => {
  const account = await owner(),
    reviewer = await owner();
  const workspace = await getWorkspace(account.user.tenantId);
  const queued = await executeTrustAction(account.user, {
    action: 'requestReview',
    context: { cmaId: workspace.cmas[0].id },
  });
  const ticketId = (queued.result.result as { ticket: { id: string } }).ticket.id;
  const secret = 'trust-review-service-'.repeat(3),
    serviceRequest = new Request('http://localhost/api/trust/review', {
      headers: { authorization: `Bearer ${secret}` },
    });
  const input = {
    tenantId: account.user.tenantId,
    ticketId,
    action: 'professionalReview',
    reviewerId: reviewer.user.id,
    reviewerTenantId: reviewer.user.tenantId,
    decision: 'reviewed',
    response: 'Synthetic test reviewer inspected the supplied evidence.',
    evidence: [
      {
        url: 'https://example.test/review',
        reference: 'Synthetic integration evidence, no external review performed.',
      },
    ],
  };
  delete process.env.TRUST_REVIEW_SECRET;
  process.env.VERIFICATION_REVIEW_SECRET = secret;
  await assert.rejects(reviewTrustRequest(serviceRequest, input), /not configured/);
  process.env.TRUST_REVIEW_SECRET = secret;
  try {
    await assert.rejects(reviewTrustRequest(request(account.token), input), /credentials/);
    await assert.rejects(reviewTrustRequest(serviceRequest, input), /verified reviewer/);
    const submission = await submitLicenseVerification(reviewer.user, {
      state: 'VA',
      licenseNumber: 'SYNTHETIC-REVIEWER',
      legalName: 'Synthetic Qualified Reviewer',
    });
    await reviewLicenseVerification({
      tenantId: reviewer.user.tenantId,
      submissionId: submission.result.submissionId,
      status: 'verified',
      reviewedBy: 'Synthetic independent verifier',
      evidence: [{ url: 'https://example.test/license', reference: 'Test fixture only' }],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const reviewed = await reviewTrustRequest(serviceRequest, input);
    assert.equal(reviewed.result.ticket.professionalReview!.status, 'reviewed');
    assert.equal(reviewed.result.ticket.status, 'responded');
    assert.equal((await getWorkspace(account.user.tenantId)).cmas[0].approvedAt, workspace.cmas[0].approvedAt);
    const self = await executeTrustAction(reviewer.user, {
      action: 'requestReview',
      context: { cmaId: (await getWorkspace(reviewer.user.tenantId)).cmas[0].id },
    });
    await assert.rejects(
      reviewTrustRequest(serviceRequest, {
        ...input,
        tenantId: reviewer.user.tenantId,
        ticketId: (self.result.result as { ticket: { id: string } }).ticket.id,
      }),
      /independent/,
    );
  } finally {
    delete process.env.TRUST_REVIEW_SECRET;
    delete process.env.VERIFICATION_REVIEW_SECRET;
  }
});

test('structured feedback rejects raw fields, and denied sources hide support text and rollback before-images', async () => {
  const account = await owner();
  assert.equal(
    trustActionSchema.safeParse({
      action: 'feedback',
      target: 'academy',
      usefulness: 5,
      reasonCode: 'clear',
      message: 'Private client name',
    }).success,
    false,
  );
  await executeTrustAction(account.user, {
    action: 'feedback',
    target: 'academy',
    usefulness: 4,
    reasonCode: 'actionable',
  });
  await executeTrustAction(account.user, {
    action: 'requestSupport',
    title: 'SUPPORT-PRIVATE-SENTINEL',
    category: 'account',
    message: 'SUPPORT-MESSAGE-SENTINEL',
  });
  await mutateWorkspace(account.user, workspace => {
    workspace.sources.push({
      id: 'denied-source',
      label: 'Denied',
      kind: 'licensed',
      observedAt: workspace.asOf,
      license: 'No grant',
      confidence: 0,
    });
    workspace.properties.push({ ...workspace.properties[0], id: 'denied-property', sourceId: 'denied-source' });
  });
  const snapshot = JSON.stringify(trustSnapshot(await getWorkspace(account.user.tenantId), account.user));
  assert.ok(!snapshot.includes('SUPPORT-PRIVATE-SENTINEL'));
  assert.ok(!snapshot.includes('SUPPORT-MESSAGE-SENTINEL'));
  assert.ok(snapshot.includes('actionable'));
});

test('HTTP routes require session and origin, and only actual successful report generation completes export task', async () => {
  assert.equal((await GET(new Request('http://localhost:3040/api/trust'))).status, 401);
  const account = await owner();
  assert.equal(
    (
      await POST(
        new Request('http://localhost:3040/api/trust', {
          method: 'POST',
          headers: {
            cookie: sessionCookie(account.token),
            origin: 'https://other.invalid',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ action: 'requestTraining', topic: 'pricing' }),
        }),
      )
    ).status,
    403,
  );
  const saved = await executeAction(account.user, {
    type: 'saveCma',
    propertyId: 'property-01',
    name: 'Real report generation',
  });
  const cma = saved.result as CmaRecord;
  const response = await report(
    new Request(`http://localhost:3040/api/trust/report?cmaId=${cma.id}`, {
      headers: { cookie: sessionCookie(account.token) },
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /html/);
  assert.equal(
    academyTasks(await getWorkspace(account.user.tenantId), account.user).find(task => task.id === 'export-report')!
      .complete,
    true,
  );
  const failed = await report(
    new Request('http://localhost:3040/api/trust/report?cmaId=unknown', {
      headers: { cookie: sessionCookie(account.token) },
    }),
  );
  assert.equal(failed.status, 404);
});
