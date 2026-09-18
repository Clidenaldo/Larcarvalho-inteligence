import {
  cotaListResponseSchema,
  cotaSchema,
  grupoListResponseSchema,
  grupoSchema,
  produtoListResponseSchema,
  produtoSchema,
  type Cota,
  type CotaListQuery,
  type Grupo,
  type GrupoListQuery,
  type Produto,
  type ProdutoListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';
type Failure = 'forbidden' | 'not-found' | 'unauthorized';
async function request(path: string) {
  const config = getFrontendConfig(),
    store = await cookies();
  return fetch(`${config.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: store.toString() },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
}
function failure(r: Response): Failure | null {
  return r.status === 401
    ? 'unauthorized'
    : r.status === 403
      ? 'forbidden'
      : r.status === 404
        ? 'not-found'
        : null;
}
function query(input: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(input))
    if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
}
export async function getProdutos(q: ProdutoListQuery) {
  const r = await request(`/api/v1/produtos?${query(q)}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar os produtos');
  return produtoListResponseSchema.parse(await r.json());
}
export async function getProduto(id: string): Promise<Produto | Failure> {
  const r = await request(`/api/v1/produtos/${id}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar o produto');
  return produtoSchema.parse(await r.json());
}
export async function getGrupos(q: GrupoListQuery) {
  const r = await request(`/api/v1/grupos?${query(q)}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar os grupos');
  return grupoListResponseSchema.parse(await r.json());
}
export async function getGrupo(id: string): Promise<Grupo | Failure> {
  const r = await request(`/api/v1/grupos/${id}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar o grupo');
  return grupoSchema.parse(await r.json());
}
export async function getCotas(q: CotaListQuery) {
  const r = await request(`/api/v1/cotas?${query(q)}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar as cotas');
  return cotaListResponseSchema.parse(await r.json());
}
export async function getCota(id: string): Promise<Cota | Failure> {
  const r = await request(`/api/v1/cotas/${id}`),
    f = failure(r);
  if (f) return f;
  if (!r.ok) throw new Error('Não foi possível carregar a cota');
  return cotaSchema.parse(await r.json());
}
