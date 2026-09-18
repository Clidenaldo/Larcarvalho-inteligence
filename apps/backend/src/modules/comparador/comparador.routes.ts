import {
  compararGruposRequestSchema,
  compararGruposResponseSchema,
  comparadorSearchQuerySchema,
  comparadorSearchResponseSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ComparadorService } from './comparador.service.js';

interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: ComparadorService;
}
export const comparadorRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  app.get(
    '/grupos',
    { preHandler: [auth, requirePermission('comparador.read')] },
    async (request) =>
      comparadorSearchResponseSchema.parse(
        await options.service.search(
          authenticatedContext(request),
          comparadorSearchQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/comparar',
    {
      preHandler: [
        createRequireTrustedOrigin(options.config),
        auth,
        requirePermission('comparador.read'),
      ],
    },
    async (request) =>
      compararGruposResponseSchema.parse(
        await options.service.compare(
          authenticatedContext(request),
          compararGruposRequestSchema.parse(request.body),
        ),
      ),
  );
};
