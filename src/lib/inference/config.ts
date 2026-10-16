import type { AiProvider, AiRoute } from '../ai-types';
export const modelRegistry = {
  'openai/gpt-oss-20b': { production: true, tools: true, jsonSchema: true, streaming: true, combinedToolsAndSchema: false, inputUsdPerMillion: 0.075, outputUsdPerMillion: 0.30, contextTokens: 131072, source: 'https://console.groq.com/docs/models' },
  'openai/gpt-oss-120b': { production: true, tools: true, jsonSchema: true, streaming: true, combinedToolsAndSchema: false, inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.60, contextTokens: 131072, source: 'https://console.groq.com/docs/models' },
} as const;
export const boundedNumber = (name: string, fallback: number, max: number) => { const raw = process.env[name]; const value = raw?.trim() ? Number(raw) : NaN; return Number.isFinite(value) && value >= 0 && value <= max ? value : fallback; };
export function inferenceRoute(message = '', preferred?: AiProvider): AiRoute {
  if (process.env.AI_PROVIDER && !['evidence', 'groq', 'openai'].includes(process.env.AI_PROVIDER)) return { provider: 'evidence', model: '', task: 'deterministic', reason: 'Unknown provider configuration fails closed.' };
  if (process.env.AI_PROVIDER === 'evidence' || /^\s*(calculate|compute|approve|send|accept|reject|change deadline|grant access)\b/i.test(message)) return { provider: 'evidence', model: '', task: 'deterministic', reason: 'Calculations, permissions, deadlines and consequential actions remain deterministic or require explicit professional approval.' };
  if (preferred === 'openai' && process.env.GROQ_API_KEY && process.env.AI_ALLOW_OPENAI_SECONDARY !== 'approved') return { provider: 'evidence', model: '', task: 'deterministic', reason: 'Secondary provider use has not been explicitly approved; evidence fallback prevents silent cost escalation.' };
  const provider = preferred || (process.env.AI_PROVIDER === 'openai' ? 'openai' : process.env.AI_PROVIDER === 'groq' || process.env.GROQ_API_KEY ? 'groq' : process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? 'openai' : 'evidence');
  const reasoning = /counterfactual|challenge|uncertain|complex|contract|contingenc|trade.?off|multiple|assumption|negotiat|compare.*(?:scenario|offer)/i.test(message);
  const model = provider === 'groq' ? process.env[reasoning ? 'GROQ_MODEL_REASONING' : 'GROQ_MODEL_FAST'] || (reasoning ? 'openai/gpt-oss-120b' : 'openai/gpt-oss-20b') : provider === 'openai' ? process.env.OPENAI_MODEL || '' : '';
  return { provider, model, task: reasoning ? 'reasoning' : 'everyday', reason: reasoning ? 'Complex comparison or assumption review; all numeric and deadline facts must come from tools.' : 'Routine evidence explanation; no model-generated valuation arithmetic.' };
}
export function providerReady(route: AiRoute): { ready: boolean; reason: string } {
  if (route.provider === 'evidence') return { ready: false, reason: route.reason };
  if (process.env.AI_DATA_SHARING !== 'approved') return { ready: false, reason: 'External data processing is not approved by the operator.' };
  if (route.provider === 'groq') {
    if (!process.env.GROQ_API_KEY || !(route.model in modelRegistry)) return { ready: false, reason: 'Groq key is absent or model is outside the explicitly supported capability registry.' };
    if (process.env.AI_REQUIRE_ZDR === 'true' && (process.env.GROQ_ZDR_ATTESTED !== 'approved' || !process.env.GROQ_ZDR_REVIEWED_AT || !Number.isFinite(Date.parse(process.env.GROQ_ZDR_REVIEWED_AT)))) return { ready: false, reason: 'Required Groq ZDR organization configuration has no operator review attestation. An application flag cannot configure Groq Data Controls.' };
  } else {
    if (!process.env.OPENAI_API_KEY || !route.model) return { ready: false, reason: 'Optional OpenAI selection requires its own explicitly configured key and model.' };
    if (process.env.NODE_ENV === 'production' || process.env.GROQ_API_KEY) { const rates = costRates('openai', route.model); if (!rates.inputUsdPerMillion || !rates.outputUsdPerMillion) return { ready: false, reason: 'Production or secondary OpenAI inference requires explicitly configured positive cost rates; an unknown model cannot receive an unpriced budget.' }; }
    if (process.env.AI_REQUIRE_ZDR === 'true' && (process.env.OPENAI_ZDR_ATTESTED !== 'approved' || !process.env.OPENAI_ZDR_REVIEWED_AT || !Number.isFinite(Date.parse(process.env.OPENAI_ZDR_REVIEWED_AT)))) return { ready: false, reason: 'Required optional-provider privacy review is unavailable; no implicit privacy fallback is allowed.' };
  }
  return { ready: true, reason: 'Explicitly configured provider; account access and privacy settings are not independently verified.' };
}
export function costRates(provider: AiProvider, model: string) {
  const defaults = provider === 'groq' ? modelRegistry[model as keyof typeof modelRegistry] : undefined;
  const prefix = provider === 'groq' ? model.endsWith('120b') ? 'GROQ_REASONING' : 'GROQ_FAST' : 'OPENAI';
  return { inputUsdPerMillion: boundedNumber(`${prefix}_INPUT_USD_PER_MILLION`, defaults?.inputUsdPerMillion ?? boundedNumber('AI_INPUT_USD_PER_MILLION', 0, 1000), 1000), outputUsdPerMillion: boundedNumber(`${prefix}_OUTPUT_USD_PER_MILLION`, defaults?.outputUsdPerMillion ?? boundedNumber('AI_OUTPUT_USD_PER_MILLION', 0, 1000), 1000), source: defaults ? defaults.source : 'operator configuration; unpriced if zero', note: 'Published or configured estimate, not a provider invoice. Cached-input discounts are not assumed.' };
}
export function budgetLimits() { return { dailyUsd: boundedNumber('AI_DAILY_BUDGET_USD', 0, 1e6), monthlyUsd: boundedNumber('AI_MONTHLY_BUDGET_USD', 0, 1e7), requestUsd: boundedNumber('AI_REQUEST_BUDGET_USD', 0, 1000) }; }
