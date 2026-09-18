import {
  authResponseSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import { permissionsForRole, permissionsForActor } from '../../core/auth/rbac.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  sessionCookieName,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';

interface AuthRoutesOptions {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
}

function requestMetadata(request: FastifyRequest): {
  ipAddress: string;
  userAgent?: string;
} {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const authenticate = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const trustedOrigin = createRequireTrustedOrigin(options.config);
  const cookieName = sessionCookieName(options.config);
  const cookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: 'strict' as const,
    secure: options.config.NODE_ENV === 'production',
  };

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: options.config.AUTH_LOGIN_RATE_LIMIT_MAX,
          timeWindow: options.config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        },
      },
      preHandler: trustedOrigin,
    },
    async (request, reply) => {
      const input = loginRequestSchema.parse(request.body);
      const result = await options.identityService.login(
        input.email,
        input.password,
        requestMetadata(request),
      );

      reply.setCookie(cookieName, result.token, {
        ...cookieOptions,
        expires: result.expiresAt,
        maxAge: options.config.AUTH_SESSION_TTL_HOURS * 60 * 60,
      });
      return authResponseSchema.parse({
        permissions: result.permissions ?? permissionsForRole(result.user.role),
        user: result.user,
      });
    },
  );

  app.get('/me', { preHandler: authenticate }, async (request) => {
    const user = authenticatedContext(request).user;
    return authResponseSchema.parse({
      permissions: permissionsForActor(authenticatedContext(request)),
      user,
    });
  });

  app.post('/logout', { preHandler: trustedOrigin }, async (request, reply) => {
    const auth = await options.identityService.authenticate(
      request.cookies[cookieName],
    );
    if (auth) {
      await options.identityService.logout(auth, requestMetadata(request));
    }
    reply.clearCookie(cookieName, cookieOptions);
    await reply.code(204).send();
  });

  app.post(
    '/change-password',
    { preHandler: [trustedOrigin, authenticate] },
    async (request, reply) => {
      const input = changePasswordRequestSchema.parse(request.body);
      await options.identityService.changePassword(
        authenticatedContext(request),
        input.currentPassword,
        input.newPassword,
        requestMetadata(request),
      );
      await reply.code(204).send();
    },
  );
};
