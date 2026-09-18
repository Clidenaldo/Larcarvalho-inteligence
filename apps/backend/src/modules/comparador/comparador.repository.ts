import type { ComparadorSearchQuery } from '@larcarvalho/shared';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

export interface ComparadorRow {
  grupo_id: string;
  grupo_codigo: string;
  grupo_status: string;
  prazo_meses: number | null;
  quantidade_cotas: number | null;
  credito_minimo: Prisma.Decimal | null;
  credito_maximo: Prisma.Decimal | null;
  administradora_id: string;
  administradora_nome: string;
  administradora_ativa: boolean;
  produto_id: string | null;
  produto_nome: string | null;
  produto_categoria: string | null;
  produto_ativo: boolean | null;
  parcela_snapshot: Prisma.Decimal | null;
  parcela_cotas: Prisma.Decimal | null;
  prazo_restante_minimo: number | null;
  prazo_restante_maximo: number | null;
  snapshot_id: string | null;
  snapshot_em: Date | null;
  assembleias_realizadas: number | null;
  assembleias_com_lance: number | null;
  assembleias_com_contemplacao: number | null;
  lances_registrados: number | null;
  lances_contemplados: number | null;
  lance_minimo: Prisma.Decimal | null;
  lance_medio: Prisma.Decimal | null;
  lance_mediano: Prisma.Decimal | null;
  lance_maximo: Prisma.Decimal | null;
  contemplacoes_registradas: number | null;
  contemplacoes_sorteio: number | null;
  contemplacoes_lance: number | null;
  contemplacoes_outras: number | null;
  issues_abertas: bigint;
  issues_criticas: bigint;
  total_count: bigint;
}

export interface CommercialPlanRow {
  tabela_id: string;
  tabela_nome: string;
  tabela_codigo: string;
  inicio_vigencia: Date;
  fim_vigencia: Date | null;
  administradora_id: string;
  administradora_nome: string;
  administradora_ativa: boolean;
  produto_id: string | null;
  produto_nome: string | null;
  produto_categoria: string;
  produto_ativo: boolean | null;
  item_id: string;
  codigo_plano: string | null;
  modalidade: string;
  credito_minimo: Prisma.Decimal;
  credito_maximo: Prisma.Decimal;
  parcela: Prisma.Decimal | null;
  primeira_parcela: Prisma.Decimal | null;
  demais_parcelas: Prisma.Decimal | null;
  parcela_padrao: Prisma.Decimal | null;
  seguro: Prisma.Decimal | null;
  taxa_antecipada_valor: Prisma.Decimal | null;
  taxa_antecipada_percentual: Prisma.Decimal | null;
  fundo_reserva_percentual: Prisma.Decimal | null;
  taxa_administracao_percentual: Prisma.Decimal | null;
  taxa_total_percentual: Prisma.Decimal | null;
  seguro_vida_percentual: Prisma.Decimal | null;
  participantes_grupo: number | null;
  prazo_meses: number;
  total_count: bigint;
}

