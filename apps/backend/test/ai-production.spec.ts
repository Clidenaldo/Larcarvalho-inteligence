import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../src/generated/prisma/client.js';
import { MockAiProvider } from '../src/modules/ai/ai-provider.js';
import { AiPricingService } from '../src/modules/ai/ai-pricing.service.js';
import { ProviderCircuitBreaker } from '../src/modules/ai/circuit-breaker.js';
import { ContextBudgetService } from '../src/modules/ai/context-budget.service.js';
import { MockEmbeddingProvider } from '../src/modules/ai/http-embedding.provider.js';
import { HttpEmbeddingProvider } from '../src/modules/ai/http-embedding.provider.js';
import {
  getModelCapabilities,
  listKnownModels,
} from '../src/modules/ai/model-registry.js';
import { OpenAiCompatibleProvider } from '../src/modules/ai/openai-compatible.provider.js';
import type { FetchImpl } from '../src/modules/ai/provider-http.js';
import { reciprocalRankFusion } from '../src/modules/ai/rrf.js';
import { InMemoryVectorStore } from '../src/modules/ai/vector-store.js';

const BASE = 'https://provider.test/v1';

function structuredBody(
  summary: string,
  usage?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    choices: [{ message: { content: JSON.stringify(summaryPayload(summary)) } }],
    usage: usage ?? {
      completion_tokens: 10,
      prompt_tokens: 100,
      total_tokens: 110,
    },
  };
}

function summaryPayload(summary: string): Record<string, unknown> {
  return {
    attentionPoints: [],
    draft: null,
    facts: [],
    missingInformation: [],
    sources: [],
    suggestedActions: [],
    summary,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream' },
    status: 200,
  });
}

const sseChunk = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const input = {
  maxOutputTokens: 100,
  model: 'gpt-4o-mini',
  promptId: 'commercial-copilot' as const,
  systemInstructions: 'regras',
  temperature: 0.2,
  toolDataSummary: 'dados',
  userMessage: 'oi',
};

describe('openai-compatible adapter (§§12-14, 86)', () => {
  it('retorna estruturado com usage real e request id', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(structuredBody('resumo ok', {
        completion_tokens: 10,
        prompt_tokens: 100,
        prompt_tokens_details: { cached_tokens: 40 },
        total_tokens: 110,
      }), 200, { 'x-request-id': 'req-1' }),
    ) as unknown as FetchImpl;
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 5000,
    });
    const { response, usage } = await provider.structuredOutput(input);
    expect(response.summary).toBe('resumo ok');
    expect(usage).toMatchObject({
      cachedTokens: 40,
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sem chave, recusa antes de qualquer rede', async () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl;
    const provider = new OpenAiCompatibleProvider({
      apiKey: null,
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 5000,
    });
    await expect(provider.generate(input)).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
      statusCode: 503,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('429 sofre retry e depois vence; 401 não sofre retry', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return new Response('busy', { status: 429 });
      return jsonResponse(structuredBody('depois do retry'));
    }) as unknown as FetchImpl;
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 5000,
    });
    const { response } = await provider.structuredOutput(input);
    expect(response.summary).toBe('depois do retry');
    expect(calls).toBe(2);

    let authCalls = 0;
    const authFetch = (async () => {
      authCalls += 1;
      return new Response('no', { status: 401 });
    }) as unknown as FetchImpl;
    const authProvider = new OpenAiCompatibleProvider({
      apiKey: 'bad',
      baseUrl: BASE,
      fetchImpl: authFetch,
      timeoutMs: 5000,
    });
    await expect(authProvider.generate(input)).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_ERROR',
      statusCode: 502,
    });
    expect(authCalls).toBe(1);
  });

  it('500 repetido vira indisponível; JSON inválido vira saída inválida', async () => {
    const down = (async () => new Response('x', { status: 500 })) as unknown as FetchImpl;
    await expect(
      new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: BASE, fetchImpl: down, timeoutMs: 1000 }).generate(input),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', statusCode: 503 });

    const badJson = (async () =>
      new Response('not json{{{', { status: 200 })) as unknown as FetchImpl;
    await expect(
      new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: BASE, fetchImpl: badJson, timeoutMs: 1000 }).generate(input),
    ).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });

    const badShape = (async () =>
      jsonResponse({ choices: [{ message: { content: '{"nope":true}' } }] })) as unknown as FetchImpl;
    await expect(
      new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: BASE, fetchImpl: badShape, timeoutMs: 1000 }).structuredOutput(input),
    ).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
  });

  it('timeout aborta e classifica 504', async () => {
    const hanging = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as unknown as FetchImpl;
    await expect(
      new OpenAiCompatibleProvider({ apiKey: 'k', baseUrl: BASE, fetchImpl: hanging, timeoutMs: 50, maxRetries: 0 }).generate(input),
    ).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', statusCode: 504 });
  });

  it('stream entrega deltas e usage; cancelamento encerra', async () => {
    const fetchImpl = (async () =>
      sseResponse([
        sseChunk('Olá '),
        sseChunk('mundo'),
        `data: ${JSON.stringify({ usage: { completion_tokens: 5, prompt_tokens: 50, total_tokens: 55 } })}\n\n`,
        'data: [DONE]\n\n',
      ])) as unknown as FetchImpl;
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      timeoutMs: 5000,
    });
    const controller = new AbortController();
    const deltas: string[] = [];
    let usage: unknown = null;
    for await (const chunk of provider.stream(input, controller.signal)) {
      if (chunk.delta) deltas.push(chunk.delta);
      if (chunk.usage) usage = chunk.usage;
    }
    expect(deltas.join('')).toBe('Olá mundo');
    expect(usage).toMatchObject({ inputTokens: 50, outputTokens: 5, totalTokens: 55 });
  });

  it('stream com JSON malformado vira OUTPUT_INVALID; 500 na abertura vira erro', async () => {
    const malformed = (async () =>
      sseResponse(['data: {invalid json}\n\n'])) as unknown as FetchImpl;
    const bad = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl: malformed,
      timeoutMs: 5000,
    });
    await expect(async () => {
      for await (const _chunk of bad.stream(input, new AbortController().signal)) {
        // consume
      }
    }).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });

    const down = (async () => new Response('x', { status: 500 })) as unknown as FetchImpl;
    const downProvider = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl: down,
      timeoutMs: 1000,
    });
    await expect(async () => {
      for await (const _chunk of downProvider.stream(input, new AbortController().signal)) {
        // consume
      }
    }).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('healthCheck distingue sem chave, ok e auth inválida', async () => {
    const unconfigured = new OpenAiCompatibleProvider({
      apiKey: null,
      baseUrl: BASE,
      timeoutMs: 1000,
    });
    expect(await unconfigured.healthCheck()).toMatchObject({
      configured: false,
      reachable: false,
    });
    const okFetch = (async () =>
      jsonResponse({ data: [] })) as unknown as FetchImpl;
    const ok = new OpenAiCompatibleProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl: okFetch,
      timeoutMs: 1000,
    });
    const health = await ok.healthCheck();
    expect(health.configured).toBe(true);
    expect(health.reachable).toBe(true);
    expect(health.capabilities?.streaming).toBe(true);
    expect(typeof health.latencyMs).toBe('number');

    const denied = (async () => new Response('no', { status: 401 })) as unknown as FetchImpl;
    const deniedProvider = new OpenAiCompatibleProvider({
      apiKey: 'bad',
      baseUrl: BASE,
      fetchImpl: denied,
      timeoutMs: 1000,
    });
    expect(await deniedProvider.healthCheck()).toMatchObject({
      configured: true,
      reachable: false,
    });
  });
});

