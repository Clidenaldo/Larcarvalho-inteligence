import {
  customer360ResponseSchema,
  customerTimelineResponseSchema,
  myFollowUpsResponseSchema,
  portfolioSummarySchema,
  walletQuerySchema,
  walletResponseSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { PortfolioService } from './portfolio.service.js';

const idParams = z.object({ id: z.uuid() });
const timelineQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: PortfolioService;
}

export const portfolioRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );

  app.get('/summary', { preHandler: [auth] }, async (request) =>
    portfolioSummarySchema.parse(
      await options.service.summary(authenticatedContext(request)),
    ),
  );

  app.get('/follow-ups/my', { preHandler: [auth] }, async (request) =>
    myFollowUpsResponseSchema.parse(
      await options.service.myFollowUps(authenticatedContext(request)),
    ),
  );

  app.get('/wallet', { preHandler: [auth] }, async (request) =>
    walletResponseSchema.parse(
      await options.service.wallet(
        authenticatedContext(request),
        walletQuerySchema.parse(request.query),
      ),
    ),
  );

  app.get('/leads/:id/timeline', { preHandler: [auth] }, async (request) => {
    const query = timelineQuery.parse(request.query);
    return customerTimelineResponseSchema.parse(
      await options.service.timeline(
        authenticatedContext(request),
        idParams.parse(request.params).id,
        query.page,
        query.pageSize,
      ),
    );
  });

  app.get('/leads/:id/overview', { preHandler: [auth] }, async (request) =>
    customer360ResponseSchema.parse(
      await options.service.customer360(
        authenticatedContext(request),
        idParams.parse(request.params).id,
      ),
    ),
  );
};
