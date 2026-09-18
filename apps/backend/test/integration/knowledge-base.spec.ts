import { randomUUID } from 'node:crypto';

import {
  aiChatResponseSchema,
  knowledgeDocumentDetailSchema,
  knowledgeDocumentListResponseSchema,
  knowledgeDocumentSchema,
  knowledgeIngestionListResponseSchema,
  knowledgeSearchResponseSchema,
} from '@larcarvalho/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment } from '../../src/config/env.js';
import { hashSessionToken } from '../../src/core/auth/session-token.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

const PUBLIC_RULE =
  'O lance fixo corresponde a 25 por cento do valor da carta de credito e nao sofre alteracao.';
const PRIVATE_RULE =
  'Regra interna ZEBRAEXCLUSIVA reservada a diretoria para casos especiais de lance.';
const TEAM_RULE =
  'Procedimento EQUIPERESTRITA de conferencia de documentos da equipe comercial.';

suite('knowledge base with PostgreSQL', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const emails = {
    manager: 'kb-manager@test.local',
    operador: 'kb-operador@test.local',
    sellerA: 'kb-seller-a@test.local',
    sellerB: 'kb-seller-b@test.local',
  };
  const cookies = new Map<string, string>();
  const origins = { origin: 'http://frontend.test' };

  async function clean(): Promise<void> {
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
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.userPermissionOverride.deleteMany({
        where: { userId: { in: ids } },
      });
    }
    await db.team.updateMany({
      where: { name: 'Equipe KB 28' },
      data: { managerId: null },
    });
    await db.team.deleteMany({ where: { name: 'Equipe KB 28' } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    cookies.clear();
  }

  async function loginUser(
    email: string,
    role: 'VENDEDOR' | 'GESTOR' | 'OPERADOR',
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

  async function createText(
    email: string,
    body: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/text',
      headers: headersFor(email, true),
      payload: body,
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

  it('creates, searches and grounds a public knowledge document', async () => {
    const team = await db.team.create({ data: { name: 'Equipe KB 28' } });
    const manager = await loginUser(emails.manager, 'GESTOR', team.id);
    await loginUser(emails.operador, 'OPERADOR');
    await loginUser(emails.sellerA, 'VENDEDOR', team.id);
    await loginUser(emails.sellerB, 'VENDEDOR');
    await db.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const created = await createText(emails.manager, {
      category: 'REGULAMENTO',
      content: PUBLIC_RULE,
      title: 'Regulamento de lance fixo',
      visibility: 'PUBLIC',
    });
    expect(created.statusCode, created.body).toBe(201);
    const document = knowledgeDocumentSchema.parse(created.json());
    expect(document.status).toBe('READY');
    expect(document.sourceType).toBe('MANUAL');
    expect(document.chunkCount).toBeGreaterThan(0);

    const duplicate = await createText(emails.manager, {
      category: 'REGULAMENTO',
      content: PUBLIC_RULE,
      title: 'Copia do regulamento',
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('KNOWLEDGE_CONFLICT');

    const search = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=lance%20fixo%20carta&limit=5',
      headers: headersFor(emails.sellerB),
    });
    expect(search.statusCode, search.body).toBe(200);
    const results = knowledgeSearchResponseSchema.parse(search.json());
    expect(results.grounded).toBe(true);
    expect(results.semanticEnabled).toBe(false);
    expect(results.mode).toBe('LEXICAL');
    expect(results.results.length).toBeGreaterThan(0);
    expect(results.results[0]!.documentId).toBe(document.id);
    expect(results.results[0]!.excerpt).toContain('25');

    const chat = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/chat',
      headers: headersFor(emails.sellerB, true),
      payload: {
        contextType: 'KNOWLEDGE',
        message: 'Qual o percentual do lance fixo?',
        promptId: 'knowledge-grounded-answer',
      },
    });
    expect(chat.statusCode, chat.body).toBe(200);
    const answer = aiChatResponseSchema.parse(chat.json());
    expect(answer.response.grounded).toBe(true);
    expect(answer.response.facts.join(' ')).toContain('25');
    expect(answer.response.sources.map((source) => source.documentId)).toContain(
      document.id,
    );
    expect(chat.body).not.toContain('lance vencedor');
  });

  it('keeps ungrounded questions from inventing an answer', async () => {
    const team = await db.team.create({ data: { name: 'Equipe KB 28' } });
    const manager = await loginUser(emails.manager, 'GESTOR', team.id);
    await loginUser(emails.sellerB, 'VENDEDOR');
    await db.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const chat = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/chat',
      headers: headersFor(emails.sellerB, true),
      payload: {
        contextType: 'KNOWLEDGE',
        message: 'Qual a previsao de contemplacao para dezembro?',
        promptId: 'knowledge-grounded-answer',
      },
    });
    expect(chat.statusCode, chat.body).toBe(200);
    const answer = aiChatResponseSchema.parse(chat.json());
    expect(answer.response.grounded).toBe(false);
    expect(answer.response.facts).toHaveLength(0);
    expect(answer.response.summary).toContain('informação');
  });

  it('enforces PRIVATE and TEAM visibility before search and listing', async () => {
    const team = await db.team.create({ data: { name: 'Equipe KB 28' } });
    const manager = await loginUser(emails.manager, 'GESTOR', team.id);
    await loginUser(emails.sellerA, 'VENDEDOR', team.id);
    await loginUser(emails.sellerB, 'VENDEDOR');
    await db.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const privateDoc = await createText(emails.manager, {
      category: 'PROCEDIMENTO',
      content: PRIVATE_RULE,
      title: 'Regra reservada',
      visibility: 'PRIVATE',
    });
    expect(privateDoc.statusCode, privateDoc.body).toBe(201);
    const teamDoc = await createText(emails.manager, {
      category: 'PROCEDIMENTO',
      content: TEAM_RULE,
      title: 'Procedimento da equipe',
      visibility: 'TEAM',
    });
    expect(teamDoc.statusCode, teamDoc.body).toBe(201);

    const outsider = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=ZEBRAEXCLUSIVA',
      headers: headersFor(emails.sellerB),
    });
    expect(outsider.statusCode, outsider.body).toBe(200);
    expect(knowledgeSearchResponseSchema.parse(outsider.json()).total).toBe(0);

    const owner = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=ZEBRAEXCLUSIVA',
      headers: headersFor(emails.manager),
    });
    expect(
      knowledgeSearchResponseSchema.parse(owner.json()).total,
    ).toBeGreaterThan(0);

    const teammate = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=EQUIPERESTRITA',
      headers: headersFor(emails.sellerA),
    });
    expect(
      knowledgeSearchResponseSchema.parse(teammate.json()).total,
    ).toBeGreaterThan(0);

    const nonTeammate = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=EQUIPERESTRITA',
      headers: headersFor(emails.sellerB),
    });
    expect(
      knowledgeSearchResponseSchema.parse(nonTeammate.json()).total,
    ).toBe(0);

    const outsiderList = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge',
      headers: headersFor(emails.sellerB),
    });
    const list = knowledgeDocumentListResponseSchema.parse(outsiderList.json());
    expect(list.items.map((item) => item.id)).not.toContain(
      privateDoc.json().id,
    );
  });

  it('restricts creation to writers and records audit trails', async () => {
    const team = await db.team.create({ data: { name: 'Equipe KB 28' } });
    const manager = await loginUser(emails.manager, 'GESTOR', team.id);
    await loginUser(emails.operador, 'OPERADOR');
    await loginUser(emails.sellerA, 'VENDEDOR', team.id);
    await db.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const operadorAttempt = await createText(emails.operador, {
      category: 'MANUAL',
      content: 'Conteudo minimo suficiente para criar um documento interno.',
      title: 'Tentativa do operador',
    });
    expect(operadorAttempt.statusCode).toBe(403);

    const sellerAttempt = await createText(emails.sellerA, {
      category: 'MANUAL',
      content: 'Conteudo minimo suficiente para criar um documento interno.',
      title: 'Tentativa do vendedor',
    });
    expect(sellerAttempt.statusCode).toBe(403);

    const created = await createText(emails.manager, {
      category: 'MANUAL',
      content: 'Manual de atendimento com passo a passo do consorciado.',
      title: 'Manual de atendimento',
    });
    expect(created.statusCode, created.body).toBe(201);

    const audit = await db.auditLog.findFirst({
      where: {
        action: 'KNOWLEDGE_DOCUMENT_CREATED',
        entity: 'KnowledgeDocument',
        entityId: created.json().id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(manager.id);
  });

  it('ingests an uploaded markdown file and exposes chunks and ingestions', async () => {
    const team = await db.team.create({ data: { name: 'Equipe KB 28' } });
    const manager = await loginUser(emails.manager, 'GESTOR', team.id);
    await loginUser(emails.sellerB, 'VENDEDOR');
    await db.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const boundary = '----larcarvalho-kb-boundary';
    const content =
      '# Regulamento\nO lance fixo corresponde a 25 por cento da carta.\n## Contemplacao\nA contemplacao ocorre em assembleia.';
    const metadata = JSON.stringify({
      category: 'REGULAMENTO',
      title: 'Regulamento enviado',
      visibility: 'PUBLIC',
    });
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="regulamento.md"\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n` +
        `--${boundary}--\r\n`,
      'utf8',
    );
    const upload = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/upload',
      headers: {
        ...headersFor(emails.manager),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(upload.statusCode, upload.body).toBe(201);
    const document = knowledgeDocumentSchema.parse(upload.json());
    expect(document.sourceType).toBe('UPLOAD');
    expect(document.originalName).toBe('regulamento.md');
    expect(document.mimeType).toBe('text/markdown');
    expect(document.checksum).not.toBeNull();
    expect(document.chunkCount).toBeGreaterThan(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/knowledge/${document.id}`,
      headers: headersFor(emails.sellerB),
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const parsed = knowledgeDocumentDetailSchema.parse(detail.json());
    expect(parsed.chunks.length).toBe(document.chunkCount);
    expect(parsed.chunks[0]!.section).toBe('Regulamento');

    const ingestions = await app.inject({
      method: 'GET',
      url: `/api/v1/knowledge/${document.id}/ingestions`,
      headers: headersFor(emails.sellerB),
    });
    const ingestionList = knowledgeIngestionListResponseSchema.parse(
      ingestions.json(),
    );
    expect(ingestionList.items[0]!.status).toBe('READY');
    expect(ingestionList.items[0]!.chunksCreated).toBe(document.chunkCount);

    const docxBoundary = '----larcarvalho-kb-docx';
    const docxBody = Buffer.from(
      `--${docxBoundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n` +
        `--${docxBoundary}\r\nContent-Disposition: form-data; name="arquivo"; filename="contrato.docx"\r\nContent-Type: application/msword\r\n\r\nconteudo binario\r\n` +
        `--${docxBoundary}--\r\n`,
      'utf8',
    );
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/upload',
      headers: {
        ...headersFor(emails.manager),
        'content-type': `multipart/form-data; boundary=${docxBoundary}`,
      },
      payload: docxBody,
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe('KNOWLEDGE_FILE_INVALID');
  });
});
