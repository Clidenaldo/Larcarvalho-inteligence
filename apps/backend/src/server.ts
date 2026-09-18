import type { FastifyInstance } from 'fastify';

import './config/load-env.js';
import { assertE2eDatabase } from './config/e2e-safety.js';
import { buildApp } from './app.js';
import {
  EnvironmentConfigurationError,
  parseEnvironment,
} from './config/env.js';
import { createDatabaseRuntime } from './infrastructure/database/prisma-client.js';

async function startServer(): Promise<void> {
  let app: FastifyInstance | undefined;

  try {
    const config = parseEnvironment();
    assertE2eDatabase(process.env.E2E_TEST, config.DATABASE_URL);
    const database = createDatabaseRuntime(config);
    app = await buildApp({
      config,
      readinessProbes: [database.readinessProbe],
    });
    app.addHook('onClose', database.disconnect);

    await app.listen({
      host: config.BACKEND_HOST,
      port: config.BACKEND_PORT,
    });

    const closeGracefully = async (signal: string) => {
      app?.log.info({ signal }, 'Stopping backend');
      await app?.close();
    };

    process.once('SIGINT', () => void closeGracefully('SIGINT'));
    process.once('SIGTERM', () => void closeGracefully('SIGTERM'));
  } catch (error) {
    if (app) {
      app.log.fatal({ err: error }, 'Unable to start backend');
    } else {
      const message =
        error instanceof EnvironmentConfigurationError
          ? error.message
          : 'Unable to initialize backend';
      process.stderr.write(`${message}\n`);
    }

    process.exitCode = 1;
  }
}

await startServer();
