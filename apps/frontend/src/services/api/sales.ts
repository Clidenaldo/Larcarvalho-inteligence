import {
  commissionListResponseSchema,
  saleDetailSchema,
  saleListResponseSchema,
  type CommissionListQuery,
  type SaleListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

async function authHeaders() {
  const store = await cookies();
  return { accept: 'application/json', cookie: store.toString() };
}
function params(query: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') search.set(key, String(value));
  return search.toString();
}
export async function getSales(query: SaleListQuery) {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sales?${params(query)}`, {
    cache: 'no-store',
    headers: await authHeaders(),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Não foi possível carregar as vendas');
  return saleListResponseSchema.parse(await response.json());
}
export async function getSale(id: string) {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/sales/${id}`, {
    cache: 'no-store',
    headers: await authHeaders(),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (response.status === 404) return 'not-found' as const;
  if (!response.ok) throw new Error('Não foi possível carregar a venda');
  return saleDetailSchema.parse(await response.json());
}
export async function getCommissions(query: CommissionListQuery) {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/commissions?${params(query)}`, {
    cache: 'no-store',
    headers: await authHeaders(),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Não foi possível carregar as comissões');
  return commissionListResponseSchema.parse(await response.json());
}
