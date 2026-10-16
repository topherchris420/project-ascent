import { boundedNumber, costRates, modelRegistry } from './config';
import type { AiRoute } from '../ai-types';
import { createHash } from 'node:crypto';
export type ProviderItem = { type: string; name?: string; call_id?: string; arguments?: string; content?: { type: string; text?: string }[]; [key: string]: unknown };
export type NormalizedResponse = { status: string; output: ProviderItem[]; usage?: { input_tokens?: number; output_tokens?: number }; needsFinal?: boolean };
export type InferenceRequest = { route: AiRoute; instructions: string; input: unknown[]; tools: { name: string; description: string; parameters: unknown }[]; format: { name: string; schema: unknown }; finalOnly: boolean; stream?: boolean; requestBudgetUsd?: number; deadlineAt?: number };
export type TransportEvent = { attempts: number; retries: number; provider: 'groq' | 'openai'; model: string; streamed: boolean; latencyMs: number };
export class InferenceHttpError extends Error {
  constructor(public readonly status:number,public readonly details:{code?:string;type?:string;param?:string;summary:string}) {super(`Provider HTTP ${status}`);this.name='InferenceHttpError';}
}
async function safeHttpError(response:Response) {
  let parsed:{error?:{code?:unknown;type?:unknown;param?:unknown}}={};try {parsed=JSON.parse(await boundedText(response));} catch { /* Provider error bodies are neither retained nor logged. */ }
  const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(value)?value:undefined;
  const code=identifier(parsed.error?.code),type=identifier(parsed.error?.type);const requestedParam=identifier(parsed.error?.param);
  const param=requestedParam&&['model','tools','tool_choice','parallel_tool_calls','reasoning_effort','response_format','max_completion_tokens','messages','stream','stream_options'].includes(requestedParam)?requestedParam:undefined;
  return new InferenceHttpError(response.status,{...(code?{code}:{}),...(type?{type}:{}),...(param?{param}:{}),summary:code==='tool_use_failed'?'Provider could not generate a valid tool invocation.':response.status===401||response.status===403?'Provider authentication or account permission was rejected.':'Provider rejected the request or could not complete its generation constraints. Raw body and request text are withheld.'});
}

