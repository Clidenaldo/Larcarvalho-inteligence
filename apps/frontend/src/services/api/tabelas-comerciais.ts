import {
  tabelaComercialDetailSchema,
  tabelaComercialItemListResponseSchema,
  tabelaComercialListResponseSchema,
  type TabelaComercialItemListQuery,
  type TabelaComercialListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';
function query(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== '') params.set(key, String(value));
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
export async function getTabelasComerciais(value: TabelaComercialListQuery) {
  const response = await request(`/api/v1/tabelas-comerciais?${query(value)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar tabelas comerciais');
  return tabelaComercialListResponseSchema.parse(await response.json());
}
export async function getTabelaComercial(id: string) {
  const response = await request(`/api/v1/tabelas-comerciais/${id}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar tabela comercial');
  return tabelaComercialDetailSchema.parse(await response.json());
}
export async function getTabelaComercialItens(
  id: string,
  value: TabelaComercialItemListQuery,
) {
  const response = await request(
    `/api/v1/tabelas-comerciais/${id}/itens?${query(value)}`,
  );
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Falha ao carregar itens comerciais');
  return tabelaComercialItemListResponseSchema.parse(await response.json());
}
