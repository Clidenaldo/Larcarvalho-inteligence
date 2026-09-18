import {
  createCommissionRequestSchema,
  createCommissionRuleRequestSchema,
  commissionListQuerySchema,
  commissionListResponseSchema,
  commissionRuleListQuerySchema,
  commissionRuleListResponseSchema,
  commissionSchema,
  confirmCommissionRequestSchema,
  receiveCommissionRequestSchema,
  reverseCommissionRequestSchema,
  updateCommissionRuleRequestSchema,
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
import type { CommissionsService } from './commissions.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: CommissionsService;
}
const idParams = z.object({ id: z.uuid() });
const saleParams = z.object({ saleId: z.uuid() });
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
});

export const commissionsRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const auth = createAuthenticateRequest(options.identityService, options.config);
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/', { preHandler: [auth] }, async (request) =>
    commissionListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        commissionListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.post(
    '/sales/:saleId/commissions',
    { preHandler: [origin, auth, requirePermission('commissions.create')] },
    async (request, reply) =>
      reply.code(201).send(
        commissionSchema.parse(
          await options.service.create(
            authenticatedContext(request),
            saleParams.parse(request.params).saleId,
            createCommissionRequestSchema.parse(request.body),
            requestMetadata(request),
          ),
        ),
      ),
  );
  app.post(
    '/:id/confirm',
    { preHandler: [origin, auth, requirePermission('commissions.confirm')] },
    async (request) =>
      commissionSchema.parse(
        await options.service.confirm(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          confirmCommissionRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.post(
    '/:id/receive',
    { preHandler: [origin, auth, requirePermission('commissions.receive')] },
    async (request) =>
      commissionSchema.parse(
        await options.service.receive(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          receiveCommissionRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.post(
    '/:id/reverse',
    { preHandler: [origin, auth, requirePermission('commissions.reverse')] },
    async (request) =>
      z.object({ original: commissionSchema, estorno: commissionSchema }).parse(
        await options.service.reverse(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          reverseCommissionRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.post(
    '/:id/cancel',
    { preHandler: [origin, auth, requirePermission('commissions.create')] },
    async (request) =>
      commissionSchema.parse(
        await options.service.cancel(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          requestMetadata(request),
        ),
      ),
  );
};

export const commissionRulesRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const auth = createAuthenticateRequest(options.identityService, options.config);
  const origin = createRequireTrustedOrigin(options.config);
  app.get('/', { preHandler: [auth] }, async (request) =>
    commissionRuleListResponseSchema.parse(
      await options.service.listRules(
        authenticatedContext(request),
        commissionRuleListQuerySchema.parse(request.query),
      ),
    ),
  );
  app.post(
    '/',
    { preHandler: [origin, auth, requirePermission('commission_rules.manage')] },
    async (request, reply) =>
      reply.code(201).send(
        await options.service.createRule(
          authenticatedContext(request),
          createCommissionRuleRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.patch(
    '/:id',
    { preHandler: [origin, auth, requirePermission('commission_rules.manage')] },
    async (request) =>
      await options.service.updateRule(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateCommissionRuleRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
  );
};
