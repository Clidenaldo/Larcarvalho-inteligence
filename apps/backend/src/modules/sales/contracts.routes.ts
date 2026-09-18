import {
  createContractRequestSchema,
  saleContractSchema,
  updateContractRequestSchema,
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
import type { SaleContractsService } from './contracts.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: SaleContractsService;
}
const idParams = z.object({ id: z.uuid() });
const saleParams = z.object({ saleId: z.uuid() });
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
});

export const saleContractsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const auth = createAuthenticateRequest(options.identityService, options.config);
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/sales/:saleId/contracts', { preHandler: [auth] }, async (request) =>
    z.array(saleContractSchema).parse(
      await options.service.list(
        authenticatedContext(request),
        saleParams.parse(request.params).saleId,
      ),
    ),
  );
  app.post(
    '/sales/:saleId/contracts',
    { preHandler: [origin, auth, requirePermission('contracts.create')] },
    async (request, reply) =>
      reply.code(201).send(
        saleContractSchema.parse(
          await options.service.create(
            authenticatedContext(request),
            saleParams.parse(request.params).saleId,
            createContractRequestSchema.parse(request.body),
            requestMetadata(request),
          ),
        ),
      ),
  );
  app.patch(
    '/contracts/:id',
    { preHandler: [origin, auth, requirePermission('contracts.update')] },
    async (request) =>
      saleContractSchema.parse(
        await options.service.update(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          updateContractRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
};
