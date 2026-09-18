import {
  administradoraListQuerySchema,
  administradoraListResponseSchema,
  administradoraSchema,
  createAdministradoraRequestSchema,
  updateAdministradoraRequestSchema,
  updateAdministradoraStatusRequestSchema,
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
import type { AdministradorasService } from './administradoras.service.js';

interface Options {
  readonly administradorasService: AdministradorasService;
  readonly config: AppConfig;
  readonly identityService: IdentityService;
}

const paramsSchema = z.object({ id: z.uuid() });

function metadata(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return { ipAddress: request.ip, ...(userAgent ? { userAgent } : {}) };
}

export const administradorasRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const authenticate = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const trustedOrigin = createRequireTrustedOrigin(options.config);
  const service = options.administradorasService;

  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('administradoras.read')] },
    async (request) =>
      administradoraListResponseSchema.parse(
        await service.list(
          authenticatedContext(request),
          administradoraListQuerySchema.parse(request.query),
        ),
      ),
  );

  app.post(
    '/',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('administradoras.create'),
      ],
    },
    async (request, reply) => {
      const result = await service.create(
        authenticatedContext(request),
        createAdministradoraRequestSchema.parse(request.body),
        metadata(request),
      );
      return reply.code(201).send(administradoraSchema.parse(result));
    },
  );

  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('administradoras.read')] },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return administradoraSchema.parse(
        await service.get(authenticatedContext(request), id),
      );
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('administradoras.update'),
      ],
    },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);
      return administradoraSchema.parse(
        await service.update(
          authenticatedContext(request),
          id,
          updateAdministradoraRequestSchema.parse(request.body),
          metadata(request),
        ),
      );
    },
  );

  app.patch(
    '/:id/status',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('administradoras.deactivate'),
      ],
    },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const { ativa } = updateAdministradoraStatusRequestSchema.parse(
        request.body,
      );
      return administradoraSchema.parse(
        await service.setStatus(
          authenticatedContext(request),
          id,
          ativa,
          metadata(request),
        ),
      );
    },
  );
};
