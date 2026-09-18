import {
  assembleiaListQuerySchema,
  assembleiaListResponseSchema,
  assembleiaSchema,
  contemplacaoListQuerySchema,
  contemplacaoListResponseSchema,
  contemplacaoSchema,
  createAssembleiaRequestSchema,
  createContemplacaoRequestSchema,
  createLanceRequestSchema,
  lanceListQuerySchema,
  lanceListResponseSchema,
  lanceSchema,
  updateAssembleiaRequestSchema,
  updateAssembleiaStatusRequestSchema,
  updateContemplacaoRequestSchema,
  updateLanceRequestSchema,
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
import type { AssembleiasService } from './assembleias/assembleias.service.js';
import type { ContemplacoesService } from './contemplacoes/contemplacoes.service.js';
import type { IdentityService } from './identity/identity.service.js';
import type { LancesService } from './lances/lances.service.js';
const p = z.object({ id: z.uuid() });
const m = (r: FastifyRequest) => ({
  ipAddress: r.ip,
  ...(r.headers['user-agent'] ? { userAgent: r.headers['user-agent'] } : {}),
});
interface O {
  config: AppConfig;
  identityService: IdentityService;
  assembleias: AssembleiasService;
  lances: LancesService;
  contemplacoes: ContemplacoesService;
}
export const historicoRoutes: FastifyPluginAsync<O> = async (app, o) => {
  const a = createAuthenticateRequest(o.identityService, o.config),
    origin = createRequireTrustedOrigin(o.config),
    write = (permission: Parameters<typeof requirePermission>[0]) => [
      origin,
      a,
      requirePermission(permission),
    ];
  app.get(
    '/assembleias',
    { preHandler: [a, requirePermission('assembleias.read')] },
    async (r) =>
      assembleiaListResponseSchema.parse(
        await o.assembleias.list(
          authenticatedContext(r),
          assembleiaListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post(
    '/assembleias',
    { preHandler: write('assembleias.create') },
    async (r, reply) =>
      reply
        .code(201)
        .send(
          assembleiaSchema.parse(
            await o.assembleias.create(
              authenticatedContext(r),
              createAssembleiaRequestSchema.parse(r.body),
              m(r),
            ),
          ),
        ),
  );
  app.get(
    '/assembleias/:id',
    { preHandler: [a, requirePermission('assembleias.read')] },
    async (r) =>
      assembleiaSchema.parse(
        await o.assembleias.get(authenticatedContext(r), p.parse(r.params).id),
      ),
  );
  app.patch(
    '/assembleias/:id',
    { preHandler: write('assembleias.update') },
    async (r) =>
      assembleiaSchema.parse(
        await o.assembleias.update(
          authenticatedContext(r),
          p.parse(r.params).id,
          updateAssembleiaRequestSchema.parse(r.body),
          m(r),
        ),
      ),
  );
  app.patch(
    '/assembleias/:id/status',
    { preHandler: write('assembleias.update') },
    async (r) =>
      assembleiaSchema.parse(
        await o.assembleias.status(
          authenticatedContext(r),
          p.parse(r.params).id,
          updateAssembleiaStatusRequestSchema.parse(r.body).status,
          m(r),
        ),
      ),
  );
  app.get(
    '/lances',
    { preHandler: [a, requirePermission('lances.read')] },
    async (r) =>
      lanceListResponseSchema.parse(
        await o.lances.list(
          authenticatedContext(r),
          lanceListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post(
    '/lances',
    { preHandler: write('lances.create') },
    async (r, reply) =>
      reply
        .code(201)
        .send(
          lanceSchema.parse(
            await o.lances.create(
              authenticatedContext(r),
              createLanceRequestSchema.parse(r.body),
              m(r),
            ),
          ),
        ),
  );
  app.get(
    '/lances/:id',
    { preHandler: [a, requirePermission('lances.read')] },
    async (r) =>
      lanceSchema.parse(
        await o.lances.get(authenticatedContext(r), p.parse(r.params).id),
      ),
  );
  app.patch('/lances/:id', { preHandler: write('lances.update') }, async (r) =>
    lanceSchema.parse(
      await o.lances.update(
        authenticatedContext(r),
        p.parse(r.params).id,
        updateLanceRequestSchema.parse(r.body),
        m(r),
      ),
    ),
  );
  app.get(
    '/contemplacoes',
    { preHandler: [a, requirePermission('contemplacoes.read')] },
    async (r) =>
      contemplacaoListResponseSchema.parse(
        await o.contemplacoes.list(
          authenticatedContext(r),
          contemplacaoListQuerySchema.parse(r.query),
        ),
      ),
  );
  app.post(
    '/contemplacoes',
    { preHandler: write('contemplacoes.create') },
    async (r, reply) =>
      reply
        .code(201)
        .send(
          contemplacaoSchema.parse(
            await o.contemplacoes.create(
              authenticatedContext(r),
              createContemplacaoRequestSchema.parse(r.body),
              m(r),
            ),
          ),
        ),
  );
  app.get(
    '/contemplacoes/:id',
    { preHandler: [a, requirePermission('contemplacoes.read')] },
    async (r) =>
      contemplacaoSchema.parse(
        await o.contemplacoes.get(
          authenticatedContext(r),
          p.parse(r.params).id,
        ),
      ),
  );
  app.patch(
    '/contemplacoes/:id',
    { preHandler: write('contemplacoes.update') },
    async (r) =>
      contemplacaoSchema.parse(
        await o.contemplacoes.update(
          authenticatedContext(r),
          p.parse(r.params).id,
          updateContemplacaoRequestSchema.parse(r.body),
          m(r),
        ),
      ),
  );
};