const select = Prisma.sql`
  SELECT
    g.id AS grupo_id,
    g.codigo AS grupo_codigo,
    g.status AS grupo_status,
    g.prazo_meses,
    g.quantidade_cotas,
    g.valor_credito_minimo AS credito_minimo,
    g.valor_credito_maximo AS credito_maximo,
    a.id AS administradora_id,
    a.nome AS administradora_nome,
    a.ativa AS administradora_ativa,
    p.id AS produto_id,
    p.nome AS produto_nome,
    p.categoria AS produto_categoria,
    p.ativo AS produto_ativo,
    latest.parcela_media AS parcela_snapshot,
    quota.parcela_media AS parcela_cotas,
    quota.prazo_restante_minimo,
    quota.prazo_restante_maximo,
    latest.id AS snapshot_id,
    latest.data_referencia AS snapshot_em,
    latest.assembleias_realizadas,
    latest.assembleias_com_dados_lance AS assembleias_com_lance,
    latest.assembleias_com_dados_contemplacao AS assembleias_com_contemplacao,
    latest.lances_registrados,
    latest.lances_contemplados,
    latest.percentual_lance_contemplado_minimo AS lance_minimo,
    latest.percentual_lance_contemplado_medio AS lance_medio,
    latest.percentual_lance_contemplado_mediano AS lance_mediano,
    latest.percentual_lance_contemplado_maximo AS lance_maximo,
    latest.contemplacoes_registradas,
    latest.contemplacoes_sorteio,
    latest.contemplacoes_lance,
    latest.contemplacoes_outras,
    quality.issues_abertas,
    quality.issues_criticas,
    count(*) OVER() AS total_count
  FROM grupos g
  INNER JOIN administradoras a ON a.id = g.administradora_id
  LEFT JOIN produtos p ON p.id = g.produto_id
  LEFT JOIN LATERAL (
    SELECT h.*
    FROM grupo_historicos h
    WHERE h.grupo_id = g.id
    ORDER BY h.data_referencia DESC, h.id DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT
      avg(c.parcela_atual)::decimal(19,2) AS parcela_media,
      min(c.prazo_restante) AS prazo_restante_minimo,
      max(c.prazo_restante) AS prazo_restante_maximo
    FROM cotas c
    WHERE c.grupo_id = g.id
  ) quota ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE q.status IN ('OPEN', 'IN_REVIEW')) AS issues_abertas,
      count(*) FILTER (
        WHERE q.status IN ('OPEN', 'IN_REVIEW') AND q.severidade = 'CRITICAL'
      ) AS issues_criticas
    FROM data_quality_issues q
    WHERE q.grupo_id = g.id
  ) quality ON true
`;
const orderFields = {
  codigo: Prisma.sql`g.codigo`,
  administradora: Prisma.sql`a.nome`,
  creditoMinimo: Prisma.sql`g.valor_credito_minimo`,
  creditoMaximo: Prisma.sql`g.valor_credito_maximo`,
  prazo: Prisma.sql`g.prazo_meses`,
  maisRecente: Prisma.sql`latest.data_referencia`,
} as const;

const commercialSelect = Prisma.sql`
  SELECT
    t.id AS tabela_id, t.nome AS tabela_nome, t.codigo AS tabela_codigo,
    t.inicio_vigencia, t.fim_vigencia,
    a.id AS administradora_id, a.nome AS administradora_nome, a.ativa AS administradora_ativa,
    p.id AS produto_id, p.nome AS produto_nome, t.categoria AS produto_categoria,
    p.ativo AS produto_ativo, i.id AS item_id, i.codigo_plano,
    i.modalidade::text AS modalidade, i.credito_referencia AS credito_minimo,
    i.credito_referencia AS credito_maximo,
    COALESCE(i.parcela_padrao, i.demais_parcelas, i.primeira_parcela) AS parcela,
    i.primeira_parcela, i.demais_parcelas, i.parcela_padrao,
    i.seguro, i.taxa_antecipada_valor, i.taxa_antecipada_percentual,
    i.fundo_reserva_percentual, i.taxa_administracao_percentual,
    i.taxa_total_percentual, i.seguro_vida_percentual, i.participantes_grupo,
    i.prazo_meses, count(*) OVER() AS total_count
  FROM tabelas_comerciais t
  INNER JOIN tabelas_comerciais_itens i ON i.tabela_comercial_id = t.id
  INNER JOIN administradoras a ON a.id = t.administradora_id
  LEFT JOIN produtos p ON p.id = t.produto_id
`;

export class ComparadorRepository {
  constructor(private readonly db: PrismaClient) {}

