import {
  assembleiaListResponseSchema,
  assembleiaSchema,
  contemplacaoListResponseSchema,
  lanceListResponseSchema,
  type AssembleiaListQuery,
  type ContemplacaoListQuery,
  type LanceListQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';
type F = 'forbidden' | 'not-found' | 'unauthorized';
async function req(path: string) {
  const c = getFrontendConfig(),
    s = await cookies();
  return fetch(`${c.apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json', cookie: s.toString() },
    signal: AbortSignal.timeout(c.apiTimeoutMs),
  });
}
function fail(r: Response): F | null {
  return r.status === 401
    ? 'unauthorized'
    : r.status === 403
      ? 'forbidden'
      : r.status === 404
        ? 'not-found'
        : null;
}
function qs(v: Record<string, unknown>) {
  const p = new URLSearchParams();
  for (const [k, x] of Object.entries(v))
    if (x !== undefined && x !== '') p.set(k, String(x));
  return p.toString();
}
export async function getAssembleias(q: AssembleiaListQuery) {
  const r = await req(`/api/v1/assembleias?${qs(q)}`),
    f = fail(r);
  if (f) return f;
  if (!r.ok) throw new Error('Falha ao carregar assembleias');
  return assembleiaListResponseSchema.parse(await r.json());
}
export async function getAssembleia(id: string) {
  const r = await req(`/api/v1/assembleias/${id}`),
    f = fail(r);
  if (f) return f;
  if (!r.ok) throw new Error('Falha ao carregar assembleia');
  return assembleiaSchema.parse(await r.json());
}
export async function getLances(q: LanceListQuery) {
  const r = await req(`/api/v1/lances?${qs(q)}`),
    f = fail(r);
  if (f) return f;
  if (!r.ok) throw new Error('Falha ao carregar lances');
  return lanceListResponseSchema.parse(await r.json());
}
export async function getContemplacoes(q: ContemplacaoListQuery) {
  const r = await req(`/api/v1/contemplacoes?${qs(q)}`),
    f = fail(r);
  if (f) return f;
  if (!r.ok) throw new Error('Falha ao carregar contemplações');
  return contemplacaoListResponseSchema.parse(await r.json());
}
