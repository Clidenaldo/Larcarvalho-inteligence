import { commercialIntelligenceQuerySchema, commercialIntelligenceSchema } from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { authenticatedContext, createAuthenticateRequest } from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { CommercialIntelligenceService } from './commercial-intelligence.service.js';

export const commercialIntelligenceRoutes: FastifyPluginAsync<{ config: AppConfig; identityService: IdentityService; service: CommercialIntelligenceService }> = async (app, options) => {
  const auth = createAuthenticateRequest(options.identityService, options.config);
  app.get('/overview', { preHandler: [auth] }, async (request) => commercialIntelligenceSchema.parse(
    await options.service.overview(authenticatedContext(request), commercialIntelligenceQuerySchema.parse(request.query)),
  ));
};
