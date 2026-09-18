import {
  appearanceConfigurationSchema,
  adminThemeSchema,
  publicThemeSchema,
  myAccountSchema,
  type AppearanceConfiguration,
  type MyAccount,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';

async function request(path: string) {
  const config = getFrontendConfig();
  const store = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: store.toString() },
    signal: AbortSignal.timeout(Math.max(config.apiTimeoutMs, 15_000)),
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

async function parsed<T>(response: Response, parse: (value: unknown) => T) {
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok)
    throw new Error('Não foi possível carregar a experiência comercial');
  return parse(await response.json());
}

export async function getAppearanceConfiguration(): Promise<
  AppearanceConfiguration | Failure
> {
  return parsed(
    await request('/api/v1/appearance'),
    appearanceConfigurationSchema.parse,
  );
}

export async function getMyAccount(): Promise<MyAccount | Failure> {
  return parsed(await request('/api/v1/account'), myAccountSchema.parse);
}

export async function getAdminPublicTheme() {
  return parsed(
    await request('/api/v1/appearance/public-theme'),
    publicThemeSchema.parse,
  );
}

export async function getAdminTheme() {
  return parsed(
    await request('/api/v1/appearance/admin-theme'),
    adminThemeSchema.parse,
  );
}
