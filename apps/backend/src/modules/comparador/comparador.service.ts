import type {
  ComparadorSearchQuery,
  CompararGruposRequest,
  Permission,
} from '@larcarvalho/shared';
import { comparadorGroupSchema } from '@larcarvalho/shared';
import type { SimuladorPublicoPerfil } from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import {
  ComparadorRepository,
  type CommercialPlanRow,
  type ComparadorRow,
} from './comparador.repository.js';

type Compatibility = 'ATENDE' | 'NAO_ATENDE' | 'INDISPONIVEL';
const decimal = (value: Prisma.Decimal | null) => value?.toString() ?? null;
const creditCompatibility = (
  row: ComparadorRow,
  desired?: string,
): Compatibility | null => {
  if (!desired) return null;
  if (!row.credito_minimo || !row.credito_maximo) return 'INDISPONIVEL';
  const value = new Prisma.Decimal(desired);
  return row.credito_minimo.lte(value) && row.credito_maximo.gte(value)
    ? 'ATENDE'
    : 'NAO_ATENDE';
};
const installment = (row: ComparadorRow) =>
  row.parcela_snapshot ?? row.parcela_cotas;
const installmentCompatibility = (
  row: ComparadorRow,
  maximum?: string,
): Compatibility | null => {
  if (!maximum) return null;
  const known = installment(row);
  if (!known) return 'INDISPONIVEL';
  return known.lte(new Prisma.Decimal(maximum)) ? 'ATENDE' : 'NAO_ATENDE';
};
const termCompatibility = (
  row: ComparadorRow,
  minimum?: number,
  maximum?: number,
): Compatibility | null => {
  if (minimum === undefined && maximum === undefined) return null;
  if (row.prazo_meses === null) return 'INDISPONIVEL';
  return (minimum === undefined || row.prazo_meses >= minimum) &&
    (maximum === undefined || row.prazo_meses <= maximum)
    ? 'ATENDE'
    : 'NAO_ATENDE';
};
const historyState = (row: ComparadorRow) => {
  if (!row.snapshot_id) return 'INDISPONIVEL' as const;
  if (
    row.assembleias_realizadas !== null &&
    row.assembleias_realizadas > 0 &&
    row.assembleias_com_lance === row.assembleias_realizadas &&
    row.assembleias_com_contemplacao === row.assembleias_realizadas
  )
    return 'DISPONIVEL' as const;
  return 'PARCIAL' as const;
};
const compatibilityReasons = (
  row: ComparadorRow,
  criteria: {
    categoria?: string | undefined;
    administradoraId?: string | undefined;
    valorCreditoDesejado?: string | undefined;
    parcelaMaxima?: string | undefined;
    prazoMinimo?: number | undefined;
    prazoMaximo?: number | undefined;
    status?: string | undefined;
    incluirInativos?: boolean | undefined;
  },
) => {
  const reasons: string[] = [];
  const explain = (label: string, state: Compatibility | null) =>
    state === 'ATENDE'
      ? `${label}: atende ao critério informado.`
      : state === 'NAO_ATENDE'
        ? `${label}: não atende ao critério informado.`
        : `${label}: dado indisponível.`;
  if (criteria.categoria)
    reasons.push(`Categoria ${criteria.categoria} corresponde ao filtro.`);
  if (criteria.administradoraId)
    reasons.push('Administradora corresponde ao filtro informado.');
  if (criteria.valorCreditoDesejado)
    reasons.push(
      explain(
        'Crédito',
        creditCompatibility(row, criteria.valorCreditoDesejado),
      ),
    );
  if (criteria.parcelaMaxima)
    reasons.push(
      explain('Parcela', installmentCompatibility(row, criteria.parcelaMaxima)),
    );
  if (criteria.prazoMinimo !== undefined || criteria.prazoMaximo !== undefined)
    reasons.push(
      explain(
        'Prazo',
        termCompatibility(row, criteria.prazoMinimo, criteria.prazoMaximo),
      ),
    );
  if (criteria.status)
    reasons.push(`Status atual corresponde a ${criteria.status}.`);
  if (!criteria.incluirInativos)
    reasons.push('Administradora e produto estão ativos ou não classificados.');
  return reasons;
};

