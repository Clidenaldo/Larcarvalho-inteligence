import {
  compararGruposResponseSchema,
  comparadorSearchResponseSchema,
  type ComparadorSearchQuery,
  type CompararGruposRequest,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized' | 'conflict';
const failure = (response: Response): Failure | null =>
  response.status === 401
    ? 'unauthorized'
    : response.status === 403
      ? 'forbidden'
      : response.status === 404
        ? 'not-found'
        : response.status === 409
          ? 'conflict'
          : null;
async function headers() {
  const store = await cookies();
  return { accept: 'application/json', cookie: store.toString() };
}
export async function searchComparisonGroups(query: ComparadorSearchQuery) {
  const config = getFrontendConfig();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/comparador/grupos?${params.toString()}`,
    {
      cache: 'no-store',
      headers: await headers(),
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    },
  );
  const known = failure(response);
  if (known) return known;
  if (!response.ok) throw new Error('Não foi possível pesquisar grupos');
  return comparadorSearchResponseSchema.parse(await response.json());
}
export async function compareGroups(input: CompararGruposRequest) {
  const config = getFrontendConfig();
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/comparador/comparar`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...(await headers()), 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    },
  );
  const known = failure(response);
  if (known) return known;
  if (!response.ok) throw new Error('Não foi possível comparar os grupos');
  return compararGruposResponseSchema.parse(await response.json());
}
