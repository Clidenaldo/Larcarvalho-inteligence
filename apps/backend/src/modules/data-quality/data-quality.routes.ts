import {
  createManualIssueRequestSchema,
  dataQualityIssueListResponseSchema,
  dataQualityIssueSchema,
  dataQualityListQuerySchema,
  dataQualityScanResultSchema,
  dataQualitySummarySchema,
  ignoreIssueRequestSchema,
  reopenIssueRequestSchema,
  resolveIssueRequestSchema,
  reviewIssueRequestSchema,
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
import type {
  IdentityService,
  RequestMetadata,
} from '../identity/identity.service.js';
import type { DataQualityService } from './data-quality.service.js';

interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: DataQualityService;
}
const params = z.object({ id: z.uuid() });
const metadata = (request: FastifyRequest): RequestMetadata => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});
export const dataQualityRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const secure = (
    permission:
      'data_quality.review' | 'data_quality.resolve' | 'data_quality.scan',
  ) => [origin, auth, requirePermission(permission)];
  const service = options.service;
  app.get(
    '/issues',
    { preHandler: [auth, requirePermission('data_quality.read')] },
    async (request) =>
      dataQualityIssueListResponseSchema.parse(
        await service.list(
          authenticatedContext(request),
          dataQualityListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/issues',
    { preHandler: secure('data_quality.review') },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          dataQualityIssueSchema.parse(
            await service.createManual(
              authenticatedContext(request),
              createManualIssueRequestSchema.parse(request.body),
              metadata(request),
            ),
          ),
        ),
  );
  app.get(
    '/issues/:id',
    { preHandler: [auth, requirePermission('data_quality.read')] },
    async (request) =>
      dataQualityIssueSchema.parse(
        await service.get(
          authenticatedContext(request),
          params.parse(request.params).id,
        ),
      ),
  );
  app.patch(
    '/issues/:id/status',
    { preHandler: secure('data_quality.review') },
    async (request) => {
      const body = reviewIssueRequestSchema.parse(request.body);
      return dataQualityIssueSchema.parse(
        await service.review(
          authenticatedContext(request),
          params.parse(request.params).id,
          body.observacao,
          metadata(request),
        ),
      );
    },
  );
  app.post(
    '/issues/:id/resolve',
    { preHandler: secure('data_quality.resolve') },
    async (request) => {
      const body = resolveIssueRequestSchema.parse(request.body);
      return dataQualityIssueSchema.parse(
        await service.resolve(
          authenticatedContext(request),
          params.parse(request.params).id,
          body.acaoRealizada,
          body.observacao,
          metadata(request),
        ),
      );
    },
  );
  app.post(
    '/issues/:id/ignore',
    { preHandler: secure('data_quality.resolve') },
    async (request) =>
      dataQualityIssueSchema.parse(
        await service.ignore(
          authenticatedContext(request),
          params.parse(request.params).id,
          ignoreIssueRequestSchema.parse(request.body).justificativa,
          metadata(request),
        ),
      ),
  );
  app.post(
    '/issues/:id/reopen',
    { preHandler: secure('data_quality.resolve') },
    async (request) =>
      dataQualityIssueSchema.parse(
        await service.reopen(
          authenticatedContext(request),
          params.parse(request.params).id,
          reopenIssueRequestSchema.parse(request.body).observacao,
          metadata(request),
        ),
      ),
  );
  app.post(
    '/scan',
    { preHandler: secure('data_quality.scan') },
    async (request) =>
      dataQualityScanResultSchema.parse(
        await service.scan(authenticatedContext(request), metadata(request)),
      ),
  );
  app.get(
    '/summary',
    { preHandler: [auth, requirePermission('data_quality.read')] },
    async (request) =>
      dataQualitySummarySchema.parse(
        await service.summary(authenticatedContext(request)),
      ),
  );
};
