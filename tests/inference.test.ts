import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { register, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { createDemoWorkspace } from '../src/lib/seed';
import { answerAssistant, answerFromEvidence, externalModelPolicy, getProviderEvidence } from '../src/lib/assistant';
import { costRates, inferenceRoute, modelRegistry, providerReady } from '../src/lib/inference/config';
import {
  discoverGroqModels,
  infer,
  InferenceHttpError,
  parseGroqSse,
  retryAfterMs,
  type InferenceRequest,
} from '../src/lib/inference/provider';
import { aiMetrics, aiStatus, reserveAiBudget, settleAiBudget } from '../src/lib/inference/ledger';
import { POST as assistantPost } from '../src/app/api/assistant/route';
import { reuseSafeSynthetic } from '../src/lib/inference/reuse';

process.env.SQLITE_PATH = resolve('.data', `inference-test-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
Object.assign(process.env, {
  GROQ_API_KEY: 'gsk_mock_not_a_real_key',
  AI_DATA_SHARING: 'approved',
  AI_DAILY_BUDGET_USD: '1',
  AI_MONTHLY_BUDGET_USD: '10',
  AI_REQUEST_BUDGET_USD: '0.1',
  AI_MAX_RETRIES: '1',
});
delete process.env.AI_REQUIRE_ZDR;
delete process.env.AI_PROVIDER;
delete process.env.GROQ_MODEL_FAST;
delete process.env.GROQ_MODEL_REASONING;
delete process.env.APP_ORIGIN;
after(async () => closeDatabase());
const finalAnswer = (
  answer = 'The saved comparable analysis is evidence, not a guaranteed sale outcome [cma-01].',
  citationIds = ['cma-01'],
) =>
  JSON.stringify({
    answer,
    citationIds,
    missingInformation: ['No calibrated sale probability is available.'],
    suggestedActions: ['Review the cited assumptions.'],
  });
const completion = (content: string, prompt = 100, output = 30) =>
  Response.json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: prompt, completion_tokens: output },
  });
const request: InferenceRequest = {
  route: { provider: 'groq', model: 'openai/gpt-oss-20b', task: 'everyday', reason: 'test' },
  instructions: 'Use evidence',
  input: [{ role: 'user', content: 'Synthetic question' }],
  tools: [],
  format: { name: 'test', schema: { type: 'object', properties: {}, additionalProperties: false } },
  finalOnly: true,
};

test('official capability registry routes everyday/reasoning and keeps deterministic work out of models', () => {
  assert.equal(inferenceRoute('Explain this property').model, 'openai/gpt-oss-20b');
  assert.equal(inferenceRoute('Challenge assumptions and compare multiple offers').model, 'openai/gpt-oss-120b');
  assert.equal(inferenceRoute('Calculate a net value').provider, 'evidence');
  assert.equal(inferenceRoute('Approve this offer').provider, 'evidence');
  assert.equal(modelRegistry['openai/gpt-oss-20b'].combinedToolsAndSchema, false);
  assert.equal(costRates('groq', 'openai/gpt-oss-120b').outputUsdPerMillion, 0.6);
  assert.equal(providerReady({ ...request.route, model: 'unknown-unregistered-model' }).ready, false);
  assert.equal(
    inferenceRoute('Explain the evidence', 'openai').provider,
    'evidence',
    'Secondary provider is not silently enabled',
  );
  process.env.AI_PROVIDER = 'unknown-provider';
  assert.equal(inferenceRoute('Explain this property').provider, 'evidence');
  delete process.env.AI_PROVIDER;
  const groqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  process.env.AI_PROVIDER = 'groq';
  assert.equal(inferenceRoute('Explain this property').provider, 'groq');
  assert.equal(providerReady(inferenceRoute('Explain this property')).ready, false);
  process.env.GROQ_API_KEY = groqKey;
  delete process.env.AI_PROVIDER;
});

test('Groq tool selection and strict final schema are separate; shared authorized tools and PII redaction remain enforced', async () => {
  const bodies: Record<string, any>[] = [];
  const workspace = createDemoWorkspace();
  workspace.clients[0].name = 'Sensitive Client Sentinel';
  const mock: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (body.tools) {
      assert.equal(body.response_format, undefined);
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'tool-1',
                  type: 'function',
                  function: {
                    name: 'compare_pricing',
                    arguments: JSON.stringify({
                      cmaId: 'cma-01',
                      listPrice: 725000,
                      commissionPercent: 3,
                      closingPercent: 1,
                      concessions: 0,
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      });
    }
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.tools, undefined);
    return completion(finalAnswer());
  };
  let inputs = 0,
    outputs = 0;
  const answer = await answerAssistant(
    workspace,
    'Explain this property for Sensitive Client Sentinel',
    { cmaId: 'cma-01', clientId: workspace.clients[0].id },
    mock,
    (a, b) => {
      inputs += a;
      outputs += b;
    },
  );
  assert.equal(answer.mode, 'model');
  assert.ok(answer.tools.includes('compare_pricing'));
  assert.equal(bodies.length, 2);
  assert.equal(inputs, 200);
  assert.equal(outputs, 50);
  assert.ok(!JSON.stringify(bodies).includes('Sensitive Client Sentinel'));
});

test('Groq retrieval instructions never demand final JSON before the separate structured synthesis phase', async () => {
  let calls = 0;
  const mock: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls++;
    const instruction = body.messages[0].content as string;
    if (body.tools) {
      // Regression from the real tool_use_failed response: the planner must not also be asked for final JSON.
      assert.match(instruction, /retrieval phase/);
      assert.doesNotMatch(instruction, /Reply with the required JSON schema|Produce the final answer/);
      assert.equal(body.response_format, undefined);
      return completion('The supplied evidence is sufficient.');
    }
    assert.match(instruction, /Produce the final answer/);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.tools, undefined);
    assert.ok(
      body.messages.some(
        (message: { role: string; content: string }) =>
          message.role === 'assistant' && message.content === 'The supplied evidence is sufficient.',
      ),
    );
    return completion(finalAnswer());
  };
  const result = await answerAssistant(
    createDemoWorkspace(),
    'Explain the available property evidence.',
    { cmaId: 'cma-01' },
    mock,
  );
  assert.equal(result.mode, 'model');
  assert.equal(calls, 2);
  assert.equal(result.citations[0].id, 'cma-01');
});

test('known semantic grounding regressions return deterministic evidence without another provider call', async () => {
  for (const [text, citationIds, code] of [
    ['The CMA uses eight comparables.', ['cma-01'], 'comparable-count'],
    ['The CMA median is $727,321.', ['cma-01'], 'valuation-method'],
    ['The subject has a lot size of 2,480 sq ft.', ['property-01'], 'property-area'],
  ] as const) {
    let calls = 0;
    const mocked: typeof fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      return completion(
        body.tools
          ? 'The supplied evidence is sufficient.'
          : JSON.stringify({ sections: [{ text, citationIds }], missingInformation: [], suggestedActions: [] }),
      );
    };
    const answer = await answerAssistant(
      createDemoWorkspace(),
      'Explain the property and its saved comparable analysis.',
      { propertyId: 'property-01', cmaId: 'cma-01' },
      mocked,
    );
    assert.equal(answer.mode, 'evidence');
    assert.ok(answer.tools.includes(`validation-error-code:${code}`));
    assert.equal(calls, 2);
  }
});

test('Groq SSE tool deltas parse across byte chunks; only nonstream final synthesis uses strict schema', async () => {
  const chunks = [
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'stream-call', function: { name: 'read_decision_graph', arguments: '{"entityId":' } },
            ],
          },
        },
      ],
    }),
    JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"property-01"}' } }] } }],
      x_groq: { usage: { prompt_tokens: 40, completion_tokens: 15 } },
    }),
  ];
  const bytes = new TextEncoder().encode(chunks.map(chunk => `data: ${chunk}\n\n`).join('') + 'data: [DONE]\n\n');
  const streamed = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 37));
          controller.enqueue(bytes.slice(37));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  const parsed = (await parseGroqSse(streamed())) as any;
  assert.equal(parsed.choices[0].message.tool_calls[0].function.arguments, '{"entityId":"property-01"}');
  let calls = 0;
  const mock: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    if (calls === 1) {
      assert.equal(body.stream, true);
      return streamed();
    }
    assert.equal(body.stream, false);
    assert.equal(body.tools, undefined);
    return completion(finalAnswer());
  };
  const result = await answerAssistant(
    createDemoWorkspace(),
    'Explain the property',
    { cmaId: 'cma-01' },
    mock,
    undefined,
    { stream: true },
  );
  assert.equal(result.mode, 'model');
  assert.equal(calls, 2);
  await assert.rejects(parseGroqSse(new Response('data: {}\n\n')), /Truncated/);
});

test('bounded 429 retries honor Retry-After; long waits, server errors and oversized context fail safely', async () => {
  let calls = 0,
    retries = 0;
  const mock: typeof fetch = async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0' } }) : completion('{}');
  };
  await infer(request, mock, event => {
    retries += event.retries;
  });
  assert.equal(calls, 2);
  assert.equal(retries, 1);
  assert.throws(() => retryAfterMs('30'), /bounded/);
  calls = 0;
  await assert.rejects(
    infer(request, async () => {
      calls++;
      return new Response('', { status: 500 });
    }),
    /500/,
  );
  assert.equal(calls, 1);
  await assert.rejects(infer({ ...request, input: [{ role: 'user', content: 'X'.repeat(100001) }] }, mock), /100 KB/);
  await assert.rejects(infer({ ...request, requestBudgetUsd: 0.00000001 }, mock), /budget/);
  await assert.rejects(infer({ ...request, deadlineAt: Date.now() - 1 }, mock), /deadline/);
});

test('ZDR is an operator-reviewed organization setting, not a request flag or implied provider verification', async () => {
  process.env.AI_REQUIRE_ZDR = 'true';
  delete process.env.GROQ_ZDR_ATTESTED;
  delete process.env.GROQ_ZDR_REVIEWED_AT;
  try {
    assert.equal(providerReady(request.route).ready, false);
    process.env.GROQ_ZDR_ATTESTED = 'approved';
    assert.equal(providerReady(request.route).ready, false);
    process.env.GROQ_ZDR_REVIEWED_AT = new Date().toISOString();
    assert.equal(providerReady(request.route).ready, true);
  } finally {
    delete process.env.AI_REQUIRE_ZDR;
    delete process.env.GROQ_ZDR_ATTESTED;
    delete process.env.GROQ_ZDR_REVIEWED_AT;
  }
  const account = await register({
    seed: 'demo',
    name: 'AI Owner',
    email: `${randomUUID()}@example.test`,
    password: 'safe inference password 123',
  });
  const status = await aiStatus(account.user);
  assert.equal(status.privacy.providerVerified, false);
  assert.equal(status.liveProviderVerified, false);
});

test('tenant budget reservations are atomic and duplicate settlements do not double count; failures remain conservatively accounted', async () => {
  const account = await register({
    seed: 'demo',
    name: 'Budget Owner',
    email: `${randomUUID()}@example.test`,
    password: 'safe inference password 123',
  });
  process.env.AI_DAILY_BUDGET_USD = '0.2';
  try {
    const reservations = await Promise.allSettled(
      Array.from({ length: 3 }, () => reserveAiBudget(account.user, request.route)),
    );
    assert.equal(reservations.filter(entry => entry.status === 'fulfilled').length, 2);
    const one = (
      reservations.find(entry => entry.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof reserveAiBudget>>
      >
    ).value;
    const event = {
      provider: 'groq' as const,
      model: request.route.model,
      task: 'everyday',
      latencyMs: 10,
      inputTokens: 100,
      outputTokens: 30,
      attempts: 1,
      retries: 0,
      cacheHit: false,
      status: 'fallback' as const,
      reason: 'transport-failure',
    };
    await settleAiBudget(account.user, one.result.id, event);
    assert.equal((await settleAiBudget(account.user, one.result.id, event)).result.duplicate, true);
    const workspace = await getWorkspace(account.user.tenantId);
    const day = Object.entries(workspace.ai!.windows).find(([key]) => key.startsWith('day:'))![1];
    assert.equal(day.spentUsd, 0.1);
    assert.equal(day.reservedUsd, 0.1);
    const other = await register({
      seed: 'demo',
      name: 'Other Budget',
      email: `${randomUUID()}@example.test`,
      password: 'safe inference password 123',
    });
    assert.equal((await aiMetrics(other.user)).totals.requests, 0);
  } finally {
    process.env.AI_DAILY_BUDGET_USD = '1';
  }
});

test('assistant SSE returns validated results and tenant metrics without prompt or client text', async () => {
  const account = await register({
    seed: 'demo',
    name: 'Streaming Owner',
    email: `${randomUUID()}@example.test`,
    password: 'safe inference password 123',
  });
  const prior = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return body.response_format
      ? completion(finalAnswer())
      : new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Use the evidence and provide a structured answer.' } }], usage: { prompt_tokens: 80, completion_tokens: 10 } })}\n\ndata: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        );
  };
  try {
    const response = await assistantPost(
      new Request('http://localhost:3040/api/assistant', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3040',
          cookie: sessionCookie(account.token),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Explain this property without raw-prompt-telemetry-sentinel',
          stream: true,
          context: { cmaId: 'cma-01' },
        }),
      }),
    );
    assert.match(response.headers.get('content-type')!, /event-stream/);
    const body = await response.text();
    assert.match(body, /event: result/);
    assert.match(body, /"mode":"model"/);
    const metrics = await aiMetrics(account.user);
    assert.equal(metrics.totals.successes, 1);
    assert.ok(!JSON.stringify(metrics).includes('raw-prompt-telemetry-sentinel'));
    assert.ok(metrics.totals.estimatedUsd > 0);
  } finally {
    globalThis.fetch = prior;
  }
});

test('unsupported citations, fabricated prices, unsafe housing output, and provider failures return deterministic evidence without secondary spend', async () => {
  const workspace = createDemoWorkspace();
  for (const text of [
    finalAnswer('Unsupported [secret]', ['secret']),
    finalAnswer('A guaranteed valuation is $999999999 [cma-01].'),
    finalAnswer('Prefer buyers of a particular religion [cma-01].'),
  ]) {
    const mock: typeof fetch = async (_url, init) =>
      JSON.parse(String(init?.body)).response_format ? completion(text) : completion('Provide final JSON.');
    const result = await answerAssistant(workspace, 'Explain this property', { cmaId: 'cma-01' }, mock);
    assert.equal(result.mode, 'evidence');
  }
  let calls = 0;
  const denied: typeof fetch = async () => {
    calls++;
    throw new Error('Must not call provider');
  };
  assert.equal((await answerAssistant(workspace, 'Choose buyers by religion', {}, denied)).mode, 'evidence');
  assert.equal(calls, 0);
  process.env.OPENAI_API_KEY = 'mock_secondary';
  process.env.OPENAI_MODEL = 'explicit-test-model';
  const unavailable: typeof fetch = async url => {
    assert.match(String(url), /api.groq.com/);
    calls++;
    return new Response('', { status: 503 });
  };
  assert.equal(
    (await answerAssistant(workspace, 'Explain evidence', { cmaId: 'cma-01' }, unavailable)).mode,
    'evidence',
  );
  assert.equal(calls, 1);
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
});

test('model explanations require matching authorized inline references instead of an unattached citation list', async () => {
  const workspace = createDemoWorkspace();
  for (const text of [
    finalAnswer('This conclusion has no inline reference.'),
    finalAnswer('Invented reference [private-source].'),
    finalAnswer('The saved analysis needs review [cma-01].', ['cma-01', 'property-01']),
  ]) {
    const mock: typeof fetch = async (_url, init) =>
      JSON.parse(String(init?.body)).response_format ? completion(text) : completion('Evidence is sufficient.');
    const result = await answerAssistant(workspace, 'Explain the evidence', { cmaId: 'cma-01' }, mock);
    assert.equal(result.mode, 'evidence');
    assert.ok(result.tools.includes('fallback:evidence-validation'));
  }
  const valid: typeof fetch = async (_url, init) =>
    JSON.parse(String(init?.body)).response_format ? completion(finalAnswer()) : completion('Evidence is sufficient.');
  assert.equal((await answerAssistant(workspace, 'Explain the evidence', { cmaId: 'cma-01' }, valid)).mode, 'model');
});

test('Groq paragraph references are schema-bound to retrieved IDs and rendered by the application', async () => {
  const mock: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (!body.response_format) return completion('Evidence is sufficient.');
    const schema = body.response_format.json_schema.schema;
    assert.ok(schema.properties.sections.items.properties.citationIds.items.enum.includes('cma-01'));
    return completion(
      JSON.stringify({
        sections: [{ text: 'The stored analysis is a calculation, not a guaranteed sale.', citationIds: ['cma-01'] }],
        missingInformation: ['Current condition requires review.'],
        suggestedActions: ['Inspect the assumptions.'],
      }),
    );
  };
  const result = await answerAssistant(
    createDemoWorkspace(),
    'Explain the property evidence',
    { cmaId: 'cma-01' },
    mock,
  );
  assert.equal(result.mode, 'model');
  assert.match(result.answer, /guaranteed sale\. \[cma-01\]/);
  for (const ids of [[], ['unknown-private-record']]) {
    const invalid: typeof fetch = async (_url, init) =>
      JSON.parse(String(init?.body)).response_format
        ? completion(
            JSON.stringify({
              sections: [{ text: 'Unsupported paragraph.', citationIds: ids }],
              missingInformation: [],
              suggestedActions: [],
            }),
          )
        : completion('Evidence is sufficient.');
    assert.equal(
      (await answerAssistant(createDemoWorkspace(), 'Explain the property evidence', { cmaId: 'cma-01' }, invalid))
        .mode,
      'evidence',
    );
  }
});

test('reasoning retrieval and structured final assembly use distinct bounded effort levels', async () => {
  const efforts: string[] = [];
  const mock: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    efforts.push(body.reasoning_effort);
    assert.ok(body.max_completion_tokens > 0 && body.max_completion_tokens <= 8192);
    return body.response_format ? completion(finalAnswer()) : completion('Evidence is sufficient.');
  };
  const result = await answerAssistant(
    createDemoWorkspace(),
    'Challenge the comparable assumptions.',
    { cmaId: 'cma-01' },
    mock,
  );
  assert.equal(result.mode, 'model');
  assert.deepEqual(efforts, ['medium', 'low']);
});

test('currency abbreviations and spaced percentages are validated in explanations, uncertainty and next actions', async () => {
  const workspace = createDemoWorkspace();
  assert.match(
    answerFromEvidence(workspace, 'Explain the CMA', { cmaId: 'cma-01' }).answer,
    /weighted mean.*not a median/,
  );
  assert.match(
    answerFromEvidence(workspace, 'Explain the CMA', { cmaId: 'cma-01' }).answer,
    /Condition adjustment IS modeled/,
  );
  const base = JSON.parse(finalAnswer());
  for (const output of [
    { ...base, answer: 'A value of $999k is certain [cma-01].' },
    { ...base, missingInformation: ['Expect a 91.25\u202f% success rate.'] },
    { ...base, suggestedActions: ['List at $999m immediately.'] },
  ]) {
    const mock: typeof fetch = async (_url, init) =>
      JSON.parse(String(init?.body)).response_format
        ? completion(JSON.stringify(output))
        : completion('Evidence is sufficient.');
    const result = await answerAssistant(workspace, 'Explain the evidence', { cmaId: 'cma-01' }, mock);
    assert.equal(result.mode, 'evidence');
    assert.ok(result.tools.includes('validation-error-code:unsupported-number'));
  }
  const valid: typeof fetch = async (_url, init) =>
    JSON.parse(String(init?.body)).response_format
      ? completion(finalAnswer('The recorded bedroom adjustment assumption is $12k [cma-01].'))
      : completion('Evidence is sufficient.');
  assert.equal((await answerAssistant(workspace, 'Explain the evidence', { cmaId: 'cma-01' }, valid)).mode, 'model');
});

test('optional models discovery intersects the known registry rather than inventing capabilities', async () => {
  let calls = 0;
  const discovery: typeof fetch = async url => {
    calls++;
    assert.equal(String(url), 'https://api.groq.com/openai/v1/models');
    return Response.json({
      data: [
        { id: 'openai/gpt-oss-20b', active: true },
        { id: 'unknown-premium-model', active: true },
        { id: 'openai/gpt-oss-120b', active: false },
      ],
    });
  };
  const models = await discoverGroqModels(discovery);
  assert.deepEqual(models, ['openai/gpt-oss-20b']);
  assert.deepEqual(await discoverGroqModels(discovery), models);
  assert.equal(calls, 1, 'Only nonsensitive account model metadata is cached');
});

test('safe in-flight reuse is tenant/evidence scoped and excludes freeform or client-context questions', async () => {
  const workspace = createDemoWorkspace();
  const actor = {
    id: 'actor',
    tenantId: 'tenant-one',
    name: 'Test',
    email: 'test@example.test',
    role: 'owner' as const,
  };
  let runs = 0;
  let release!: () => void;
  const waiting = new Promise<void>(done => {
    release = done;
  });
  const run = async () => {
    runs++;
    await waiting;
    return {
      mode: 'evidence' as const,
      answer: 'Synthetic evidence',
      citations: [],
      missingInformation: [],
      suggestedActions: [],
      computed: true,
      tools: [],
    };
  };
  const first = reuseSafeSynthetic(
    actor,
    workspace,
    'Explain this property',
    { propertyId: 'property-01' },
    request.route,
    run,
  );
  const second = reuseSafeSynthetic(
    actor,
    workspace,
    'Explain this property',
    { propertyId: 'property-01' },
    request.route,
    run,
  );
  const other = reuseSafeSynthetic(
    { ...actor, tenantId: 'tenant-two' },
    workspace,
    'Explain this property',
    { propertyId: 'property-01' },
    request.route,
    run,
  );
  release();
  const results = await Promise.all([first, second, other]);
  assert.equal(runs, 2);
  assert.equal(results[1].reused, true);
  assert.equal(results[2].reused, false);
  await reuseSafeSynthetic(
    actor,
    workspace,
    'A private custom question',
    { clientId: 'client-01' },
    request.route,
    run,
  );
  await reuseSafeSynthetic(
    actor,
    workspace,
    'A private custom question',
    { clientId: 'client-01' },
    request.route,
    run,
  );
  assert.equal(runs, 4, 'Private or freeform questions never reuse an inference response');
});

test('provider error diagnostics retain bounded codes but never raw provider messages or request fields', async () => {
  try {
    await infer(request, async () =>
      Response.json(
        {
          error: {
            code: 'tool_use_failed',
            type: 'invalid_request_error',
            param: 'tools',
            message: 'Secret raw client@example.test and gsk_private',
            failed_generation: 'PRIVATE SOURCE',
          },
        },
        { status: 400 },
      ),
    );
    assert.fail('expected sanitized failure');
  } catch (error) {
    assert.ok(error instanceof InferenceHttpError);
    assert.equal(error.status, 400);
    assert.equal(error.details.code, 'tool_use_failed');
    assert.equal(error.details.param, 'tools');
    assert.doesNotMatch(JSON.stringify(error), /client@example|gsk_private|PRIVATE SOURCE/);
  }
});

test('authorized provider fixtures are read-only evidence; any real provider cache independently blocks external model processing', async () => {
  const { createFixturePropertyProvider, FIXTURE_PROPERTY_ADDRESS } =
    await import('../src/lib/providers/fixture-property');
  const workspace = createDemoWorkspace();
  const result = await createFixturePropertyProvider().getProperty({ address: FIXTURE_PROPERTY_ADDRESS });
  const at = new Date().toISOString();
  workspace.providerData = {
    version: 1,
    usage: { period: at.slice(0, 7), requests: 0, reservedCostUsd: 0, perUser: {} },
    usageHistory: [],
    reservations: [],
    cache: [
      {
        id: 'provider-fixture-cache',
        key: 'fixture',
        action: 'getProperty',
        fixture: true,
        observedAt: at,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        policyVersion: 'fixture',
        data: result,
      },
    ],
  };
  const evidence = getProviderEvidence(workspace, { zipCode: '22207' });
  assert.equal(evidence.entries.length, 1);
  assert.equal(evidence.entries[0].synthetic, true);
  assert.match(
    answerFromEvidence(workspace, 'Explain provider tax evidence in ZIP 22207', { page: 'providers' }).answer,
    /Synthetic fixture/,
  );
  assert.equal(externalModelPolicy(workspace).allowed, true);
  workspace.providerData.cache[0].fixture = false;
  assert.equal(
    getProviderEvidence(workspace).entries.length,
    0,
    'A missing reviewed policy denies cached real evidence.',
  );
  assert.equal(
    externalModelPolicy(workspace).allowed,
    false,
    'The cache block does not rely on separately projected workspace sources.',
  );
  let calls = 0;
  const answer = await answerAssistant(workspace, 'Explain this property', {}, async () => {
    calls++;
    throw new Error('must not call');
  });
  assert.equal(answer.mode, 'evidence');
  assert.equal(calls, 0);
  assert.ok(answer.tools.includes('licensed-model-sharing-blocked'));
});

test('answers separate recorded facts, calculations, assumptions, interpretation and unknowns', async () => {
  const workspace = createDemoWorkspace();
  const deterministic = answerFromEvidence(workspace, 'Explain the pricing assumptions', {
    cmaId: 'cma-01',
    propertyId: workspace.cmas.find(c => c.id === 'cma-01')!.propertyId,
  });
  const kinds = new Set(deterministic.statements!.map(s => s.kind));
  for (const kind of ['fact', 'calculation', 'assumption'] as const) assert.ok(kinds.has(kind), kind);
  assert.ok(!kinds.has('interpretation'), 'deterministic mode never claims model interpretation');
  // The labeled statements are the answer, not a second version of it.
  assert.equal(deterministic.answer, deterministic.statements!.map(s => s.text).join('\n\n'));
  assert.ok(deterministic.missingInformation.length > 0);
  assert.ok(deterministic.statements!.filter(s => s.kind === 'calculation').some(s => /weighted mean/.test(s.text)));
  const draft = answerFromEvidence(workspace, 'Draft an email to my seller', { cmaId: 'cma-01' });
  assert.ok(draft.statements!.some(s => s.kind === 'draft' && s.text.includes('{client_first_name}')));

  const bodies: string[] = [];
  const mock: typeof fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    const body = JSON.parse(String(init?.body));
    if (!body.response_format) return completion('Evidence is sufficient.');
    return completion(
      JSON.stringify({
        sections: [{ text: 'The stored analysis is a calculation, not a guaranteed sale.', citationIds: ['cma-01'] }],
        missingInformation: [],
        suggestedActions: [],
      }),
    );
  };
  const model = await answerAssistant(workspace, 'Explain the property evidence', { cmaId: 'cma-01' }, mock);
  assert.equal(model.mode, 'model');
  assert.equal(model.statements![0].kind, 'interpretation');
  assert.deepEqual(model.statements![0].refs, ['cma-01']);
  assert.ok(model.statements!.some(s => s.kind === 'calculation'));
  // Labeled copies are presentation only: they are never sent to, or billed by, the model provider.
  assert.ok(bodies.length > 0 && bodies.every(body => !body.includes('"statements"')));
});
