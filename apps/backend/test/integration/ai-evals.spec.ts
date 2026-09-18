import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import {
  aiChatResponseSchema,
  type AiContextType,
  type AiPromptId,
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
const evalDir = fileURLToPath(new URL('../../../../tests/evals', import.meta.url));

interface HttpEval {
  description: string;
  harness: string;
  id: string;
  setup?: {
    documents?: {
      category: string;
      content: string;
      owner?: string;
      team?: string;
      title: string;
      visibility: string;
    }[];
    teams?: string[];
    users?: { email: string; role: string; team?: string }[];
  };
  steps: {
    as: string;
    contextType: AiContextType;
    expect: {
      factsEmpty?: boolean;
      grounded?: boolean;
      minSources?: number;
      mustContain?: string[];
      mustNotContain?: string[];
      mustNotMatch?: string[];
      noSuggestedAction?: boolean;
    };
    message: string;
    promptId: AiPromptId;
  }[];
  version: string;
}

function loadHttpEvals(): HttpEval[] {
  return readdirSync(evalDir)
    .filter((file) => file.endsWith('.eval.json'))
    .map((file) => JSON.parse(readFileSync(join(evalDir, file), 'utf8')) as HttpEval)
    .filter((item) => item.harness === 'http-api')
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Evals §§68-70,73-75 executados contra o backend real + PostgreSQL +
 * MockAiProvider. Nível: TESTADO COM POSTGRESQL REAL (sem provider externo).
 */
suite('ai evals http-api (Fase 29)', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies = new Map<string, string>();
  const teamIds = new Map<string, string>();
  const origins = { origin: 'http://frontend.test' };

  async function clean(): Promise<void> {
    const users = await db.user.findMany({
      where: { email: { contains: 'eval29' } },
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
    const teams = await db.team.findMany({
      select: { id: true },
      where: { name: { contains: 'EVAL29' } },
    });
    await db.team.updateMany({
      data: { managerId: null },
      where: { id: { in: teams.map((team) => team.id) } },
    });
    await db.team.deleteMany({
      where: { id: { in: teams.map((team) => team.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    cookies.clear();
    teamIds.clear();
  }

  async function loginUser(email: string, role: 'SUPER_ADMIN' | 'GESTOR' | 'VENDEDOR', teamId?: string) {
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

  for (const evalCase of loadHttpEvals()) {
    it(`${evalCase.id} — ${evalCase.description}`, async () => {
      for (const team of evalCase.setup?.teams ?? []) {
        const created = await db.team.create({ data: { name: team } });
        teamIds.set(team, created.id);
      }
      await loginUser('eval29-admin@test.local', 'SUPER_ADMIN');
      await loginUser('eval29-seller@test.local', 'VENDEDOR');
      for (const user of evalCase.setup?.users ?? []) {
        await loginUser(
          user.email,
          user.role as 'VENDEDOR' | 'GESTOR',
          user.team ? teamIds.get(user.team) : undefined,
        );
      }
      for (const document of evalCase.setup?.documents ?? []) {
        const owner =
          document.owner === 'admin' ? 'eval29-admin@test.local' : 'eval29-admin@test.local';
        const created = await app.inject({
          headers: {
            cookie: cookies.get(owner)!,
            origin: origins.origin,
            'content-type': 'application/json',
          },
          method: 'POST',
          payload: {
            category: document.category,
            content: document.content,
            ...(document.team ? { teamId: teamIds.get(document.team) } : {}),
            title: `${document.title} ${evalCase.id}`,
            visibility: document.visibility,
          },
          url: '/api/v1/knowledge/text',
        });
        expect(created.statusCode, created.body).toBe(201);
      }
      for (const step of evalCase.steps) {
        const email = step.as === 'seller' ? 'eval29-seller@test.local' : step.as;
        const chat = await app.inject({
          headers: {
            cookie: cookies.get(email)!,
            origin: origins.origin,
            'content-type': 'application/json',
          },
          method: 'POST',
          payload: {
            contextType: step.contextType,
            message: step.message,
            promptId: step.promptId,
          },
          url: '/api/v1/ai/chat',
        });
        expect(chat.statusCode, chat.body).toBe(200);
        const answer = aiChatResponseSchema.parse(chat.json());
        const text = [answer.response.summary, ...answer.response.facts].join('\n');
        if (step.expect.grounded !== undefined) {
          expect(answer.response.grounded).toBe(step.expect.grounded);
        }
        if (step.expect.minSources !== undefined) {
          expect(answer.response.sources.length).toBeGreaterThanOrEqual(
            step.expect.minSources,
          );
          if (step.expect.minSources === 0) {
            expect(answer.response.sources).toHaveLength(0);
          }
        }
        if (step.expect.factsEmpty) {
          expect(answer.response.facts).toHaveLength(0);
        }
        for (const required of step.expect.mustContain ?? []) {
          expect(text).toContain(required);
        }
        for (const forbidden of step.expect.mustNotContain ?? []) {
          expect(text).not.toContain(forbidden);
          expect(chat.body).not.toContain(forbidden);
        }
        for (const pattern of step.expect.mustNotMatch ?? []) {
          expect(text).not.toMatch(new RegExp(pattern, 'i'));
        }
        if (step.expect.noSuggestedAction) {
          expect(answer.response.suggestedAction ?? null).toBeNull();
        }
      }
    });
  }
});
