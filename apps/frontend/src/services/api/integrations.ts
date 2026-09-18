import {
  integrationListResponseSchema,
  integrationLogListResponseSchema,
  integrationRunListResponseSchema,
  integrationSchema,
  type IntegrationListQuery,
  type IntegrationRunListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';
function query(value: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && item !== '') params.set(key, String(item));
  return params.toString();
}
async function request(path: string) {
  const config = getFrontendConfig();
  const store = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: store.toString() },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
}
function failure(response: Response): Failure | null {
  return response.status === 401
    ? 'unauthorized'
    : response.status === 403
      ? 'forbidden'
      : response.status === 404
        ? 'not-found'
        : null;
}
export async function getIntegrations(value: IntegrationListQuery) {
  const response = await request(`/api/v1/integrations?${query(value)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar integrações');
  return integrationListResponseSchema.parse(await response.json());
}
export async function getIntegration(id: string) {
  const response = await request(`/api/v1/integrations/${id}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar integração');
  return integrationSchema.parse(await response.json());
}
export async function getIntegrationRuns(
  id: string,
  value: IntegrationRunListQuery,
) {
  const response = await request(
    `/api/v1/integrations/${id}/runs?${query(value)}`,
  );
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar execuções');
  return integrationRunListResponseSchema.parse(await response.json());
}
export async function getIntegrationLogs(
  id: string,
  value: IntegrationRunListQuery,
) {
  const response = await request(
    `/api/v1/integrations/${id}/logs?${query(value)}`,
  );
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar logs');
  return integrationLogListResponseSchema.parse(await response.json());
}
