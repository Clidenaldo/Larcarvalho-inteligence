import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;
const password = 'frase senha inicial segura';

function configForTest(): AppConfig {
  return parseEnvironment({
    ...process.env,
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    DATABASE_POOL_MAX: '3',
    DATABASE_URL: testDatabaseUrl,
    FRONTEND_URL: 'http://frontend.test',
    INTEGRATION_REST_ALLOWED_HOSTS: '127.0.0.1',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });
}
function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie de sessão ausente');
  return value.split(';', 1)[0] as string;
}

describePostgresql('integrations HTTP module', () => {
  let config: AppConfig;
  let identity: IdentityService;
  let prisma: PrismaClient;

  beforeAll(() => {
    config = configForTest();
    prisma = createPrismaClient(config);
    identity = new IdentityService(prisma, config);
  });

  beforeEach(async () => {
    await wipeSalesData(prisma);
    await prisma.integrationLog.deleteMany();
    await prisma.externalEntityMapping.deleteMany();
    await prisma.integrationRun.deleteMany();
    await prisma.integration.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await wipeSalesData(prisma);
    await prisma?.integrationLog.deleteMany();
    await prisma?.externalEntityMapping.deleteMany();
    await prisma?.integrationRun.deleteMany();
    await prisma?.integration.deleteMany();
    await prisma?.session.deleteMany();
    await prisma?.auditLog.deleteMany();
    await prisma?.user.deleteMany();
    await prisma?.$disconnect();
  });

  it('creates, tests, executes idempotently, logs and pauses a mock connector', async () => {
    await identity.createFirstSuperAdmin({
      email: 'root-integrations@example.com',
      nome: 'Root Integrations',
      password,
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
        method: 'POST',
        payload: { email: 'root-integrations@example.com', password },
        url: '/api/v1/auth/login',
      });
      const cookie = cookieFrom(login);
      const headers = { cookie, origin: 'http://frontend.test' };
      const create = await app.inject({
        headers,
        method: 'POST',
        payload: {
          nome: 'Connector controlado',
          tipo: 'MOCK',
          configuracao: { scenario: 'SUCCESS', recordCount: 2 },
        },
        url: '/api/v1/integrations',
      });
      expect(create.statusCode).toBe(201);
      expect(create.json()).toMatchObject({
        tipo: 'MOCK',
        status: 'ATIVA',
        configurado: true,
        secretRef: null,
      });
      const id = create.json().id as string;

      const test = await app.inject({
        headers,
        method: 'POST',
        url: `/api/v1/integrations/${id}/test-connection`,
      });
      expect(test.statusCode).toBe(200);
      expect(test.json().sucesso).toBe(true);

      const payload = { trigger: 'MANUAL', idempotencyKey: 'same-cycle-0001' };
      const first = await app.inject({
        headers,
        method: 'POST',
        payload,
        url: `/api/v1/integrations/${id}/execute`,
      });
      const second = await app.inject({
        headers,
        method: 'POST',
        payload,
        url: `/api/v1/integrations/${id}/execute`,
      });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({
        status: 'SUCESSO',
        registrosRecebidos: 2,
        registrosValidos: 2,
        registrosIgnorados: 0,
      });
      expect(second.json().id).toBe(first.json().id);
      await expect(
        prisma.integrationRun.count({ where: { integrationId: id } }),
      ).resolves.toBe(1);

      const firstRunId = first.json().id as string;

      const staging = await prisma.integrationStagingRecord.findMany({
        where: {
          integrationId: id,
          runId: firstRunId,
        },
        orderBy: [{ entityType: 'asc' }, { externalId: 'asc' }],
      });

      expect(staging).toHaveLength(2);

      for (const record of staging) {
        expect(record.runId).toBe(firstRunId);
        expect(record.integrationId).toBe(id);
        expect(record.externalId.length).toBeGreaterThan(0);
        expect(record.entityType.length).toBeGreaterThan(0);
        expect(record.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(record.schemaVersion).toBe('CANONICAL_V1');
        expect(record.status).toBe('APPLIED');
        expect(record.errorCode).toBeNull();
        expect(record.payload).toBeTruthy();
      }

      const stagingSnapshot = staging.map((record) => ({
        externalId: record.externalId,
        entityType: record.entityType,
        checksum: record.checksum,
        payload: record.payload,
        schemaVersion: record.schemaVersion,
        status: record.status,
      }));

      const third = await app.inject({
        headers,
        method: 'POST',
        payload,
        url: `/api/v1/integrations/${id}/execute`,
      });

      expect(third.statusCode, third.body).toBe(200);
      expect(third.json().id).toBe(firstRunId);

      await expect(
        prisma.integrationRun.count({ where: { integrationId: id } }),
      ).resolves.toBe(1);

      const stagingAfterRetry = await prisma.integrationStagingRecord.findMany({
        where: {
          integrationId: id,
          runId: firstRunId,
        },
        orderBy: [{ entityType: 'asc' }, { externalId: 'asc' }],
      });

      expect(stagingAfterRetry).toHaveLength(2);

      expect(
        stagingAfterRetry.map((record) => ({
          externalId: record.externalId,
          entityType: record.entityType,
          checksum: record.checksum,
          payload: record.payload,
          schemaVersion: record.schemaVersion,
          status: record.status,
        })),
      ).toEqual(stagingSnapshot);

      const nextCycle = await app.inject({
        headers,
        method: 'POST',
        payload: {
          trigger: 'MANUAL',
          idempotencyKey: 'same-cycle-0002',
        },
        url: `/api/v1/integrations/${id}/execute`,
      });

      expect(nextCycle.statusCode, nextCycle.body).toBe(200);

      const secondRunId = nextCycle.json().id as string;

      expect(secondRunId).not.toBe(firstRunId);

      await expect(
        prisma.integrationRun.count({
          where: { integrationId: id },
        }),
      ).resolves.toBe(2);

      const secondRunStaging = await prisma.integrationStagingRecord.findMany({
        where: {
          integrationId: id,
          runId: secondRunId,
        },
        orderBy: [{ entityType: 'asc' }, { externalId: 'asc' }],
      });

      expect(secondRunStaging).toHaveLength(2);

      expect(
        secondRunStaging.map((record) => ({
          externalId: record.externalId,
          entityType: record.entityType,
          checksum: record.checksum,
          payload: record.payload,
          schemaVersion: record.schemaVersion,
          status: record.status,
        })),
      ).toEqual(stagingSnapshot);

      await expect(
        prisma.integrationStagingRecord.count({
          where: { integrationId: id },
        }),
      ).resolves.toBe(4);

      const logs = await app.inject({
        headers: { cookie },
        method: 'GET',
        url: `/api/v1/integrations/${id}/logs`,
      });
      expect(logs.statusCode).toBe(200);
      expect(logs.json().items).toHaveLength(3);
      expect(JSON.stringify(logs.json())).not.toContain('authorization');

      const pause = await app.inject({
        headers,
        method: 'POST',
        url: `/api/v1/integrations/${id}/pause`,
      });
      expect(pause.json().status).toBe('PAUSADA');
      await expect(
        prisma.auditLog.count({ where: { entityId: id } }),
      ).resolves.toBeGreaterThanOrEqual(3);
    } finally {
      await app.close();
    }
  });

  it('keeps sellers outside technical integration endpoints', async () => {
    await identity.createFirstSuperAdmin({
      email: 'root-rbac@example.com',
      nome: 'Root RBAC',
      password,
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const rootLogin = await app.inject({
        method: 'POST',
        payload: { email: 'root-rbac@example.com', password },
        url: '/api/v1/auth/login',
      });
      const createSeller = await app.inject({
        headers: {
          cookie: cookieFrom(rootLogin),
          origin: 'http://frontend.test',
        },
        method: 'POST',
        payload: {
          email: 'seller-integrations@example.com',
          nome: 'Seller',
          password,
          role: 'VENDEDOR',
        },
        url: '/api/v1/users',
      });
      expect(createSeller.statusCode).toBe(201);
      const sellerLogin = await app.inject({
        method: 'POST',
        payload: { email: 'seller-integrations@example.com', password },
        url: '/api/v1/auth/login',
      });
      const denied = await app.inject({
        headers: { cookie: cookieFrom(sellerLogin) },
        method: 'GET',
        url: '/api/v1/integrations',
      });
      expect(denied.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
