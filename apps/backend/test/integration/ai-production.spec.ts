import { randomUUID } from 'node:crypto';

import {
  aiChatResponseSchema,
  aiUsageSummarySchema,
  knowledgeSearchResponseSchema,
} from '@larcarvalho/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment } from '../../src/config/env.js';
import type { AuthContext } from '../../src/core/auth/auth-context.js';
import { hashSessionToken } from '../../src/core/auth/session-token.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import { AiConfigService } from '../../src/modules/ai/ai-config.service.js';
import { AiPricingService } from '../../src/modules/ai/ai-pricing.service.js';
import { AiService } from '../../src/modules/ai/ai.service.js';
import { AiUsageService } from '../../src/modules/ai/ai-usage.service.js';
import { MockEmbeddingProvider } from '../../src/modules/ai/http-embedding.provider.js';
import { OpenAiCompatibleProvider } from '../../src/modules/ai/openai-compatible.provider.js';
import { InMemoryVectorStore } from '../../src/modules/ai/vector-store.js';
import { InMemoryKnowledgeStorage } from '../../src/modules/knowledge/knowledge-storage.js';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service.js';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

/**
 * Fase 29 — IA real de produção: telemetria, limites, modos de retrieval,
 * streaming e híbrido com RBAC. PostgreSQL real, MockAiProvider (sem rede).
 */
