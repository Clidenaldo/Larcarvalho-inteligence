import {
  dashboardOverviewSchema,
  dashboardQuerySchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { DashboardService } from './dashboard.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: DashboardService;
}

export const dashboardRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  app.get('/overview', { preHandler: [auth] }, async (request) =>
    dashboardOverviewSchema.parse(
      await options.service.overview(
        authenticatedContext(request),
        dashboardQuerySchema.parse(request.query),
      ),
    ),
  );
};