async function boundedText(response: Response) {
  if (!response.body) throw new Error('Empty provider response');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 1000000) { await reader.cancel(); throw new Error('Provider response exceeded 1 MB'); } chunks.push(next.value); }
  return Buffer.concat(chunks).toString('utf8');
}
export function retryAfterMs(value: string | null, now = Date.now()) { if (!value) return 250; const seconds = Number(value); const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now; if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2000) throw new Error('Retry-After exceeds the bounded retry deadline'); return milliseconds; }
export async function parseGroqSse(response: Response): Promise<Record<string, unknown>> {
  const text = await boundedText(response); const calls = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>(); let content = ''; let usage: unknown; let finished = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue; const data = line.slice(5).trim(); if (data === '[DONE]') { finished = true; continue; } if (!data) continue;
    const chunk = JSON.parse(data); if (chunk.usage) usage = chunk.usage; else if (chunk.x_groq?.usage) usage = chunk.x_groq.usage;
    const delta = chunk.choices?.[0]?.delta; if (typeof delta?.content === 'string') content += delta.content;
    for (const call of delta?.tool_calls || []) { if (!Number.isSafeInteger(call.index) || call.index < 0 || call.index > 3) throw new Error('Invalid streaming tool index'); const prior = calls.get(call.index) || { id: '', type: 'function', function: { name: '', arguments: '' } }; if (call.id) prior.id += call.id; if (call.function?.name) prior.function.name += call.function.name; if (call.function?.arguments) prior.function.arguments += call.function.arguments; if (prior.function.arguments.length > 8000) throw new Error('Tool arguments exceeded limit'); calls.set(call.index, prior); }
  }
  if (!finished) throw new Error('Truncated provider stream');
  return { choices: [{ message: { role: 'assistant', content, tool_calls: [...calls.values()] }, finish_reason: calls.size ? 'tool_calls' : 'stop' }], usage };
}
function chatMessages(input: unknown[]) {
  const messages: Record<string, unknown>[] = []; let pending: Record<string, unknown>[] = [];
  const flush = () => { if (pending.length) { messages.push({ role: 'assistant', content: null, tool_calls: pending }); pending = []; } };
  for (const raw of input) { const item = raw as Record<string, unknown>;
    if (item.type === 'function_call') pending.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } });
    else { flush(); if (item.type === 'function_call_output') messages.push({ role: 'tool', tool_call_id: item.call_id, content: item.output }); else if (item.role) messages.push({ role: item.role, content: item.content }); else if (item.type === 'message') messages.push({ role: 'assistant', content: (item.content as { text?: string }[]).map((part) => part.text || '').join('') }); }
  } flush(); return messages;
}
export async function infer(request: InferenceRequest, fetcher: typeof fetch = fetch, onTransport?: (event: TransportEvent) => void): Promise<NormalizedResponse> {
  const { route } = request; if (route.provider === 'evidence') throw new Error('Deterministic route has no external transport');
  const groq = route.provider === 'groq'; if (groq && !(route.model in modelRegistry)) throw new Error('Unknown model capability');
  const maxOutput = Math.max(128, Math.floor(boundedNumber('AI_MAX_OUTPUT_TOKENS', 2200, 8192))); const stream = groq && !request.finalOnly && !!request.stream;
  const payload = groq ? { model: route.model, messages: [{ role: 'system', content: request.instructions }, ...chatMessages(request.input)], max_completion_tokens: maxOutput, reasoning_effort: route.task === 'reasoning' ? 'medium' : 'low', ...(request.finalOnly ? { response_format: { type: 'json_schema', json_schema: { ...request.format, strict: true } } } : { tools: request.tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: 'auto', parallel_tool_calls: false }), stream, ...(stream ? { stream_options: { include_usage: true } } : {}) } : { model: route.model, instructions: request.instructions, input: request.input, tools: request.tools, tool_choice: request.finalOnly ? 'none' : 'auto', parallel_tool_calls: false, max_output_tokens: maxOutput, store: false, include: ['reasoning.encrypted_content'], text: { format: { type: 'json_schema', ...request.format, strict: true } } };
  const body = JSON.stringify(payload); if (Buffer.byteLength(body) > 100000) throw new Error('Authorized inference context exceeds 100 KB');
  if (request.requestBudgetUsd) { const rates = costRates(route.provider, route.model); const bound = Buffer.byteLength(body) * rates.inputUsdPerMillion / 1e6 + maxOutput * rates.outputUsdPerMillion / 1e6; if (bound > request.requestBudgetUsd / 3) throw new Error('Conservative token envelope exceeds the reserved per-request budget'); }
  const started = performance.now(); let attempts = 0; const maxRetries = Math.min(1, Math.floor(boundedNumber('AI_MAX_RETRIES', 1, 1)));
  try {
    while (true) {
      const remaining = request.deadlineAt ? request.deadlineAt - Date.now() : 15000; if (remaining <= 0) throw new Error('Inference deadline exhausted');
      attempts++;
      const response = await fetcher(groq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${process.env[groq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY']}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(Math.max(1, Math.min(remaining, boundedNumber('AI_TIMEOUT_MS', 12000, 15000)))), redirect: 'error' });
      if (response.status === 429 && attempts <= maxRetries) { const delay = retryAfterMs(response.headers.get('retry-after')); await response.body?.cancel(); if (request.deadlineAt && Date.now() + delay >= request.deadlineAt) throw new Error('Retry would exceed inference deadline'); await new Promise((resolve) => setTimeout(resolve, delay)); continue; }
      if (!response.ok) throw await safeHttpError(response);
      const result = stream ? await parseGroqSse(response) : JSON.parse(await boundedText(response));
      if (!groq) return result as NormalizedResponse;
      const choice = result.choices?.[0]; if (!choice?.message || !['stop', 'tool_calls'].includes(choice.finish_reason)) throw new Error('Provider completion is incomplete');
      const calls = choice.message.tool_calls || []; if (calls.length > 4) throw new Error('Provider tool budget exceeded');
      if (request.finalOnly && calls.length) throw new Error('Final structured synthesis cannot request a tool');
      const output: ProviderItem[] = calls.length ? calls.map((call: { id: string; function: { name: string; arguments: string } }) => ({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments })) : [{ type: 'message', content: [{ type: 'output_text', text: choice.message.content || '' }] }];
      return { status: 'completed', output, usage: { input_tokens: result.usage?.prompt_tokens, output_tokens: result.usage?.completion_tokens }, needsFinal: !request.finalOnly && !calls.length };
    }
  } finally { onTransport?.({ attempts, retries: Math.max(0, attempts - 1), provider: route.provider, model: route.model, streamed: stream, latencyMs: performance.now() - started }); }
}
const modelMetadata = new Map<string, { ids: string[]; expiresAt: number }>();
const metadataInflight = new Map<string, Promise<string[]>>();
export async function discoverGroqModels(fetcher: typeof fetch = fetch): Promise<string[]> {
  if (!process.env.GROQ_API_KEY) throw new Error('Groq is not configured');
  const identity = createHash('sha256').update(process.env.GROQ_API_KEY).digest('hex'); const cached = modelMetadata.get(identity); if (cached && cached.expiresAt > Date.now()) return [...cached.ids];
  const pending = metadataInflight.get(identity); if (pending) return [...await pending];
  const operation = (async () => { const response = await fetcher('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(5000), redirect: 'error' }); if (!response.ok) throw new Error('Model discovery unavailable'); const result = JSON.parse(await boundedText(response)); const ids: string[] = (result.data || []).filter((entry: { id?: string; active?: boolean }) => entry.active !== false && typeof entry.id === 'string' && entry.id in modelRegistry).map((entry: { id: string }) => entry.id); if (modelMetadata.size > 20) modelMetadata.clear(); modelMetadata.set(identity, { ids, expiresAt: Date.now() + 300000 }); return ids; })();
  metadataInflight.set(identity, operation); try { return [...await operation]; } finally { metadataInflight.delete(identity); }
}
