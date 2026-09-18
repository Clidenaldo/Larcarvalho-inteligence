import {
  leadDetailSchema,
  leadListResponseSchema,
  type LeadListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

async function authHeaders() {
  const store = await cookies();
  return { accept: 'application/json', cookie: store.toString() };
}
export async function getLeads(query: LeadListQuery) {
  const config = getFrontendConfig();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const response = await fetch(`${config.apiBaseUrl}/api/v1/leads?${params}`, {
    cache: 'no-store',
    headers: await authHeaders(),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Não foi possível carregar o CRM');
  return leadListResponseSchema.parse(await response.json());
}
export async function getLead(id: string) {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/leads/${id}`, {
    cache: 'no-store',
    headers: await authHeaders(),
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (response.status === 404) return 'not-found' as const;
  if (!response.ok) throw new Error('Não foi possível carregar o lead');
  return leadDetailSchema.parse(await response.json());
}
