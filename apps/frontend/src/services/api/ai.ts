import {
  aiPublicConfigSchema,
  aiStatusResponseSchema,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'unauthorized';

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
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return 'forbidden';
  return null;
}

export async function getAiStatus() {
  const response = await request('/api/v1/ai/status');
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Não foi possível carregar o status da IA');
  return aiStatusResponseSchema.parse(await response.json());
}

export async function getAiConfig() {
  const response = await request('/api/v1/ai/config');
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Não foi possível carregar a configuração da IA');
  return aiPublicConfigSchema.parse(await response.json());
}