describe('http embedding provider (§§29-30, 83)', () => {
  it('divide em lotes de 32 e valida forma', async () => {
    let calls = 0;
    const fetchImpl = (async (_url: unknown, init?: { body?: string }) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      return jsonResponse({
        data: body.input.map((text) => ({ embedding: [text.length, 0.5] })),
      });
    }) as unknown as FetchImpl;
    const provider = new HttpEmbeddingProvider({
      apiKey: 'k',
      baseUrl: BASE,
      fetchImpl,
      model: 'emb',
      timeoutMs: 5000,
    });
    const vectors = await provider.embed(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(vectors).toHaveLength(70);
    expect(calls).toBe(3);
    expect(vectors[0]).toEqual([2, 0.5]);
  });

  it('sem chave recusa; forma inválida vira OUTPUT_INVALID', async () => {
    const none = new HttpEmbeddingProvider({
      apiKey: null,
      baseUrl: BASE,
      model: 'emb',
      timeoutMs: 1000,
    });
    await expect(none.embed(['a'])).rejects.toMatchObject({
      code: 'EMBEDDING_UNAVAILABLE',
    });
    const bad = (async () => jsonResponse({ data: [{ nope: 1 }] })) as unknown as FetchImpl;
    await expect(
      new HttpEmbeddingProvider({ apiKey: 'k', baseUrl: BASE, fetchImpl: bad, model: 'emb', timeoutMs: 1000 }).embed(['a']),
    ).rejects.toMatchObject({ code: 'OUTPUT_INVALID' });
  });
});

describe('circuit breaker (§15)', () => {
  it('abre após 5 falhas e fecha após cooldown; sucesso zera', () => {
    const breaker = new ProviderCircuitBreaker();
    const key = 'external:gpt-4o-mini';
    for (let i = 0; i < 4; i += 1) {
      breaker.recordFailure(key, 1000);
      expect(breaker.isOpen(key, 1000)).toBe(false);
    }
    breaker.recordFailure(key, 1000);
    expect(breaker.isOpen(key, 1000)).toBe(true);
    expect(breaker.isOpen(key, 1000 + 59_999)).toBe(true);
    expect(breaker.isOpen(key, 1000 + 60_000)).toBe(false);
    breaker.recordFailure(key, 2000);
    breaker.recordSuccess(key);
    expect(breaker.isOpen(key, 2000)).toBe(false);
  });
});

