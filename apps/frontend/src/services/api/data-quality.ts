import {
  dataQualityIssueListResponseSchema,
  dataQualityIssueSchema,
  dataQualitySummarySchema,
  type DataQualityListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';
type Failure = 'forbidden' | 'not-found' | 'unauthorized';
const qs = (value: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && item !== '') params.set(key, String(item));
  return params.toString();
};
async function request(path: string) {
  const config = getFrontendConfig();
  const store = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: store.toString() },
    signal: AbortSignal.timeout(120_000),
  });
}
const failure = (response: Response): Failure | null =>
  response.status === 401
    ? 'unauthorized'
    : response.status === 403
      ? 'forbidden'
      : response.status === 404
        ? 'not-found'
        : null;
export async function getDataQualityIssues(query: DataQualityListQuery) {
  const response = await request(`/api/v1/data-quality/issues?${qs(query)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar qualidade dos dados');
  return dataQualityIssueListResponseSchema.parse(await response.json());
}
export async function getDataQualityIssue(id: string) {
  const response = await request(`/api/v1/data-quality/issues/${id}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar problema');
  return dataQualityIssueSchema.parse(await response.json());
}
export async function getDataQualitySummary() {
  const response = await request('/api/v1/data-quality/summary');
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar indicadores');
  return dataQualitySummarySchema.parse(await response.json());
}
