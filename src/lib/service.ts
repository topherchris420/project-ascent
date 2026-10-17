import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calculateCma, buildDecisionGraph, detectMarketChanges } from './analytics';
import { assessValuationRelease } from './valuation-safeguards';
import { auditDigest, HttpError, requireEditor } from './auth';
import { getWorkspace, mutateWorkspace, storeDocument, type DbTransaction } from './db';
import { clientRoles, clientStages, type Actor, type DocumentRecord, type Workspace } from './types';
import { activePropertyIds, regionalAssumptions, scopeWorkspaceForAccess } from './fabric';
import { inspectFairHousing } from './fair-housing';
import type { FairHousingSurface } from './domain-types';
import { recordProductAction } from './product';
import { evaluateSavedSearch } from './client-intelligence';
import { analyzeContractDates, extractContractDates } from './contract-dates';
import { readDocumentText } from './document-reader';
import { documentSizeError } from './upload-limits';

const id = z.string().min(1).max(100);
const text = z.string().trim().min(1).max(5000);
const money = z.number().finite().min(0).max(1_000_000_000);
const date = z
  .string()
  .refine(
    value =>
      /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value.slice(0, 10),
    'Use a valid ISO date.',
  );
const assumptions = z
  .object({
    sqftRate: z.number().min(0).max(1000),
    bedroomValue: money,
    bathroomValue: money,
    conditionValue: money,
    monthlyTrend: z.number().min(-0.1).max(0.1),
    maxDistanceMiles: z.number().min(0.1).max(100),
    maxAgeDays: z.number().int().min(1).max(1825),
    maxSizeRatio: z.number().min(0.1).max(3),
  })
  .partial();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('saveCma'),
    propertyId: id,
    name: z.string().trim().min(1).max(150),
    compIds: z.array(id).max(50).optional(),
    assumptions: assumptions.optional(),
  }),
  z.object({ type: z.literal('approveCma'), id, acknowledgeReview: z.boolean().optional() }),
  z.object({
    type: z.literal('saveClient'),
    id: id.optional(),
    name: z.string().trim().min(1).max(150),
    email: z.email().max(254),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[0-9+().\-\s]*$/, 'Use digits, spaces and + ( ) - . only.')
      .optional(),
    role: z.enum(clientRoles).optional(),
    stage: z.enum(clientStages),
    budget: money,
    preferences: z.string().max(5000),
  }),
  z.object({ type: z.literal('addClientNote'), id, note: text }),
  z.object({
    type: z.literal('saveSearch'),
    name: z.string().trim().min(1).max(150),
    query: z.string().max(500),
    maxPrice: money,
    clientId: id.optional(),
    criteria: z
      .strictObject({
        minBedrooms: z.number().int().min(0).max(50).optional(),
        minBathrooms: z.number().min(0).max(50).optional(),
        minSqft: z.number().positive().max(1000000).optional(),
        state: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        zip: z
          .string()
          .regex(/^\d{5}$/)
          .optional(),
        status: z.enum(['all', 'active', 'sold', 'pending', 'withdrawn']).optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('reviewSavedSearch'), id }),
  z.object({
    type: z.literal('saveFollowUp'),
    clientId: id,
    title: z.string().trim().min(1).max(200),
    dueAt: date,
    propertyId: id.optional(),
  }),
  z.object({ type: z.literal('setFollowUpStatus'), clientId: id, id, status: z.enum(['pending', 'complete']) }),
  z.object({ type: z.literal('setClientProperty'), clientId: id, propertyId: id, saved: z.boolean() }),
  z.object({
    type: z.literal('saveOffer'),
    propertyId: id,
    buyer: z.string().trim().min(1).max(150),
    price: money.positive(),
    sellerCredit: money,
    financing: z.enum(['cash', 'conventional', 'fha', 'va']),
    downPercent: z.number().min(0).max(100),
    earnestMoney: money,
    contingencies: z.array(z.string().max(150)).max(20),
    closeDate: date,
    expiresAt: date,
  }),
  z.object({ type: z.literal('draftCounter'), offerId: id, price: money.positive(), note: z.string().max(5000) }),
  z.object({ type: z.literal('approveDraft'), id }),
  z.object({ type: z.literal('draftListingDescription'), propertyId: id, text: text }),
  z.object({ type: z.literal('saveTransaction'), propertyId: id, clientId: id }),
  z.object({ type: z.literal('toggleMilestone'), transactionId: id, milestoneId: id }),
  z.object({
    type: z.literal('addMilestone'),
    transactionId: id,
    title: z.string().trim().min(1).max(200),
    dueAt: date,
  }),
  z.object({
    type: z.literal('approveExtractedDate'),
    documentId: id,
    index: z.number().int().min(0).max(99),
    title: z.string().trim().min(1).max(200),
    reviewedDate: date.optional(),
    reviewNote: z.string().trim().max(1000).optional(),
    assumptionsReviewed: z.boolean().optional(),
  }),
  z
    .object({
      type: z.literal('recordCheckIn'),
      propertyId: id,
      weekOf: date,
      showings: z.number().int().min(0).max(500),
      secondShowings: z.number().int().min(0).max(500),
      offers: z.number().int().min(0).max(100),
      feedback: z.string().trim().max(2000),
    })
    .refine(value => value.secondShowings <= value.showings, {
      message: 'Second showings cannot exceed showings.',
      path: ['secondShowings'],
    }),
  z.object({ type: z.literal('markAlertRead'), id }),
  z.object({ type: z.literal('runMonitor') }),
  z.object({
    type: z.literal('recordOutcome'),
    propertyId: id,
    cmaId: id,
    actualPrice: money.positive(),
    observedAt: date,
    notes: z.string().max(5000),
  }),
  z.object({
    type: z.literal('updateSettings'),
    retentionDays: z.number().int().min(1).max(3650),
    organization: z.string().trim().min(1).max(150),
  }),
  z.object({ type: z.literal('purgeExpiredDocuments') }),
]);
export type Action = z.infer<typeof actionSchema>;

