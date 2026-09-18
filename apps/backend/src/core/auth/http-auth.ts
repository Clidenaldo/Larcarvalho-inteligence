import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import type { IdentityService } from '../../modules/identity/identity.service.js';
import { AppError } from '../errors/app-error.js';
import type { AuthContext } from './auth-context.js';
import { type Permission } from '@larcarvalho/shared';

import { hasPermission } from './rbac.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export const developmentSessionCookieName = 'larcarvalho_session';
export const productionSessionCookieName = '__Host-larcarvalho_session';

export function sessionCookieName(config: AppConfig): string {
  return config.NODE_ENV === 'production'
    ? productionSessionCookieName
    : developmentSessionCookieName;
}

export function registerAuthContext(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
}

export function createAuthenticateRequest(
  identityService: Pick<IdentityService, 'authenticate'>,
  config: AppConfig,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const cookieName = sessionCookieName(config);

  return async (request): Promise<void> => {
    const auth = await identityService.authenticate(
      request.cookies[cookieName],
    );
    if (!auth) {
      throw new AppError({
        code: 'UNAUTHORIZED',
        message: 'Não autenticado',
        statusCode: 401,
      });
    }
    request.auth = auth;
  };
}

export function requirePermission(
  permission: Permission,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request): Promise<void> => {
    if (!request.auth || !hasPermission(request.auth, permission)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
    }
  };
}

export function createRequireTrustedOrigin(
  config: AppConfig,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const trustedOrigin = new URL(config.FRONTEND_URL).origin;

  return async (request): Promise<void> => {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== trustedOrigin) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Origem da requisição não autorizada',
        statusCode: 403,
      });
    }
  };
}

export function authenticatedContext(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      message: 'Não autenticado',
      statusCode: 401,
    });
  }
  return request.auth;
}
