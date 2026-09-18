import { commercialIntelligenceSchema, type CommercialIntelligenceQuery } from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

export async function getCommercialIntelligence(query: CommercialIntelligenceQuery) {
  const config = getFrontendConfig();
  const params = new URLSearchParams({ period: query.period });
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.scope) params.set('scope', query.scope);
  const response = await fetch(`${config.apiBaseUrl}/api/v1/commercial-intelligence/overview?${params}`, {
    cache: 'no-store', headers: { accept: 'application/json', cookie: (await cookies()).toString() },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Falha ao carregar a gestao comercial');
  return commercialIntelligenceSchema.parse(await response.json());
}
