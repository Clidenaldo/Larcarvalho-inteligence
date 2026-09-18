import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnvironment({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const datasource = process.env.DATABASE_URL
  ? { datasource: { url: process.env.DATABASE_URL } }
  : {};

export default defineConfig({
  ...datasource,
  migrations: {
    path: '../../database/prisma/migrations',
  },
  schema: '../../database/prisma/schema.prisma',
});
