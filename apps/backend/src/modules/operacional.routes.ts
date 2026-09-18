import {
  cotaListQuerySchema,
  cotaListResponseSchema,
  cotaSchema,
  createCotaRequestSchema,
  createGrupoRequestSchema,
  createProdutoRequestSchema,
  grupoListQuerySchema,
  grupoListResponseSchema,
  grupoSchema,
  produtoListQuerySchema,
  produtoListResponseSchema,
  produtoSchema,
  updateCotaRequestSchema,
  updateCotaStatusRequestSchema,
  updateGrupoRequestSchema,
  updateGrupoStatusRequestSchema,
  updateProdutoRequestSchema,
  updateProdutoStatusRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../core/auth/http-auth.js';
import type { IdentityService } from './identity/identity.service.js';
import type { ProdutosService } from './produtos/produtos.service.js';
import type { GruposService } from './grupos/grupos.service.js';
import type { CotasService } from './cotas/cotas.service.js';
const params = z.object({ id: z.uuid() });
const meta = (r: FastifyRequest) => ({
  ipAddress: r.ip,
  ...(r.headers['user-agent'] ? { userAgent: r.headers['user-agent'] } : {}),
});
interface O {
  config: AppConfig;
  identityService: IdentityService;
  produtos: ProdutosService;
  grupos: GruposService;
  cotas: CotasService;
}
export const operacionalRoutes: FastifyPluginAsync<O> = async (app, o) => {
  const auth = createAuthenticateRequest(o.identityService, o.config),
    origin = createRequireTrustedOrigin(o.config);
  const secure = (p: string) => [origin, auth, requirePermission(p as never)];
  app.get(
    '/produtos',
    { preHandler: [auth, requirePermission('produtos.read')] },
    async (r) =>
      produtoListResponseSchema.parse(
        await o.produtos.list(
          authenticatedContext(r),
          produtoListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post(
    '/produtos',
    { preHandler: secure('produtos.create') },
    async (r, reply) =>
      reply
        .code(201)
        .send(
          produtoSchema.parse(
            await o.produtos.create(
              authenticatedContext(r),
              createProdutoRequestSchema.parse(r.body),
              meta(r),
            ),
          ),
        ),
  );
  app.get(
    '/produtos/:id',
    { preHandler: [auth, requirePermission('produtos.read')] },
    async (r) =>
      produtoSchema.parse(
        await o.produtos.get(
          authenticatedContext(r),
          params.parse(r.params).id,
        ),
      ),
  );
  app.patch(
    '/produtos/:id',
    { preHandler: secure('produtos.update') },
    async (r) =>
      produtoSchema.parse(
        await o.produtos.update(
          authenticatedContext(r),
          params.parse(r.params).id,
          updateProdutoRequestSchema.parse(r.body),
          meta(r),
        ),
      ),
  );
  app.patch(
    '/produtos/:id/status',
    { preHandler: secure('produtos.deactivate') },
    async (r) =>
      produtoSchema.parse(
        await o.produtos.status(
          authenticatedContext(r),
          params.parse(r.params).id,
          updateProdutoStatusRequestSchema.parse(r.body).ativo,
          meta(r),
        ),
      ),
  );
  app.get(
    '/grupos',
    { preHandler: [auth, requirePermission('grupos.read')] },
    async (r) =>
      grupoListResponseSchema.parse(
        await o.grupos.list(
          authenticatedContext(r),
          grupoListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post(
    '/grupos',
    { preHandler: secure('grupos.create') },
    async (r, reply) =>
      reply
        .code(201)
        .send(
          grupoSchema.parse(
            await o.grupos.create(
              authenticatedContext(r),
              createGrupoRequestSchema.parse(r.body),
              meta(r),
            ),
          ),
        ),
  );
  app.get(
    '/grupos/:id',
    { preHandler: [auth, requirePermission('grupos.read')] },
    async (r) =>
      grupoSchema.parse(
        await o.grupos.get(authenticatedContext(r), params.parse(r.params).id),
      ),
  );
  app.patch('/grupos/:id', { preHandler: secure('grupos.update') }, async (r) =>
    grupoSchema.parse(
      await o.grupos.update(
        authenticatedContext(r),
        params.parse(r.params).id,
        updateGrupoRequestSchema.parse(r.body),
        meta(r),
      ),
    ),
  );
  app.patch(
    '/grupos/:id/status',
    { preHandler: secure('grupos.deactivate') },
    async (r) =>
      grupoSchema.parse(
        await o.grupos.status(
          authenticatedContext(r),
          params.parse(r.params).id,
          updateGrupoStatusRequestSchema.parse(r.body).status,
          meta(r),
        ),
      ),
  );
  app.get(
    '/cotas',
    { preHandler: [auth, requirePermission('cotas.read')] },
    async (r) =>
      cotaListResponseSchema.parse(
        await o.cotas.list(
          authenticatedContext(r),
          cotaListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post('/cotas', { preHandler: secure('cotas.create') }, async (r, reply) =>
    reply
      .code(201)
      .send(
        cotaSchema.parse(
          await o.cotas.create(
            authenticatedContext(r),
            createCotaRequestSchema.parse(r.body),
            meta(r),
          ),
        ),
      ),
  );
  app.get(
    '/cotas/:id',
    { preHandler: [auth, requirePermission('cotas.read')] },
    async (r) =>
      cotaSchema.parse(
        await o.cotas.get(authenticatedContext(r), params.parse(r.params).id),
      ),
  );
  app.patch('/cotas/:id', { preHandler: secure('cotas.update') }, async (r) =>
    cotaSchema.parse(
      await o.cotas.update(
        authenticatedContext(r),
        params.parse(r.params).id,
        updateCotaRequestSchema.parse(r.body),
        meta(r),
      ),
    ),
  );
  app.patch(
    '/cotas/:id/status',
    { preHandler: secure('cotas.deactivate') },
    async (r) =>
      cotaSchema.parse(
        await o.cotas.status(
          authenticatedContext(r),
          params.parse(r.params).id,
          updateCotaStatusRequestSchema.parse(r.body).status,
          meta(r),
        ),
      ),
  );
};
