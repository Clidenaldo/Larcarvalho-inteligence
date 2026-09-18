import type { FastifyServerOptions } from 'fastify';

import type { AppConfig } from './env.js';

export function createLoggerOptions(
  config: AppConfig,
): NonNullable<FastifyServerOptions['logger']> {
  return {
    base: {
      environment: config.NODE_ENV,
      service: 'backend',
    },
    level: config.LOG_LEVEL,
    redact: {
      censor: '[REDACTED]',
      paths: [
        "req.headers['x-api-key']",
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.password',
        'req.body.passwordHash',
        'req.headers.authorization',
        'req.headers.cookie',
        "res.headers['set-cookie']",
      ],
    },
  };
}
