export type AiProvider = 'groq' | 'openai';
export type AiRoute = { provider: AiProvider | 'evidence'; model: string; task: 'everyday' | 'reasoning' | 'deterministic'; reason: string };
export type AiEvent = { id: string; at: string; provider: AiProvider | 'evidence'; model: string; task: string; latencyMs: number; inputTokens: number; outputTokens: number; estimatedUsd: number; attempts: number; retries: number; cacheHit: boolean; status: 'success' | 'fallback' | 'blocked'; reason: string };
export type AiReservation = { id: string; provider: AiProvider; model: string; day: string; month: string; amountUsd: number; at: string; status: 'reserved' | 'settled'; settledUsd?: number };
export type AiState = { version: 1; windows: Record<string, { reservedUsd: number; spentUsd: number }>; reservations: AiReservation[]; events: AiEvent[] };
