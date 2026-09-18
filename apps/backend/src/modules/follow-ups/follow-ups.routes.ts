import {
  createFollowUpRequestSchema,
  followUpListQuerySchema,
  followUpListResponseSchema,
  followUpSchema,
  setFollowUpStatusRequestSchema,
  updateFollowUpRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { FollowUpsService } from './follow-ups.service.js';

const idParams = z.object({ id: z.uuid() });

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: FollowUpsService;
}

export const followUpsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);

  app.get('/', { preHandler: [auth] }, async (request) =>
    followUpListResponseSchema.parse(
      await options.service.list(
        authenticatedContext(request),
        followUpListQuerySchema.parse(request.query),
      ),
    ),
  );

  app.post(
    '/',
    { preHandler: [origin, auth] },
    async (request, reply) =>
      reply.code(201).send(
        followUpSchema.parse(
          await options.service.create(
            authenticatedContext(request),
            createFollowUpRequestSchema.parse(request.body),
          ),
        ),
      ),
  );

  app.get('/:id', { preHandler: [auth] }, async (request) =>
    followUpSchema.parse(
      await options.service.get(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );

  app.patch('/:id', { preHandler: [origin, auth] }, async (request) =>
    followUpSchema.parse(
      await options.service.update(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        updateFollowUpRequestSchema.parse(request.body),
      ),
    ),
  );

  app.post('/:id/status', { preHandler: [origin, auth] }, async (request) =>
    followUpSchema.parse(
      await options.service.setStatus(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        setFollowUpStatusRequestSchema.parse(request.body),
      ),
    ),
  );
};
