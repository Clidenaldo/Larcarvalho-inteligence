import type { ReadinessProbe } from '../../core/readiness/readiness-probe.js';

export type DatabaseHealthQuery = () => Promise<unknown>;

export async function checkDatabaseHealth(
  executeHealthQuery: DatabaseHealthQuery,
): Promise<boolean> {
  try {
    await executeHealthQuery();
    return true;
  } catch {
    return false;
  }
}

export function createDatabaseReadinessProbe(
  executeHealthQuery: DatabaseHealthQuery,
): ReadinessProbe {
  return {
    name: 'postgresql',
    check: async () => checkDatabaseHealth(executeHealthQuery),
  };
}
