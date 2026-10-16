import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { auditDigest, createSession, digest, hashPassword, HttpError } from './auth';
import { getWorkspace, mutateWorkspace, transaction } from './db';
import type { Actor, Workspace } from './types';
import type { Entitlements, MonthlyUsage, PlanDefinition, PlanId, PlatformState, ProviderGrant, UsageMetric } from './platform-types';

const positiveEnv = (key: string, fallback: number) => { const raw = process.env[key]; const value = raw?.trim() ? Number(raw) : NaN; return Number.isSafeInteger(value) && value >= 0 ? value : fallback; };
const period = (at = new Date().toISOString()) => at.slice(0, 7);
const emptyUsage = (at?: string): MonthlyUsage => ({ period: period(at), aiRequests: 0, fabricQueries: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, events: [] });
export function ensurePlatform(workspace: Workspace): PlatformState {
  if (!workspace.platform) workspace.platform = { version: 1, plan: 'free', billing: { status: 'free' }, verification: { status: 'unsubmitted' }, providerGrants: [], usage: emptyUsage() };
  return workspace.platform;
}
export function hasVerifiedLicense(workspace: Workspace, at = new Date().toISOString()): boolean {
  const value = ensurePlatform(workspace).verification;
  return value.status === 'verified' && !!value.reviewedBy && !!value.reviewedAt && !!value.evidence?.length && !!value.expiresAt && Date.parse(value.expiresAt) > Date.parse(at);
}
export function assertProviderAccess(workspace: Workspace, request: { providerId: string; regionId: string; use: string }, at = new Date().toISOString()): ProviderGrant {
  if (!hasVerifiedLicense(workspace, at)) throw new HttpError(403, 'This licensed provider requires independent professional license verification. Free Explorer remains available.');
  const grant = ensurePlatform(workspace).providerGrants.find((entry) => entry.providerId === request.providerId && entry.regionIds.includes(request.regionId) && entry.allowedUses.includes(request.use) && !entry.revokedAt && !!entry.reviewedBy && Number.isFinite(Date.parse(entry.verifiedAt)) && Date.parse(entry.expiresAt) > Date.parse(at) && Date.parse(entry.issuedAt) <= Date.parse(at));
  if (!grant) throw new HttpError(403, 'A current, reviewed provider license for this region and permitted use is required. A subscription cannot grant data rights.');
  return grant;
}
export function effectivePlan(workspace: Workspace): PlanId {
  const state = ensurePlatform(workspace);
  if (!['active', 'trialing'].includes(state.billing.status)) return 'free';
  if (state.billing.currentPeriodEnd && Date.parse(state.billing.currentPeriodEnd) <= Date.now()) return 'free';
  return state.plan;
}
export function planDefinitions(): PlanDefinition[] {
  const plan = (id: PlanId, name: string, description: string, seats: number, ai: number, fabric: number): PlanDefinition => ({ id, name, description, permanentFree: id === 'free', configured: id === 'free' || !!process.env[`STRIPE_PRICE_${id.toUpperCase()}`] && !!process.env.STRIPE_SECRET_KEY, priceLabel: id === 'free' ? 'Free forever' : process.env[`PLAN_${id.toUpperCase()}_PRICE_LABEL`] || 'Pricing configured by your operator', seats: positiveEnv(`PLAN_${id.toUpperCase()}_SEATS`, seats), aiRequestsPerMonth: positiveEnv(`PLAN_${id.toUpperCase()}_AI_REQUESTS`, ai), fabricQueriesPerMonth: positiveEnv(`PLAN_${id.toUpperCase()}_FABRIC_QUERIES`, fabric) });
  return [plan('free', 'Free Explorer', 'Permanent synthetic property research, unlimited basic CMA, clients, offers, and transaction workflows.', 1, 20, 200), plan('pro', 'Professional', 'Larger configured model and data-workflow allowances for one professional.', 1, 200, 2000), plan('team', 'Brokerage Team', 'Shared organization workflows with role-based seats and larger allowances.', 10, 1000, 10000), plan('enterprise', 'Enterprise', 'Operator-configured capacity and commercial terms; data licenses remain independent.', 50, 5000, 50000)];
}
export function getEntitlements(workspace: Workspace): Entitlements {
  const plan = effectivePlan(workspace); const definition = planDefinitions().find((entry) => entry.id === plan)!;
  return { plan, seats: definition.seats, aiRequestsPerMonth: definition.aiRequestsPerMonth, fabricQueriesPerMonth: definition.fabricQueriesPerMonth, licensedData: hasVerifiedLicense(workspace), basicCmaUnlimited: true, costRatesConfigured: Number.isFinite(Number(process.env.AI_INPUT_USD_PER_MILLION)) && Number.isFinite(Number(process.env.AI_OUTPUT_USD_PER_MILLION)) && !!process.env.AI_INPUT_USD_PER_MILLION && !!process.env.AI_OUTPUT_USD_PER_MILLION };
}
function usageWindow(workspace: Workspace): MonthlyUsage { const state = ensurePlatform(workspace); if (state.usage.period !== period()) { state.usageHistory = [...(state.usageHistory || []), state.usage].slice(-24); state.usage = emptyUsage(); } return state.usage; }
function audit(workspace: Workspace, actor: Actor, action: string, entityId: string, details: string) { const event = { id: randomUUID(), actorId: actor.id, action, entityId, at: new Date().toISOString(), details, previousHash: workspace.audit.at(-1)?.hash || 'genesis' }; workspace.audit.push({ ...event, hash: auditDigest(event) }); }
export async function reserveUsage(actor: Actor, metric: UsageMetric, units = 1) {
  if (!Number.isSafeInteger(units) || units <= 0 || units > 100000) throw new HttpError(400, 'Usage units must be a positive bounded integer.');
  return mutateWorkspace(actor, (workspace) => {
    const entitlements = getEntitlements(workspace); const usage = usageWindow(workspace); const limit = metric === 'aiRequests' ? entitlements.aiRequestsPerMonth : entitlements.fabricQueriesPerMonth;
    if (usage[metric] + units > limit) throw new HttpError(metric === 'aiRequests' ? 402 : 429, `The monthly ${metric === 'aiRequests' ? 'AI-assisted question (up to three provider rounds, with tokens metered separately)' : 'data query'} allowance is exhausted. Free deterministic property and CMA workflows remain available.`);
    usage[metric] += units; const id = randomUUID(); usage.events.push({ id, metric, units, estimatedCostUsd: 0, at: new Date().toISOString() }); usage.events = usage.events.slice(-1000); audit(workspace, actor, 'reserveMeteredUsage', id, `${metric}: ${units} units in ${usage.period}; no charge created.`);
    return { id, period: usage.period, used: usage[metric], limit };
  });
}
export async function recordModelUsage(actor: Actor, inputTokens: number, outputTokens: number, reference: string, reservedPeriod?: string, rates?: { inputUsdPerMillion: number; outputUsdPerMillion: number }) {
  if (![inputTokens, outputTokens].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 100000000)) throw new HttpError(400, 'Invalid provider usage counts.');
  return mutateWorkspace(actor, (workspace) => {
    usageWindow(workspace); const state = ensurePlatform(workspace); const usage = !reservedPeriod || reservedPeriod === state.usage.period ? state.usage : state.usageHistory?.find((entry) => entry.period === reservedPeriod);
    if (!usage) throw new HttpError(409, 'The reservation usage period is unavailable; reconciliation is required.');
    if (usage.events.some((entry) => entry.reference === reference)) return { duplicate: true };
    const inputRate = rates?.inputUsdPerMillion ?? Number(process.env.AI_INPUT_USD_PER_MILLION || 0), outputRate = rates?.outputUsdPerMillion ?? Number(process.env.AI_OUTPUT_USD_PER_MILLION || 0);
    const cost = Math.max(0, Number.isFinite(inputRate) ? inputRate : 0) * inputTokens / 1000000 + Math.max(0, Number.isFinite(outputRate) ? outputRate : 0) * outputTokens / 1000000;
    usage.inputTokens += inputTokens; usage.outputTokens += outputTokens; usage.estimatedCostUsd += cost; usage.events.push({ id: randomUUID(), metric: 'modelTokens', units: inputTokens + outputTokens, inputTokens, outputTokens, estimatedCostUsd: cost, at: new Date().toISOString(), reference }); usage.events = usage.events.slice(-1000);
    audit(workspace, actor, 'recordModelUsage', reference, `Provider-reported tokens ${inputTokens} input / ${outputTokens} output; configured cost estimate ${cost} USD, not a bill.`); return { estimatedCostUsd: cost, note: 'Operator-configured cost estimate, not a provider invoice or customer charge.' };
  });
}
export async function platformSnapshot(actor: Actor) { const workspace = await getWorkspace(actor.tenantId); const platform = ensurePlatform(workspace); usageWindow(workspace); return { platform, plans: planDefinitions(), entitlements: getEntitlements(workspace), costNote: 'Usage costs are operator-configured estimates, not invoices. Payment never substitutes for professional verification or provider licensing.' }; }
export function requireOwner(actor: Actor) { if (actor.role !== 'owner') throw new HttpError(403, 'Only the organization owner can administer billing, members, and provider grants.'); }
export async function listTeam(actor: Actor) {
  requireOwner(actor); const workspace = await getWorkspace(actor.tenantId);
  return transaction(actor.tenantId, async (tx) => ({ members: await tx.query('SELECT id,name,email,role FROM users WHERE tenant_id=$1 ORDER BY created_at', [actor.tenantId]), invitations: await tx.query('SELECT id,email,role,expires_at,used_at FROM team_invitations WHERE tenant_id=$1 ORDER BY expires_at DESC', [actor.tenantId]), entitlements: getEntitlements(workspace) }));
}
export async function inviteMember(actor: Actor, raw: unknown) {
  requireOwner(actor); const input = z.object({ email: z.email().max(254), role: z.enum(['agent', 'viewer']) }).parse(raw); const token = `${actor.tenantId}.${randomBytes(32).toString('base64url')}`; const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const result = await mutateWorkspace(actor, async (workspace, tx) => {
    const members = await tx.query('SELECT id FROM users WHERE tenant_id=$1', [actor.tenantId]); const invitations = await tx.query('SELECT id FROM team_invitations WHERE tenant_id=$1 AND used_at IS NULL AND expires_at>$2', [actor.tenantId, new Date().toISOString()]);
    if (members.length + invitations.length >= getEntitlements(workspace).seats) throw new HttpError(403, 'The configured seat allowance is full. Existing accounts remain accessible after a downgrade; new invitations require available seats.');
    const existing = await tx.query('SELECT id FROM users WHERE email=$1', [input.email.toLowerCase()]); if (existing.length) throw new HttpError(409, 'This invitation flow supports a new member account. An existing account is never moved out of its private workspace.');
    const id = randomUUID(); await tx.query('INSERT INTO team_invitations(id,tenant_id,token_hash,email,role,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, actor.tenantId, digest(token), input.email.toLowerCase(), input.role, expiresAt, actor.id]); audit(workspace, actor, 'inviteTeamMember', id, `Role ${input.role}; one-time token returned to the owner; no email sent.`); return { id, email: input.email, role: input.role, expiresAt };
  });
  return { ...result.result, token, acceptanceUrl: `${process.env.APP_ORIGIN || 'http://localhost:3040'}/?invite=${encodeURIComponent(token)}`, note: 'Copy this private link to the intended recipient. No email was sent; the token is shown once.' };
}
export async function acceptInvitation(raw: unknown) {
  const input = z.object({ token: z.string().min(45).max(200), name: z.string().trim().min(2).max(150), password: z.string().min(12).max(1024) }).parse(raw);
  const tenantId = input.token.split('.')[0]; if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new HttpError(400, 'Invalid invitation.'); const passwordHash = await hashPassword(input.password); const id = randomUUID();
  const account = await mutateWorkspace({ id: 'invitation', tenantId, name: 'Invitation', email: '', role: 'viewer' }, async (workspace, tx) => {
    const rows = await tx.query<{ id: string; email: string; role: 'agent' | 'viewer'; expires_at: string | Date; used_at: string | null }>('SELECT * FROM team_invitations WHERE token_hash=$1 AND tenant_id=$2 FOR UPDATE', [digest(input.token), tenantId]); const invite = rows[0];
    if (!invite || invite.used_at || new Date(invite.expires_at).getTime() <= Date.now()) throw new HttpError(400, 'Invitation is invalid, expired, or already used.');
    const existing = await tx.query('SELECT id FROM users WHERE email=$1', [invite.email]); if (existing.length) throw new HttpError(409, 'An account already uses the invited email. No existing workspace has been changed.');
    const members = await tx.query('SELECT id FROM users WHERE tenant_id=$1', [tenantId]); if (members.length >= getEntitlements(workspace).seats) throw new HttpError(403, 'No team seat is available. Ask the owner to review the current plan.');
    const user: Actor = { id, tenantId, name: input.name, email: invite.email, role: invite.role };
    await tx.query('INSERT INTO users(id,tenant_id,name,email,role,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, tenantId, user.name, user.email, user.role, passwordHash, new Date().toISOString()]); await tx.query('UPDATE team_invitations SET used_at=$1 WHERE id=$2 AND tenant_id=$3', [new Date().toISOString(), invite.id, tenantId]); audit(workspace, user, 'acceptTeamInvitation', invite.id, 'One-time invitation redeemed into the intended tenant.'); return user;
  });
  return createSession(account.result);
}
export async function changeMember(actor: Actor, memberId: string, role: 'agent' | 'viewer' | 'remove') {
  requireOwner(actor); if (memberId === actor.id) throw new HttpError(400, 'The owner cannot remove or demote their own account.');
  return mutateWorkspace(actor, async (workspace, tx) => {
    const rows = await tx.query<{ role: string }>('SELECT role FROM users WHERE id=$1 AND tenant_id=$2', [memberId, actor.tenantId]); if (!rows[0]) throw new HttpError(404, 'Member not found in this organization.'); if (rows[0].role === 'owner') throw new HttpError(403, 'Owner accounts cannot be edited by this endpoint.');
    if (role === 'remove') { await tx.query('DELETE FROM sessions WHERE user_id=$1', [memberId]); await tx.query('DELETE FROM users WHERE id=$1 AND tenant_id=$2', [memberId, actor.tenantId]); }
    else await tx.query('UPDATE users SET role=$1 WHERE id=$2 AND tenant_id=$3', [role, memberId, actor.tenantId]);
    audit(workspace, actor, role === 'remove' ? 'removeTeamMember' : 'changeTeamRole', memberId, role); return { id: memberId, role };
  });
}
