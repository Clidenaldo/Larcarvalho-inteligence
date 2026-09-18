import { healthResponseSchema } from '@larcarvalho/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getJson, type ApiClientError } from '../src/services/api/client';

const validHealthResponse = {
  requestId: 'request-1',
  service: 'backend',
  status: 'ok',
  timestamp: '2026-08-31T12:00:00.000Z',
  version: 'v1',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('returns a response validated by the shared contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(validHealthResponse)),
    );

    await expect(
      getJson({
        baseUrl: 'http://backend.test',
        parse: (payload) => healthResponseSchema.parse(payload),
        path: '/api/v1/health',
        timeoutMs: 1000,
      }),
    ).resolves.toEqual(validHealthResponse);
  });

  it('rejects a response outside the shared contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'unknown' })),
    );

    await expect(
      getJson({
        baseUrl: 'http://backend.test',
        parse: (payload) => healthResponseSchema.parse(payload),
        path: '/api/v1/health',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('classifies a deterministic timeout', async () => {
    const timeoutError = new Error('timed out');
    timeoutError.name = 'TimeoutError';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(timeoutError)),
    );

    await expect(
      getJson({
        baseUrl: 'http://backend.test',
        parse: (payload) => payload,
        path: '/api/v1/health',
        timeoutMs: 1000,
      }),
    ).rejects.toEqual(
      expect.objectContaining<ApiClientError>({ kind: 'timeout' }),
    );
  });

  it('preserves the status of an HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(
      getJson({
        baseUrl: 'http://backend.test',
        parse: (payload) => payload,
        path: '/api/v1/health',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ kind: 'http_error', statusCode: 503 });
  });
});
