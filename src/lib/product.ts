import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError, requireEditor } from './auth';
import { mutateWorkspace } from './db';
import { scopeWorkspaceForAccess } from './fabric';
import { ensurePlatform, requireOwner } from './platform';
import { appendAudit } from './service';
import type { Actor, Workspace } from './types';
import type { ProductFeature, ProductMetric, ProductState } from './product-types';

const feature = z.enum([
  'cma',
  'clients',
  'offers',
  'transactions',
  'reports',
  'academy',
  'migration',
  'assistant',
  'fabric',
]);
const flagId = z.enum(['guided-academy', 'scenario-breakdown', 'compact-offers']);
export const productActionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('consent'), enabled: z.boolean() }),
  z.strictObject({ action: z.literal('resetMetrics') }),
  z.strictObject({
    action: z.literal('flag'),
    id: flagId,
    enabled: z.boolean(),
    treatmentPercent: z.number().min(0).max(100),
  }),
  z.strictObject({
    action: z.literal('priority'),
    feature,
    impact: z.number().min(0).max(5),
    confidence: z.number().min(0).max(1),
    differentiation: z.number().min(0).max(5),
    effort: z.number().min(1).max(10),
  }),
  z.strictObject({
    action: z.literal('event'),
    eventId: z.uuid(),
    feature,
    kind: z.enum(['open', 'complete', 'timing', 'error']),
    durationMs: z.number().int().min(0).max(300000).optional(),
    errorCode: z.enum(['validation', 'unavailable', 'authorization', 'timeout', 'unknown']).optional(),
    entityId: z.string().min(1).max(100).optional(),
  }),
]);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function ensureProduct(workspace: Workspace): ProductState {
  return (workspace.product ??= {
    version: 1,
    consent: false,
    metrics: [],
    dedupe: [],
    flags: [],
    priorities: [],
    updatedAt: new Date().toISOString(),
  });
}
export function experimentAssignment(
  tenantId: string,
  flag: { id: string; enabled: boolean; treatmentPercent: number },
): 'off' | 'control' | 'treatment' {
  if (!flag.enabled) return 'off';
  return (parseInt(hash(`${tenantId}:${flag.id}`).slice(0, 8), 16) / 0x100000000) * 100 < flag.treatmentPercent
    ? 'treatment'
    : 'control';
}
const actions: Record<string, ProductFeature> = {
  saveCma: 'cma',
  approveCma: 'cma',
  saveClient: 'clients',
  addClientNote: 'clients',
  saveSearch: 'clients',
  reviewSavedSearch: 'clients',
  saveFollowUp: 'clients',
  setFollowUpStatus: 'clients',
  setClientProperty: 'clients',
  draftCounter: 'offers',
  approveDraft: 'offers',
  saveOffer: 'offers',
  saveTransaction: 'transactions',
  addMilestone: 'transactions',
  approveExtractedDate: 'transactions',
  toggleMilestone: 'transactions',
  trustReportExport: 'reports',
  academyInspectCma: 'academy',
  migrationCommit: 'migration',
};
function metric(state: ProductState, key: ProductFeature): ProductMetric {
  let value = state.metrics.find(item => item.feature === key);
  if (!value) {
    value = { feature: key, opens: 0, completedTasks: 0, timingCount: 0, totalDurationMs: 0, errors: {} };
    state.metrics.push(value);
  }
  return value;
}
function remember(state: ProductState, key: string): boolean {
  if (state.dedupe.includes(key)) return false;
  state.dedupe.push(key);
  state.dedupe = state.dedupe.slice(-2000);
  return true;
}
/** Called after an actual workflow audit, never from a checkbox. No entity ID or user text is retained. */
export function recordProductAction(
  workspace: Workspace,
  actor: Actor,
  action: string,
  entityId: string,
  durationMs?: number,
) {
  const state = ensureProduct(workspace),
    key = actions[action];
  if (!state.consent || !key) return false;
  const event = [...workspace.audit]
    .reverse()
    .find(item => item.actorId === actor.id && item.action === action && item.entityId === entityId);
  if (!event || !remember(state, hash(`audit:${event.id}`))) return false;
  const value = metric(state, key);
  value.completedTasks++;
  if (durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0 && durationMs <= 300000) {
    value.timingCount++;
    value.totalDurationMs += Math.round(durationMs);
  }
  state.updatedAt = new Date().toISOString();
  return true;
}
export function productSnapshot(workspace: Workspace, actor: Actor) {
  const state = ensureProduct(workspace);
  const flags = flagId.options.map(
    id => state.flags.find(flag => flag.id === id) ?? { id, enabled: false, treatmentPercent: 50 },
  );
  return {
    consent: state.consent,
    metrics: state.metrics,
    flags: flags.map(flag => ({ ...flag, assignment: experimentAssignment(actor.tenantId, flag) })),
    priorities: [...state.priorities].sort((a, b) => b.score - a.score),
    usage: ensurePlatform(workspace).usage,
    note: 'Local opt-in aggregate workflow metrics only. No addresses, names, messages or document text. Scores are owner assumptions; assignments and descriptive outcomes do not establish a winning variant or causal improvement.',
  };
}
function proveCompletion(workspace: Workspace, actor: Actor, key: ProductFeature, entityId?: string) {
  const scoped = scopeWorkspaceForAccess(workspace);
  const eligible = new Set(
    [
      ...scoped.properties,
      ...scoped.cmas,
      ...scoped.clients,
      ...scoped.offers,
      ...scoped.transactions,
      ...scoped.approvals,
    ].map(item => item.id),
  );
  if (entityId && !eligible.has(entityId) && key !== 'migration')
    throw new HttpError(404, 'Workflow evidence is unavailable.');
  const boundary = workspace.audit.findIndex(event => event.action === 'registerWorkspace');
  const found = workspace.audit
    .slice(boundary + 1)
    .reverse()
    .find(event => event.actorId === actor.id && actions[event.action] === key && event.entityId === entityId);
  if (!found) throw new HttpError(422, 'A real audited workflow is required; completion cannot be self-asserted.');
  return found;
}
export async function executeProductAction(actor: Actor, raw: unknown) {
  const input = productActionSchema.parse(raw);
  if (input.action === 'event') requireEditor(actor);
  else requireOwner(actor);
  return mutateWorkspace(actor, workspace => {
    const state = ensureProduct(workspace);
    if (input.action === 'consent') {
      state.consent = input.enabled;
      appendAudit(
        workspace,
        actor,
        'setProductMetricsConsent',
        'product',
        `Opt-in aggregate collection ${input.enabled ? 'enabled' : 'disabled'}; no external analytics delivery.`,
      );
    } else if (input.action === 'resetMetrics') {
      state.metrics = [];
      state.dedupe = [];
      appendAudit(workspace, actor, 'resetProductMetrics', 'product', 'Local aggregates cleared.');
    } else if (input.action === 'flag') {
      const existing = state.flags.find(item => item.id === input.id);
      const values = { id: input.id, enabled: input.enabled, treatmentPercent: input.treatmentPercent };
      if (existing) Object.assign(existing, values);
      else state.flags.push(values);
      appendAudit(
        workspace,
        actor,
        'configureProductFlag',
        input.id,
        'Owner configured a stable-assignment experiment; no winner inferred.',
      );
    } else if (input.action === 'priority') {
      const value = {
        feature: input.feature,
        impact: input.impact,
        confidence: input.confidence,
        differentiation: input.differentiation,
        effort: input.effort,
        score: (input.impact * input.confidence * input.differentiation) / input.effort,
      };
      const existing = state.priorities.find(item => item.feature === input.feature);
      if (existing) Object.assign(existing, value);
      else state.priorities.push(value);
      appendAudit(
        workspace,
        actor,
        'setProductPriority',
        input.feature,
        'Impact × confidence × differentiation ÷ effort; explicit owner assumptions, not measured revenue.',
      );
    } else if (state.consent) {
      if (input.kind === 'complete') {
        const event = proveCompletion(workspace, actor, input.feature, input.entityId);
        recordProductAction(workspace, actor, event.action, event.entityId, input.durationMs);
      } else if (remember(state, hash(`event:${input.eventId}`))) {
        const value = metric(state, input.feature);
        if (input.kind === 'open') value.opens++;
        if (input.kind === 'timing') {
          if (input.durationMs === undefined) throw new HttpError(400, 'Timing requires a bounded duration.');
          value.timingCount++;
          value.totalDurationMs += input.durationMs;
        }
        if (input.kind === 'error') {
          if (!input.errorCode) throw new HttpError(400, 'Select a structured error code.');
          value.errors[input.errorCode] = (value.errors[input.errorCode] || 0) + 1;
        }
      }
    }
    state.updatedAt = new Date().toISOString();
    return productSnapshot(workspace, actor);
  });
}
