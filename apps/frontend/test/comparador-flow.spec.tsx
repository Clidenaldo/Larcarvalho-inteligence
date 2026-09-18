import type { ComparadorGroup } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/app/api/comparador/[...path]/route';
import {
  clearComparisonSelection,
  COMPARADOR_LIMIT,
  removeComparisonSelection,
  toggleComparisonSelection,
} from '../src/components/comparador-results';
import {
  ComparadorSideBySide,
  filterComparisonItems,
  winnerIds,
} from '../src/components/comparador-side-by-side';

const uuids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
] as const;

function comparisonFixture(
  index: number,
  origin: 'GRUPO' | 'PLANO_COMERCIAL' = 'GRUPO',
): ComparadorGroup {
  const id = uuids[index] ?? crypto.randomUUID();
  const plan = origin === 'PLANO_COMERCIAL';
  return {
    origem: origin,
    grupo: {
      id,
      codigo: plan ? `TA-${index + 1}` : `G-${index + 1}`,
      status: 'ATIVO',
      quantidadeCotas: plan ? null : 500,
    },
    tabelaComercial: plan
      ? {
          id,
          nome: 'Tabela Pesados sem produto',
          codigo: `TA-${index + 1}`,
          itemId: id,
          codigoPlano: `PLANO-${index + 1}`,
          modalidade: 'NORMAL',
          vigenciaInicio: '2026-01-01T00:00:00.000Z',
          vigenciaFim: null,
        }
      : null,
    administradora: { id, nome: `Administradora ${index + 1}`, ativa: true },
    produto: {
      id,
      nome: plan ? 'Tabela Pesados sem produto' : 'Imóvel',
      categoria: plan ? 'PESADOS' : 'IMOVEL',
      ativo: true,
    },
    credito: {
      minimo: String(100000 + index * 10000),
      maximo: String(200000 + index * 10000),
      compatibilidade: null,
    },
    parcela: {
      valorConhecido: String(2500 + index * 100),
      origem: 'SNAPSHOT',
      compatibilidade: null,
    },
    prazo: {
      totalMeses: 120 + index,
      restanteMinimo: null,
      restanteMaximo: null,
      compatibilidade: null,
    },
    historico: {
      estado: plan ? 'INDISPONIVEL' : 'DISPONIVEL',
      snapshotId: null,
      capturadoEm: null,
      assembleiasRealizadas: plan ? null : 12,
      lancesRegistrados: null,
      lancesContemplados: null,
      percentualLanceMinimo: null,
      percentualLanceMedio: null,
      percentualLanceMediano: null,
      percentualLanceMaximo: null,
      contemplacoesRegistradas: null,
      contemplacoesSorteio: null,
      contemplacoesLance: null,
      contemplacoesOutras: null,
    },
    cobertura: {
      assembleiasRealizadas: plan ? null : 12,
      assembleiasComDadosLance: null,
      assembleiasComDadosContemplacao: null,
      percentualLances: null,
    },
    qualidade: { issuesAbertas: 0, issuesCriticas: 0 },
    financeiro: plan
      ? {
          primeiraParcela: '2800',
          demaisParcelas: '2500',
          parcelaPadrao: '2500',
          seguro: '45',
          taxaAntecipadaValor: '300',
          taxaAntecipadaPercentual: '0.5',
          fundoReservaPercentual: '1.5',
          taxaAdministracaoPercentual: '18',
          taxaTotalPercentual: '20',
          seguroVidaPercentual: '0.3',
          participantesGrupo: 400,
        }
      : null,
    motivosCompatibilidade: [],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('comparator frontend and BFF', () => {
  it('selects one, two and five; blocks the sixth; removes, reselects and clears', () => {
    const ids = ['1', '2', '3', '4', '5', '6'];
    let selected: string[] = [];
    selected = toggleComparisonSelection(selected, ids[0]);
    expect(selected).toEqual(['1']);
    selected = toggleComparisonSelection(selected, ids[1]);
    expect(selected).toEqual(['1', '2']);
    for (const id of ids.slice(2, 5))
      selected = toggleComparisonSelection(selected, id);
    expect(COMPARADOR_LIMIT).toBe(5);
    expect(toggleComparisonSelection(selected, '6')).toEqual(ids.slice(0, 5));
    const withoutTwo = removeComparisonSelection(selected, '2');
    expect(withoutTwo).toEqual(['1', '3', '4', '5']);
    expect(toggleComparisonSelection(withoutTwo, '6')).toEqual([
      '1',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(clearComparisonSelection()).toEqual([]);
  });
  it('renders only selected options with financial values, adherence and responsive views', () => {
    const group = comparisonFixture(0);
    const omitted = comparisonFixture(1);
    const plan = comparisonFixture(2, 'PLANO_COMERCIAL');
    const visible = filterComparisonItems(
      [group, omitted, plan],
      [group.grupo.id, plan.tabelaComercial?.itemId ?? ''],
    );
    expect(visible).toEqual([group, plan]);
    const html = renderToStaticMarkup(
      <ComparadorSideBySide
        adherenceMap={{ [group.grupo.id]: 92 }}
        criterios={{}}
        items={visible}
      />,
    );
    expect(html).toContain('Comparação selecionada (2/5)');
    expect(html).toContain('comparison-mobile');
    expect(html).toContain('comparison-table');
    expect(html).toContain('sticky left-0');
    expect(html).toContain('Aderência 92/100');
    expect(html).toContain('Tabela Pesados sem produto');
    expect(html).toContain('PESADOS');
    expect(html).toContain('R$ 2.500,00');
    expect(html).toContain('R$ 45,00');
    expect(html).toContain('18%');
    expect(html).toContain('Taxa antecipada');
    expect(html).not.toContain('G-2');
  });
  it('renders one option and an empty comparison without false highlights', () => {
    const group = comparisonFixture(0);
    const single = renderToStaticMarkup(
      <ComparadorSideBySide
        adherenceMap={{ [group.grupo.id]: 92 }}
        criterios={{}}
        items={[group]}
      />,
    );
    expect(single).toContain('Comparação selecionada (1/5)');
    expect(single).not.toContain('Menor parcela');
    expect(single).not.toContain('Maior aderência');
    const empty = renderToStaticMarkup(
      <ComparadorSideBySide adherenceMap={{}} criterios={{}} items={[]} />,
    );
    expect(empty).toContain('Nenhuma opção para comparar.');
  });
  it('highlights a factual difference but not an all-equal tie', () => {
    const items = [comparisonFixture(0), comparisonFixture(1)];
    expect([
      ...winnerIds(items, 'min', (item) => Number(item.parcela.valorConhecido)),
    ]).toEqual([items[0]?.grupo.id]);
    expect([...winnerIds(items, 'min', () => 100)]).toEqual([]);
  });
  it('forwards filters and comparison through the authenticated BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', backendFetch);
    await GET(
      new Request(
        'http://frontend.test/api/comparador/grupos?categoria=IMOVEL',
      ),
      { params: Promise.resolve({ path: ['grupos'] }) },
    );
    expect(backendFetch.mock.calls[0]?.[0]).toContain('categoria=IMOVEL');
    await POST(
      new Request('http://frontend.test/api/comparador/comparar', {
        method: 'POST',
        body: JSON.stringify({ grupoIds: ['1', '2'] }),
      }),
      { params: Promise.resolve({ path: ['comparar'] }) },
    );
    expect(backendFetch.mock.calls[1]?.[0]).toBe(
      'http://backend.test/api/v1/comparador/comparar',
    );
  });
});
