import { z } from 'zod';
import { answerAssistant, answerFromEvidence, externalModelPolicy } from '@/lib/assistant';
import { authorized, endpoint, json, rateLimit, readJson } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { HttpError } from '@/lib/auth';
import { recordModelUsage, reserveUsage } from '@/lib/platform';
import { costRates, inferenceRoute, providerReady } from '@/lib/inference/config';
import { recordAiReuse, reserveAiBudget, settleAiBudget } from '@/lib/inference/ledger';
import { reuseSafeSynthetic } from '@/lib/inference/reuse';
import type { AssistantResponse } from '@/lib/types';
export const runtime = 'nodejs';
export const maxDuration = 60;
const schema = z.object({ message: z.string().trim().min(1).max(4000), mode: z.enum(['auto', 'evidence', 'model']).default('auto'), stream: z.boolean().default(false), provider: z.enum(['groq', 'openai']).optional(), context: z.object({ propertyId: z.string().max(100).optional(), cmaId: z.string().max(100).optional(), clientId: z.string().max(100).optional(), transactionId: z.string().max(100).optional(), page: z.string().max(100).optional() }).optional() });
function streamResponse(run: (progress: (value: unknown) => void) => Promise<AssistantResponse>) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ async start(controller) { const emit = (name: string, value: unknown) => controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`)); try { emit('status', { phase: 'authorized-evidence', note: 'Only validated final text is released.' }); emit('result', await run((value) => emit('progress', value))); } catch (error) { emit('error', { status: error instanceof HttpError ? error.status : 500, error: error instanceof HttpError ? error.message : 'Inference could not complete. Evidence mode remains available.' }); } finally { controller.close(); } } }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' } });
}
export async function POST(request: Request) { return endpoint(async () => {
  const user = await authorized(request, true); await rateLimit(request, 'assistant', 30, user); const input = await readJson(request, schema); const workspace = await getWorkspace(user.tenantId);
  const immediate = (answer: AssistantResponse) => input.stream ? streamResponse(async () => answer) : json(answer);
  const baseline = answerFromEvidence(workspace, input.message, input.context);
  if (input.mode === 'evidence' || baseline.tools.includes('fair-housing-boundary')) return immediate(baseline);
  const policy = externalModelPolicy(workspace);
  if (!policy.allowed) { if (input.mode === 'model') throw new HttpError(403, policy.reason!); return immediate({ ...baseline, missingInformation: [...baseline.missingInformation, policy.reason!], tools: [...baseline.tools, 'licensed-model-sharing-blocked'] }); }
  const route = inferenceRoute(input.message, input.provider); const readiness = providerReady(route);
  if (!readiness.ready) { if (input.mode === 'model') throw new HttpError(503, readiness.reason); return immediate({ ...baseline, missingInformation: [...baseline.missingInformation, readiness.reason] }); }
  const run = async (progress: (value: unknown) => void = () => undefined): Promise<AssistantResponse> => {
    let budget;
    try { budget = await reserveAiBudget(user, route); }
    catch (error) { if (input.mode === 'auto' && error instanceof HttpError) return { ...baseline, missingInformation: [...baseline.missingInformation, error.message], tools: [...baseline.tools, 'budget-evidence-fallback'] }; throw error; }
    let reservation;
    try { reservation = await reserveUsage(user, 'aiRequests'); }
    catch (error) { await settleAiBudget(user, budget.result.id, { provider: route.provider, model: route.model, task: route.task, latencyMs: 0, inputTokens: 0, outputTokens: 0, attempts: 0, retries: 0, cacheHit: false, status: 'blocked', reason: 'question-quota' }); if (input.mode === 'auto' && error instanceof HttpError && error.status === 402) return { ...baseline, missingInformation: [...baseline.missingInformation, error.message], tools: [...baseline.tools, 'quota-evidence-fallback'] }; throw error; }
    let inputTokens = 0, outputTokens = 0, attempts = 0, retries = 0; const started = performance.now();
    const answer = await answerAssistant(workspace, input.message, input.context, fetch, (inputCount, outputCount) => { inputTokens += inputCount; outputTokens += outputCount; }, { route, stream: input.stream, requestBudgetUsd: budget.result.amountUsd || undefined, onTransport(event) { attempts += event.attempts; retries += event.retries; progress({ phase: 'provider', provider: event.provider, attempts, retries }); } });
    const rates = costRates(route.provider as 'groq' | 'openai', route.model);
    await recordModelUsage(user, inputTokens, outputTokens, reservation.result.id, reservation.result.period, rates);
    await settleAiBudget(user, budget.result.id, { provider: route.provider, model: route.model, task: route.task, latencyMs: performance.now() - started, inputTokens, outputTokens, attempts, retries, cacheHit: false, status: answer.mode === 'model' ? 'success' : attempts === 0 ? 'blocked' : 'fallback', reason: answer.mode === 'model' ? 'validated-citations-and-policy' : attempts === 0 ? 'blocked-before-provider' : 'provider-or-evidence-validation' });
    return answer;
  };
  const shared = async (progress: (value: unknown) => void = () => undefined) => { const result = await reuseSafeSynthetic(user, workspace, input.message, input.context || {}, route, () => run(progress)); if (result.reused) await recordAiReuse(user, route, result.answer.mode); return result.answer; };
  return input.stream ? streamResponse(shared) : json(await shared());
}); }
