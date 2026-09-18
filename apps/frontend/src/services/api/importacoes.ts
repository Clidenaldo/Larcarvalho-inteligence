import {
  importacaoIssueListResponseSchema,
  importacaoListResponseSchema,
  importacaoSchema,
  type ImportacaoIssueQuery,
  type ImportacaoListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';
function query(value: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [key, item] of Object.entries(value))
    if (item !== undefined && item !== '') p.set(key, String(item));
  return p.toString();
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
export async function getImportacoes(value: ImportacaoListQuery) {
  const response = await request(`/api/v1/importacoes?${query(value)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar importações');
  return importacaoListResponseSchema.parse(await response.json());
}
export async function getImportacao(id: string) {
  const response = await request(`/api/v1/importacoes/${id}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar importação');
  return importacaoSchema.parse(await response.json());
}
export async function getImportacaoIssues(
  id: string,
  value: ImportacaoIssueQuery,
) {
  const response = await request(
    `/api/v1/importacoes/${id}/issues?${query(value)}`,
  );
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar problemas');
  return importacaoIssueListResponseSchema.parse(await response.json());
}
