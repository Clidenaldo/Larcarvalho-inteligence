import {
  analyticsEventRequestSchema,
  analyticsOverviewSchema,
  analyticsQuerySchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import {
  createAuthenticateRequest,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { AnalyticsService } from './analytics.service.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';

export const publicAnalyticsRoutes: FastifyPluginAsync<{
  config: AppConfig;
  service: AnalyticsService;
}> = async (app, { service }) => {
  app.post(
    '/events',
    {
      bodyLimit: 4096,
      config: { rateLimit: { max: 120, timeWindow: 60_000 } },
    },
    async (request, reply) => {
      const startedAt = performance.now();
      let input;
      try {
        input = analyticsEventRequestSchema.parse(request.body);
      } catch {
        getBusinessMetrics().recordAnalyticsEvent('rejected');
        getBusinessMetrics().recordAnalyticsEventProcessingDuration(
          performance.now() - startedAt,
        );
        return reply.code(400).send({ message: 'Evento inválido' });
      }
      getBusinessMetrics().recordAnalyticsEvent('received');
      try {
        await service.record(input);
        getBusinessMetrics().recordAnalyticsEvent('processed');
      } finally {
        getBusinessMetrics().recordAnalyticsEventProcessingDuration(
          performance.now() - startedAt,
        );
      }
      return reply.code(202).send({ accepted: true });
    },
  );
};

export const analyticsRoutes: FastifyPluginAsync<{
  config: AppConfig;
  identityService: IdentityService;
  service: AnalyticsService;
}> = async (app, { config, identityService, service }) => {
  const auth = createAuthenticateRequest(identityService, config);
  app.get(
    '/overview',
    { preHandler: [auth, requirePermission('analytics.read')] },
    async (request) => {
      const query = analyticsQuerySchema.parse(request.query);
      return analyticsOverviewSchema.parse(await service.overview(query));
    },
  );
};