export function find<T extends { id: string }>(items: T[], target: string, label: string): T {
  const found = items.find(item => item.id === target);
  if (!found) throw new HttpError(404, `${label} was not found in this workspace.`);
  return found;
}

export function appendAudit(workspace: Workspace, actor: Actor, action: string, entityId: string, details = '') {
  const event = {
    id: randomUUID(),
    actorId: actor.id,
    action,
    entityId,
    at: new Date().toISOString(),
    details,
    previousHash: workspace.audit.at(-1)?.hash || 'genesis',
  };
  const hash = auditDigest(event);
  workspace.audit.push({ ...event, hash });
}

export function verifyAudit(workspace: Workspace): boolean {
  let previous = 'genesis';
  for (const event of workspace.audit) {
    const { hash, ...body } = event;
    if (body.previousHash !== previous || auditDigest(body) !== hash) return false;
    previous = hash;
  }
  return true;
}

export function refreshGraph(workspace: Workspace) {
  const graph = buildDecisionGraph(workspace);
  workspace.nodes = graph.nodes;
  workspace.edges = graph.edges;
}

export async function executeAction(actor: Actor, raw: unknown) {
  requireEditor(actor);
  const action = actionSchema.parse(raw);
  if (action.type === 'updateSettings' || action.type === 'purgeExpiredDocuments') {
    if (actor.role !== 'owner')
      throw new HttpError(403, 'Only the workspace owner can change retention or purge documents.');
  }
  const startedAt = performance.now();
  const safetyInputs: { text: string; surface: FairHousingSurface }[] = [];
  if (action.type === 'saveClient') safetyInputs.push({ text: action.preferences, surface: 'client-preferences' });
  if (action.type === 'saveSearch') safetyInputs.push({ text: `${action.name}\n${action.query}`, surface: 'search' });
  if (action.type === 'reviewSavedSearch') {
    const search = find(
      scopeWorkspaceForAccess(await getWorkspace(actor.tenantId)).savedSearches,
      action.id,
      'Saved search',
    );
    safetyInputs.push({ text: `${search.name}\n${search.query}`, surface: 'search' });
  }
  if (action.type === 'addClientNote') safetyInputs.push({ text: action.note, surface: 'client-communication' });
  if (action.type === 'saveFollowUp') safetyInputs.push({ text: action.title, surface: 'client-communication' });
  if (action.type === 'recordCheckIn' && action.feedback)
    safetyInputs.push({ text: action.feedback, surface: 'client-communication' });
  if (action.type === 'draftCounter') safetyInputs.push({ text: action.note, surface: 'client-communication' });
  if (action.type === 'draftListingDescription') safetyInputs.push({ text: action.text, surface: 'advertising' });
  if (action.type === 'approveDraft') {
    const workspace = scopeWorkspaceForAccess(await getWorkspace(actor.tenantId));
    safetyInputs.push({ text: find(workspace.approvals, action.id, 'Draft').draft, surface: 'client-communication' });
  }
  for (const input of safetyInputs) {
    const assessment = inspectFairHousing(input.text, { surface: input.surface });
    if (assessment.decision !== 'allow') {
      // Commit the structured safety event independently so rejecting the business action does not erase the audit.
      await mutateWorkspace(actor, workspace => {
        workspace.domain ??= { version: 1, proposals: [], evaluations: [], safetyEvents: [] };
        workspace.domain.safetyEvents.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          actorId: actor.id,
          surface: input.surface,
          decision: assessment.decision,
          codes: assessment.findings.map(finding => finding.code),
          policyVersion: assessment.policyVersion,
        });
        workspace.domain.safetyEvents = workspace.domain.safetyEvents.slice(-500);
        appendAudit(
          workspace,
          actor,
          'fairHousingWorkflowHeld',
          action.type,
          `${assessment.policyVersion}; ${assessment.decision}; ${assessment.findings.map(finding => finding.code).join(', ')}. Raw text excluded.`,
        );
      });
      throw new HttpError(
        422,
        `${assessment.explanation} ${assessment.findings.map(finding => finding.reason).join(' ')}`,
      );
    }
  }
  return mutateWorkspace(actor, async (workspace, tx) => {
    const accessible = scopeWorkspaceForAccess(workspace);
    const permit = <T extends { id: string }>(all: T[], allowed: T[], target: string, label: string) => {
      if (all.some(item => item.id === target) && !allowed.some(item => item.id === target))
        throw new HttpError(403, `Current source permissions do not permit this ${label.toLowerCase()} workflow.`);
    };
    if ('propertyId' in action && action.propertyId)
      permit(workspace.properties, accessible.properties, action.propertyId, 'Property');
    if ('transactionId' in action)
      permit(workspace.transactions, accessible.transactions, action.transactionId, 'Transaction');
    if (action.type === 'approveCma') permit(workspace.cmas, accessible.cmas, action.id, 'CMA');
    if (action.type === 'draftCounter') permit(workspace.offers, accessible.offers, action.offerId, 'Offer');
    if (action.type === 'approveDraft') permit(workspace.approvals, accessible.approvals, action.id, 'Draft');
    if (action.type === 'approveExtractedDate')
      permit(workspace.documents, accessible.documents, action.documentId, 'Document');
    if (action.type === 'recordOutcome') permit(workspace.cmas, accessible.cmas, action.cmaId, 'CMA');
    if (action.type === 'addClientNote' || (action.type === 'saveClient' && action.id))
      permit(workspace.clients, accessible.clients, action.id!, 'Client');
    if ('clientId' in action && action.clientId)
      permit(workspace.clients, accessible.clients, action.clientId, 'Client');
    const now = new Date().toISOString();
    let entityId = '';
    let result: unknown = null;
    let auditDetails = '';
    switch (action.type) {
      case 'saveCma': {
        const valuation = scopeWorkspaceForAccess(workspace, 'valuation');
        permit(workspace.properties, valuation.properties, action.propertyId, 'Valuation');
        if (action.compIds)
          for (const compId of action.compIds) permit(workspace.properties, valuation.properties, compId, 'Comparable');
        const property = find(valuation.properties, action.propertyId, 'Property');
        const recordRegion = workspace.fabric?.records.find(
          record => (record.propertyId ?? record.id) === property.id,
        )?.regionId;
        const synthetic = (sourceId: string) =>
          valuation.sources.find(source => source.id === sourceId)?.kind === 'synthetic';
        const regionalIds = recordRegion
          ? new Set(
              workspace
                .fabric!.records.filter(record => record.regionId === recordRegion)
                .map(record => record.propertyId ?? record.id),
            )
          : null;
        const candidates = action.compIds
          ? action.compIds.map(compId => find(valuation.properties, compId, 'Comparable'))
          : valuation.properties.filter(
              candidate =>
                (!regionalIds || regionalIds.has(candidate.id)) &&
                synthetic(candidate.sourceId) === synthetic(property.sourceId),
            );
        if (candidates.some(candidate => synthetic(candidate.sourceId) !== synthetic(property.sourceId)))
          throw new HttpError(400, 'Synthetic and source-provided records cannot be combined in one CMA.');
        const calculation = calculateCma(
          property,
          candidates,
          {
            ...regionalAssumptions(recordRegion || workspace.fabric?.selectedRegionId || 'austin'),
            ...action.assumptions,
          },
          workspace.asOf,
        );
        if (!calculation.comps.length)
          throw new HttpError(422, 'No eligible comparable sales. Broaden the selection or review assumptions.');
        const cma = {
          id: randomUUID(),
          name: action.name,
          propertyId: property.id,
          createdAt: now,
          result: calculation,
          release: assessValuationRelease(calculation, { sources: valuation.sources, now }),
        };
        workspace.cmas.push(cma);
        auditDetails = `Release gate ${cma.release.decision} (${cma.release.policyVersion}).`;
        entityId = cma.id;
        result = cma;
        break;
      }
      case 'approveCma': {
        const cma = find(workspace.cmas, action.id, 'CMA');
        if (cma.approvedAt) throw new HttpError(409, 'This analysis is already approved.');
        // Re-run the gate now: the operator switch, engine build or source metadata may have changed since saving.
        const release = assessValuationRelease(cma.result, { sources: workspace.sources, now });
        if (release.decision === 'withhold')
          throw new HttpError(409, `${release.summary} Calculation remains available for review.`);
        const reviewItems = release.checks.filter(check => check.status === 'review');
        if (reviewItems.length && action.acknowledgeReview !== true)
          throw new HttpError(409, `${release.summary} Confirm you reviewed these items to approve.`);
        cma.release = release;
        cma.approvedAt = now;
        cma.approval = {
          decision: release.decision,
          acknowledgedChecks: reviewItems.map(check => check.id),
          policyVersion: release.policyVersion,
          approvedBy: actor.id,
        };
        entityId = cma.id;
        auditDetails = `Release gate ${release.decision}; acknowledged ${reviewItems.map(check => check.id).join(', ') || 'none'} (${release.policyVersion}).`;
        break;
      }
      case 'saveClient': {
        const existing = action.id ? find(workspace.clients, action.id, 'Client') : undefined;
        const values = {
          name: action.name,
          email: action.email,
          phone: action.phone || undefined,
          role: action.role,
          stage: action.stage,
          budget: action.budget,
          preferences: action.preferences,
        };
        if (existing) {
          Object.assign(existing, values);
          entityId = existing.id;
        } else {
          entityId = randomUUID();
          workspace.clients.unshift({
            id: entityId,
            ...values,
            savedPropertyIds: [],
            timeline: [{ date: now, note: 'Client profile created.' }],
          });
        }
        break;
      }
      case 'addClientNote': {
        const client = find(workspace.clients, action.id, 'Client');
        client.timeline.unshift({ date: now, note: action.note });
        entityId = client.id;
        break;
      }
      case 'saveSearch': {
        if (action.clientId) find(workspace.clients, action.clientId, 'Client');
        entityId = randomUUID();
        workspace.savedSearches.push({
          id: entityId,
          name: action.name,
          query: action.query,
          maxPrice: action.maxPrice,
          clientId: action.clientId,
          criteria: action.criteria,
          createdAt: now,
        });
        break;
      }
      case 'reviewSavedSearch': {
        const search = find(accessible.savedSearches, action.id, 'Saved search');
        const evaluation = evaluateSavedSearch(search, accessible.properties);
        let created = 0;
        for (const match of evaluation.filter(match => match.matched)) {
          const property = find(accessible.properties, match.propertyId, 'Property');
          const fingerprint = createHash('sha256')
            .update(
              JSON.stringify([
                search.id,
                search.query,
                search.maxPrice,
                search.criteria,
                property.id,
                property.status,
                property.price,
                property.soldPrice,
                property.beds,
                property.baths,
                property.sqft,
                property.sourceId,
              ]),
            )
            .digest('hex');
          if (workspace.alerts.some(alert => alert.fingerprint === fingerprint)) continue;
          workspace.alerts.unshift({
            id: randomUUID(),
            propertyId: property.id,
            clientId: search.clientId,
            searchId: search.id,
            title: `Saved search match: ${search.name}`,
            explanation: `Stored inventory matches explicit criteria. ${match.reasons.join(' ')} Confirm current availability and client preferences before outreach. This review fetched no new provider data and sent no message.`,
            severity: 'info',
            sourceIds: [property.sourceId],
            createdAt: now,
            read: false,
            fingerprint,
          });
          created++;
        }
        entityId = search.id;
        result = {
          matches: evaluation.filter(match => match.matched).length,
          needsEvidence: evaluation.filter(match => match.needsEvidence).length,
          createdAlerts: created,
          providerRequests: 0,
        };
        break;
      }
      case 'saveFollowUp': {
        const client = find(workspace.clients, action.clientId, 'Client');
        if (action.propertyId) find(accessible.properties, action.propertyId, 'Property');
        entityId = randomUUID();
        (client.followUps ??= []).push({
          id: entityId,
          title: action.title,
          dueAt: action.dueAt,
          propertyId: action.propertyId,
          status: 'pending',
          createdAt: now,
        });
        result = { id: entityId };
        break;
      }
      case 'setFollowUpStatus': {
        const client = find(workspace.clients, action.clientId, 'Client'),
          task = find(client.followUps || [], action.id, 'Follow-up');
        if (task.propertyId) permit(workspace.properties, accessible.properties, task.propertyId, 'Property');
        if (task.status !== action.status) {
          task.status = action.status;
          task.completedAt = action.status === 'complete' ? now : undefined;
          client.timeline.push({
            date: now,
            note: `Follow-up ${action.status === 'complete' ? 'completed' : 'reopened'}: ${task.title}`,
          });
        }
        entityId = task.id;
        break;
      }
      case 'setClientProperty': {
        const client = find(workspace.clients, action.clientId, 'Client');
        find(accessible.properties, action.propertyId, 'Property');
        client.savedPropertyIds = action.saved
          ? [...new Set([...client.savedPropertyIds, action.propertyId])]
          : client.savedPropertyIds.filter(id => id !== action.propertyId);
        entityId = client.id;
        break;
      }
      case 'saveOffer': {
        find(workspace.properties, action.propertyId, 'Property');
        if (action.sellerCredit > action.price || action.earnestMoney > action.price)
          throw new HttpError(400, 'Credit and earnest money cannot exceed the offer price.');
        const { type: _, ...values } = action;
        entityId = randomUUID();
        workspace.offers.unshift({ id: entityId, ...values, status: 'received' });
        break;
      }
      case 'draftCounter': {
        const offer = find(workspace.offers, action.offerId, 'Offer');
        const property = find(workspace.properties, offer.propertyId, 'Property');
        entityId = randomUUID();
        const draft = `DRAFT FOR PROFESSIONAL REVIEW\nProperty: ${property.address}\nCounter to ${offer.buyer}: $${action.price.toLocaleString('en-US')}.\n${action.note}\nAll other terms remain subject to a fully executed written agreement. This draft has not been sent and is not legal advice.`;
        workspace.approvals.unshift({
          id: entityId,
          kind: 'counteroffer',
          entityId: offer.id,
          draft,
          status: 'draft',
          createdAt: now,
        });
        offer.status = 'counter-draft';
        result = { draft, id: entityId };
        break;
      }
      case 'draftListingDescription': {
        const property = find(accessible.properties, action.propertyId, 'Property');
        entityId = randomUUID();
        workspace.approvals.unshift({
          id: entityId,
          kind: 'communication',
          entityId: property.id,
          draft: [
            'LISTING DESCRIPTION DRAFT FOR PROFESSIONAL REVIEW',
            `Property: ${property.address}`,
            '',
            action.text,
            '',
            'Passed the automated fair-housing language check; not published or sent.',
          ].join('\n'),
          status: 'draft',
          createdAt: now,
        });
        result = { id: entityId };
        break;
      }
      case 'approveDraft': {
        const approval = find(workspace.approvals, action.id, 'Draft');
        approval.status = 'approved';
        approval.approvedAt = now;
        approval.approvedBy = actor.id;
        entityId = approval.id;
        result = { message: 'Approved for professional use. No communication was sent.' };
        break;
      }
      case 'saveTransaction': {
        find(workspace.properties, action.propertyId, 'Property');
        find(workspace.clients, action.clientId, 'Client');
        entityId = randomUUID();
        workspace.transactions.unshift({
          id: entityId,
          propertyId: action.propertyId,
          clientId: action.clientId,
          stage: 'preparing',
          notes: '',
          milestones: [
            {
              id: randomUUID(),
              title: 'Review agreement and confirm contractual deadlines',
              dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              status: 'pending',
            },
          ],
        });
        break;
      }
      case 'toggleMilestone': {
        const transaction = find(workspace.transactions, action.transactionId, 'Transaction');
        const milestone = find(transaction.milestones, action.milestoneId, 'Milestone');
        milestone.status = milestone.status === 'pending' ? 'complete' : 'pending';
        entityId = milestone.id;
        break;
      }
      case 'addMilestone': {
        const transaction = find(workspace.transactions, action.transactionId, 'Transaction');
        entityId = randomUUID();
        transaction.milestones.push({ id: entityId, title: action.title, dueAt: action.dueAt, status: 'pending' });
        break;
      }
      case 'approveExtractedDate': {
        const document = find(workspace.documents, action.documentId, 'Document');
        const candidate = document.extractedDates[action.index];
        if (!candidate) throw new HttpError(404, 'Date candidate not found.');
        if (candidate.approved) throw new HttpError(409, 'This date was already approved.');
        if (candidate.basis === 'computed' && !action.assumptionsReviewed)
          throw new HttpError(
            422,
            'Review the counting assumptions and source contract before adding this computed date.',
          );
        const reviewedDate = (action.reviewedDate ?? candidate.date).slice(0, 10);
        if (reviewedDate !== candidate.date && !action.reviewNote)
          throw new HttpError(422, 'Explain the date correction so the original proposal remains traceable.');
        const transaction = find(workspace.transactions, document.transactionId, 'Transaction');
        entityId = randomUUID();
        transaction.milestones.push({
          id: entityId,
          title: action.title,
          dueAt: reviewedDate,
          status: 'pending',
          sourceId: document.id,
          dateEvidence: {
            candidateIndex: action.index,
            proposedDate: candidate.date,
            page: candidate.evidence?.page,
            rule: candidate.rule,
            extractionVersion: document.dateAnalysis?.version,
          },
        });
        candidate.approved = true;
        candidate.approvedDate = reviewedDate;
        candidate.approvedBy = actor.id;
        candidate.approvedAt = now;
        candidate.reviewNote = action.reviewNote || undefined;
        candidate.milestoneId = entityId;
        auditDetails = JSON.stringify({
          documentId: document.id,
          candidateIndex: action.index,
          basis: candidate.basis ?? 'stated',
          proposedDate: candidate.date,
          reviewedDate,
          corrected: reviewedDate !== candidate.date,
          assumptionsReviewed: action.assumptionsReviewed === true,
          extractionVersion: document.dateAnalysis?.version,
        });
        result = { id: entityId, reviewedDate };
        break;
      }
      case 'recordCheckIn': {
        const property = find(accessible.properties, action.propertyId, 'Property');
        if (property.status !== 'active') throw new HttpError(409, 'Weekly check-ins apply to active listings only.');
        const { type: _, ...values } = action;
        const checkIns = (workspace.listingCheckIns ??= []);
        const existing = checkIns.find(
          item => item.propertyId === property.id && item.weekOf.slice(0, 10) === action.weekOf.slice(0, 10),
        );
        if (existing) {
          Object.assign(existing, values);
          entityId = existing.id;
        } else {
          entityId = randomUUID();
          checkIns.push({ id: entityId, ...values, createdAt: now });
        }
        result = { id: entityId, updated: Boolean(existing) };
        break;
      }
      case 'markAlertRead': {
        find(workspace.alerts, action.id, 'Alert').read = true;
        entityId = action.id;
        break;
      }
      case 'runMonitor': {
        result = runMonitor(workspace);
        entityId = 'market';
        break;
      }
      case 'recordOutcome': {
        const cma = find(workspace.cmas, action.cmaId, 'CMA');
        find(workspace.properties, action.propertyId, 'Property');
        if (cma.propertyId !== action.propertyId) throw new HttpError(400, 'Outcome property must match the forecast.');
        if (Date.parse(action.observedAt) <= Math.max(Date.parse(cma.result.asOf), Date.parse(cma.createdAt)))
          throw new HttpError(400, 'Outcome must be observed after the forecast was created and frozen.');
        if (Date.parse(action.observedAt) > Date.now() + 86400000)
          throw new HttpError(400, 'An observed outcome cannot be dated in the future.');
        if (workspace.outcomes.some(outcome => outcome.cmaId === cma.id && outcome.propertyId === action.propertyId))
          throw new HttpError(409, 'An outcome for this property and forecast is already recorded.');
        entityId = randomUUID();
        workspace.outcomes.push({
          id: entityId,
          propertyId: action.propertyId,
          cmaId: cma.id,
          forecastAt: cma.createdAt,
          observedAt: action.observedAt,
          actualPrice: action.actualPrice,
          notes: action.notes,
        });
        break;
      }
      case 'updateSettings':
        workspace.settings = { organization: action.organization, retentionDays: action.retentionDays };
        entityId = actor.tenantId;
        break;
      case 'purgeExpiredDocuments': {
        const cutoff = Date.now() - workspace.settings.retentionDays * 86400000;
        const expired = workspace.documents.filter(document => Date.parse(document.uploadedAt) < cutoff);
        for (const document of expired)
          await tx.query('DELETE FROM documents WHERE id=$1 AND tenant_id=$2', [document.id, actor.tenantId]);
        workspace.documents = workspace.documents.filter(document => !expired.some(old => old.id === document.id));
        result = { deleted: expired.length };
        entityId = actor.tenantId;
        break;
      }
    }
    appendAudit(
      workspace,
      actor,
      action.type,
      entityId,
      action.type === 'approveDraft'
        ? 'Explicit professional approval recorded; no external action performed.'
        : action.type === 'approveCma'
          ? `Explicit professional approval recorded; no external action performed. ${auditDetails}`
          : auditDetails,
    );
    recordProductAction(workspace, actor, action.type, entityId, performance.now() - startedAt);
    refreshGraph(workspace);
    return result;
  });
}

