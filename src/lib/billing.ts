import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { auditDigest, HttpError } from './auth';
import { getWorkspace, mutateWorkspace } from './db';
import { ensurePlatform, platformSnapshot, requireOwner } from './platform';
import type { Actor } from './types';
import type { BillingState, PlanId } from './platform-types';

/** Official transport references:
 * https://docs.stripe.com/api/checkout/sessions/create
 * https://docs.stripe.com/api/customer_portal/sessions/create
 * https://docs.stripe.com/events/manage-webhook-endpoints
 * Credentials and price IDs are operator configuration; tests use mocked HTTP only.
 */
const paidPlans = ['pro', 'team', 'enterprise'] as const;
const configuredPrice = (plan: string) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
function applicationOrigin() {
  if (!process.env.APP_ORIGIN) throw new HttpError(503, 'APP_ORIGIN must be configured before billing can open.');
  const url = new URL(process.env.APP_ORIGIN);
  if (url.origin !== process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:'))
    throw new HttpError(503, 'Configure an exact secure application origin for billing.');
  return url.origin;
}
async function stripeRequest(path: string, body: URLSearchParams, fetcher: typeof fetch) {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HttpError(503, 'Stripe is not configured. Free Explorer remains available.');
  const headers: Record<string, string> = {
    authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'content-type': 'application/x-www-form-urlencoded',
    'idempotency-key': randomUUID(),
  };
  if (process.env.STRIPE_API_VERSION) headers['Stripe-Version'] = process.env.STRIPE_API_VERSION;
  const response = await fetcher(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new HttpError(502, 'Stripe could not open a billing session. No local subscription was changed.');
  const result = z.object({ url: z.url() }).parse(await response.json());
  const url = new URL(result.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.stripe.com'))
    throw new HttpError(502, 'Stripe returned an unexpected session URL.');
  return { url: result.url };
}
export async function openCheckout(actor: Actor, planId: string, fetcher: typeof fetch = fetch) {
  requireOwner(actor);
  const plan = z.enum(paidPlans).parse(planId);
  const price = configuredPrice(plan);
  if (!price)
    throw new HttpError(
      503,
      'This plan has no configured Stripe price. Contact the operator; no price or charge is implied.',
    );
  const workspace = await getWorkspace(actor.tenantId);
  const billing = ensurePlatform(workspace).billing;
  if (billing.subscriptionId && ['active', 'trialing'].includes(billing.status))
    throw new HttpError(409, 'An active subscription already exists. Use the customer portal to manage its plan.');
  const origin = applicationOrigin();
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=canceled`,
    client_reference_id: actor.tenantId,
    'metadata[tenantId]': actor.tenantId,
    'subscription_data[metadata][tenantId]': actor.tenantId,
  });
  if (billing.customerId) body.set('customer', billing.customerId);
  else body.set('customer_email', actor.email);
  return stripeRequest('checkout/sessions', body, fetcher);
}
export async function openPortal(actor: Actor, fetcher: typeof fetch = fetch) {
  requireOwner(actor);
  const workspace = await getWorkspace(actor.tenantId);
  const customer = ensurePlatform(workspace).billing.customerId;
  if (!customer) throw new HttpError(409, 'This organization has no Stripe customer yet.');
  return stripeRequest(
    'billing_portal/sessions',
    new URLSearchParams({ customer, return_url: `${applicationOrigin()}/?billing=portal-return` }),
    fetcher,
  );
}
export async function billingSnapshot(actor: Actor) {
  const snapshot = await platformSnapshot(actor);
  return {
    ...snapshot,
    plans: snapshot.plans.map(plan => ({
      ...plan,
      checkoutConfigured: plan.configured && plan.id !== 'free',
      modelCallsPerMonth: plan.aiRequestsPerMonth,
      modelUsageUnit: 'AI-assisted questions (up to three provider rounds; tokens metered separately)',
      features: [
        'Unlimited basic CMA and fictional demonstration workflows',
        `${plan.aiRequestsPerMonth} AI-assisted questions per month (up to three provider rounds; tokens metered separately)`,
        `${plan.seats} organization seats`,
        'Data-provider licensing and professional verification are independent',
      ],
    })),
    subscription: snapshot.platform.billing,
    usage: snapshot.platform.usage,
    costs: {
      inputUsdPerMillion: process.env.AI_INPUT_USD_PER_MILLION ? Number(process.env.AI_INPUT_USD_PER_MILLION) : null,
      outputUsdPerMillion: process.env.AI_OUTPUT_USD_PER_MILLION ? Number(process.env.AI_OUTPUT_USD_PER_MILLION) : null,
      estimatedMonthUsd: snapshot.platform.usage.estimatedCostUsd,
      note: snapshot.costNote,
    },
    accessLevel: snapshot.entitlements.licensedData ? 'verified' : 'explorer',
  };
}
export function verifyStripeSignature(rawBody: string, header: string | null, now = Date.now()): void {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'Stripe webhook is not configured.');
  const parts = (header || '').split(',').map(part => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    throw new HttpError(400, 'Stripe signature is missing or expired.');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const matches = parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => {
      if (!/^[0-9a-f]{64}$/i.test(value || '')) return false;
      const actual = Buffer.from(value, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  if (!matches) throw new HttpError(400, 'Stripe signature is invalid.');
}
const subscriptionSchema = z.object({
  id: z.string().min(1).max(200),
  customer: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.enum([
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'paused',
  ]),
  metadata: z.object({ tenantId: z.string().min(1).max(100) }),
  current_period_end: z.number().optional(),
  cancel_at_period_end: z.boolean().optional(),
  items: z.object({
    data: z
      .array(z.object({ price: z.object({ id: z.string() }), current_period_end: z.number().optional() }))
      .min(1)
      .max(100),
  }),
});
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().max(200),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  data: z.object({ object: z.unknown() }),
});
export async function processStripeWebhook(rawBody: string, signature: string | null) {
  verifyStripeSignature(rawBody, signature);
  const event = eventSchema.parse(JSON.parse(rawBody));
  if (
    !['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(
      event.type,
    )
  )
    return { received: true, ignored: 'Unmapped event type; no entitlement changed.' };
  if (
    (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && !event.livemode) ||
    (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && event.livemode)
  )
    throw new HttpError(400, 'Stripe event mode does not match this deployment.');
  const subscription = subscriptionSchema.parse(event.data.object);
  const tenantId = subscription.metadata.tenantId;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const actor: Actor = {
    id: 'system:stripe',
    tenantId,
    name: 'Stripe webhook',
    email: 'system@ascent.invalid',
    role: 'owner',
  };
  const mutation = await mutateWorkspace(actor, async (workspace, tx) => {
    const inserted = await tx.query(
      'INSERT INTO billing_events(id,tenant_id,created_at) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',
      [event.id, tenantId, new Date().toISOString()],
    );
    if (!inserted.length) return { received: true, duplicate: true };
    const state = ensurePlatform(workspace);
    const previous = state.billing;
    if (previous.customerId && previous.customerId !== customerId)
      return { received: true, ignored: 'Customer does not match the tenant billing relationship.' };
    if (
      previous.subscriptionId &&
      previous.subscriptionId !== subscription.id &&
      ['active', 'trialing', 'past_due'].includes(previous.status)
    )
      return { received: true, ignored: 'A different subscription is already bound to this organization.' };
    const prices = subscription.items.data.map(item => item.price.id);
    const matchingPlans = paidPlans.filter(plan => !!configuredPrice(plan) && prices.includes(configuredPrice(plan)!));
    const status: BillingState['status'] =
      event.type === 'customer.subscription.deleted' || ['canceled', 'incomplete_expired'].includes(subscription.status)
        ? 'canceled'
        : ['active', 'trialing'].includes(subscription.status)
          ? (subscription.status as 'active' | 'trialing')
          : 'past_due';
    const precedence = status === 'canceled' ? 4 : status === 'past_due' ? 3 : status === 'active' ? 2 : 1;
    if (
      event.created < (previous.lastEventCreated || 0) ||
      (event.created === previous.lastEventCreated && precedence <= (previous.lastEventPrecedence || 0))
    )
      return { received: true, ignored: 'Older or conservatively ordered same-second subscription event.' };
    const periodEnd =
      subscription.current_period_end ||
      Math.max(0, ...subscription.items.data.map(item => item.current_period_end || 0));
    const validPlan = matchingPlans.length === 1 && subscription.items.data.length === 1;
    state.plan = validPlan ? matchingPlans[0] : 'free';
    state.billing = {
      status: validPlan || ['canceled', 'past_due'].includes(status) ? status : 'unconfigured',
      customerId,
      subscriptionId: subscription.id,
      priceId: prices[0],
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastEventCreated: event.created,
      lastEventId: event.id,
      lastEventPrecedence: precedence,
    };
    if (['active', 'trialing'].includes(state.billing.status) && !periodEnd) {
      state.billing.status = 'unconfigured';
      state.plan = 'free';
    }
    const audit = {
      id: randomUUID(),
      actorId: actor.id,
      action: 'stripeSubscriptionEvent',
      entityId: subscription.id,
      at: new Date().toISOString(),
      details: `${event.id}: ${state.billing.status}; mapped plan ${state.plan}. Payment does not modify verification or provider licenses.`,
      previousHash: workspace.audit.at(-1)?.hash || 'genesis',
    };
    workspace.audit.push({ ...audit, hash: auditDigest(audit) });
    return { received: true, status: state.billing.status, plan: state.plan };
  });
  return mutation.result;
}
