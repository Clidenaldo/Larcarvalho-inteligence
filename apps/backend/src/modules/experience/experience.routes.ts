import {
  adminThemeSchema,
  updateAdminThemeSchema,
  publicThemeSchema,
  updatePublicThemeSchema,
  appearanceConfigurationSchema,
  myAccountSchema,
  updateAppearanceConfigurationRequestSchema,
  updateMyAccountRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { ExperienceService } from './experience.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: ExperienceService;
}

const requestMetadata = (request: FastifyRequest) => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const appearanceRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);

  // Every authenticated role needs the admin palette to render its own shell.
  app.get('/admin-theme', { preHandler: [auth] }, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return adminThemeSchema.parse(await options.service.getAdminTheme());
  });
  app.patch(
    '/admin-theme',
    {
      preHandler: [origin, auth, requirePermission('themes.admin.manage')],
    },
    async (request) =>
      adminThemeSchema.parse(
        await options.service.updateAdminTheme(
          authenticatedContext(request),
          updateAdminThemeSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
  app.post(
    '/admin-theme/reset',
    {
      preHandler: [origin, auth, requirePermission('themes.admin.manage')],
    },
    async (request) =>
      adminThemeSchema.parse(
        await options.service.updateAdminTheme(
          authenticatedContext(request),
          {},
          requestMetadata(request),
          true,
        ),
      ),
  );
  app.post(
    '/public-theme/reset',
    {
      preHandler: [origin, auth, requirePermission('themes.public.manage')],
    },
    async (request) =>
      publicThemeSchema.parse(
        await options.service.updatePublicTheme(
          authenticatedContext(request),
          {},
          requestMetadata(request),
          true,
        ),
      ),
  );

  app.get(
    '/public-theme',
    {
      preHandler: [auth, requirePermission('themes.public.manage')],
    },
    async (_request, reply) => {
      reply.header('cache-control', 'no-store');
      return publicThemeSchema.parse(await options.service.getPublicTheme());
    },
  );
  app.patch(
    '/public-theme',
    {
      preHandler: [origin, auth, requirePermission('themes.public.manage')],
    },
    async (request) =>
      publicThemeSchema.parse(
        await options.service.updatePublicTheme(
          authenticatedContext(request),
          updatePublicThemeSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );

  app.get('/', { preHandler: [auth] }, async () =>
    appearanceConfigurationSchema.parse(await options.service.getAppearance()),
  );

  app.patch(
    '/',
    {
      preHandler: [origin, auth, requirePermission('themes.admin.manage')],
    },
    async (request) =>
      appearanceConfigurationSchema.parse(
        await options.service.updateAppearance(
          authenticatedContext(request),
          updateAppearanceConfigurationRequestSchema.parse(request.body),
          requestMetadata(request),
        ),
      ),
  );
};

export const accountRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);

  app.get('/', { preHandler: [auth] }, async (request) =>
    myAccountSchema.parse(
      await options.service.getAccount(authenticatedContext(request)),
    ),
  );

  app.patch('/', { preHandler: [origin, auth] }, async (request) =>
    myAccountSchema.parse(
      await options.service.updateAccount(
        authenticatedContext(request),
        updateMyAccountRequestSchema.parse(request.body),
        requestMetadata(request),
      ),
    ),
  );
};

export const publicThemeRoutes: FastifyPluginAsync<{
  service: ExperienceService;
}> = async (app, options) => {
  app.get('/', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return publicThemeSchema.parse(await options.service.getPublicTheme());
  });
};
