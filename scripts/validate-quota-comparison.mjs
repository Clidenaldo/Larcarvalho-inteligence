import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';

// Disposable database only. Never clean or reuse an existing local database.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env'), quiet: true });
const source = new URL(process.env.TEST_DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(source.hostname))
  throw new Error('A local TEST_DATABASE_URL is required');
source.hostname = '127.0.0.1';
const name = 'larcarvalho_comparison_validation';
source.pathname = `/${name}`;
const target = source.toString();
source.pathname = '/postgres';
const client = new pg.Client({ connectionString: source.toString() });
const require = createRequire(import.meta.url);
const npmCli =
  process.env.npm_execpath ??
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const npm = require.resolve(npmCli);
const run = (args) => {
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: target, TEST_DATABASE_URL: target },
  });
  if (result.error || result.status !== 0)
    throw new Error(`Validation failed: npm ${args.join(' ')}`);
};
await client.connect();
let created = false;
try {
  if (
    (await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]))
      .rowCount
  ) {
    throw new Error(
      'Validation database already exists; refusing reuse or deletion',
    );
  }
  await client.query('CREATE DATABASE larcarvalho_comparison_validation');
  created = true;
  run(['run', 'prisma:migrate:deploy']);
  run([
    'run',
    'test:integration',
    '--workspace',
    '@larcarvalho/backend',
    '--',
    'test/integration/simulations.spec.ts',
    'test/integration/comparador.spec.ts',
  ]);
  run([
    'run',
    'e2e',
    '--',
    '--config',
    'playwright.quota-comparison.config.ts',
  ]);
} finally {
  if (created)
    await client.query(
      'DROP DATABASE larcarvalho_comparison_validation WITH (FORCE)',
    );
  await client.end();
}
