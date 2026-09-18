import {
  commercialConfigurationSchema,
  createProductCommercialRuleRequestSchema,
  productCommercialRuleListQuerySchema,
  productCommercialRuleListResponseSchema,
  productCommercialRuleSchema,
  updateCommercialConfigurationRequestSchema,
  updateProductCommercialRuleRequestSchema,
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
import type { CommercialConfigurationsService } from './commercial-configurations.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: CommercialConfigurationsService;
}
const idParams = z.object({ id: z.uuid() });
const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const commercialConfigurationRoutes: FastifyPluginAsync<
  Options
> = async (app, options) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  app.get(
    '/',
    { preHandler: [auth, requirePermission('commercial_config.read')] },
    async () =>
      commercialConfigurationSchema.parse(
        await options.service.getConfiguration(),
      ),
  );
  app.patch(
    '/',
    {
      preHandler: [origin, auth, requirePermission('commercial_config.update')],
    },
    async (request) =>
      commercialConfigurationSchema.parse(
        await options.service.updateConfiguration(
          authenticatedContext(request),
          updateCommercialConfigurationRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
};

export const productCommercialRulesRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  app.get(
    '/',
    { preHandler: [auth, requirePermission('commercial_rules.read')] },
    async (request) =>
      productCommercialRuleListResponseSchema.parse(
        await options.service.listRules(
          productCommercialRuleListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/',
    {
      preHandler: [origin, auth, requirePermission('commercial_rules.manage')],
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          productCommercialRuleSchema.parse(
            await options.service.createRule(
              authenticatedContext(request),
              createProductCommercialRuleRequestSchema.parse(request.body),
              requestMetadata(request),
            ),
          ),
        ),
  );
  app.get(
    '/:id',
    { preHandler: [auth, requirePermission('commercial_rules.read')] },
    async (request) =>
      productCommercialRuleSchema.parse(
        await options.service.getRule(idParams.parse(request.params).id),
      ),
  );
  app.patch(
    '/:id',
    {
      preHandler: [origin, auth, requirePermission('commercial_rules.manage')],
    },
    async (request) =>
      productCommercialRuleSchema.parse(
        await options.service.updateRule(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          updateProductCommercialRuleRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.delete(
    '/:id',
    {
      preHandler: [origin, auth, requirePermission('commercial_rules.manage')],
    },
    async (request, reply) => {
      await options.service.deleteRule(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        requestMetadata(request),
      );
      return reply.code(204).send();
    },
  );
};
