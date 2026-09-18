import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import type { AppConfig } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { ReadinessProbe } from '../../core/readiness/readiness-probe.js';
import { createDatabaseReadinessProbe } from './database-health.js';
import {
  DatabaseMetrics,
  extractSqlOperation,
} from '../observability/database-metrics.js';

let prismaClient: PrismaClient | undefined;
let prismaPool: pg.Pool | undefined;
let dbMetrics: DatabaseMetrics | null = null;

function createPool(config: AppConfig): pg.Pool {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
  }

  const databaseUrl = new URL(config.DATABASE_URL);
  databaseUrl.searchParams.delete('schema');

  return new pg.Pool({
    connectionString: databaseUrl.toString(),
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
    max: config.DATABASE_POOL_MAX,
  });
}

function createAdapter(config: AppConfig, pool: pg.Pool): PrismaPg {
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to initialize Prisma');
  }

  const databaseUrl = new URL(config.DATABASE_URL);
  const schema = databaseUrl.searchParams.get('schema') ?? 'public';

  return new PrismaPg(pool, { schema });
}

export function createPrismaClient(config: AppConfig): PrismaClient {
  const pool = createPool(config);
  prismaPool = pool;

  const adapter = createAdapter(config, pool);

  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });

  // Instrument real queries with database metrics
  const metrics = getDatabaseMetrics();
  if (metrics) {
    client.$on('query', (event) => {
      const operation = extractSqlOperation(event.query);
      metrics.recordQueryDuration(event.duration, operation);

      if (event.duration > config.SLOW_DATABASE_QUERY_THRESHOLD_MS) {
        metrics.recordSlowQuery(event.duration, operation);
      }
    });
  }

  return client;
}

export function getPrismaClient(config: AppConfig): PrismaClient {
  prismaClient ??= createPrismaClient(config);
  return prismaClient;
}

/**
 * Get the DatabaseMetrics instance connected to the real pool.
 * Returns null when no database is configured.
 */
export function getDatabaseMetrics(): DatabaseMetrics | null {
  if (!prismaPool) {
    return null;
  }

  dbMetrics ??= new DatabaseMetrics(() => {
    try {
      return prismaPool as unknown as Record<string, unknown> | null;
    } catch {
      return null;
    }
  });

  return dbMetrics;
}

/**
 * Update pool metrics on-demand (e.g., before exporting /metrics).
 */
export function updateDatabasePoolMetrics(): void {
  getDatabaseMetrics()?.updatePoolMetrics();
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = undefined;
  prismaPool = undefined;
  dbMetrics = null;
}

export interface DatabaseRuntime {
  readonly disconnect: () => Promise<void>;
  readonly readinessProbe: ReadinessProbe;
}

export function createDatabaseRuntime(config: AppConfig): DatabaseRuntime {
  const dbUrl = config.DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    return {
      disconnect: async () => undefined,
      readinessProbe: {
        name: 'postgresql',
        check: async () => false,
      },
    };
  }

  const resolvedConfig = { ...config, DATABASE_URL: dbUrl };
  const client = getPrismaClient(resolvedConfig);

  return {
    disconnect: disconnectPrismaClient,
    readinessProbe: createDatabaseReadinessProbe(
      async () => client.$queryRaw`SELECT 1 AS result`,
    ),
  };
}
