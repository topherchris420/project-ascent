import { randomUUID } from 'node:crypto';
import { auditDigest, HttpError } from '../auth';
import { getWorkspace, mutateWorkspace } from '../db';
import { ensurePlatform, getEntitlements } from '../platform';
import { budgetLimits, costRates, inferenceRoute, modelRegistry, providerReady } from './config';
import type { Actor, Workspace } from '../types';
import type { AiEvent, AiRoute, AiState } from '../ai-types';

export function ensureAi(workspace: Workspace): AiState { return workspace.ai ??= { version: 1, windows: {}, reservations: [], events: [] }; }
export async function reserveAiBudget(actor: Actor, route: AiRoute) {
  if (route.provider === 'evidence') throw new HttpError(400, 'Evidence mode does not reserve model spend.');
  const limits = budgetLimits();
  // Local legacy OpenAI mock integrations remain compatible; production and all Groq calls require explicit caps.
  const legacyLocal = route.provider === 'openai' && process.env.NODE_ENV !== 'production' && !process.env.AI_DAILY_BUDGET_USD && !process.env.AI_MONTHLY_BUDGET_USD && !process.env.AI_REQUEST_BUDGET_USD;
  if (!legacyLocal && (!limits.dailyUsd || !limits.monthlyUsd || !limits.requestUsd)) throw new HttpError(503, 'Configure positive daily, monthly and per-question AI budgets before external inference. Evidence mode is available.');
  const provider = route.provider;
  return mutateWorkspace(actor, (workspace) => {
    const ai = ensureAi(workspace); const now = new Date().toISOString(); const day = `day:${now.slice(0, 10)}`; const month = `month:${now.slice(0, 7)}`; const amount = legacyLocal ? 0 : limits.requestUsd;
    for (const [key, limit] of [[day, limits.dailyUsd], [month, limits.monthlyUsd]] as const) { const window = ai.windows[key] ??= { spentUsd: 0, reservedUsd: 0 }; if (!legacyLocal && window.spentUsd + window.reservedUsd + amount > limit + 1e-12) throw new HttpError(402, 'The organization AI cost budget cannot accommodate another bounded request. No provider was called.'); }
    ai.windows[day].reservedUsd += amount; ai.windows[month].reservedUsd += amount;
    const reservation = { id: randomUUID(), provider, model: route.model, day, month, amountUsd: amount, at: now, status: 'reserved' as const }; ai.reservations.push(reservation); return reservation;
  });
}
export async function settleAiBudget(actor: Actor, reservationId: string, event: Omit<AiEvent, 'id' | 'at' | 'estimatedUsd'>) {
  return mutateWorkspace(actor, (workspace) => {
    const ai = ensureAi(workspace); const reservation = ai.reservations.find((entry) => entry.id === reservationId);
    if (!reservation || reservation.status === 'settled') return { duplicate: true };
    const rates = costRates(reservation.provider, reservation.model); const reported = Math.max(0, event.inputTokens) * rates.inputUsdPerMillion / 1e6 + Math.max(0, event.outputTokens) * rates.outputUsdPerMillion / 1e6;
    // A transport failure can have incurred an unreported provider charge. Keep its full reservation conservatively spent.
    const accounted = event.status === 'blocked' ? 0 : event.status === 'success' ? reported : Math.max(reported, reservation.amountUsd);
    for (const key of [reservation.day, reservation.month]) { const window = ai.windows[key] ??= { reservedUsd: 0, spentUsd: 0 }; window.reservedUsd = Math.max(0, window.reservedUsd - reservation.amountUsd); window.spentUsd += accounted; }
    reservation.status = 'settled'; reservation.settledUsd = accounted;
    const recorded: AiEvent = { ...event, id: randomUUID(), at: new Date().toISOString(), estimatedUsd: reported }; ai.events.push(recorded); ai.events = ai.events.slice(-500);
    ai.reservations = [...ai.reservations.filter((entry) => entry.status === 'reserved'), ...ai.reservations.filter((entry) => entry.status === 'settled' && Date.parse(entry.at) > Date.now() - 62 * 86400000).slice(-2000)];
    const audit = { id: randomUUID(), actorId: actor.id, action: 'aiInferenceTelemetry', entityId: recorded.id, at: recorded.at, details: `${event.provider}/${event.model}; ${event.task}; ${event.status}; ${Math.round(event.latencyMs)} ms; ${event.inputTokens}/${event.outputTokens} tokens; ${event.attempts} attempts; ${event.retries} retries; estimated ${reported} USD; budget accounted ${accounted} USD. No prompt or response text logged.`, previousHash: workspace.audit.at(-1)?.hash || 'genesis' }; workspace.audit.push({ ...audit, hash: auditDigest(audit) });
    return { estimatedUsd: reported, budgetAccountedUsd: accounted };
  });
}
export async function aiStatus(actor: Actor) {
  const workspace = await getWorkspace(actor.tenantId); const ai = ensureAi(workspace); const route = inferenceRoute(); const ready = providerReady(route); const limits = budgetLimits(); const platform = ensurePlatform(workspace); const now = new Date().toISOString();
  const capsConfigured = !!limits.dailyUsd && !!limits.monthlyUsd && !!limits.requestUsd;
  return { provider: route.provider, configured: ready.ready && (route.provider !== 'groq' || capsConfigured), reason: ready.ready && route.provider === 'groq' && !capsConfigured ? 'Explicit AI budgets are required.' : ready.reason, models: { fast: process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b', reasoning: process.env.GROQ_MODEL_REASONING || 'openai/gpt-oss-120b', secondary: process.env.OPENAI_MODEL || null }, capabilities: modelRegistry, privacy: { licensedSharing: 'blocked', knownPiiRedaction: process.env.AI_PII_SHARING !== 'approved', zdrRequired: process.env.AI_REQUIRE_ZDR === 'true', groqZdrAttested: process.env.GROQ_ZDR_ATTESTED === 'approved', providerVerified: false, note: 'Operator attestation does not configure or independently verify Groq organization Data Controls.' }, budget: { ...limits, capsConfigured, day: ai.windows[`day:${now.slice(0, 10)}`] || { spentUsd: 0, reservedUsd: 0 }, month: ai.windows[`month:${now.slice(0, 7)}`] || { spentUsd: 0, reservedUsd: 0 } }, usage: platform.usage, limits: getEntitlements(workspace), fallback: 'Evidence by default; no automatic cross-provider spend escalation.', liveProviderVerified: false };
}
export async function aiMetrics(actor: Actor) {
  const workspace = await getWorkspace(actor.tenantId); const ai = ensureAi(workspace); const events = ai.events;
  return { period: 'retained telemetry window', totals: { requests: events.length, successes: events.filter((entry) => entry.status === 'success').length, fallbacks: events.filter((entry) => entry.status === 'fallback').length, cacheHits: events.filter((entry) => entry.cacheHit).length, inputTokens: events.reduce((sum, entry) => sum + entry.inputTokens, 0), outputTokens: events.reduce((sum, entry) => sum + entry.outputTokens, 0), estimatedUsd: events.reduce((sum, entry) => sum + entry.estimatedUsd, 0), retries: events.reduce((sum, entry) => sum + entry.retries, 0), averageLatencyMs: events.length ? events.reduce((sum, entry) => sum + entry.latencyMs, 0) / events.length : null }, recentEvents: events.slice(-50).reverse(), notes: ['Only this tenant’s last 500 events are retained in this view; this is not a lifetime total.', 'Costs are published/configured estimates, not provider invoices. Failed transports retain their reserved budget conservatively.', 'Prompts, client identities, documents and response text are absent from inference telemetry.', 'Only allowlisted identical in-flight synthetic questions in the same tenant share work; no completed or private-text response cache is enabled.'] };
}
export async function recordAiReuse(actor: Actor, route: AiRoute, mode: 'model' | 'evidence') { return mutateWorkspace(actor, (workspace) => { const ai = ensureAi(workspace); ai.events.push({ id: randomUUID(), at: new Date().toISOString(), provider: route.provider, model: route.model, task: route.task, latencyMs: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0, attempts: 0, retries: 0, cacheHit: true, status: mode === 'model' ? 'success' : 'fallback', reason: 'same-tenant-safe-synthetic-inflight-reuse' }); ai.events = ai.events.slice(-500); return { reused: true }; }); }
