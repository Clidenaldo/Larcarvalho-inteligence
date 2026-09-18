import {
  userListResponseSchema,
  type UserListResponse,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

export async function getUsers(
  page: number,
  pageSize = 20,
  filters: Record<string, string | undefined> = {},
): Promise<UserListResponse | 'forbidden' | 'unauthorized'> {
  const config = getFrontendConfig();
  const cookieStore = await cookies();
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  for (const [key, value] of Object.entries(filters)) if (value && ['busca', 'role', 'teamId', 'ativo'].includes(key)) params.set(key, value);
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/users?${params.toString()}`,
    {
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: cookieStore.toString() },
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    },
  );
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return 'forbidden';
  if (!response.ok) throw new Error('Não foi possível carregar os usuários');
  return userListResponseSchema.parse(await response.json());
}
