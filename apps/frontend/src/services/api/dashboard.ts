import {
  dashboardOverviewSchema,
  type DashboardQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

export async function getDashboardOverview(query: DashboardQuery) {
  const config = getFrontendConfig();
  const store = await cookies();
  const params = new URLSearchParams({ period: query.period });
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.responsibleId) params.set('responsibleId', query.responsibleId);
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/dashboard/overview?${params}`,
    {
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: store.toString() },
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    },
  );
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Falha ao carregar o dashboard');
  return dashboardOverviewSchema.parse(await response.json());
}
