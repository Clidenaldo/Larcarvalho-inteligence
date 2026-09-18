import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import {
  createDatabaseRuntime,
  createPrismaClient,
} from '../../src/infrastructure/database/prisma-client.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;

function validateTestDatabaseUrl(value: string): URL {
  const url = new URL(value);
  const databaseName = url.pathname.slice(1);
  const localHosts = new Set(['127.0.0.1', 'localhost']);

  if (!localHosts.has(url.hostname) || databaseName !== 'larcarvalho_test') {
    throw new Error(
      'TEST_DATABASE_URL must target the local larcarvalho_test database',
    );
  }

  return url;
}

function createIntegrationConfig(value: string): AppConfig {
  return parseEnvironment({
    ...process.env,
    DATABASE_CONNECTION_TIMEOUT_MS: '5000',
    DATABASE_POOL_MAX: '2',
    DATABASE_URL: value,
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });
}

async function expectSqlState(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
    throw new Error(`Expected PostgreSQL error ${expectedCode}`);
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
  }
}

async function inRollbackTransaction(
  operation: (client: Client) => Promise<void>,
): Promise<void> {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required');
  }

  const url = validateTestDatabaseUrl(testDatabaseUrl);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query('BEGIN');

  try {
    await operation(client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

describePostgresql('PostgreSQL integration', () => {
  let config: AppConfig;
  let prisma: PrismaClient;

  beforeAll(() => {
    const url = validateTestDatabaseUrl(testDatabaseUrl as string);
    config = createIntegrationConfig(url.toString());
    prisma = createPrismaClient(config);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('connects through Prisma and executes a cleaned-up transaction', async () => {
    const id = randomUUID();
    const result = await prisma.$queryRaw<
      Array<{ result: number }>
    >`SELECT 1 AS result`;

    expect(result).toEqual([{ result: 1 }]);

    await prisma.$transaction(async (transaction) => {
      await transaction.auditLog.create({
        data: {
          action: 'integration_test',
          entity: 'technical_probe',
          entityId: id,
          id,
        },
      });

      await expect(
        transaction.auditLog.findUnique({ where: { id } }),
      ).resolves.toMatchObject({ id });

      await transaction.auditLog.delete({ where: { id } });
    });

    await expect(
      prisma.auditLog.findUnique({ where: { id } }),
    ).resolves.toBeNull();
  });

  it('reports health independently and readiness from real PostgreSQL', async () => {
    const runtime = createDatabaseRuntime(config);
    const app = await buildApp({
      config,
      logger: false,
      readinessProbes: [runtime.readinessProbe],
    });

    try {
      const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
      const ready = await app.inject({ method: 'GET', url: '/api/v1/ready' });

      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ status: 'ok' });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toMatchObject({
        checks: [{ name: 'postgresql', status: 'ready' }],
        status: 'ready',
      });
    } finally {
      await app.close();
      await runtime.disconnect();
    }
  });

  it('keeps health alive and marks readiness unavailable when PostgreSQL cannot be reached', async () => {
    const unavailableConfig = createIntegrationConfig(
      'postgresql://local:local@127.0.0.1:55432/larcarvalho_test?schema=public',
    );
    const runtime = createDatabaseRuntime(unavailableConfig);
    const app = await buildApp({
      config: unavailableConfig,
      logger: false,
      readinessProbes: [runtime.readinessProbe],
    });

    try {
      const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
      const ready = await app.inject({ method: 'GET', url: '/api/v1/ready' });

      expect(health.statusCode).toBe(200);
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toMatchObject({
        checks: [{ name: 'postgresql', status: 'not_ready' }],
        status: 'not_ready',
      });
    } finally {
      await app.close();
      await runtime.disconnect();
    }
  });

  it('rejects duplicate unique values', async () => {
    await inRollbackTransaction(async (client) => {
      const firstId = randomUUID();
      const secondId = randomUUID();
      const cnpj = '90000000000001';
      await client.query(
        'INSERT INTO administradoras (id, nome, cnpj, updated_at) VALUES ($1, $2, $3, now())',
        [firstId, 'Technical integration probe', cnpj],
      );
      await expectSqlState(
        () =>
          client.query(
            'INSERT INTO administradoras (id, nome, cnpj, updated_at) VALUES ($1, $2, $3, now())',
            [secondId, 'Technical duplicate probe', cnpj],
          ),
        '23505',
      );
    });
  });

  it('rejects invalid percentages and monetary values', async () => {
    await inRollbackTransaction(async (client) => {
      const administradoraId = randomUUID();
      const grupoId = randomUUID();
      const assembleiaId = randomUUID();
      await client.query(
        'INSERT INTO administradoras (id, nome, updated_at) VALUES ($1, $2, now())',
        [administradoraId, 'Technical constraint probe'],
      );
      await client.query(
        'INSERT INTO grupos (id, administradora_id, codigo, status, updated_at) VALUES ($1, $2, $3, $4, now())',
        [grupoId, administradoraId, 'TECH-GROUP', 'technical'],
      );
      await client.query(
        'INSERT INTO assembleias (id, grupo_id, data_assembleia, status, updated_at) VALUES ($1, $2, now(), $3, now())',
        [assembleiaId, grupoId, 'technical'],
      );
      await expectSqlState(
        () =>
          client.query(
            'INSERT INTO lances (id, assembleia_id, tipo, percentual, origem, updated_at) VALUES ($1, $2, $3, $4, $5, now())',
            [randomUUID(), assembleiaId, 'technical', 101, 'integration_test'],
          ),
        '23514',
      );
    });

    await inRollbackTransaction(async (client) => {
      const administradoraId = randomUUID();
      await client.query(
        'INSERT INTO administradoras (id, nome, updated_at) VALUES ($1, $2, now())',
        [administradoraId, 'Technical monetary probe'],
      );
      await expectSqlState(
        () =>
          client.query(
            'INSERT INTO grupos (id, administradora_id, codigo, status, valor_credito_minimo, updated_at) VALUES ($1, $2, $3, $4, $5, now())',
            [randomUUID(), administradoraId, 'TECH-MONEY', 'technical', -1],
          ),
        '23514',
      );
    });
  });

  it('rejects missing required fields and nonexistent foreign keys', async () => {
    await inRollbackTransaction(async (client) => {
      await expectSqlState(
        () =>
          client.query(
            'INSERT INTO administradoras (id, nome, updated_at) VALUES ($1, NULL, now())',
            [randomUUID()],
          ),
        '23502',
      );
    });

    await inRollbackTransaction(async (client) => {
      await expectSqlState(
        () =>
          client.query(
            'INSERT INTO produtos (id, administradora_id, nome, categoria, updated_at) VALUES ($1, $2, $3, $4, now())',
            [randomUUID(), randomUUID(), 'Technical FK probe', 'technical'],
          ),
        '23503',
      );
    });
  });

  it('enforces Restrict and SetNull delete behaviors', async () => {
    await inRollbackTransaction(async (client) => {
      const administradoraId = randomUUID();
      await client.query(
        'INSERT INTO administradoras (id, nome, updated_at) VALUES ($1, $2, now())',
        [administradoraId, 'Technical restrict probe'],
      );
      await client.query(
        'INSERT INTO produtos (id, administradora_id, nome, categoria, updated_at) VALUES ($1, $2, $3, $4, now())',
        [randomUUID(), administradoraId, 'Technical product', 'technical'],
      );
      await expectSqlState(
        () =>
          client.query('DELETE FROM administradoras WHERE id = $1', [
            administradoraId,
          ]),
        '23503',
      );
    });

    await inRollbackTransaction(async (client) => {
      const administradoraId = randomUUID();
      const produtoId = randomUUID();
      const grupoId = randomUUID();
      await client.query(
        'INSERT INTO administradoras (id, nome, updated_at) VALUES ($1, $2, now())',
        [administradoraId, 'Technical set-null probe'],
      );
      await client.query(
        'INSERT INTO produtos (id, administradora_id, nome, categoria, updated_at) VALUES ($1, $2, $3, $4, now())',
        [produtoId, administradoraId, 'Technical product', 'technical'],
      );
      await client.query(
        'INSERT INTO grupos (id, administradora_id, produto_id, codigo, status, updated_at) VALUES ($1, $2, $3, $4, $5, now())',
        [grupoId, administradoraId, produtoId, 'TECH-SET-NULL', 'technical'],
      );

      await client.query('DELETE FROM produtos WHERE id = $1', [produtoId]);
      const result = await client.query<{ produto_id: string | null }>(
        'SELECT produto_id FROM grupos WHERE id = $1',
        [grupoId],
      );

      expect(result.rows).toEqual([{ produto_id: null }]);
    });
  });
});
