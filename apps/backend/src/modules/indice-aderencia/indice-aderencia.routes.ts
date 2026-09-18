import {
  calcularIndiceAderenciaRequestSchema,
  calcularIndiceAderenciaResponseSchema,
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
import type { IndiceAderenciaService } from './indice-aderencia.service.js';

interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: IndiceAderenciaService;
}

export const indiceAderenciaRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  app.post(
    '/calcular',
    {
      preHandler: [
        createRequireTrustedOrigin(options.config),
        auth,
        requirePermission('indice_aderencia.read'),
      ],
    },
    async (request) =>
      calcularIndiceAderenciaResponseSchema.parse(
        await options.service.calculate(
          authenticatedContext(request),
          calcularIndiceAderenciaRequestSchema.parse(request.body),
        ),
      ),
  );
};
