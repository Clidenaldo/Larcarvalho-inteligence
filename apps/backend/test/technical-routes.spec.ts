import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@larcarvalho/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { AppError } from '../src/core/errors/app-error.js';
import { createTestConfig } from './helpers/config.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

async function createApp(
  options: Parameters<typeof buildApp>[0] = {},
): Promise<Awaited<ReturnType<typeof buildApp>>> {
  const app = await buildApp({
    config: createTestConfig(),
    logger: false,
    ...options,
  });
  apps.push(app);
  return app;
}

describe('technical API routes', () => {
  it('reports health using the shared contract and request ID', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    const body = healthResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body).toMatchObject({
      service: 'backend',
      status: 'ok',
      version: 'v1',
    });
  });

  it('reports readiness without inventing dependencies', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });
    const body = readinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ checks: [], status: 'ready' });
  });

  it('reports not ready when a future dependency probe fails', async () => {
    const app = await createApp({
      readinessProbes: [
        { name: 'example-dependency', check: async () => false },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    });
    const body = readinessResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(503);
    expect(body).toMatchObject({
      checks: [{ name: 'example-dependency', status: 'not_ready' }],
      status: 'not_ready',
    });
  });
});

describe('standard API errors', () => {
  it('returns the standard JSON contract for unknown routes', async () => {
    const app = await createApp();

    const response = await app.inject({ method: 'GET', url: '/unknown' });
    const body = apiErrorResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(404);
    expect(body).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Rota não encontrada' },
    });
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('normalizes an expected application error', async () => {
    const app = await createApp();
    app.get('/test/app-error', async () => {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Entrada técnica inválida',
        statusCode: 422,
      });
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/app-error',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Entrada técnica inválida',
      },
    });
  });

  it('hides details from an unexpected error', async () => {
    const app = await createApp();
    app.get('/test/unexpected-error', async () => {
      throw new Error('internal path and sensitive implementation detail');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected-error',
    });
    const serializedBody = response.body;

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocorreu um erro inesperado',
      },
    });
    expect(serializedBody).not.toContain('sensitive implementation detail');
  });

  it('normalizes a request that exceeds the configured body limit', async () => {
    const app = await createApp({
      config: createTestConfig({ REQUEST_BODY_LIMIT_BYTES: '1024' }),
    });
    app.post('/test/body-limit', async () => ({ accepted: true }));

    const response = await app.inject({
      method: 'POST',
      payload: { content: 'x'.repeat(2048) },
      url: '/test/body-limit',
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requisição inválida',
      },
    });
  });
});

describe('HTTP security', () => {
  it('allows only the configured frontend origin', async () => {
    const app = await createApp();

    const allowed = await app.inject({
      headers: { origin: 'http://frontend.test' },
      method: 'GET',
      url: '/api/v1/health',
    });
    const denied = await app.inject({
      headers: { origin: 'https://untrusted.example' },
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://frontend.test',
    );
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
  });
});