export function runMonitor(workspace: Workspace) {
  const eligible = scopeWorkspaceForAccess(workspace, 'market');
  const activeIds = new Set(activePropertyIds(eligible.fabric));
  if (eligible.fabric) eligible.properties = eligible.properties.filter(property => activeIds.has(property.id));
  // Provider ingestion is deliberately absent without a licensed connector. Compare listing history against current records.
  const previousProperties = eligible.properties.map(property => {
    const priorPrice = property.history
      .filter(event => typeof event.price === 'number' && event.price !== property.price)
      .at(-1)?.price;
    return priorPrice ? { ...property, price: priorPrice } : property;
  });
  const previous = { ...eligible, properties: previousProperties, alerts: [] };
  const alerts = detectMarketChanges(previous, eligible, workspace.asOf);
  let added = 0;
  for (const alert of alerts) {
    if (!workspace.alerts.some(existing => existing.fingerprint === alert.fingerprint)) {
      workspace.alerts.unshift(alert);
      added++;
    }
  }
  return {
    added,
    checked: eligible.properties.length,
    asOf: workspace.asOf,
    mode: workspace.mode,
    note: 'Monitoring uses currently permitted stored evidence for the selected region; no external data was fetched.',
  };
}

export function validateUpload(filename: string, mime: string, bytes: Buffer) {
  const sizeError = documentSizeError(bytes.length);
  if (sizeError) throw new HttpError(413, sizeError);
  const extension = filename.toLowerCase().split('.').at(-1);
  const pdf = extension === 'pdf' && mime === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
  const txt = extension === 'txt' && (mime === 'text/plain' || mime === '') && !bytes.includes(0);
  if (!pdf && !txt) throw new HttpError(415, 'Only valid PDF and plain text documents are supported.');
}

