import {
  createGrupoSnapshotRequestSchema,
  grupoHistoricoListQuerySchema,
  grupoHistoricoListResponseSchema,
  grupoHistoricoSeriesSchema,
  grupoSnapshotSchema,
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
import type { GrupoHistoricoService } from './grupo-historico.service.js';

const groupParams = z.object({ grupoId: z.uuid() });
const snapshotParams = groupParams.extend({ snapshotId: z.uuid() });
const metadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});
interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: GrupoHistoricoService;
}
export const grupoHistoricoRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const trustedOrigin = createRequireTrustedOrigin(options.config);
  app.get(
    '/grupos/:grupoId/historico',
    { preHandler: [auth, requirePermission('historico_grupos.read')] },
    async (request) =>
      grupoHistoricoListResponseSchema.parse(
        await options.service.list(
          authenticatedContext(request),
          groupParams.parse(request.params).grupoId,
          grupoHistoricoListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/grupos/:grupoId/historico/snapshot',
    {
      preHandler: [
        trustedOrigin,
        auth,
        requirePermission('historico_grupos.create'),
      ],
    },
    async (request, reply) => {
      const result = await options.service.createManual(
        authenticatedContext(request),
        groupParams.parse(request.params).grupoId,
        createGrupoSnapshotRequestSchema.parse(request.body).idempotencyKey,
        metadata(request),
      );
      return reply.code(201).send(grupoSnapshotSchema.parse(result));
    },
  );
  app.get(
    '/grupos/:grupoId/historico/series',
    { preHandler: [auth, requirePermission('historico_grupos.read')] },
    async (request) =>
      grupoHistoricoSeriesSchema.parse(
        await options.service.series(
          authenticatedContext(request),
          groupParams.parse(request.params).grupoId,
        ),
      ),
  );
  app.get(
    '/grupos/:grupoId/historico/:snapshotId',
    { preHandler: [auth, requirePermission('historico_grupos.read')] },
    async (request) => {
      const params = snapshotParams.parse(request.params);
      return grupoSnapshotSchema.parse(
        await options.service.get(
          authenticatedContext(request),
          params.grupoId,
          params.snapshotId,
        ),
      );
    },
  );
};
