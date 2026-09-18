import type { IndiceAderenciaResult } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/app/api/indice-aderencia/[...path]/route';
import { IndiceAderenciaPanel } from '../src/components/indice-aderencia-panel';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const result = (index: number | null): IndiceAderenciaResult => ({
  grupoId: '11111111-1111-4111-8111-111111111111',
  indice: index,
  classificacao: index === null ? null : 'ALTA_ADERENCIA',
  coberturaAvaliacao: index === null ? 30 : 90,
  pesoTotalAvaliavel: index === null ? 30 : 90,
  componentes: [
    ['CREDITO', 20, 20, 100, 20, 'ATENDE'],
    ['PARCELA', 15, 15, 100, 15, 'ATENDE'],
    ['PRAZO', 10, 10, 100, 10, 'ATENDE'],
    ['HISTORICO_LANCES', 25, 25, 100, 25, 'ATENDE'],
    ['COBERTURA_HISTORICA', 10, 10, 100, 10, 'ATENDE'],
    ['CARACTERISTICAS_GRUPO', 10, 0, null, null, 'INDISPONIVEL'],
    ['QUALIDADE_DADOS', 10, 10, 100, 10, 'ATENDE'],
  ].map(
    ([
      nome,
      peso,
      pesoAvaliado,
      pontuacaoBruta,
      pontuacaoPonderada,
      status,
    ]) => ({
      nome: nome as IndiceAderenciaResult['componentes'][number]['nome'],
      peso: peso as number,
      pesoAvaliado: pesoAvaliado as number,
      pontuacaoBruta: pontuacaoBruta as number | null,
      pontuacaoPonderada: pontuacaoPonderada as number | null,
      status: status as IndiceAderenciaResult['componentes'][number]['status'],
      explicacao: 'Explicação factual do componente.',
      dadosUtilizados: {},
    }),
  ),
  disclaimer:
    'O índice não representa probabilidade, promessa ou garantia de contemplação.',
});

describe('adherence frontend and BFF', () => {
  it('renders index, coverage, components, unavailable data and disclaimer', () => {
    const html = renderToStaticMarkup(
      <IndiceAderenciaPanel codigo="G1" result={result(100)} />,
    );
    expect(html).toContain('100/100');
    expect(html).toContain('Cobertura da avaliação: 90%');
    expect(html).toContain('Características do grupo');
    expect(html).toContain('Indisponível');
    expect(html).toContain('não representa probabilidade');
  });

  it('renders the low-coverage state without a numeric index', () => {
    const html = renderToStaticMarkup(
      <IndiceAderenciaPanel codigo="G1" result={result(null)} />,
    );
    expect(html).toContain('Dados insuficientes');
    expect(html).toContain('atingir 40%');
    expect(html).not.toContain('null/100');
  });

  it('forwards calculation through the authenticated BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ resultados: [] }));
    vi.stubGlobal('fetch', backendFetch);
    await POST(
      new Request('http://frontend.test/api/indice-aderencia/calcular', {
        method: 'POST',
        body: JSON.stringify({
          perfil: { valorCreditoDesejado: '100' },
          grupoIds: ['1'],
        }),
      }),
      { params: Promise.resolve({ path: ['calcular'] }) },
    );
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/indice-aderencia/calcular',
    );
  });
});
