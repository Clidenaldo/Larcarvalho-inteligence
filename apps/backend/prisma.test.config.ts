import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnvironment({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for integration migrations');
}

const parsedUrl = new URL(testDatabaseUrl);
const databaseName = parsedUrl.pathname.slice(1);

if (
  !['127.0.0.1', 'localhost'].includes(parsedUrl.hostname) ||
  databaseName !== 'larcarvalho_test'
) {
  throw new Error(
    'TEST_DATABASE_URL must target the local larcarvalho_test database',
  );
}

export default defineConfig({
  datasource: { url: testDatabaseUrl },
  migrations: {
    path: '../../database/prisma/migrations',
  },
  schema: '../../database/prisma/schema.prisma',
});
