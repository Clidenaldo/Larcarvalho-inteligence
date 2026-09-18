import {
  assignSaleRequestSchema,
  cancelSaleRequestSchema,
  changeSaleStatusRequestSchema,
  createSaleRequestSchema,
  saleListQuerySchema,
  saleListResponseSchema,
  saleSchema,
  updateDocumentStatusRequestSchema,
  updateSaleRequestSchema,
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
import type { SalesService } from './sales.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: SalesService;
}
const idParams = z.object({ id: z.uuid() });
const docParams = z.object({ saleId: z.uuid(), documentId: z.uuid() });
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
});

const saleDetailSchema = saleSchema.extend({
  contracts: z.array(z.unknown()),
  documents: z.array(z.unknown()),
  commissions: z.array(z.unknown()),
  commissionsHidden: z.boolean(),
  statusHistory: z.array(z.unknown()),
  auditTrail: z.array(z.unknown()),
});

export const salesRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const auth = createAuthenticateRequest(options.identityService, options.config);
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/', { preHandler: [auth] }, async (request) =>
    saleListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        saleListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.get('/:id', { preHandler: [auth] }, async (request) =>
    saleDetailSchema.parse(
      await options.service.get(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
  app.post(
    '/',
    { preHandler: [origin, auth, requirePermission('sales.create')] },
    async (request, reply) =>
      reply.code(201).send(
        saleSchema.parse(
          await options.service.createFromProposal(
            authenticatedContext(request),
            createSaleRequestSchema.parse(request.body),
            requestMetadata(request),
          ),
        ),
      ),
  );
  app.patch('/:id', { preHandler: [origin, auth] }, async (request) =>
    saleSchema.parse(
      await options.service.update(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateSaleRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.post('/:id/status', { preHandler: [origin, auth] }, async (request) =>
    saleSchema.parse(
      await options.service.changeStatus(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        changeSaleStatusRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.post(
    '/:id/assign',
    { preHandler: [origin, auth, requirePermission('sales.assign')] },
    async (request) =>
      saleSchema.parse(
        await options.service.assign(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          assignSaleRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.post(
    '/:id/cancel',
    { preHandler: [origin, auth, requirePermission('sales.cancel')] },
    async (request) =>
      saleSchema.parse(
        await options.service.cancel(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          cancelSaleRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.patch('/:saleId/documents/:documentId', { preHandler: [origin, auth] }, async (request) =>
    z.unknown().parse(
      await options.service.updateDocument(
        authenticatedContext(request),
        docParams.parse(request.params).saleId,
        docParams.parse(request.params).documentId,
        updateDocumentStatusRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
};
