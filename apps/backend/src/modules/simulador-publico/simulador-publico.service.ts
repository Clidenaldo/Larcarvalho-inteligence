import type {
  ComparadorGroup,
  IndiceAderenciaResult,
  SimuladorPublicoItem,
  SimuladorPublicoRequest,
  SimuladorPublicoResponse,
} from '@larcarvalho/shared';
import type { AppConfig } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { ComparadorService } from '../comparador/comparador.service.js';
import { calculateIndiceAderencia } from '../indice-aderencia/indice-aderencia.engine.js';

interface SimulationMetrics {
  candidateCount: number;
  evaluatedCount: number;
  queryDurationMs: number;
  calculationDurationMs: number;
  totalDurationMs: number;
}

const publicHistoryStatus = (
  group: ComparadorGroup,
): SimuladorPublicoItem['historicoStatus'] =>
  group.historico.estado === 'INDISPONIVEL'
    ? 'DADOS_INSUFICIENTES'
    : group.historico.estado === 'PARCIAL' || group.qualidade.issuesCriticas > 0
      ? 'DADOS_HISTORICOS_PARCIAIS'
      : 'DADOS_DISPONIVEIS';

const toPublicItem = (
  group: ComparadorGroup,
  adherence: IndiceAderenciaResult,
): SimuladorPublicoItem => ({
  origem: group.origem ?? 'GRUPO',
  administradora: group.administradora.nome,
  grupo: group.grupo?.codigo ?? group.tabelaComercial?.codigo ?? 'Plano comercial',
  tabelaComercial: group.tabelaComercial
    ? {
        id: group.tabelaComercial.id,
        codigo: group.tabelaComercial.codigo,
        nome: group.tabelaComercial.nome,
        itemId: group.tabelaComercial.itemId,
      }
    : null,
  categoria: group.produto?.categoria ?? 'OUTROS',
  credito: { minimo: group.credito.minimo, maximo: group.credito.maximo },
  parcelaConhecida: group.parcela.valorConhecido,
  prazoMeses: group.prazo.totalMeses,
  indiceAderencia: adherence.indice,
  classificacao: adherence.classificacao,
  coberturaAvaliacao: adherence.coberturaAvaliacao,
  historicoStatus: publicHistoryStatus(group),
  historicoObservado: {
    lanceMinimo: group.historico.percentualLanceMinimo,
    lanceMediano: group.historico.percentualLanceMediano,
    lanceMaximo: group.historico.percentualLanceMaximo,
    assembleiasAnalisadas: group.historico.assembleiasRealizadas,
  },
  componentes: adherence.componentes.map((component) => ({
    nome: component.nome,
    status: component.status,
    pesoAvaliado: component.pesoAvaliado,
    pontuacaoPonderada: component.pontuacaoPonderada,
    explicacao: component.explicacao,
  })),
});

const compareItems = (a: SimuladorPublicoItem, b: SimuladorPublicoItem) => {
  if (a.indiceAderencia === null && b.indiceAderencia !== null) return 1;
  if (a.indiceAderencia !== null && b.indiceAderencia === null) return -1;
  if (
    a.indiceAderencia !== null &&
    b.indiceAderencia !== null &&
    a.indiceAderencia !== b.indiceAderencia
  )
    return b.indiceAderencia - a.indiceAderencia;
  const byCode = a.grupo.localeCompare(b.grupo, 'pt-BR');
  return byCode || a.administradora.localeCompare(b.administradora, 'pt-BR');
};

export class SimuladorPublicoService {
  constructor(
    private readonly comparador: ComparadorService,
    private readonly config: AppConfig,
  ) {}

  async simulate(input: SimuladorPublicoRequest): Promise<{
    response: SimuladorPublicoResponse;
    metrics: SimulationMetrics;
  }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.execute(input),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new AppError({
                  code: 'SIMULATION_TIMEOUT',
                  message: 'Não foi possível concluir sua simulação agora',
                  statusCode: 503,
                }),
              ),
            this.config.PUBLIC_SIMULATOR_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async execute(input: SimuladorPublicoRequest) {
    const totalStarted = performance.now();
    const queryStarted = performance.now();
    const candidates = await this.comparador.publicCandidates(
      input.perfil,
      this.config.PUBLIC_SIMULATOR_CANDIDATE_LIMIT,
    );
    const queryDurationMs = performance.now() - queryStarted;
    const calculationStarted = performance.now();
    const sorted = candidates.items
      .map((group) =>
        toPublicItem(group, calculateIndiceAderencia(input.perfil, group)),
      )
      .sort(compareItems);
    const calculationDurationMs = performance.now() - calculationStarted;
    const offset = (input.page - 1) * input.pageSize;
    const pageItems = sorted.slice(offset, offset + input.pageSize);
    const totalDurationMs = performance.now() - totalStarted;
    return {
      response: {
        items: pageItems,
        page: input.page,
        pageSize: input.pageSize,
        total: sorted.length,
        totalPages: sorted.length
          ? Math.ceil(sorted.length / input.pageSize)
          : 0,
        totalCandidatos: candidates.total,
        limiteCandidatos: this.config.PUBLIC_SIMULATOR_CANDIDATE_LIMIT,
        limiteAtingido:
          candidates.total > this.config.PUBLIC_SIMULATOR_CANDIDATE_LIMIT,
        disclaimer:
          'O Índice de Aderência mede compatibilidade entre os critérios informados e os dados conhecidos do grupo. Ele não representa probabilidade, promessa ou garantia de contemplação.',
      },
      metrics: {
        candidateCount: candidates.total,
        evaluatedCount: sorted.length,
        queryDurationMs: Math.round(queryDurationMs),
        calculationDurationMs: Math.round(calculationDurationMs),
        totalDurationMs: Math.round(totalDurationMs),
      },
    };
  }
}
