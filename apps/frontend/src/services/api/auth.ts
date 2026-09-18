import {
  authResponseSchema,
  type AuthenticatedUser,
  type AuthResponse,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

export async function getCurrentIdentity(): Promise<AuthResponse | null> {
  const config = getFrontendConfig();
  const cookieStore = await cookies();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/auth/me`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: cookieStore.toString(),
    },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Não foi possível validar a sessão');

  return authResponseSchema.parse(await response.json());
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  return (await getCurrentIdentity())?.user ?? null;
}
