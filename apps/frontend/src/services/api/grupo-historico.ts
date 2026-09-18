import {
  grupoHistoricoListResponseSchema,
  grupoHistoricoSeriesSchema,
  grupoSnapshotSchema,
  type GrupoHistoricoListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized';
function failure(response: Response): Failure | null {
  return response.status === 401
    ? 'unauthorized'
    : response.status === 403
      ? 'forbidden'
      : response.status === 404
        ? 'not-found'
        : null;
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
export async function getGrupoHistorico(
  grupoId: string,
  query: GrupoHistoricoListQuery,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const response = await request(
    `/api/v1/grupos/${grupoId}/historico?${params.toString()}`,
  );
  const knownFailure = failure(response);
  if (knownFailure) return knownFailure;
  if (!response.ok) throw new Error('Não foi possível carregar o histórico');
  return grupoHistoricoListResponseSchema.parse(await response.json());
}
export async function getGrupoSnapshot(grupoId: string, snapshotId: string) {
  const response = await request(
    `/api/v1/grupos/${grupoId}/historico/${snapshotId}`,
  );
  const knownFailure = failure(response);
  if (knownFailure) return knownFailure;
  if (!response.ok) throw new Error('Não foi possível carregar o snapshot');
  return grupoSnapshotSchema.parse(await response.json());
}
export async function getGrupoHistoricoSeries(grupoId: string) {
  const response = await request(`/api/v1/grupos/${grupoId}/historico/series`);
  const knownFailure = failure(response);
  if (knownFailure) return knownFailure;
  if (!response.ok) throw new Error('Não foi possível carregar as séries');
  return grupoHistoricoSeriesSchema.parse(await response.json());
}
