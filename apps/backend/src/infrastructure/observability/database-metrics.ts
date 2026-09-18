import { getMetricsRegistry } from './metrics-registry.js';

/**
 * Database Metrics
 * Tracks:
 * - Pool statistics (total, idle, waiting)
 * - Query errors
 * - Query duration
 * - Slow queries
 */

interface PoolMetrics {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

/**
 * Extract the SQL operation type from a query string.
 * Returns a normalized operation name for metric labels.
 */
export function extractSqlOperation(query: string): string {
  const trimmed = query.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('BEGIN')) return 'BEGIN';
  if (trimmed.startsWith('COMMIT')) return 'COMMIT';
  if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
  if (trimmed.startsWith('SAVEPOINT')) return 'SAVEPOINT';
  if (trimmed.startsWith('SET')) return 'SET';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('ALTER')) return 'ALTER';
  if (trimmed.startsWith('DROP')) return 'DROP';
  if (trimmed.startsWith('TRUNCATE')) return 'TRUNCATE';
  if (trimmed.startsWith('WITH')) return 'WITH';
  return 'OTHER';
}

export class DatabaseMetrics {
  constructor(private poolGetter: () => Record<string, unknown> | null) {}

  recordQueryDuration(duration: number, operationName?: string): void {
    const registry = getMetricsRegistry();

    // Overall query duration
    registry.observeHistogram(
      'database_query_duration_seconds',
      duration / 1000,
      'Database query duration in seconds',
    );

    // By operation if provided
    if (operationName) {
      registry.observeHistogram(
        `database_query_duration_by_operation_seconds{operation="${operationName}"}`,
        duration / 1000,
        'Database query duration by operation',
      );
    }
  }

  recordQueryError(operationName?: string): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(
      'database_query_errors_total',
      'Total database query errors',
    );

    if (operationName) {
      registry.incrementCounter(
        `database_query_errors_by_operation_total{operation="${operationName}"}`,
        'Database query errors by operation',
      );
    }
  }

  recordSlowQuery(duration: number, operationName?: string): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(
      'database_slow_queries_total',
      'Slow database queries',
    );

    if (operationName) {
      registry.incrementCounter(
        `database_slow_queries_by_operation_total{operation="${operationName}"}`,
        'Slow queries by operation',
      );
    }
  }

  updatePoolMetrics(): void {
    const registry = getMetricsRegistry();
    const pool = this.poolGetter();

    if (!pool) return;

    try {
      // Try to get pool stats (varies by pg version and driver)
      const totalCount = (pool.totalCount as number) ?? 0;
      const idleCount = (pool.idleCount as number) ?? 0;
      const waitingCount = (pool.waitingCount as number) ?? 0;

      registry.setGauge(
        'database_pool_total',
        totalCount,
        'Total database connections in pool',
      );

      registry.setGauge(
        'database_pool_idle',
        idleCount,
        'Idle database connections',
      );

      registry.setGauge(
        'database_pool_waiting',
        waitingCount,
        'Waiting database connections',
      );
    } catch {
      // Pool stats not available in this driver version
    }
  }

  getPoolMetrics(): PoolMetrics | null {
    const pool = this.poolGetter();
    if (!pool) return null;

    try {
      return {
        totalCount: (pool.totalCount as number) ?? 0,
        idleCount: (pool.idleCount as number) ?? 0,
        waitingCount: (pool.waitingCount as number) ?? 0,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Periodically update pool metrics
 * Run this on an interval (e.g., every 10 seconds)
 */
export function startPoolMetricsInterval(
  dbMetrics: DatabaseMetrics,
  intervalMs = 10_000,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    dbMetrics.updatePoolMetrics();
  }, intervalMs);
}

export function stopPoolMetricsInterval(
  timer: ReturnType<typeof setInterval> | null,
): void {
  if (timer) {
    clearInterval(timer);
  }
}