describe('model registry (§10)', () => {
  it('resolve conhecidos, exige allowlist para desconhecidos', () => {
    expect(getModelCapabilities('gpt-4o-mini', [])?.contextWindowTokens).toBe(128_000);
    expect(getModelCapabilities('modelo-novo', [])).toBeNull();
    expect(getModelCapabilities('modelo-novo', ['modelo-novo'])?.estimated).toBe(true);
    expect(listKnownModels()).toContain('larcarvalho-copilot-v1');
  });
});

describe('pricing micros exatos (§§23-24, 81)', () => {
  const pricing = new AiPricingService({} as PrismaClient);
  const rate = {
    cachedPerMillionMicros: 1_250_000n,
    inputPerMillionMicros: 2_500_000n,
    outputPerMillionMicros: 10_000_000n,
  };
  it('tokens pequenos e grandes sem float drift', () => {
    // 1000 in + 100 out a $2.50/$10.00 por milhão = 2500 + 1000 = 3500 micros.
    expect(pricing.computeCostMicros(1000, 100, null, rate)).toBe(3500);
    // Preço fracionário $0.15/M em 7 tokens: 7*150000/1e6 = 1.05 → 1 micro.
    expect(
      pricing.computeCostMicros(7, 0, null, {
        cachedPerMillionMicros: null,
        inputPerMillionMicros: 150_000n,
        outputPerMillionMicros: 150_000n,
      }),
    ).toBe(1);
    expect(pricing.computeCostMicros(1_000_000, 500_000, 200_000, rate)).toBe(
      2_500_000 + 5_000_000 + 250_000,
    );
  });
});

describe('reciprocal rank fusion (§§38-39)', () => {
  it('ordena por soma 1/(k+rank) e documenta relevância', () => {
    const fused = reciprocalRankFusion([['a', 'b', 'c'], ['b', 'a']], 60);
    expect(fused.map((item) => item.chunkId)).toEqual(['a', 'b', 'c']);
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 62, 10);
    expect(fused[2]!.score).toBeCloseTo(1 / 63, 10);
  });
});

describe('context budget (§§48-49)', () => {
  const budget = new ContextBudgetService();
  const caps = {
    contextWindowTokens: 40,
    estimated: false,
    embeddings: false,
    maxOutputTokens: 10,
    streaming: true,
    structuredOutput: true,
    toolCalling: false,
  };
  it('corta fatos de menor prioridade inteiros e avisa', () => {
    const plan = budget.plan({
      capabilities: caps,
      facts: ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)],
      maxOutputTokens: 10,
      reserveTokens: 10,
      systemText: 'sys',
      userText: 'user',
    });
    expect(plan.facts.length).toBeLessThan(3);
    expect(plan.droppedFacts).toBeGreaterThan(0);
    expect(plan.warnings).toHaveLength(1);
    // Maior prioridade (primeiro fato) preservada.
    expect(plan.facts[0]).toContain('a');
  });

  it('sistema maior que a janela vira CONTEXT_TOO_LARGE', () => {
    expect(() =>
      budget.plan({
        capabilities: caps,
        facts: [],
        maxOutputTokens: 10,
        reserveTokens: 10,
        systemText: 'x'.repeat(1000),
        userText: 'user',
      }),
    ).toThrowError('CONTEXT_TOO_LARGE');
  });
});

describe('mock streaming determinístico (§11)', () => {
  it('emite deltas que recompõem o texto e respeita abort', async () => {
    const provider = new MockAiProvider();
    const controller = new AbortController();
    let text = '';
    let usage: unknown = null;
    for await (const chunk of provider.stream(input, controller.signal)) {
      if (chunk.delta) text += chunk.delta;
      if (chunk.usage) usage = chunk.usage;
    }
    const full = await provider.generate(input);
    expect(text).toBe(full.text);
    expect(usage).toMatchObject({ inputTokens: full.inputTokens });

    const aborting = new AbortController();
    aborting.abort();
    const chunks: unknown[] = [];
    for await (const chunk of provider.stream(input, aborting.signal)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(0);
  });
});

describe('mock embeddings + vector store de teste (§§40-42)', () => {
  it('pseudo-vetores estáveis e dimensão incompatível rejeitada', async () => {
    const embeddings = new MockEmbeddingProvider();
    const [a, b] = await embeddings.embed(['lance fixo percentual', 'lance fixo percentual']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    const store = new InMemoryVectorStore();
    await store.upsert('c1', a!);
    await expect(store.upsert('c2', [1, 2, 3])).rejects.toThrowError(
      'VECTOR_DIMENSION_MISMATCH',
    );
    const [other] = await embeddings.embed(['assembleia sorteio contemplação']);
    await store.upsert('c2', other!);
    const [only] = await store.search(a!, 5, new Set(['c2']));
    expect(only!.chunkId).toBe('c2');
  });
});
