import {
  assignLeadRequestSchema,
  changeLeadStatusRequestSchema,
  createLeadInteractionRequestSchema,
  createLeadInterestRequestSchema,
  createLeadRequestSchema,
  leadDetailSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  publicLeadRequestSchema,
  publicLeadResponseSchema,
  setLeadNextContactRequestSchema,
  updateLeadRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { LeadsService } from './leads.service.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';

const idParams = z.object({ id: z.uuid() });
const interestParams = z.object({ id: z.uuid(), interestId: z.uuid() });
interface Options {
  config: AppConfig;
  identityService: IdentityService;
  service: LeadsService;
}

export const publicLeadsRoutes: FastifyPluginAsync<{
  config: AppConfig;
  service: LeadsService;
}> = async (app, options) => {
  // A captura pública usa um limite menor que o limite global da API.
  app.post(
    '/',
    {
      bodyLimit: 16_384,
      config: {
        rateLimit: {
          max: options.config.PUBLIC_LEAD_RATE_LIMIT_MAX,
          timeWindow: options.config.PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS,
        },
      },
    },
    async (request, reply) => {
      const input = publicLeadRequestSchema.parse(request.body);
      try {
        await options.service.capturePublic(input);
        getBusinessMetrics().recordPublicLeadAttempt('accepted');
      } catch (error) {
        getBusinessMetrics().recordPublicLeadAttempt('failed');
        throw error;
      }
      request.log.info(
        {
          event: 'public_lead_received',
          requestId: request.id,
          honeypot: Boolean(input.website),
        },
        'Public lead request processed',
      );
      return reply.code(202).send(
        publicLeadResponseSchema.parse({
          message:
            'Recebemos sua solicitação. Nossa equipe poderá entrar em contato pelos dados informados.',
        }),
      );
    },
  );
};

export const leadsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const mutate = [origin, auth];
  app.get('/', { preHandler: [auth] }, async (request) =>
    leadListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        leadListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.post(
    '/',
    { preHandler: [origin, auth, requirePermission('leads.create')] },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          leadDetailSchema.parse(
            await options.service.create(
              authenticatedContext(request),
              createLeadRequestSchema.parse(request.body),
            ),
          ),
        ),
  );
  app.get('/:id', { preHandler: [auth] }, async (request) =>
    leadDetailSchema.parse(
      await options.service.get(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
  app.patch('/:id', { preHandler: mutate }, async (request) =>
    leadDetailSchema.parse(
      await options.service.update(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateLeadRequestSchema.parse(request.body),
      ),
    ),
  );
  app.post(
    '/:id/assign',
    { preHandler: [origin, auth, requirePermission('leads.assign')] },
    async (request) =>
      leadDetailSchema.parse(
        await options.service.assign(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          assignLeadRequestSchema.parse(request.body),
        ),
      ),
  );
  app.post(
    '/:id/status',
    { preHandler: [origin, auth, requirePermission('leads.change_status')] },
    async (request) =>
      leadDetailSchema.parse(
        await options.service.changeStatus(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          changeLeadStatusRequestSchema.parse(request.body),
        ),
      ),
  );
  app.post(
    '/:id/interacoes',
    { preHandler: [origin, auth, requirePermission('leads.add_interaction')] },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          leadDetailSchema.parse(
            await options.service.interact(
              authenticatedContext(request),
              idParams.parse(request.params).id,
              createLeadInteractionRequestSchema.parse(request.body),
            ),
          ),
        ),
  );
  app.post('/:id/interesses', { preHandler: mutate }, async (request, reply) =>
    reply
      .code(201)
      .send(
        leadDetailSchema.parse(
          await options.service.addInterest(
            authenticatedContext(request),
            idParams.parse(request.params).id,
            createLeadInterestRequestSchema.parse(request.body),
          ),
        ),
      ),
  );
  app.delete(
    '/:id/interesses/:interestId',
    { preHandler: mutate },
    async (request) => {
      const params = interestParams.parse(request.params);
      return leadDetailSchema.parse(
        await options.service.removeInterest(
          authenticatedContext(request),
          params.id,
          params.interestId,
        ),
      );
    },
  );
  app.patch('/:id/proximo-contato', { preHandler: mutate }, async (request) =>
    leadDetailSchema.parse(
      await options.service.nextContact(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        setLeadNextContactRequestSchema.parse(request.body),
      ),
    ),
  );
};