export class ComparadorService {
  private readonly repository;
  constructor(database: PrismaClient) {
    this.repository = new ComparadorRepository(database);
  }
  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private dto(
    row: ComparadorRow,
    criteria: {
      categoria?: string | undefined;
      administradoraId?: string | undefined;
      valorCreditoDesejado?: string | undefined;
      parcelaMaxima?: string | undefined;
      prazoMinimo?: number | undefined;
      prazoMaximo?: number | undefined;
      status?: string | undefined;
      incluirInativos?: boolean | undefined;
    },
  ) {
    const knownInstallment = installment(row);
    return {
      origem: 'GRUPO' as const,
      grupo: {
        id: row.grupo_id,
        codigo: row.grupo_codigo,
        status: row.grupo_status,
        quantidadeCotas: row.quantidade_cotas,
      },
      tabelaComercial: null,
      administradora: {
        id: row.administradora_id,
        nome: row.administradora_nome,
        ativa: row.administradora_ativa,
      },
      produto:
        row.produto_id && row.produto_nome && row.produto_categoria
          ? {
              id: row.produto_id,
              nome: row.produto_nome,
              categoria: row.produto_categoria,
              ativo: row.produto_ativo ?? false,
            }
          : null,
      credito: {
        minimo: decimal(row.credito_minimo),
        maximo: decimal(row.credito_maximo),
        compatibilidade: creditCompatibility(
          row,
          criteria.valorCreditoDesejado,
        ),
      },
      parcela: {
        valorConhecido: decimal(knownInstallment),
        origem: row.parcela_snapshot
          ? ('SNAPSHOT' as const)
          : row.parcela_cotas
            ? ('COTAS_ATUAIS' as const)
            : null,
        compatibilidade: installmentCompatibility(row, criteria.parcelaMaxima),
      },
      prazo: {
        totalMeses: row.prazo_meses,
        restanteMinimo: row.prazo_restante_minimo,
        restanteMaximo: row.prazo_restante_maximo,
        compatibilidade: termCompatibility(
          row,
          criteria.prazoMinimo,
          criteria.prazoMaximo,
        ),
      },
      historico: {
        estado: historyState(row),
        snapshotId: row.snapshot_id,
        capturadoEm: row.snapshot_em?.toISOString() ?? null,
        assembleiasRealizadas: row.assembleias_realizadas,
        lancesRegistrados: row.lances_registrados,
        lancesContemplados: row.lances_contemplados,
        percentualLanceMinimo: decimal(row.lance_minimo),
        percentualLanceMedio: decimal(row.lance_medio),
        percentualLanceMediano: decimal(row.lance_mediano),
        percentualLanceMaximo: decimal(row.lance_maximo),
        contemplacoesRegistradas: row.contemplacoes_registradas,
        contemplacoesSorteio: row.contemplacoes_sorteio,
        contemplacoesLance: row.contemplacoes_lance,
        contemplacoesOutras: row.contemplacoes_outras,
      },
      cobertura: {
        assembleiasRealizadas: row.assembleias_realizadas,
        assembleiasComDadosLance: row.assembleias_com_lance,
        assembleiasComDadosContemplacao: row.assembleias_com_contemplacao,
        percentualLances:
          row.assembleias_realizadas && row.assembleias_com_lance !== null
            ? row.assembleias_com_lance / row.assembleias_realizadas
            : null,
      },
      qualidade: {
        issuesAbertas: Number(row.issues_abertas),
        issuesCriticas: Number(row.issues_criticas),
      },
      financeiro: null,
      motivosCompatibilidade: compatibilityReasons(row, criteria),
    };
  }
  private commercialDto(row: CommercialPlanRow, criteria: Parameters<typeof compatibilityReasons>[1]) {
    const compatibilityRow = {
      credito_minimo: row.credito_minimo,
      credito_maximo: row.credito_maximo,
      parcela_snapshot: row.parcela,
      parcela_cotas: null,
      prazo_meses: row.prazo_meses,
    } as ComparadorRow;
    return {
      origem: 'PLANO_COMERCIAL' as const,
      grupo: {
        id: row.tabela_id,
        codigo: row.tabela_codigo,
        status: 'ATIVO',
        quantidadeCotas: null,
      },
      tabelaComercial: {
        id: row.tabela_id,
        nome: row.tabela_nome,
        codigo: row.tabela_codigo,
        itemId: row.item_id,
        codigoPlano: row.codigo_plano,
        modalidade: row.modalidade,
        vigenciaInicio: row.inicio_vigencia.toISOString(),
        vigenciaFim: row.fim_vigencia?.toISOString() ?? null,
      },
      administradora: {
        id: row.administradora_id,
        nome: row.administradora_nome,
        ativa: row.administradora_ativa,
      },
      produto: {
        id: row.produto_id ?? row.tabela_id,
        nome: row.produto_nome ?? row.tabela_nome,
        categoria: row.produto_categoria,
        ativo: row.produto_ativo ?? true,
      },
      credito: {
        minimo: decimal(row.credito_minimo),
        maximo: decimal(row.credito_maximo),
        compatibilidade: creditCompatibility(compatibilityRow, criteria.valorCreditoDesejado),
      },
      parcela: {
        valorConhecido: decimal(row.parcela),
        origem: row.parcela ? ('SNAPSHOT' as const) : null,
        compatibilidade: installmentCompatibility(compatibilityRow, criteria.parcelaMaxima),
      },
      prazo: {
        totalMeses: row.prazo_meses,
        restanteMinimo: null,
        restanteMaximo: null,
        compatibilidade: termCompatibility(compatibilityRow, criteria.prazoMinimo, criteria.prazoMaximo),
      },
      historico: {
        estado: 'INDISPONIVEL' as const,
        snapshotId: null,
        capturadoEm: null,
        assembleiasRealizadas: null,
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
        assembleiasRealizadas: null,
        assembleiasComDadosLance: null,
        assembleiasComDadosContemplacao: null,
        percentualLances: null,
      },
      qualidade: { issuesAbertas: 0, issuesCriticas: 0 },
      financeiro: {
        primeiraParcela: decimal(row.primeira_parcela),
        demaisParcelas: decimal(row.demais_parcelas),
        parcelaPadrao: decimal(row.parcela_padrao),
        seguro: decimal(row.seguro),
        taxaAntecipadaValor: decimal(row.taxa_antecipada_valor),
        taxaAntecipadaPercentual: decimal(row.taxa_antecipada_percentual),
        fundoReservaPercentual: decimal(row.fundo_reserva_percentual),
        taxaAdministracaoPercentual: decimal(
          row.taxa_administracao_percentual,
        ),
        taxaTotalPercentual: decimal(row.taxa_total_percentual),
        seguroVidaPercentual: decimal(row.seguro_vida_percentual),
        participantesGrupo: row.participantes_grupo,
      },
      motivosCompatibilidade: [
        `Plano comercial ${row.tabela_codigo} vigente e disponível para comparação.`,
      ],
    };
  }
  async search(actor: AuthContext, query: ComparadorSearchQuery) {
    this.allow(actor, 'comparador.read');
    const [groups, commercialPlans] = await Promise.all([
      this.repository.search(query),
      this.repository.commercialPlans(query),
    ]);
    const items = [
      ...groups.rows.map((row) => this.dto(row, query)),
      ...commercialPlans.rows.map((row) => this.commercialDto(row, query)),
    ];
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: groups.total + commercialPlans.total,
      totalPages: items.length ? Math.ceil((groups.total + commercialPlans.total) / query.pageSize) : 0,
    };
  }
  async compare(actor: AuthContext, input: CompararGruposRequest) {
    this.allow(actor, 'comparador.read');
    const [groupRows, planRows] = await Promise.all([
      this.repository.byIds(input.grupoIds),
      this.repository.commercialPlansByIds(input.grupoIds),
    ]);
    const byId = new Map<string, ComparadorRow | CommercialPlanRow>();
    groupRows.forEach((row) => byId.set(row.grupo_id, row));
    planRows.forEach((row) => byId.set(row.item_id, row));
    const missing = input.grupoIds.filter((id) => !byId.has(id));
    if (missing.length)
      throw new AppError({
        code: 'COMPARADOR_GROUP_NOT_FOUND',
        message: 'Um ou mais grupos ou planos não foram encontrados',
        statusCode: 404,
      });
    const categories = new Set(
      [...groupRows, ...planRows].flatMap((row) =>
        row.produto_categoria ? [row.produto_categoria] : [],
      ),
    );
    if (categories.size > 1 && !input.permitirCategoriasDiferentes)
      throw new AppError({
        code: 'COMPARADOR_CONFLICT',
        message:
          'Categorias diferentes exigem confirmação explícita para comparação',
        statusCode: 409,
      });
    const criteria = {
      ...(input.valorCreditoDesejado
        ? { valorCreditoDesejado: input.valorCreditoDesejado }
        : {}),
      ...(input.parcelaMaxima ? { parcelaMaxima: input.parcelaMaxima } : {}),
      ...(input.prazoMinimo !== undefined
        ? { prazoMinimo: input.prazoMinimo }
        : {}),
      ...(input.prazoMaximo !== undefined
        ? { prazoMaximo: input.prazoMaximo }
        : {}),
    };
    const render = (row: ComparadorRow | CommercialPlanRow) =>
      'item_id' in row
        ? this.commercialDto(row, criteria)
        : this.dto(row, criteria);
    return {
      criterios: criteria,
      items: input.grupoIds.map((id) => render(byId.get(id)!)),
      disclaimer:
        'Os dados apresentados são históricos e informativos. Resultados anteriores de assembleias e lances não garantem contemplação futura.',
    };
  }

  async groupsForEvaluation(actor: AuthContext, ids: string[]) {
    this.allow(actor, 'comparador.read');
    const rows = await this.repository.byIds(ids);
    if (rows.length !== ids.length)
      throw new AppError({
        code: 'COMPARADOR_GROUP_NOT_FOUND',
        message: 'Um ou mais grupos não foram encontrados',
        statusCode: 404,
      });
    const byId = new Map(rows.map((row) => [row.grupo_id, row]));
    return ids.map((id) =>
      comparadorGroupSchema.parse(this.dto(byId.get(id)!, {})),
    );
  }

  async publicCandidates(profile: SimuladorPublicoPerfil, limit: number) {
    const query: ComparadorSearchQuery = {
      categoria: profile.categoria,
      valorCreditoDesejado: profile.valorCreditoDesejado,
      ...(profile.parcelaMaxima
        ? { parcelaMaxima: profile.parcelaMaxima }
        : {}),
      ...(profile.prazoMaximo !== undefined
        ? { prazoMaximo: profile.prazoMaximo }
        : {}),
      status: 'ATIVO',
      incluirInativos: false,
      page: 1,
      pageSize: limit,
      sort: 'codigo',
      sortDirection: 'asc',
    };
    const [result, commercialPlans] = await Promise.all([
      this.repository.search(query),
      this.repository.commercialPlans(query),
    ]);
    return {
      items: [
        ...result.rows.map((row) => comparadorGroupSchema.parse(this.dto(row, query))),
        ...commercialPlans.rows.map((row) => comparadorGroupSchema.parse(this.commercialDto(row, query))),
      ],
      total: result.total + commercialPlans.total,
    };
  }
}
