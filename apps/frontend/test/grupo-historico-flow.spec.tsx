import type { GrupoHistoricoSeries } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GET,
  POST,
} from '../src/app/api/grupos/[id]/historico/[[...path]]/route';
import { HistoricoSeries } from '../src/components/historico-series';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('group history frontend', () => {
  it('renders an accessible empty state without inventing a series', () => {
    const html = renderToStaticMarkup(
      <HistoricoSeries series={{ grupoId: crypto.randomUUID(), pontos: [] }} />,
    );
    expect(html).toContain('Nenhuma série temporal disponível');
    expect(html).not.toContain('dados históricos observados');
  });
  it('renders charts and an equivalent accessible table', () => {
    const point = (day: number, value: string) => ({
      snapshotId: crypto.randomUUID(),
      capturadoEm: `2026-09-0${day}T12:00:00.000Z`,
      valorCreditoMinimo: value,
      valorCreditoMaximo: value,
      prazoMeses: 120,
      quantidadeCotasDeclarada: 100,
      percentualLanceContempladoMinimo: '10',
      percentualLanceContempladoMaximo: '20',
      percentualLanceContempladoMedio: '15',
      percentualLanceContempladoMediano: '15',
      contemplacoesRegistradas: day,
    });
    const series: GrupoHistoricoSeries = {
      grupoId: crypto.randomUUID(),
      pontos: [point(1, '100000'), point(2, '110000')],
    };
    const html = renderToStaticMarkup(<HistoricoSeries series={series} />);
    expect(html).toContain('<svg');
    expect(html).toContain('dados históricos observados');
    expect(html).toContain('Tabela acessível das séries observadas');
  });
  it('forwards list and idempotent creation through the BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', backendFetch);
    const context = {
      params: Promise.resolve({
        id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        path: ['snapshot'],
      }),
    };
    const response = await POST(
      new Request('http://frontend.test/api/grupos/g/historico/snapshot', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toContain(
      '/api/v1/grupos/3343309c-541f-4457-8d6b-a42f7e02bd9c/historico/snapshot',
    );
    await GET(
      new Request('http://frontend.test/api/grupos/g/historico?page=1'),
      {
        params: Promise.resolve({
          id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        }),
      },
    );
    expect(backendFetch.mock.calls[1]?.[0]).toContain('historico?page=1');
  });
});
