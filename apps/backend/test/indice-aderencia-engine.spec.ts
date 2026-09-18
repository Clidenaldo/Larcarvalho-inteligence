import type { ComparadorGroup, PerfilAderencia } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';
import {
  INDICE_ADERENCIA_CONFIG,
  calculateCoberturaComponent,
  calculateCreditoComponent,
  calculateIndiceAderencia,
  calculateLanceComponent,
  calculateParcelaComponent,
  calculatePrazoComponent,
  calculateQualidadeComponent,
} from '../src/modules/indice-aderencia/indice-aderencia.engine.js';

const group = (
  options: {
    creditMin?: string | null;
    creditMax?: string | null;
    installment?: string | null;
    term?: number | null;
    snapshot?: boolean;
    minimumBid?: string | null;
    medianBid?: string | null;
    maximumBid?: string | null;
    observations?: number | null;
    assemblies?: number | null;
    bidAssemblies?: number | null;
    awardAssemblies?: number | null;
    openIssues?: number;
    criticalIssues?: number;
  } = {},
): ComparadorGroup => ({
  grupo: {
    id: '11111111-1111-4111-8111-111111111111',
    codigo: 'G1',
    status: 'ATIVO',
    quantidadeCotas: 100,
  },
  administradora: {
    id: '22222222-2222-4222-8222-222222222222',
    nome: 'Administradora',
    ativa: true,
  },
  produto: {
    id: '33333333-3333-4333-8333-333333333333',
    nome: 'Imóvel',
    categoria: 'IMOVEL',
    ativo: true,
  },
  credito: {
    minimo: options.creditMin === undefined ? '100' : options.creditMin,
    maximo: options.creditMax === undefined ? '200' : options.creditMax,
    compatibilidade: null,
  },
  parcela: {
    valorConhecido:
      options.installment === undefined ? '500' : options.installment,
    origem: 'SNAPSHOT',
    compatibilidade: null,
  },
  prazo: {
    totalMeses: options.term === undefined ? 120 : options.term,
    restanteMinimo: 40,
    restanteMaximo: 60,
    compatibilidade: null,
  },
  historico: {
    estado: options.snapshot === false ? 'INDISPONIVEL' : 'DISPONIVEL',
    snapshotId:
      options.snapshot === false
        ? null
        : '44444444-4444-4444-8444-444444444444',
    capturadoEm: options.snapshot === false ? null : '2026-09-02T12:00:00.000Z',
    assembleiasRealizadas:
      options.assemblies === undefined ? 10 : options.assemblies,
    lancesRegistrados: 20,
    lancesContemplados:
      options.observations === undefined ? 10 : options.observations,
    percentualLanceMinimo:
      options.minimumBid === undefined ? '10' : options.minimumBid,
    percentualLanceMedio: '20',
    percentualLanceMediano:
      options.medianBid === undefined ? '20' : options.medianBid,
    percentualLanceMaximo:
      options.maximumBid === undefined ? '30' : options.maximumBid,
    contemplacoesRegistradas: 10,
    contemplacoesSorteio: 5,
    contemplacoesLance: 5,
    contemplacoesOutras: 0,
  },
  cobertura: {
    assembleiasRealizadas:
      options.assemblies === undefined ? 10 : options.assemblies,
    assembleiasComDadosLance:
      options.bidAssemblies === undefined ? 10 : options.bidAssemblies,
    assembleiasComDadosContemplacao:
      options.awardAssemblies === undefined ? 10 : options.awardAssemblies,
    percentualLances: 1,
  },
  qualidade: {
    issuesAbertas: options.openIssues ?? 0,
    issuesCriticas: options.criticalIssues ?? 0,
  },
  motivosCompatibilidade: [],
});

