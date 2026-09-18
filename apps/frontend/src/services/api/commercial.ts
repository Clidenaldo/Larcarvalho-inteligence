import {
  simulationCatalogSchema,
  commercialConfigurationSchema,
  productCommercialRuleListResponseSchema,
  proposalListResponseSchema,
  proposalSchema,
  proposalVersionChainSchema,
  simulationCatalogFavoritesSchema,
  simulationListResponseSchema,
  simulationSchema,
  type ProductCommercialRuleListQuery,
  type ProposalListQuery,
  type SimulationListQuery,
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
  if (!response.ok) throw new Error('Falha ao carregar o módulo comercial');
  return parse(await response.json());
}

export async function getSimulations(value: SimulationListQuery) {
  return parsed(
    await request(`/api/v1/simulations?${query(value)}`),
    simulationListResponseSchema.parse,
  );
}
export async function getSimulation(id: string) {
  return parsed(
    await request(`/api/v1/simulations/${encodeURIComponent(id)}`),
    simulationSchema.parse,
  );
}
export async function getSimulationCatalogFavorites() {
  return parsed(
    await request('/api/v1/simulations/favorites/catalog'),
    simulationCatalogFavoritesSchema.parse,
  );
}
export async function getSimulationCatalog() {
  return parsed(await request('/api/v1/simulations/catalog'), simulationCatalogSchema.parse);
}
export async function getProposals(value: ProposalListQuery) {
  return parsed(
    await request(`/api/v1/proposals?${query(value)}`),
    proposalListResponseSchema.parse,
  );
}
export async function getProposal(id: string) {
  return parsed(
    await request(`/api/v1/proposals/${encodeURIComponent(id)}`),
    proposalSchema.parse,
  );
}
export async function getProposalVersions(id: string) {
  return parsed(
    await request(`/api/v1/proposals/${encodeURIComponent(id)}/versions`),
    proposalVersionChainSchema.parse,
  );
}
export async function getCommercialConfiguration() {
  return parsed(
    await request('/api/v1/commercial-configurations'),
    commercialConfigurationSchema.parse,
  );
}
export async function getProductCommercialRules(
  value: ProductCommercialRuleListQuery,
) {
  return parsed(
    await request(`/api/v1/product-commercial-rules?${query(value)}`),
    productCommercialRuleListResponseSchema.parse,
  );
}
