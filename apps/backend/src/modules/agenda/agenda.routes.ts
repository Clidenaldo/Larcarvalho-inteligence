import { agendaQuerySchema, agendaResponseSchema } from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { AgendaService } from './agenda.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: AgendaService;
}

export const agendaRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );

  app.get('/', { preHandler: [auth] }, async (request) =>
    agendaResponseSchema.parse(
      await options.service.getAgenda(
        authenticatedContext(request),
        agendaQuerySchema.parse(request.query),
      ),
    ),
  );

  app.get('/team', { preHandler: [auth] }, async (request) =>
    agendaResponseSchema.parse(
      await options.service.getTeamAgenda(
        authenticatedContext(request),
        agendaQuerySchema.parse(request.query),
      ),
    ),
  );
};
