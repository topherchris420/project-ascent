import { createHash } from 'node:crypto';
import type { Actor, AssistantResponse, Workspace } from '../types';
import type { AiRoute } from '../ai-types';
const inflight = new Map<string, Promise<AssistantResponse>>();
const safeQuestions = new Set(['explain this property', 'explain the cma', 'summarize the market']);
/** No persistent response cache. Only identical in-flight synthetic reads may share computation. */
export async function reuseSafeSynthetic(
  actor: Actor,
  workspace: Workspace,
  message: string,
  context: { page?: string; propertyId?: string; cmaId?: string; clientId?: string; transactionId?: string },
  route: AiRoute,
  run: () => Promise<AssistantResponse>,
): Promise<{ answer: AssistantResponse; reused: boolean }> {
  const eligible =
    process.env.AI_INFLIGHT_DEDUP !== 'false' &&
    workspace.mode === 'demo' &&
    workspace.sources.every(source => source.kind === 'synthetic') &&
    safeQuestions.has(
      message
        .trim()
        .toLowerCase()
        .replace(/[?.!]$/, ''),
    ) &&
    (!context.page || ['properties', 'cma', 'market'].includes(context.page)) &&
    ((!context.clientId && !context.transactionId) ||
      (!!context.page && ['properties', 'cma', 'market'].includes(context.page)));
  if (!eligible || inflight.size > 100) return { answer: await run(), reused: false };
  const key = createHash('sha256')
    .update(
      JSON.stringify({
        tenant: actor.tenantId,
        route,
        message: message.trim().toLowerCase(),
        context: { page: context.page, propertyId: context.propertyId, cmaId: context.cmaId },
        sources: workspace.sources,
        propertyEvidence: workspace.properties,
        cmas: workspace.cmas.map(record => ({ id: record.id, hash: record.result.calculationHash })),
        selectedRegion: workspace.fabric?.selectedRegionId,
        mode: workspace.fabric?.dataMode,
      }),
    )
    .digest('hex');
  const prior = inflight.get(key);
  if (prior) return { answer: structuredClone(await prior), reused: true };
  const operation = run();
  inflight.set(key, operation);
  try {
    return { answer: await operation, reused: false };
  } finally {
    inflight.delete(key);
  }
}
