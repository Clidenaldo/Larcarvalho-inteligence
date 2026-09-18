import {
  apiVersion,
  type HealthResponse,
  type ReadinessResponse,
} from '@larcarvalho/shared';
import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import {
  runReadinessProbe,
  type ReadinessProbe,
} from '../core/readiness/readiness-probe.js';

export interface TechnicalRoutesOptions extends FastifyPluginOptions {
  readonly probes: readonly ReadinessProbe[];
}

function technicalMetadata(request: FastifyRequest) {
  return {
    requestId: request.id,
    service: 'backend',
    timestamp: new Date().toISOString(),
    version: apiVersion,
  } as const;
}

function disableCaching(reply: FastifyReply): void {
  void reply.header('cache-control', 'no-store');
}

export const technicalRoutes: FastifyPluginAsync<
  TechnicalRoutesOptions
> = async (app, options) => {
  app.get('/health', async (request, reply): Promise<HealthResponse> => {
    disableCaching(reply);

    return {
      ...technicalMetadata(request),
      status: 'ok',
    };
  });

  app.get('/ready', async (request, reply): Promise<ReadinessResponse> => {
    disableCaching(reply);

    const checks = await Promise.all(options.probes.map(runReadinessProbe));
    const status = checks.every((check) => check.status === 'ready')
      ? 'ready'
      : 'not_ready';

    if (status === 'not_ready') {
      void reply.code(503);
    }

    return {
      ...technicalMetadata(request),
      checks,
      status,
    };
  });
};
