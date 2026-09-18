import type {
  ComparadorGroup,
  SimuladorPublicoRequest,
} from '@larcarvalho/shared';
import { describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';
import type { ComparadorService } from '../src/modules/comparador/comparador.service.js';
import { SimuladorPublicoService } from '../src/modules/simulador-publico/simulador-publico.service.js';

const group = (
  code: string,
  options: {
    snapshot?: boolean;
    credit?: [string, string];
    quality?: [number, number];
    installment?: string | null;
  } = {},
): ComparadorGroup => ({
  grupo: {
    id: `${code.padEnd(8, '1')}-1111-4111-8111-111111111111`,
    codigo: code,
    status: 'ATIVO',
    quantidadeCotas: 100,
  },
  administradora: {
    id: '22222222-2222-4222-8222-222222222222',
    nome: `Administradora ${code}`,
    ativa: true,
  },
  produto: {
    id: '33333333-3333-4333-8333-333333333333',
    nome: 'Imóvel',
    categoria: 'IMOVEL',
    ativo: true,
  },
  credito: {
    minimo: options.credit?.[0] ?? '100000',
    maximo: options.credit?.[1] ?? '200000',
    compatibilidade: 'ATENDE',
  },
  parcela: {
    valorConhecido:
      options.installment === undefined ? '1000' : options.installment,
    origem: 'SNAPSHOT',
    compatibilidade: null,
  },
  prazo: {
    totalMeses: 120,
    restanteMinimo: 60,
    restanteMaximo: 80,
    compatibilidade: null,
  },
  historico: {
    estado: options.snapshot === false ? 'INDISPONIVEL' : 'DISPONIVEL',
    snapshotId:
      options.snapshot === false
        ? null
        : '44444444-4444-4444-8444-444444444444',
    capturadoEm: options.snapshot === false ? null : '2026-09-02T00:00:00.000Z',
    assembleiasRealizadas: options.snapshot === false ? null : 10,
    lancesRegistrados: options.snapshot === false ? null : 10,
    lancesContemplados: options.snapshot === false ? null : 10,
    percentualLanceMinimo: options.snapshot === false ? null : '10',
    percentualLanceMedio: options.snapshot === false ? null : '20',
    percentualLanceMediano: options.snapshot === false ? null : '20',
    percentualLanceMaximo: options.snapshot === false ? null : '30',
    contemplacoesRegistradas: options.snapshot === false ? null : 10,
    contemplacoesSorteio: options.snapshot === false ? null : 5,
    contemplacoesLance: options.snapshot === false ? null : 5,
    contemplacoesOutras: options.snapshot === false ? null : 0,
  },
  cobertura: {
    assembleiasRealizadas: options.snapshot === false ? null : 10,
    assembleiasComDadosLance: options.snapshot === false ? null : 10,
    assembleiasComDadosContemplacao: options.snapshot === false ? null : 10,
    percentualLances: options.snapshot === false ? null : 1,
  },
  qualidade: {
    issuesAbertas: options.quality?.[0] ?? 0,
    issuesCriticas: options.quality?.[1] ?? 0,
  },
  motivosCompatibilidade: [],
});

const input = (
  overrides: Partial<SimuladorPublicoRequest> = {},
): SimuladorPublicoRequest => ({
  perfil: { categoria: 'IMOVEL', valorCreditoDesejado: '150000' },
  page: 1,
  pageSize: 2,
  ...overrides,
});

function service(items: ComparadorGroup[], total = items.length) {
  const publicCandidates = vi.fn(async () => ({ items, total }));
  const comparator = { publicCandidates } as unknown as ComparadorService;
  return {
    publicCandidates,
    subject: new SimuladorPublicoService(
      comparator,
      parseEnvironment({ PUBLIC_SIMULATOR_CANDIDATE_LIMIT: '20' }),
    ),
  };
}

describe('public simulator service', () => {
  it('orders the evaluated set before final pagination and places null last', async () => {
    const { subject } = service([
      group('G3', { snapshot: false }),
      group('G2', { quality: [1, 1] }),
      group('G1'),
    ]);
    const first = await subject.simulate(input());
    expect(first.response.items.map((item) => item.grupo)).toEqual([
      'G1',
      'G2',
    ]);
    const second = await subject.simulate(input({ page: 2 }));
    expect(second.response.items.map((item) => item.grupo)).toEqual(['G3']);
    expect(second.response.items[0]?.indiceAderencia).toBeNull();
  });

  it('uses group code as deterministic tie breaker', async () => {
    const { subject } = service([group('G2'), group('G1')]);
    expect(
      (await subject.simulate(input())).response.items.map(
        (item) => item.grupo,
      ),
    ).toEqual(['G1', 'G2']);
  });

  it('reports candidate truncation without exposing internal identifiers or issues', async () => {
    const { subject, publicCandidates } = service([group('G1')], 21);
    const output = await subject.simulate(input());
    expect(publicCandidates).toHaveBeenCalledWith(input().perfil, 20);
    expect(output.response).toMatchObject({
      limiteAtingido: true,
      limiteCandidatos: 20,
      totalCandidatos: 21,
    });
    const serialized = JSON.stringify(output.response);
    expect(serialized).not.toContain('11111111-1111');
    expect(serialized).not.toContain('issuesCriticas');
  });

  it('returns a safe empty result and technical timings', async () => {
    const output = await service([]).subject.simulate(input());
    expect(output.response).toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
    expect(output.metrics).toMatchObject({
      candidateCount: 0,
      evaluatedCount: 0,
    });
    expect(output.metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('maps public history quality without exposing technical counts', async () => {
    const output = await service([
      group('G1', { quality: [1, 1] }),
      group('G2', { snapshot: false }),
    ]).subject.simulate(input());
    expect(output.response.items.map((item) => item.historicoStatus)).toEqual([
      'DADOS_HISTORICOS_PARCIAIS',
      'DADOS_INSUFICIENTES',
    ]);
  });
});