export function extractDateCandidates(content: string): DocumentRecord['extractedDates'] {
  return extractContractDates(content);
}

/** Machine-readable text of an upload. Scanned PDFs have none; OCR is not attempted. */
export async function documentText(file: { name: string; bytes: Buffer }): Promise<string> {
  return (await readDocumentText(file)).pages.map(page => page.text).join('\n');
}

export async function uploadDocument(
  actor: Actor,
  transactionId: string,
  file: { name: string; type: string; bytes: Buffer },
  reader: typeof readDocumentText = readDocumentText,
) {
  requireEditor(actor);
  validateUpload(file.name, file.type, file.bytes);
  const assertContextAccess = (workspace: Workspace) => {
    const permitted = scopeWorkspaceForAccess(workspace);
    if (
      workspace.transactions.some(record => record.id === transactionId) &&
      !permitted.transactions.some(record => record.id === transactionId)
    )
      throw new HttpError(403, 'Current source permissions do not permit this transaction document context.');
    find(permitted.transactions, transactionId, 'Transaction');
  };
  // Check the context before decoding, then recheck inside the write transaction in case permissions changed.
  assertContextAccess(await getWorkspace(actor.tenantId));
  const read = await reader(file);
  const analysis = analyzeContractDates(read.pages, { complete: read.metadata.status === 'complete' });
  const textLength = read.pages.reduce((count, page) => count + page.text.length, 0);
  return mutateWorkspace(actor, async (workspace, tx: DbTransaction) => {
    assertContextAccess(workspace);
    const doc: DocumentRecord = {
      id: randomUUID(),
      transactionId,
      name: file.name.replace(/[\r\n<>\\/]/g, '_').slice(0, 180),
      mime: file.type || 'text/plain',
      size: file.bytes.length,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
      uploadedAt: new Date().toISOString(),
      extractedDates: analysis.candidates,
      textLength,
      textExtraction: read.metadata,
      dateAnalysis: { version: analysis.version, issues: analysis.issues },
    };
    await storeDocument(tx, actor.tenantId, doc.id, file.bytes);
    workspace.documents.unshift(doc);
    appendAudit(
      workspace,
      actor,
      'uploadDocument',
      doc.id,
      `SHA-256 ${doc.sha256}. Extraction ${read.metadata.status}; ${read.metadata.pagesRead} pages read. ${doc.extractedDates.length} date candidates; ${analysis.issues.length} unresolved issues. None approved. Source text excluded from audit.`,
    );
    refreshGraph(workspace);
    return doc;
  });
}
