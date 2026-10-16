import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace, transaction } from './db';
import { scopeWorkspaceForAccess } from './fabric';
import { hasVerifiedLicense } from './platform';
import { recordProductAction } from './product';
import { appendAudit, find } from './service';
import { authorizeVerificationReview } from './verification';
import type { Actor, Workspace } from './types';
import type { AcademyTask, TrustContext, TrustState, TrustTicket } from './trust-types';

const id = z.string().min(1).max(100);
export const trustContextSchema = z.strictObject({ propertyId: id.optional(), clientId: id.optional(), cmaId: id.optional(), transactionId: id.optional(), domainProposalId: id.optional() });
const text = z.string().trim().min(1).max(2000);
export const trustActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('requestSupport'), title: text.max(150), category: z.enum(['workflow', 'data', 'account', 'migration']), context: trustContextSchema.default({}), message: text.optional() }),
  z.strictObject({ action: z.literal('requestReview'), context: trustContextSchema.refine(value => !!value.cmaId || !!value.domainProposalId, 'Select a CMA or domain proposal.'), question: text.optional() }),
  z.strictObject({ action: z.literal('requestTraining'), topic: z.enum(['pricing', 'offers', 'transactions', 'portability']), context: trustContextSchema.default({}) }),
  z.strictObject({ action: z.literal('resolveTicket'), id }),
  z.strictObject({ action: z.literal('inspectCma'), cmaId: id }),
  z.strictObject({ action: z.literal('feedback'), target: z.enum(['academy', 'assistant', 'report', 'support']), usefulness: z.number().int().min(1).max(5), reasonCode: z.enum(['clear', 'actionable', 'missing-evidence', 'confusing', 'not-relevant']), context: trustContextSchema.default({}) }),
]);
export function ensureTrust(workspace: Workspace): TrustState { return workspace.trust ??= { version: 1, tickets: [], feedback: [] }; }
export function validateTrustContext(workspace: Workspace, context: TrustContext) {
  const scoped = scopeWorkspaceForAccess(workspace);
  if (context.propertyId) find(scoped.properties, context.propertyId, 'Property');
  if (context.clientId) find(scoped.clients, context.clientId, 'Client');
  if (context.cmaId) find(scoped.cmas, context.cmaId, 'CMA');
  if (context.transactionId) find(scoped.transactions, context.transactionId, 'Transaction');
  if (context.domainProposalId) { const domain = (workspace as Workspace & { domain?: { proposals?: { id: string }[] } }).domain; find(domain?.proposals ?? [], context.domainProposalId, 'Domain proposal'); }
  if (context.propertyId && context.cmaId && scoped.cmas.find(record => record.id === context.cmaId)?.propertyId !== context.propertyId) throw new HttpError(400, 'CMA and property context do not match.');
  return scoped;
}
export function academyTasks(workspace: Workspace, actor: Actor): AcademyTask[] {
  const scoped = scopeWorkspaceForAccess(workspace);
  const boundary = workspace.audit.findIndex(event => event.action === 'registerWorkspace');
  const events = workspace.audit.slice(boundary + 1).filter(event => event.actorId === actor.id);
  const evidence = (action: string, valid: (entityId: string) => boolean) => events.filter(event => event.action === action && valid(event.entityId)).map(event => event.entityId);
  const saved = evidence('saveCma', target => scoped.cmas.some(record => record.id === target && !!record.result.inputSnapshot));
  const inspected = evidence('academyInspectCma', target => saved.includes(target));
  const reviewed = evidence('approveCma', target => saved.includes(target) && scoped.cmas.some(record => record.id === target && !!record.approvedAt));
  const drafted = evidence('draftCounter', target => scoped.approvals.some(record => record.id === target && record.kind === 'counteroffer'));
  const exported = evidence('trustReportExport', target => saved.includes(target));
  return [
    { id: 'save-cma', title: 'Preserve your first pricing decision', description: 'Save a CMA with frozen inputs and inspectable assumptions. Bundled sample reports do not complete this task.', nextAction: 'pricing', evidenceIds: saved },
    { id: 'inspect-evidence', title: 'Inspect adjustments and exclusions', description: 'Request the real saved-CMA evidence breakdown, including why candidates were not used.', nextAction: 'inspectCma', evidenceIds: inspected },
    { id: 'review-cma', title: 'Record professional approval', description: 'Review an actual saved CMA and explicitly approve it in the pricing workflow.', nextAction: 'pricing', evidenceIds: reviewed },
    { id: 'counter-draft', title: 'Prepare an offer counter for review', description: 'Create a real counteroffer draft. Nothing is sent and no agreement is executed.', nextAction: 'offers', evidenceIds: drafted },
    { id: 'export-report', title: 'Open your client-facing report', description: 'Generate a permission-checked report through the Academy report link. A checkbox cannot complete this task.', nextAction: 'report', evidenceIds: exported },
  ].map(task => ({ ...task, complete: task.evidenceIds.length > 0 }));
}
export function trustSnapshot(workspace: Workspace, actor: Actor) {
  const state = ensureTrust(scopeWorkspaceForAccess(workspace));
  const visible = <T extends { context: TrustContext }>(records: T[]) => records.filter(record => { try { validateTrustContext(workspace, record.context); return true; } catch { return false; } });
  return { academy: academyTasks(workspace, actor), tickets: visible(state.tickets), feedback: visible(state.feedback), service: { externalExperts: false, trainingScheduling: false, note: 'Requests are stored privately. No expert, response time, meeting schedule or external delivery is invented.' } };
}
export async function executeTrustAction(actor: Actor, raw: unknown) {
  requireEditor(actor); const input = trustActionSchema.parse(raw);
  return mutateWorkspace(actor, workspace => {
    const state = ensureTrust(workspace); const now = new Date().toISOString(); let result: unknown;
    if ('context' in input) validateTrustContext(workspace, input.context);
    if (input.action === 'inspectCma') {
      const cma = find(scopeWorkspaceForAccess(workspace, 'valuation').cmas, input.cmaId, 'CMA');
      appendAudit(workspace, actor, 'academyInspectCma', cma.id, 'Actual saved adjustment and exclusion evidence retrieved; no checkbox completion.');
      recordProductAction(workspace, actor, 'academyInspectCma', cma.id);
      result = { cmaId: cma.id, calculationHash: cma.result.calculationHash, comps: cma.result.comps, excluded: cma.result.excluded, warnings: cma.result.warnings };
    } else if (input.action === 'resolveTicket') {
      const ticket = find(state.tickets, input.id, 'Support request'); validateTrustContext(workspace, ticket.context); ticket.status = 'resolved'; ticket.resolvedAt = now; result = { ticket };
      appendAudit(workspace, actor, 'resolveTrustTicket', ticket.id, 'Requester closed the ticket; this does not certify a professional review.');
    } else if (input.action === 'feedback') {
      const feedback = { id: randomUUID(), target: input.target, usefulness: input.usefulness, reasonCode: input.reasonCode, context: input.context, at: now }; state.feedback.unshift(feedback); state.feedback = state.feedback.slice(0, 500); result = { feedback };
      appendAudit(workspace, actor, 'recordTrustFeedback', feedback.id, 'Structured usefulness code only; no free-form client information in feedback audit.');
    } else {
      if (state.tickets.filter(ticket => ticket.status !== 'resolved').length >= 100) throw new HttpError(409, 'Resolve an existing request before creating more than 100 open requests.');
      const kind: TrustTicket['kind'] = input.action === 'requestSupport' ? 'support' : input.action === 'requestReview' ? 'professional-review' : 'training';
      const ticket: TrustTicket = { id: randomUUID(), kind, title: input.action === 'requestSupport' ? input.title : input.action === 'requestReview' ? 'Professional review requested' : `Training requested: ${input.topic}`, category: input.action === 'requestSupport' ? input.category : input.action === 'requestTraining' ? input.topic : 'professional', context: input.context, message: input.action === 'requestSupport' ? input.message : input.action === 'requestReview' ? input.question : undefined, status: 'open', createdAt: now, submittedBy: actor.id, ...(kind === 'professional-review' ? { professionalReview: { status: 'pending' as const } } : {}) };
      state.tickets.unshift(ticket); result = { ticket };
      appendAudit(workspace, actor, 'requestTrustSupport', ticket.id, `${kind} queued privately. No external professional or training appointment is assigned.`);
    }
    const snapshot = trustSnapshot(workspace, actor);
    if (result && typeof result === 'object' && 'ticket' in result) { const ticket = (result as { ticket: TrustTicket }).ticket; result = { ticket: snapshot.tickets.find(item => item.id === ticket.id) }; }
    return { ...snapshot, result };
  });
}
export const trustReviewSchema = z.strictObject({ tenantId: z.uuid(), ticketId: id, action: z.enum(['respond', 'professionalReview']), response: text, reviewerId: id, reviewerTenantId: z.uuid().optional(), decision: z.enum(['reviewed', 'declined']).optional(), evidence: z.array(z.strictObject({ url: z.url().refine(value => new URL(value).protocol === 'https:'), reference: text.max(500) })).min(1).max(10) });
export async function reviewTrustRequest(request: Request, raw: unknown) {
  authorizeVerificationReview(request, process.env.TRUST_REVIEW_SECRET || '');
  const input = trustReviewSchema.parse(raw);
  if (input.action === 'professionalReview') {
    if (!input.reviewerTenantId || !input.decision) throw new HttpError(400, 'Professional review requires a qualified reviewer workspace and decision.');
    const reviewerWorkspace = await getWorkspace(input.reviewerTenantId);
    const members = await transaction(null, tx => tx.query<{ role: string }>('SELECT role FROM users WHERE id=$1 AND tenant_id=$2', [input.reviewerId, input.reviewerTenantId!]));
    if (!hasVerifiedLicense(reviewerWorkspace) || reviewerWorkspace.platform?.verification.submittedBy !== input.reviewerId || members[0]?.role !== 'owner') throw new HttpError(403, 'A current independently verified reviewer account is required. A claimed title is insufficient.');
  }
  const actor: Actor = { id: input.reviewerId, tenantId: input.tenantId, role: 'owner', name: 'Trusted support service', email: 'support@system.invalid' };
  return mutateWorkspace(actor, workspace => {
    const ticket = find(ensureTrust(workspace).tickets, input.ticketId, 'Support request'); validateTrustContext(workspace, ticket.context);
    if (ticket.status === 'resolved') throw new HttpError(409, 'This request was already resolved.');
    if (input.action === 'professionalReview') {
      if (ticket.kind !== 'professional-review' || ticket.submittedBy === input.reviewerId) throw new HttpError(403, 'Professional review must be independent of the requester.');
      ticket.professionalReview = { status: input.decision!, reviewerId: input.reviewerId, reviewedAt: new Date().toISOString(), evidence: input.evidence };
    }
    ticket.response = input.response; ticket.respondedAt = new Date().toISOString(); ticket.status = 'responded';
    appendAudit(workspace, actor, 'respondTrustRequest', ticket.id, 'Trusted response recorded. No communication sent and no domain rule or recommendation automatically approved.');
    return { ticket };
  });
}
