/** One explicitly authorized minimal diagnostic, never part of the ordinary evaluation/test suite. */
import { readFile, writeFile } from 'node:fs/promises';
import { infer, discoverGroqModels, InferenceHttpError } from '../src/lib/inference/provider';
import { costRates } from '../src/lib/inference/config';
async function main() {
  if (
    process.env.AI_EVAL_ALLOW_LIVE !== 'approved' ||
    !process.env.GROQ_API_KEY ||
    !process.argv.includes('--approved-diagnostic')
  )
    throw new Error('Explicit live diagnostic opt-in is required.');
  const path = 'evidence/ai-evaluation.live-diagnostic.json';
  try {
    await readFile(path);
    throw new Error('Diagnostic artifact already exists; no duplicate paid diagnostic is allowed.');
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const previous = JSON.parse(await readFile('evidence/ai-evaluation.live.json', 'utf8'));
  const priorAccountedUsd = Number(previous.summary.accountedBudgetUsd);
  const reservedCapUsd = 0.0009;
  if (!Number.isFinite(priorAccountedUsd) || priorAccountedUsd + reservedCapUsd > 0.01)
    throw new Error('Cumulative evaluation budget exhausted.');
  process.env.AI_MAX_OUTPUT_TOKENS = '256';
  process.env.AI_MAX_RETRIES = '0';
  let attempts = 0;
  const started = performance.now();
  let result: unknown;
  let errorDetails: unknown;
  let inputTokens = 0,
    outputTokens = 0;
  try {
    const response = await infer(
      {
        route: {
          provider: 'groq',
          model: 'openai/gpt-oss-20b',
          task: 'everyday',
          reason: 'One explicitly approved minimal tool-phase diagnostic.',
        },
        instructions:
          'Only synthetic evidence is available. Use lookup_evidence to read a fixture if needed; never invent a fact.',
        input: [{ role: 'user', content: 'Explain synthetic fixture demo-1 using available evidence.' }],
        tools: [
          {
            name: 'lookup_evidence',
            description: 'Read a fictional fixture. No action or network call.',
            parameters: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
              additionalProperties: false,
            },
          },
        ],
        format: {
          name: 'diagnostic',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
        },
        finalOnly: false,
        requestBudgetUsd: reservedCapUsd,
        deadlineAt: Date.now() + 15000,
      },
      fetch,
      event => {
        attempts += event.attempts;
      },
    );
    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;
    result = { status: response.status, output: response.output };
  } catch (error) {
    errorDetails =
      error instanceof InferenceHttpError
        ? { status: error.status, ...error.details }
        : {
            summary:
              error instanceof Error && /budget|deadline|timeout/i.test(error.message)
                ? error.message
                : 'Provider transport or response validation failed. No raw request, body or credential retained.',
          };
  }
  let models: unknown;
  try {
    models = await discoverGroqModels();
  } catch {
    models = { status: 'unavailable', note: 'Metadata discovery failed; no additional inference request was made.' };
  }
  const rates = costRates('groq', 'openai/gpt-oss-20b');
  const estimatedUsd = (inputTokens * rates.inputUsdPerMillion + outputTokens * rates.outputUsdPerMillion) / 1e6;
  const artifact = {
    executedAt: new Date().toISOString(),
    mode: 'explicit-opt-in-single-diagnostic',
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    attempts,
    latencyMs: performance.now() - started,
    inputTokens,
    outputTokens,
    estimatedUsd,
    reservedCapUsd,
    priorAccountedUsd,
    cumulativeConservativeBoundUsd: priorAccountedUsd + (attempts ? reservedCapUsd : 0),
    ...(result ? { result } : {}),
    ...(errorDetails ? { error: errorDetails } : {}),
    discoverableSupportedModels: models,
    limitations: [
      'Synthetic minimal tool-phase transport diagnostic only; does not verify the application final structured answer,120B inference, factual accuracy or superiority.',
      'No retries, secondary-provider calls or hidden model reasoning are retained. Token arithmetic is an estimate, not an invoice.',
    ],
  };
  await writeFile(path, JSON.stringify(artifact, null, 2) + '\n');
  console.log(JSON.stringify(artifact));
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Diagnostic failed');
  process.exitCode = 1;
});
