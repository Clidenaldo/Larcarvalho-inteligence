import {
  simuladorPublicoRequestSchema,
  simuladorPublicoResponseSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import type { SimuladorPublicoService } from './simulador-publico.service.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';

interface Options {
  config: AppConfig;
  service: SimuladorPublicoService;
}

export const simuladorPublicoRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.post(
    '/simulador',
    {
      config: {
        rateLimit: {
          max: options.config.PUBLIC_SIMULATOR_RATE_LIMIT_MAX,
          timeWindow: options.config.PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request) => {
      const input = simuladorPublicoRequestSchema.parse(request.body);
      const startedAt = Date.now();
      const businessMetrics = getBusinessMetrics();
      businessMetrics.recordSimulation('started', input.perfil.categoria);
      try {
        const { response, metrics } = await options.service.simulate(input);
        businessMetrics.recordSimulation(
          'completed',
          input.perfil.categoria,
          Date.now() - startedAt,
        );
        request.log.info(
          {
            event: 'public_simulation_completed',
            requestId: request.id,
            categoria: input.perfil.categoria,
            ...metrics,
          },
          'Public simulation completed',
        );
        return simuladorPublicoResponseSchema.parse(response);
      } catch (error) {
        businessMetrics.recordSimulation(
          'failed',
          input.perfil.categoria,
          Date.now() - startedAt,
        );
        throw error;
      }
    },
  );
};
