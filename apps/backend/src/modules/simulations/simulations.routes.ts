import {
  simulationCatalogSchema,
  calculateSimulationRequestSchema,
  createSimulationRequestSchema,
  simulationListQuerySchema,
  simulationListResponseSchema,
  simulationCatalogFavoritesSchema,
  simulationCatalogFavoriteTypeSchema,
  simulationScenarioSchema,
  simulationSchema,
  updateSimulationRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { SimulationsService } from './simulations.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: SimulationsService;
}
const idParams = z.object({ id: z.uuid() });
const catalogFavoriteParams = z.object({
  type: simulationCatalogFavoriteTypeSchema,
  entityId: z.uuid(),
});
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const simulationsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/catalog', { preHandler: [auth, requirePermission('simulations.create')] }, async (request) => simulationCatalogSchema.parse(await options.service.catalog(authenticatedContext(request))));

  app.get('/', { preHandler: [auth] }, async (request) =>
    simulationListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        simulationListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.post(
    '/',
    { preHandler: [origin, auth, requirePermission('simulations.create')] },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          simulationSchema.parse(
            await options.service.create(
              authenticatedContext(request),
              createSimulationRequestSchema.parse(request.body),
              requestMetadata(request),
            ),
          ),
        ),
  );
  app.get('/favorites/catalog', { preHandler: [auth] }, async (request) =>
    simulationCatalogFavoritesSchema.parse(
      await options.service.listCatalogFavorites(authenticatedContext(request)),
    ),
  );
  app.post(
    '/favorites/:type/:entityId',
    { preHandler: [origin, auth] },
    async (request, reply) => {
      const params = catalogFavoriteParams.parse(request.params);
      await options.service.favoriteCatalogEntity(
        authenticatedContext(request),
        params.type,
        params.entityId,
        requestMetadata(request),
      );
      return reply.code(204).send();
    },
  );
  app.delete(
    '/favorites/:type/:entityId',
    { preHandler: [origin, auth] },
    async (request, reply) => {
      const params = catalogFavoriteParams.parse(request.params);
      await options.service.unfavoriteCatalogEntity(
        authenticatedContext(request),
        params.type,
        params.entityId,
        requestMetadata(request),
      );
      return reply.code(204).send();
    },
  );
  app.get('/:id', { preHandler: [auth] }, async (request) =>
    simulationSchema.parse(
      await options.service.get(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
  app.get(
    '/:id/scenarios/:scenarioId/csv',
    { preHandler: [auth] },
    async (request, reply) => {
      const params = z
        .object({ id: z.uuid(), scenarioId: z.uuid() })
        .parse(request.params);
      const output = await options.service.exportScenarioCsv(
        authenticatedContext(request),
        params.id,
        params.scenarioId,
        requestMetadata(request),
      );
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="${output.filename}"`,
        )
        .header('cache-control', 'private, no-store')
        .send(output.csv);
    },
  );
  app.patch('/:id', { preHandler: [origin, auth] }, async (request) =>
    simulationSchema.parse(
      await options.service.update(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateSimulationRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.delete('/:id', { preHandler: [origin, auth] }, async (request, reply) => {
    await options.service.delete(
      authenticatedContext(request),
      idParams.parse(request.params).id,
      requestMetadata(request),
    );
    return reply.code(204).send();
  });
  app.post('/:id/calculate', { preHandler: [origin, auth] }, async (request) =>
    simulationScenarioSchema.parse(
      await options.service.calculate(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        calculateSimulationRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.post(
    '/:id/print',
    { preHandler: [origin, auth] },
    async (request, reply) => {
      await options.service.registerPrint(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
      );
      return reply.code(204).send();
    },
  );
  app.post('/:id/favorite', { preHandler: [origin, auth] }, async (request) =>
    simulationSchema.parse(
      await options.service.favorite(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
      ),
    ),
  );
  app.delete('/:id/favorite', { preHandler: [origin, auth] }, async (request) =>
    simulationSchema.parse(
      await options.service.unfavorite(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
      ),
    ),
  );
};
