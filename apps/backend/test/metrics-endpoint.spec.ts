import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createTestConfig } from './helpers/config.js';
import { resetMetricsRegistry } from '../src/infrastructure/observability/metrics-registry.js';
import {
  getBusinessMetrics,
  resetBusinessMetrics,
} from '../src/infrastructure/observability/business-metrics.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
  resetMetricsRegistry();
  resetBusinessMetrics();
});

beforeEach(() => {
  resetMetricsRegistry();
  resetBusinessMetrics();
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

describe('Metrics endpoint', () => {
  it('returns 404 when METRICS_ENABLED is false', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'false' }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 401 without token in production', async () => {
    const app = await createApp({
      config: createTestConfig({
        METRICS_ENABLED: 'true',
        METRICS_AUTH_TOKEN: 'test-token',
        NODE_ENV: 'production',
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 with invalid token in production', async () => {
    const app = await createApp({
      config: createTestConfig({
        METRICS_ENABLED: 'true',
        METRICS_AUTH_TOKEN: 'test-token',
        NODE_ENV: 'production',
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: 'Bearer invalid-token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 200 with valid token in production', async () => {
    const app = await createApp({
      config: createTestConfig({
        METRICS_ENABLED: 'true',
        METRICS_AUTH_TOKEN: 'test-token',
        NODE_ENV: 'production',
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(
      'text/plain; version=0.0.4',
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 200 without token in development/test', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(
      'text/plain; version=0.0.4',
    );
  });

  it('contains HTTP metrics after generating traffic', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    // Generate real traffic
    await app.inject({ method: 'GET', url: '/api/v1/health' });
    await app.inject({ method: 'GET', url: '/api/v1/ready' });
    await app.inject({ method: 'GET', url: '/api/v1/health' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;

    // HTTP metrics should be present
    expect(body).toContain('larcarvalho_http_requests_total');
    expect(body).toContain('larcarvalho_http_request_duration_seconds');
    expect(body).toContain('larcarvalho_http_requests_by_route_total');
    expect(body).toContain('larcarvalho_http_requests_by_status_total');
  });

  it('contains business metrics after recording real business events', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    // Record real business events
    getBusinessMetrics().recordLead('created');
    getBusinessMetrics().recordLead('converted');
    getBusinessMetrics().recordIntegrationRun('success', 'MOCK', 500);
    getBusinessMetrics().recordImport('completed', 100);
    getBusinessMetrics().recordDataQualityIssue('critical', 'open');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;

    expect(body).toContain('larcarvalho_leads_created_total');
    expect(body).toContain('larcarvalho_leads_converted_total');
    expect(body).toContain('larcarvalho_integration_runs_total');
    expect(body).toContain('larcarvalho_imports_total');
    expect(body).toContain('larcarvalho_data_quality_issues_total');
  });

  it('does not expose UUIDs, emails, phones, tokens, cookies or passwords in labels', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    // Generate traffic with UUIDs in URLs
    const uuid1 = '123e4567-e89b-12d3-a456-426614174000';
    const uuid2 = '123e4567-e89b-12d3-a456-426614174001';
    await app.inject({ method: 'GET', url: `/api/v1/users/${uuid1}` });
    await app.inject({ method: 'GET', url: `/api/v1/users/${uuid2}` });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;

    // UUIDs should NOT appear in the output
    expect(body).not.toContain(uuid1);
    expect(body).not.toContain(uuid2);

    // PII should NOT appear
    expect(body).not.toContain('user@example.com');
    expect(body).not.toContain('+55 11 99999-9999');
    expect(body).not.toContain('Bearer');
    expect(body).not.toContain('password');
    expect(body).not.toContain('cookie');
  });

  it('normalizes different UUIDs to the same route label', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    const uuid1 = '123e4567-e89b-12d3-a456-426614174000';
    const uuid2 = '123e4567-e89b-12d3-a456-426614174001';
    await app.inject({ method: 'GET', url: `/api/v1/users/${uuid1}` });
    await app.inject({ method: 'GET', url: `/api/v1/users/${uuid2}` });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    const body = response.body;

    // Both requests should map to the same normalized route
    const routeLines = body
      .split('\n')
      .filter((line) => line.includes('http_requests_by_route_total'));
    const normalizedRoutes = routeLines.filter((line) =>
      line.includes('/api/v1/users/:id'),
    );

    expect(normalizedRoutes.length).toBeGreaterThan(0);
    // No raw UUIDs in route labels
    expect(routeLines.some((line) => line.includes(uuid1))).toBe(false);
    expect(routeLines.some((line) => line.includes(uuid2))).toBe(false);
  });

  it('does not include requestId as a label', async () => {
    const app = await createApp({
      config: createTestConfig({ METRICS_ENABLED: 'true' }),
    });

    await app.inject({ method: 'GET', url: '/api/v1/health' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics',
    });

    const body = response.body;
    expect(body).not.toContain('requestId');
    expect(body).not.toContain('request_id');
  });
});
