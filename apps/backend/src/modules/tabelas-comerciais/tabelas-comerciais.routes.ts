import {
  createTabelaComercialItemRequestSchema,
  createTabelaComercialRequestSchema,
  tabelaComercialDetailSchema,
  tabelaComercialItemListQuerySchema,
  tabelaComercialItemListResponseSchema,
  tabelaComercialItemSchema,
  tabelaComercialListQuerySchema,
  tabelaComercialListResponseSchema,
  tabelaComercialSchema,
  updateTabelaComercialItemRequestSchema,
  updateTabelaComercialRequestSchema,
  updateTabelaComercialStatusRequestSchema,
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
import type { TabelasComerciaisService } from './tabelas-comerciais.service.js';

interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: TabelasComerciaisService;
}
const idParams = z.object({ id: z.uuid() });
const itemParams = z.object({ id: z.uuid(), itemId: z.uuid() });
const deleteBody = z.object({ confirmation: z.literal('EXCLUIR') }).strict();
const metadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const tabelasComerciaisRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const secure = (
    permission: 'tabelas_comerciais.create' | 'tabelas_comerciais.update',
  ) => [origin, auth, requirePermission(permission)];

  app.get(
    '/',
    { preHandler: [auth, requirePermission('tabelas_comerciais.read')] },
    async (request) =>
      tabelaComercialListResponseSchema.parse(
        await options.service.list(
          authenticatedContext(request),
          tabelaComercialListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/',
    { preHandler: secure('tabelas_comerciais.create') },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          tabelaComercialSchema.parse(
            await options.service.create(
              authenticatedContext(request),
              createTabelaComercialRequestSchema.parse(request.body),
              metadata(request),
            ),
          ),
        ),
  );
  app.get(
    '/:id',
    { preHandler: [auth, requirePermission('tabelas_comerciais.read')] },
    async (request) =>
      tabelaComercialDetailSchema.parse(
        await options.service.get(
          authenticatedContext(request),
          idParams.parse(request.params).id,
        ),
      ),
  );
  app.patch(
    '/:id',
    { preHandler: secure('tabelas_comerciais.update') },
    async (request) =>
      tabelaComercialSchema.parse(
        await options.service.update(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          updateTabelaComercialRequestSchema.parse(request.body),
          metadata(request),
        ),
      ),
  );
  app.patch(
    '/:id/archive',
    { preHandler: secure('tabelas_comerciais.update') },
    async (request) =>
      tabelaComercialSchema.parse(
        await options.service.archive(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          metadata(request),
        ),
      ),
  );
  app.post(
    '/:id/restore',
    { preHandler: secure('tabelas_comerciais.update') },
    async (request) =>
      tabelaComercialSchema.parse(
        await options.service.restore(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          metadata(request),
        ),
      ),
  );
  app.delete(
    '/:id',
    {
      preHandler: [
        origin,
        auth,
        requirePermission('tabelas_comerciais.delete'),
      ],
    },
    async (request, reply) => {
      await options.service.delete(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        deleteBody.parse(request.body).confirmation,
        metadata(request),
      );
      return reply.code(204).send();
    },
  );
  app.patch(
    '/:id/status',
    { preHandler: secure('tabelas_comerciais.update') },
    async (request) =>
      tabelaComercialSchema.parse(
        await options.service.status(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          updateTabelaComercialStatusRequestSchema.parse(request.body).status,
          metadata(request),
        ),
      ),
  );
  app.get(
    '/:id/itens',
    { preHandler: [auth, requirePermission('tabelas_comerciais.read')] },
    async (request) =>
      tabelaComercialItemListResponseSchema.parse(
        await options.service.items(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          tabelaComercialItemListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/:id/itens',
    { preHandler: secure('tabelas_comerciais.create') },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          tabelaComercialItemSchema.parse(
            await options.service.createItem(
              authenticatedContext(request),
              idParams.parse(request.params).id,
              createTabelaComercialItemRequestSchema.parse(request.body),
              metadata(request),
            ),
          ),
        ),
  );
  app.patch(
    '/:id/itens/:itemId',
    { preHandler: secure('tabelas_comerciais.update') },
    async (request) => {
      const params = itemParams.parse(request.params);
      return tabelaComercialItemSchema.parse(
        await options.service.updateItem(
          authenticatedContext(request),
          params.id,
          params.itemId,
          updateTabelaComercialItemRequestSchema.parse(request.body),
          metadata(request),
        ),
      );
    },
  );
};
