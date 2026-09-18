import {
  agendaResponseSchema,
  type AgendaQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'unauthorized';

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
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return 'forbidden';
  return null;
}

export async function getAgenda(value: AgendaQuery) {
  const response = await request(`/api/v1/agenda?${query(value)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Não foi possível carregar a agenda');
  return agendaResponseSchema.parse(await response.json());
}

export async function getTeamAgenda(value: AgendaQuery) {
  const response = await request(`/api/v1/agenda/team?${query(value)}`);
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error('Não foi possível carregar a agenda da equipe');
  return agendaResponseSchema.parse(await response.json());
}
