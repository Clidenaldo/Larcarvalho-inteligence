import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/env.js';
import { AppError } from '../core/errors/app-error.js';

export async function registerSecurityPlugins(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  await app.register(helmet, {
    global: true,
  });

  await app.register(cookie, {
    hook: 'onRequest',
  });

  await app.register(rateLimit, {
    errorResponseBuilder: () =>
      new AppError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Muitas tentativas. Tente novamente mais tarde',
        statusCode: 429,
      }),
    global: false,
  });

  await app.register(cors, {
    credentials: true,
    maxAge: 600,
    methods: ['GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST'],
    origin: (origin, callback) => {
      const isAllowed = origin === undefined || origin === config.FRONTEND_URL;
      callback(null, isAllowed);
    },
    strictPreflight: true,
  });
}
