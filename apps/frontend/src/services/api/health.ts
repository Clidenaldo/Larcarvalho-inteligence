import {
  apiPrefix,
  healthResponseSchema,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from '@larcarvalho/shared';

import type { FrontendConfig } from '../../config/env';
import { ApiClientError, getJson } from './client';

export type BackendHealthResult =
  | { readonly data: HealthResponse; readonly state: 'online' }
  | {
      readonly reason: 'invalid_response' | 'timeout' | 'unavailable';
      readonly state: 'offline';
    };

export async function getBackendHealth(
  config: FrontendConfig,
): Promise<BackendHealthResult> {
  try {
    const data = await getJson({
      baseUrl: config.apiBaseUrl,
      parse: (payload) => healthResponseSchema.parse(payload),
      path: `${apiPrefix}/health`,
      timeoutMs: config.apiTimeoutMs,
    });

    return { data, state: 'online' };
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.kind === 'timeout') {
        return { reason: 'timeout', state: 'offline' };
      }

      if (error.kind === 'invalid_response') {
        return { reason: 'invalid_response', state: 'offline' };
      }
    }

    return { reason: 'unavailable', state: 'offline' };
  }
}

export async function getBackendReadiness(
  config: FrontendConfig,
): Promise<ReadinessResponse | null> {
  try {
    return await getJson({
      baseUrl: config.apiBaseUrl,
      parse: (payload) => readinessResponseSchema.parse(payload),
      path: `${apiPrefix}/ready`,
      timeoutMs: config.apiTimeoutMs,
    });
  } catch {
    return null;
  }
}