describe('Índice de Aderência pure engine', () => {
  it('keeps centralized weights equal to 100', () => {
    expect(
      Object.values(INDICE_ADERENCIA_CONFIG.pesos).reduce((a, b) => a + b, 0),
    ).toBe(100);
  });
  it.each([
    ['150', 100],
    ['100', 100],
    ['200', 100],
    ['99', 0],
    ['201', 0],
  ])('scores credit %s deterministically', (desired, score) => {
    expect(
      calculateCreditoComponent({ valorCreditoDesejado: desired }, group())
        .pontuacaoBruta,
    ).toBe(score);
  });
  it('marks unknown credit as unavailable', () => {
    expect(
      calculateCreditoComponent(
        { valorCreditoDesejado: '150' },
        group({ creditMin: null }),
      ).status,
    ).toBe('INDISPONIVEL');
  });
  it.each([
    ['600', 100],
    ['500', 100],
    ['499', 0],
  ])('scores known installment against %s', (maximum, score) => {
    expect(
      calculateParcelaComponent({ parcelaMaxima: maximum }, group())
        .pontuacaoBruta,
    ).toBe(score);
  });
  it('does not treat an unknown installment as zero', () => {
    expect(
      calculateParcelaComponent(
        { parcelaMaxima: '500' },
        group({ installment: null }),
      ).status,
    ).toBe('INDISPONIVEL');
  });
  it.each([
    [{ prazoMaximo: 120 }, 100],
    [{ prazoMaximo: 119 }, 0],
    [{ prazoMinimo: 100, prazoMaximo: 130 }, 100],
    [{ prazoMinimo: 121 }, 0],
  ] satisfies Array<[PerfilAderencia, number]>)(
    'scores term intervals',
    (profile, score) => {
      expect(calculatePrazoComponent(profile, group()).pontuacaoBruta).toBe(
        score,
      );
    },
  );
  it('marks an unknown term as unavailable', () => {
    expect(
      calculatePrazoComponent({ prazoMaximo: 120 }, group({ term: null }))
        .status,
    ).toBe('INDISPONIVEL');
  });
  it.each([
    ['5', 25],
    ['10', 50],
    ['15', 75],
    ['20', 100],
    ['25', 100],
    ['40', 100],
  ])('compares bid %s only with observed history', (bid, score) => {
    expect(
      calculateLanceComponent({ lanceDisponivelPercentual: bid }, group())
        .pontuacaoBruta,
    ).toBe(score);
  });
  it('marks bid history as unavailable without observations', () => {
    expect(
      calculateLanceComponent(
        { lanceDisponivelPercentual: '20' },
        group({ observations: 0 }),
      ).status,
    ).toBe('INDISPONIVEL');
  });
  it('reduces evaluable weight for one or few observations', () => {
    expect(
      calculateLanceComponent(
        { lanceDisponivelPercentual: '20' },
        group({ observations: 1 }),
      ).pesoAvaliado,
    ).toBe(12.5);
    expect(
      calculateLanceComponent(
        { lanceDisponivelPercentual: '20' },
        group({ observations: 3 }),
      ).pesoAvaliado,
    ).toBe(18.75);
  });
  it.each([
    [{ assemblies: 10, bidAssemblies: 0, awardAssemblies: 0 }, 0],
    [{ assemblies: 10, bidAssemblies: 5, awardAssemblies: 5 }, 50],
    [{ assemblies: 10, bidAssemblies: 10, awardAssemblies: 10 }, 100],
  ])('scores objective historical coverage', (options, score) => {
    expect(calculateCoberturaComponent(group(options)).pontuacaoBruta).toBe(
      score,
    );
  });
  it('marks zero denominator and no snapshot as unavailable', () => {
    expect(calculateCoberturaComponent(group({ assemblies: 0 })).status).toBe(
      'INDISPONIVEL',
    );
    expect(calculateCoberturaComponent(group({ snapshot: false })).status).toBe(
      'INDISPONIVEL',
    );
  });
  it.each([
    [{}, 100],
    [{ openIssues: 2 }, 80],
    [{ openIssues: 1, criticalIssues: 1 }, 25],
    [{ openIssues: 2, criticalIssues: 2 }, 0],
  ])('scores only technical data quality', (options, score) => {
    expect(calculateQualidadeComponent(group(options)).pontuacaoBruta).toBe(
      score,
    );
  });
  it('normalizes missing components instead of assigning zero', () => {
    const result = calculateIndiceAderencia(
      { valorCreditoDesejado: '150', parcelaMaxima: '500' },
      group({ installment: null }),
    );
    expect(result.pesoTotalAvaliavel).toBe(40);
    expect(result.indice).toBe(100);
  });
  it('enforces coverage below, equal to and above 40%', () => {
    expect(
      calculateIndiceAderencia(
        { valorCreditoDesejado: '150' },
        group({ snapshot: false }),
      ).indice,
    ).toBeNull();
    expect(
      calculateIndiceAderencia(
        { valorCreditoDesejado: '150', parcelaMaxima: '500' },
        group({ installment: null }),
      ).indice,
    ).toBe(100);
    expect(
      calculateIndiceAderencia(
        { valorCreditoDesejado: '150', parcelaMaxima: '500' },
        group({ snapshot: false }),
      ).indice,
    ).toBe(100);
  });
  it('produces final 0, intermediate and 100 with half-up integer output', () => {
    const profile = {
      valorCreditoDesejado: '150',
      parcelaMaxima: '500',
      prazoMaximo: 120,
      lanceDisponivelPercentual: '20',
    };
    expect(calculateIndiceAderencia(profile, group()).indice).toBe(100);
    expect(
      calculateIndiceAderencia(
        { ...profile, lanceDisponivelPercentual: '0' },
        group({
          creditMin: '300',
          creditMax: '400',
          installment: '700',
          term: 200,
          bidAssemblies: 0,
          awardAssemblies: 0,
          openIssues: 2,
          criticalIssues: 2,
        }),
      ).indice,
    ).toBe(0);
    const intermediate = calculateIndiceAderencia(
      { lanceDisponivelPercentual: '15', valorCreditoDesejado: '150' },
      group(),
    );
    expect(intermediate.indice).toBe(90);
  });
  it('is deterministic and contains no predictive fields or positive promises', () => {
    const profile = {
      valorCreditoDesejado: '150',
      lanceDisponivelPercentual: '15',
    };
    const first = calculateIndiceAderencia(profile, group());
    expect(calculateIndiceAderencia(profile, group())).toEqual(first);
    const text = JSON.stringify({
      ...first,
      disclaimer: undefined,
    }).toLowerCase();
    for (const forbidden of [
      'alta chance',
      'grande probabilidade',
      'garantimos contemplação',
      'winner',
      'best',
      'recommended',
      'contemplationprobability',
    ])
      expect(text).not.toContain(forbidden);
    expect(first.disclaimer).toContain('não representa probabilidade');
  });
});
