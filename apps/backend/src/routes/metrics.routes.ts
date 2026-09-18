import type {
  FastifyPluginAsync,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import type { AppConfig } from '../config/env.js';
import { getMetricsRegistry } from '../infrastructure/observability/metrics-registry.js';
import { updateDatabasePoolMetrics } from '../infrastructure/database/prisma-client.js';

export interface MetricsRoutesOptions extends FastifyPluginOptions {
  readonly config: AppConfig;
}

/**
 * Authenticate metrics endpoint
 * Supports:
 * - METRICS_AUTH_TOKEN via Authorization header
 * - Allowlist for localhost in development
 */
function authenticateMetrics(
  request: FastifyRequest,
  config: AppConfig,
): boolean {
  // Allow in development/test
  if (config.NODE_ENV !== 'production') {
    return true;
  }

  // Production: require token
  const token = config.METRICS_AUTH_TOKEN;
  if (!token) {
    return false;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader) {
    return false;
  }

  // Support "Bearer <token>" format
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Bearer') {
    return false;
  }

  return credentials === token;
}

export const metricsRoutes: FastifyPluginAsync<MetricsRoutesOptions> = async (
  app,
  options,
) => {
  app.get<object>(
    '/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Authenticate
      if (!authenticateMetrics(request, options.config)) {
        void reply.code(401);
        return { error: 'Unauthorized' };
      }

      try {
        const registry = getMetricsRegistry();

        // Update pool metrics from the real PostgreSQL pool (on-demand)
        updateDatabasePoolMetrics();

        const metricsData = registry.exportMetrics();

        void reply
          .type('text/plain; version=0.0.4')
          .header('cache-control', 'no-store')
          .send(metricsData);

        return;
      } catch (error) {
        request.log.error({
          type: 'metrics_export_error',
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId: request.id,
        });

        void reply.code(500);
        return { error: 'Failed to export metrics' };
      }
    },
  );
};
