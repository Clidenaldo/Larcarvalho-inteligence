import {
  administradoraListResponseSchema,
  administradoraSchema,
  type Administradora,
  type AdministradoraListQuery,
  type AdministradoraListResponse,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type ApiFailure = 'forbidden' | 'not-found' | 'unauthorized';

async function request(path: string): Promise<Response> {
  const config = getFrontendConfig();
  const cookieStore = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: cookieStore.toString() },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
}

function knownFailure(response: Response): ApiFailure | null {
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return 'forbidden';
  if (response.status === 404) return 'not-found';
  return null;
}

export async function getAdministradoras(
  query: AdministradoraListQuery,
): Promise<AdministradoraListResponse | ApiFailure> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    status: query.status,
  });
  if (query.search) params.set('search', query.search);
  const response = await request(
    `/api/v1/administradoras?${params.toString()}`,
  );
  const failure = knownFailure(response);
  if (failure) return failure;
  if (!response.ok)
    throw new Error('Não foi possível carregar as administradoras');
  return administradoraListResponseSchema.parse(await response.json());
}

export async function getAdministradora(
  id: string,
): Promise<Administradora | ApiFailure> {
  const response = await request(`/api/v1/administradoras/${id}`);
  const failure = knownFailure(response);
  if (failure) return failure;
  if (!response.ok)
    throw new Error('Não foi possível carregar a administradora');
  return administradoraSchema.parse(await response.json());
}