suite('ai production with PostgreSQL (Fase 29)', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const emails = {
    admin: 'f29-admin@test.local',
    gestorA: 'f29-gestor-a@test.local',
    sellerA: 'f29-seller-a@test.local',
    sellerB: 'f29-seller-b@test.local',
  };
  const teamNames = { a: 'Equipe F29 A', b: 'Equipe F29 B' };
  const cookies = new Map<string, string>();
  const origins = { origin: 'http://frontend.test' };

  async function clean(): Promise<void> {
    // ai_usage é exclusivo desta suíte: limpa tudo (inclui reservas null).
    await db.aiUsage.deleteMany({});
    const users = await db.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    if (ids.length > 0) {
      await db.knowledgeIngestion.deleteMany({
        where: { document: { ownerUserId: { in: ids } } },
      });
      await db.knowledgeChunk.deleteMany({
        where: { document: { ownerUserId: { in: ids } } },
      });
      await db.knowledgeDocument.deleteMany({
        where: { ownerUserId: { in: ids } },
      });
      await db.aiUsage.deleteMany({ where: { userId: { in: ids } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.userPermissionOverride.deleteMany({
        where: { userId: { in: ids } },
      });
    }
    await db.team.updateMany({
      where: { name: { in: Object.values(teamNames) } },
      data: { managerId: null },
    });
    await db.team.deleteMany({
      where: { name: { in: Object.values(teamNames) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.aiPricing.deleteMany({
      where: { model: { contains: 'F29' } },
    });
    cookies.clear();
  }

  async function loginUser(
    email: string,
    role: 'SUPER_ADMIN' | 'ADMIN' | 'GESTOR' | 'VENDEDOR',
    teamId?: string,
  ) {
    const user = await db.user.create({
      data: {
        email,
        nome: email,
        passwordHash: 'hash-seguro-teste',
        role,
        ...(teamId ? { teamId } : {}),
      },
    });
    const token = randomUUID();
    await db.session.create({
      data: {
        expiresAt: new Date(Date.now() + 3_600_000),
        tokenHash: hashSessionToken(token),
        userId: user.id,
      },
    });
    cookies.set(email, `larcarvalho_session=${token}`);
    return user;
  }

  function headersFor(email: string, json = false) {
    return {
      cookie: cookies.get(email)!,
      origin: origins.origin,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
  }

  async function seedUsers() {
    const teamA = await db.team.create({ data: { name: teamNames.a } });
    const teamB = await db.team.create({ data: { name: teamNames.b } });
    const admin = await loginUser(emails.admin, 'ADMIN');
    const gestorA = await loginUser(emails.gestorA, 'GESTOR', teamA.id);
    await loginUser(emails.sellerA, 'VENDEDOR', teamA.id);
    await loginUser(emails.sellerB, 'VENDEDOR', teamB.id);
    await db.team.update({
      data: { managerId: gestorA.id },
      where: { id: teamA.id },
    });
    return { admin, teamA, teamB };
  }

  async function patchConfig(email: string, body: Record<string, unknown>) {
    return app.inject({
      headers: headersFor(email, true),
      method: 'PATCH',
      payload: body,
      url: '/api/v1/ai/config',
    });
  }

  beforeAll(async () => {
    const config = parseEnvironment({
      ...process.env,
      DATABASE_URL: testUrl,
      FRONTEND_URL: origins.origin,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    db = createPrismaClient(config);
    app = await buildApp({
      config,
      identityService: new IdentityService(db, config),
      logger: false,
    });
  });
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await app.close();
    await db.$disconnect();
  });

  it('precifica com micros exatos e soma null sem pricing', async () => {
    await seedUsers();
    const priced = await app.inject({
      headers: headersFor(emails.admin, true),
      method: 'PUT',
      payload: {
        currency: 'USD',
        inputPerMillionMicros: 2_500_000,
        model: 'larcarvalho-copilot-v1-F29',
        outputPerMillionMicros: 10_000_000,
        provider: 'mock',
      },
      url: '/api/v1/ai/pricing',
    });
    expect(priced.statusCode, priced.body).toBe(200);
    const audit = await db.auditLog.findFirst({
      where: { action: 'AI_PRICING_UPSERTED', entity: 'AiPricing' },
    });
    expect(audit).not.toBeNull();

    const listed = await app.inject({
      headers: headersFor(emails.admin),
      method: 'GET',
      url: '/api/v1/ai/pricing',
    });
    expect(listed.statusCode).toBe(200);
    expect(
      (listed.json().items as { model: string }[]).map((item) => item.model),
    ).toContain('larcarvalho-copilot-v1-F29');

    // Sem pricing para o modelo ativo: custo null (nunca R$ 0,00 inventado).
    const chat = await app.inject({
      headers: headersFor(emails.sellerA, true),
      method: 'POST',
      payload: {
        contextType: 'GENERAL',
        message: 'oi sem pricing',
        promptId: 'commercial-copilot',
      },
      url: '/api/v1/ai/chat',
    });
    expect(chat.statusCode, chat.body).toBe(200);
    const answer = aiChatResponseSchema.parse(chat.json());
    expect(answer.response.usage?.costMicros ?? null).toBeNull();

    const usage = await app.inject({
      headers: headersFor(emails.admin),
      method: 'GET',
      url: '/api/v1/ai/usage?page=1&pageSize=5',
    });
    expect(usage.statusCode).toBe(200);
    expect(usage.json().total).toBeGreaterThan(0);

    const summary = await app.inject({
      headers: headersFor(emails.admin),
      method: 'GET',
      url: '/api/v1/ai/usage/summary',
    });
    expect(summary.statusCode).toBe(200);
    aiUsageSummarySchema.parse(summary.json());
  });

  it('aplica hard limit diário e registra status limit (inclui concorrência)', async () => {
    await seedUsers();
    const set = await patchConfig(emails.admin, { dailyTokenLimit: 0 });
    expect(set.statusCode, set.body).toBe(200);
    try {
      const blocked = await app.inject({
        headers: headersFor(emails.sellerA, true),
        method: 'POST',
        payload: {
          contextType: 'GENERAL',
          message: 'deve bloquear',
          promptId: 'commercial-copilot',
        },
        url: '/api/v1/ai/chat',
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe('USAGE_LIMIT_EXCEEDED');
      const limited = await db.aiUsage.findFirst({
        where: { status: 'limit' },
      });
      expect(limited).not.toBeNull();

      // Concorrência direta no serviço: fail-closed, sem over-admission.
      const pricing = new AiPricingService(db);
      const usageService = new AiUsageService(db, pricing);
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, index) =>
          usageService
            .reserveAndCheck(
              {
                contextType: 'GENERAL',
                estimatedTotalTokens: 60,
                model: 'm',
                provider: 'mock',
                userId: null,
              },
              {
                dailyCostLimitMicros: null,
                dailyTokenLimit: 100,
                maxTokensPerRequest: null,
                monthlyCostLimitMicros: null,
              },
            )
            .then(() => `admitido-${index}`)
            .catch(() => `negado-${index}`),
        ),
      );
      const admitted = results.filter((result) => result.startsWith('admitido'));
      // 60 tokens cada, limite 100: no máximo 2 passam (fail-closed).
      expect(admitted.length).toBeGreaterThanOrEqual(1);
      expect(admitted.length).toBeLessThanOrEqual(2);
    } finally {
      await patchConfig(emails.admin, { dailyTokenLimit: null });
    }
  });

  it('modos semantic/hybrid indisponíveis sem índice vetorial; lexical ok', async () => {
    await seedUsers();
    for (const mode of ['semantic', 'hybrid']) {
      const response = await app.inject({
        headers: headersFor(emails.sellerA),
        method: 'GET',
        url: `/api/v1/knowledge/search?q=teste&mode=${mode}`,
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('VECTOR_SEARCH_UNAVAILABLE');
    }
    const lexical = await app.inject({
      headers: headersFor(emails.sellerA),
      method: 'GET',
      url: '/api/v1/knowledge/search?q=teste&mode=lexical',
    });
    expect(lexical.statusCode).toBe(200);
    expect(knowledgeSearchResponseSchema.parse(lexical.json()).mode).toBe('LEXICAL');
  });

  it('híbrido com store de teste isola TEAM_B e funde RRF', async () => {
    const { teamA, teamB } = await seedUsers();
    const config = parseEnvironment({
      ...process.env,
      DATABASE_URL: testUrl,
      FRONTEND_URL: origins.origin,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    const store = new InMemoryVectorStore();
    const embeddings = new MockEmbeddingProvider();
    const hybridService = new KnowledgeService(
      db,
      new InMemoryKnowledgeStorage(),
      { maxBytes: 15_728_640, retrievalMode: 'hybrid', rrfK: 60, vectorStore: store },
      embeddings,
    );
    const hybridApp = await buildApp({
      config,
      identityService: new IdentityService(db, config),
      knowledgeService: hybridService,
      logger: false,
    });
    try {
      const secret = 'TOKEN-HIBRIDO-29-B';
      const teamBDoc = await app.inject({
        headers: headersFor(emails.admin, true),
        method: 'POST',
        payload: {
          category: 'PROCEDIMENTO',
          content: `Diretriz exclusiva ${secret} da equipe B para conferencia interna.`,
          teamId: teamB.id,
          title: 'Diretriz híbrida B F29',
          visibility: 'TEAM',
        },
        url: '/api/v1/knowledge/text',
      });
      expect(teamBDoc.statusCode, teamBDoc.body).toBe(201);
      const teamBId = (teamBDoc.json() as { id: string }).id;
      const teamADoc = await app.inject({
        headers: headersFor(emails.admin, true),
        method: 'POST',
        payload: {
          category: 'PROCEDIMENTO',
          content: 'Rotina de abertura da loja da equipe A com checklist matinal de atendimento.',
          teamId: teamA.id,
          title: 'Rotina híbrida A F29',
          visibility: 'TEAM',
        },
        url: '/api/v1/knowledge/text',
      });
      expect(teamADoc.statusCode, teamADoc.body).toBe(201);
      // Indexa os trechos no store de teste.
      const chunks = await db.knowledgeChunk.findMany({
        select: { content: true, id: true },
      });
      const vectors = await embeddings.embed(chunks.map((chunk) => chunk.content));
      for (let index = 0; index < chunks.length; index += 1) {
        await store.upsert(chunks[index]!.id, vectors[index]!);
      }

      const outsider = await hybridApp.inject({
        headers: headersFor(emails.sellerA),
        method: 'GET',
        url: `/api/v1/knowledge/search?q=${secret}&mode=hybrid`,
      });
      expect(outsider.statusCode, outsider.body).toBe(200);
      const outsiderResults = knowledgeSearchResponseSchema.parse(outsider.json());
      expect(outsiderResults.mode).toBe('HYBRID');
      // Propriedade de segurança: nenhum conteúdo TEAM_B, em nenhum resultado.
      // (O eco de `query` na resposta não é vazamento: é o próprio termo pedido.)
      expect(
        outsiderResults.results.map((result) => result.documentId),
      ).not.toContain(teamBId);
      for (const result of outsiderResults.results) {
        expect(result.excerpt).not.toContain(secret);
        expect(result.documentTitle).not.toContain(secret);
      }

      // Caminho lexical é determinístico: zero acertos para o token exclusivo.
      const outsiderLexical = await hybridApp.inject({
        headers: headersFor(emails.sellerA),
        method: 'GET',
        url: `/api/v1/knowledge/search?q=${secret}&mode=lexical`,
      });
      expect(
        knowledgeSearchResponseSchema.parse(outsiderLexical.json()).total,
      ).toBe(0);

      const insider = await hybridApp.inject({
        headers: headersFor(emails.sellerB),
        method: 'GET',
        url: `/api/v1/knowledge/search?q=${secret}&mode=hybrid`,
      });
      expect(insider.statusCode, insider.body).toBe(200);
      expect(knowledgeSearchResponseSchema.parse(insider.json()).total).toBeGreaterThan(0);

      const teammate = await hybridApp.inject({
        headers: headersFor(emails.sellerA),
        method: 'GET',
        url: '/api/v1/knowledge/search?q=checklist%20matinal&mode=hybrid',
      });
      expect(knowledgeSearchResponseSchema.parse(teammate.json()).total).toBeGreaterThan(0);
    } finally {
      await hybridApp.close();
    }
  });

  it('backfill sem embeddings configurados responde 503 honesto', async () => {
    await seedUsers();
    const response = await app.inject({
      headers: headersFor(emails.admin, true),
      method: 'POST',
      payload: {},
      url: '/api/v1/knowledge/embeddings/backfill',
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('EMBEDDING_UNAVAILABLE');
  });

  it('stream SSE entrega start/deltas/usage/done; grounded revalida', async () => {
    await seedUsers();
    const created = await app.inject({
      headers: headersFor(emails.admin, true),
      method: 'POST',
      payload: {
        category: 'PRODUTO',
        content: 'O lance fixo do plano stream corresponde a 25% do crédito.',
        title: 'Plano stream F29',
        visibility: 'PUBLIC',
      },
      url: '/api/v1/knowledge/text',
    });
    expect(created.statusCode, created.body).toBe(201);
    const eventsOf = (body: string) =>
      body
        .split('\n\n')
        .map((block) => block.trim())
        .filter((block) => block.startsWith('data:'))
        .map((block) => JSON.parse(block.slice(5).trim()) as { type: string });

    const general = await app.inject({
      headers: headersFor(emails.sellerA, true),
      method: 'POST',
      payload: {
        contextType: 'GENERAL',
        message: 'oi stream',
        promptId: 'commercial-copilot',
      },
      url: '/api/v1/ai/chat/stream',
    });
    expect(general.statusCode).toBe(200);
    expect(general.headers['content-type']).toContain('text/event-stream');
    const generalEvents = eventsOf(general.body);
    const types = generalEvents.map((event) => event.type);
    expect(types[0]).toBe('start');
    expect(types).toContain('delta');
    expect(types).toContain('usage');
    expect(types[types.length - 1]).toBe('done');

    const grounded = await app.inject({
      headers: headersFor(emails.sellerA, true),
      method: 'POST',
      payload: {
        contextType: 'KNOWLEDGE',
        message: 'Qual é o lance fixo do plano stream?',
        promptId: 'knowledge-grounded-answer',
      },
      url: '/api/v1/ai/chat/stream',
    });
    expect(grounded.statusCode).toBe(200);
    const groundedEvents = eventsOf(grounded.body);
    const groundedTypes = groundedEvents.map((event) => event.type);
    expect(groundedTypes).toContain('source');
    expect(groundedTypes[groundedTypes.length - 1]).toBe('done');
    expect(grounded.body).toContain('25%');
  });

  it('configuração audita mudanças e nunca expõe segredo; ai.usage separa leitura', async () => {
    const { admin } = await seedUsers();
    const updated = await patchConfig(emails.admin, { topK: 8 });
    expect(updated.statusCode, updated.body).toBe(200);
    const audit = await db.auditLog.findFirst({
      where: { action: 'AI_CONFIG_UPDATED', actorId: admin.id, entity: 'AiConfig' },
    });
    expect(audit).not.toBeNull();

    const config = await app.inject({
      headers: headersFor(emails.admin),
      method: 'GET',
      url: '/api/v1/ai/config',
    });
    expect(config.statusCode).toBe(200);
    expect(JSON.stringify(config.json())).not.toMatch(/apiKey|API_KEY/i);

    const gestorUsage = await app.inject({
      headers: headersFor(emails.gestorA),
      method: 'GET',
      url: '/api/v1/ai/usage/summary',
    });
    expect(gestorUsage.statusCode).toBe(403);
    const adminUsage = await app.inject({
      headers: headersFor(emails.admin),
      method: 'GET',
      url: '/api/v1/ai/usage/summary',
    });
    expect(adminUsage.statusCode).toBe(200);

    const test = await app.inject({
      headers: headersFor(emails.admin, true),
      method: 'POST',
      payload: {},
      url: '/api/v1/ai/test-connection',
    });
    expect(test.statusCode).toBe(200);
    expect(test.json()).toMatchObject({ configured: false, provider: 'mock' });
  });

  it('modelo fora do registry é recusado; allowlist libera sem rede', async () => {
    const actor = (role: AuthContext['user']['role']): AuthContext => ({
      sessionId: 'f29-model',
      teamIds: [],
      user: { email: 'x@test.local', id: randomUUID(), nome: 'X', role },
    });
    const blocked = new AiService(
      parseEnvironment({ AI_MODEL: 'modelo-desconhecido', AI_PROVIDER: 'external' }),
      new AiConfigService(
        parseEnvironment({ AI_MODEL: 'modelo-desconhecido', AI_PROVIDER: 'external' }),
      ),
      new OpenAiCompatibleProvider({ apiKey: null, baseUrl: 'https://x.test', timeoutMs: 1000 }),
    );
    await expect(
      blocked.chat(actor('GESTOR'), {
        contextType: 'GENERAL',
        message: 'oi',
        promptId: 'commercial-copilot',
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_ALLOWED' });

    const allowed = new AiService(
      parseEnvironment({
        AI_ALLOWED_MODELS: 'modelo-liberado',
        AI_MODEL: 'modelo-liberado',
        AI_PROVIDER: 'external',
      }),
      new AiConfigService(
        parseEnvironment({
          AI_ALLOWED_MODELS: 'modelo-liberado',
          AI_MODEL: 'modelo-liberado',
          AI_PROVIDER: 'external',
        }),
      ),
      new OpenAiCompatibleProvider({ apiKey: null, baseUrl: 'https://x.test', timeoutMs: 1000 }),
    );
    // Passa na validação e falha só na credencial — sem nenhuma chamada de rede.
    await expect(
      allowed.chat(actor('GESTOR'), {
        contextType: 'GENERAL',
        message: 'oi',
        promptId: 'commercial-copilot',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });
});