  async search(query: ComparadorSearchQuery) {
    const filters: Prisma.Sql[] = [Prisma.sql`g.status = ${query.status}`];
    if (!query.incluirInativos) {
      filters.push(Prisma.sql`a.ativa = true`);
      filters.push(Prisma.sql`(p.id IS NULL OR p.ativo = true)`);
    }
    if (query.categoria)
      filters.push(Prisma.sql`p.categoria = ${query.categoria}`);
    if (query.administradoraId)
      filters.push(
        Prisma.sql`g.administradora_id = ${query.administradoraId}::uuid`,
      );
    if (query.valorCreditoDesejado) {
      filters.push(
        Prisma.sql`g.valor_credito_minimo <= ${query.valorCreditoDesejado}::decimal`,
      );
      filters.push(
        Prisma.sql`g.valor_credito_maximo >= ${query.valorCreditoDesejado}::decimal`,
      );
    }
    if (query.parcelaMaxima)
      filters.push(
        Prisma.sql`COALESCE(latest.parcela_media, quota.parcela_media) <= ${query.parcelaMaxima}::decimal`,
      );
    if (query.prazoMinimo !== undefined)
      filters.push(Prisma.sql`g.prazo_meses >= ${query.prazoMinimo}`);
    if (query.prazoMaximo !== undefined)
      filters.push(Prisma.sql`g.prazo_meses <= ${query.prazoMaximo}`);
    const direction =
      query.sortDirection === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const order = orderFields[query.sort];
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db.$queryRaw<ComparadorRow[]>(Prisma.sql`
      ${select}
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY ${order} ${direction} NULLS LAST, g.id ASC
      LIMIT ${query.pageSize} OFFSET ${offset}
    `);
    return {
      rows,
      total: rows[0] ? Number(rows[0].total_count) : 0,
    };
  }

  byIds(ids: string[]) {
    return this.db.$queryRaw<ComparadorRow[]>(Prisma.sql`
      ${select}
      WHERE g.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY g.id ASC
    `);
  }

  async commercialPlans(query: ComparadorSearchQuery) {
    const filters: Prisma.Sql[] = [
      Prisma.sql`t.deleted_at IS NULL`,
      Prisma.sql`t.status = 'ATIVA'`,
      Prisma.sql`t.inicio_vigencia <= CURRENT_DATE`,
      Prisma.sql`(t.fim_vigencia IS NULL OR t.fim_vigencia >= CURRENT_DATE)`,
    ];
    if (!query.incluirInativos) {
      filters.push(Prisma.sql`a.ativa = true`);
      filters.push(Prisma.sql`(p.id IS NULL OR p.ativo = true)`);
    }
    if (query.categoria)
      filters.push(Prisma.sql`t.categoria = ${query.categoria}`);
    if (query.administradoraId)
      filters.push(
        Prisma.sql`t.administradora_id = ${query.administradoraId}::uuid`,
      );
    if (query.valorCreditoDesejado)
      filters.push(
        Prisma.sql`i.credito_referencia = ${query.valorCreditoDesejado}::decimal`,
      );
    if (query.parcelaMaxima)
      filters.push(
        Prisma.sql`COALESCE(i.parcela_padrao, i.demais_parcelas, i.primeira_parcela) <= ${query.parcelaMaxima}::decimal`,
      );
    if (query.prazoMinimo !== undefined)
      filters.push(Prisma.sql`i.prazo_meses >= ${query.prazoMinimo}`);
    if (query.prazoMaximo !== undefined)
      filters.push(Prisma.sql`i.prazo_meses <= ${query.prazoMaximo}`);
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db.$queryRaw<CommercialPlanRow[]>(Prisma.sql`
      ${commercialSelect}
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY t.codigo ASC, t.inicio_vigencia DESC, t.id DESC, i.prazo_meses ASC, i.id ASC
      LIMIT ${query.pageSize} OFFSET ${offset}
    `);
    return { rows, total: rows[0] ? Number(rows[0].total_count) : 0 };
  }

  commercialPlansByIds(ids: string[]) {
    return this.db.$queryRaw<CommercialPlanRow[]>(Prisma.sql`
      ${commercialSelect}
      WHERE i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY i.id ASC
    `);
  }
}
