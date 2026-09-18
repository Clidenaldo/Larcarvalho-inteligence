import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import {
  checkDatabaseHealth,
  createDatabaseReadinessProbe,
} from '../src/infrastructure/database/database-health.js';
import {
  createDatabaseRuntime,
  createPrismaClient,
  disconnectPrismaClient,
  getPrismaClient,
} from '../src/infrastructure/database/prisma-client.js';
import { createTestConfig } from './helpers/config.js';

afterEach(async () => {
  await disconnectPrismaClient();
});

describe('database health', () => {
  it('reports a successful constant query', async () => {
    const query = vi.fn(async () => [{ result: 1 }]);

    await expect(checkDatabaseHealth(query)).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it('reports an unavailable database without throwing', async () => {
    const query = vi.fn(async () => Promise.reject(new Error('connection')));

    await expect(checkDatabaseHealth(query)).resolves.toBe(false);
  });

  it('uses a stable readiness check name', async () => {
    const probe = createDatabaseReadinessProbe(async () => true);

    expect(probe.name).toBe('postgresql');
    await expect(probe.check()).resolves.toBe(true);
  });
});

describe('Prisma lifecycle', () => {
  const databaseConfig = createTestConfig({
    DATABASE_CONNECTION_TIMEOUT_MS: '250',
    DATABASE_POOL_MAX: '2',
    DATABASE_URL:
      'postgresql://user:password@localhost:5432/database?schema=public',
  });

  it('initializes a Prisma Client without opening a connection eagerly', async () => {
    const client = createPrismaClient(databaseConfig);

    expect(client).toBeDefined();
    await expect(client.$disconnect()).resolves.toBeUndefined();
  });

  it('reuses one client instance within the process', () => {
    const first = getPrismaClient(databaseConfig);
    const second = getPrismaClient(databaseConfig);

    expect(first).toBe(second);
  });

  it('marks the application not ready when DATABASE_URL is absent', async () => {
    const runtime = createDatabaseRuntime(createTestConfig());
    const app = await buildApp({
      config: createTestConfig(),
      logger: false,
      readinessProbes: [runtime.readinessProbe],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      checks: [{ name: 'postgresql', status: 'not_ready' }],
      status: 'not_ready',
    });

    await app.close();
    await runtime.disconnect();
  });
});
