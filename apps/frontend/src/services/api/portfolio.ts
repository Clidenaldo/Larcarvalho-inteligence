import {
  customer360ResponseSchema,
  customerTimelineResponseSchema,
  followUpListResponseSchema,
  followUpSchema,
  myFollowUpsResponseSchema,
  portfolioSummarySchema,
  walletResponseSchema,
  type FollowUpListQuery,
  type WalletQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';

import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';

function query(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}

async function request(path: string, init?: RequestInit) {
  const config = getFrontendConfig();
  const store = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: store.toString() },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
    ...init,
  });
}

function failure(response: Response): Failure | null {
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) return 'forbidden';
  if (response.status === 404) return 'not-found';
  return null;
}

async function parsed<T>(response: Response, parse: (value: unknown) => T, message: string) {
  const problem = failure(response);
  if (problem) return problem;
  if (!response.ok) throw new Error(message);
  return parse(await response.json());
}

export async function getPortfolioSummary() {
  return parsed(
    await request('/api/v1/portfolio/summary'),
    portfolioSummarySchema.parse,
    'Não foi possível carregar o resumo da carteira',
  );
}

export async function getMyFollowUps() {
  return parsed(
    await request('/api/v1/portfolio/follow-ups/my'),
    myFollowUpsResponseSchema.parse,
    'Não foi possível carregar seus follow-ups',
  );
}

export async function getWallet(value: WalletQuery) {
  return parsed(
    await request(`/api/v1/portfolio/wallet?${query(value)}`),
    walletResponseSchema.parse,
    'Não foi possível carregar a carteira',
  );
}

export async function getCustomerTimeline(leadId: string, page = 1, pageSize = 20) {
  return parsed(
    await request(
      `/api/v1/portfolio/leads/${encodeURIComponent(leadId)}/timeline?${query({ page, pageSize })}`,
    ),
    customerTimelineResponseSchema.parse,
    'Não foi possível carregar a timeline',
  );
}

export async function getCustomerOverview(leadId: string) {
  return parsed(
    await request(`/api/v1/portfolio/leads/${encodeURIComponent(leadId)}/overview`),
    customer360ResponseSchema.parse,
    'Não foi possível carregar o cliente',
  );
}

export async function getFollowUps(value: FollowUpListQuery) {
  return parsed(
    await request(`/api/v1/follow-ups?${query(value)}`),
    followUpListResponseSchema.parse,
    'Não foi possível carregar os follow-ups',
  );
}

export async function getFollowUp(id: string) {
  return parsed(
    await request(`/api/v1/follow-ups/${encodeURIComponent(id)}`),
    followUpSchema.parse,
    'Não foi possível carregar o follow-up',
  );
}
