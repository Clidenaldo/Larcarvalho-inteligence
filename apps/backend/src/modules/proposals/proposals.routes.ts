import {
  createProposalRequestSchema,
  createProposalVersionRequestSchema,
  proposalListQuerySchema,
  proposalListResponseSchema,
  proposalSchema,
  proposalVersionChainSchema,
  updateProposalRequestSchema,
  updateProposalStatusRequestSchema,
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
import type { ProposalsService } from './proposals.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: ProposalsService;
}
const idParams = z.object({ id: z.uuid() });
const pdfQuerySchema = z.object({
  detail: z.enum(['full', 'summary']).default('full'),
});
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const proposalsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/', { preHandler: [auth] }, async (request) =>
    proposalListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        proposalListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.get('/:id', { preHandler: [auth] }, async (request) =>
    proposalSchema.parse(
      await options.service.get(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
  app.patch('/:id/status', { preHandler: [origin, auth] }, async (request) =>
    proposalSchema.parse(
      await options.service.changeStatus(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateProposalStatusRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.patch('/:id', { preHandler: [origin, auth] }, async (request) =>
    proposalSchema.parse(
      await options.service.update(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateProposalRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
  app.post('/:id/versions', { preHandler: [origin, auth] }, async (request, reply) =>
    reply.code(201).send(
      proposalSchema.parse(
        await options.service.createVersion(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          createProposalVersionRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
    ),
  );
  app.get('/:id/versions', { preHandler: [auth] }, async (request) =>
    proposalVersionChainSchema.parse(
      await options.service.versions(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
  app.post(
    '/:id/pdf',
    { preHandler: [origin, auth, requirePermission('proposals.export')] },
    async (request, reply) => {
      const output = await options.service.generatePdf(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
        pdfQuerySchema.parse(request.query ?? {}),
      );
      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          `attachment; filename="${output.filename}"`,
        )
        .header('cache-control', 'private, no-store')
        .send(output.bytes);
    },
  );
  app.post(
    '/:id/print',
    { preHandler: [origin, auth, requirePermission('proposals.export')] },
    async (request, reply) => {
      await options.service.registerPrint(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
      );
      return reply.code(204).send();
    },
  );
  app.delete('/:id', { preHandler: [origin, auth] }, async (request, reply) => {
    await options.service.delete(
      authenticatedContext(request),
      idParams.parse(request.params).id,
      requestMetadata(request),
    );
    return reply.code(204).send();
  });
};

export const simulationProposalsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  app.post(
    '/:id/proposals',
    { preHandler: [origin, auth, requirePermission('proposals.create')] },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          proposalSchema.parse(
            await options.service.create(
              authenticatedContext(request),
              idParams.parse(request.params).id,
              createProposalRequestSchema.parse(request.body),
              requestMetadata(request),
            ),
          ),
        ),
  );
};
