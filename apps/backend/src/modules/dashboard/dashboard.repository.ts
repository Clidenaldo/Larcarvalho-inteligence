import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { ACTIVE_LEAD_STATUSES } from '../leads/lead-rules.js';

type Window = { from: Date; to: Date; previousFrom: Date; previousTo: Date };
type LeadScope = Prisma.LeadWhereInput;
type CountItem = { key: string; label: string; value: number };

const countOf = (value: unknown) => Number(value ?? 0);
const grouped = <T extends { _count: unknown }>(
  rows: T[],
  key: (row: T) => string,
): CountItem[] =>
  rows.map((row) => ({
    key: key(row),
    label: key(row),
    value:
      typeof row._count === 'number'
        ? row._count
        : countOf((row._count as { _all?: number })._all),
  }));

export class DashboardRepository {
  constructor(private readonly db: PrismaClient) {}

  async consorcios(now: Date, staleAfterDays: number) {
    const staleAt = new Date(now.getTime() - staleAfterDays * 86_400_000);
    const [
      administradorasAtivas,
      produtosAtivos,
      gruposAtivos,
      cotasAtivas,
      assembleias,
      lances,
      contemplacoes,
      categories,
      administrators,
      creditBands,
      snapshotTotals,
    ] = await Promise.all([
      this.db.administradora.count({ where: { ativa: true } }),
      this.db.produto.count({ where: { ativo: true } }),
      this.db.grupo.count({ where: { status: 'ATIVO' } }),
      this.db.cota.count({ where: { status: 'ATIVO' } }),
      this.db.assembleia.count(),
      this.db.lance.count(),
      this.db.contemplacao.count(),
      this.db.$queryRaw<Array<{ key: string; value: bigint }>>(Prisma.sql`
        SELECT CASE WHEN UPPER(COALESCE(p.categoria, '')) IN ('IMOVEL','AUTOMOVEL','MOTOCICLETA','PESADOS','SERVICOS') THEN UPPER(p.categoria) ELSE 'OUTROS' END AS key,
               COUNT(*)::bigint AS value
        FROM grupos g LEFT JOIN produtos p ON p.id = g.produto_id
        WHERE g.status = 'ATIVO'
        GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<
        Array<{ key: string; label: string; value: bigint }>
      >(Prisma.sql`
        WITH counts AS (SELECT a.id::text AS key, a.nome AS label, COUNT(g.id)::bigint AS value
          FROM administradoras a JOIN grupos g ON g.administradora_id=a.id AND g.status='ATIVO'
          GROUP BY a.id,a.nome), ranked AS (SELECT *, ROW_NUMBER() OVER (ORDER BY value DESC,label ASC) AS rn FROM counts)
        SELECT key,label,value FROM ranked WHERE rn<=5
        UNION ALL SELECT 'OUTRAS','Outras',SUM(value)::bigint FROM ranked WHERE rn>5 HAVING COUNT(*)>0
        ORDER BY value DESC,label ASC`),
      this.db.$queryRaw<
        Array<{ key: string; label: string; value: bigint }>
      >(Prisma.sql`
        SELECT bucket AS key, bucket AS label, COUNT(*)::bigint AS value FROM (
          SELECT CASE WHEN valor_credito_minimo IS NULL THEN 'Não informado'
            WHEN valor_credito_minimo < 100000 THEN 'Até R$ 99.999'
            WHEN valor_credito_minimo < 250000 THEN 'R$ 100 mil a R$ 249.999'
            WHEN valor_credito_minimo < 500000 THEN 'R$ 250 mil a R$ 499.999'
            ELSE 'R$ 500 mil ou mais' END AS bucket
          FROM grupos WHERE status='ATIVO') bands GROUP BY bucket ORDER BY bucket`),
      this.db.$queryRaw<
        Array<{
          total: bigint;
          stale: bigint;
          bid_coverage: string | null;
          award_coverage: string | null;
        }>
      >(Prisma.sql`
        WITH latest AS (SELECT DISTINCT ON (grupo_id) grupo_id,data_referencia,assembleias_realizadas,assembleias_com_dados_lance,assembleias_com_dados_contemplacao
          FROM grupo_historicos ORDER BY grupo_id,data_referencia DESC), active AS (SELECT id FROM grupos WHERE status='ATIVO')
        SELECT (SELECT COUNT(*) FROM grupo_historicos)::bigint AS total,
          COUNT(*) FILTER (WHERE l.data_referencia IS NULL OR l.data_referencia < ${staleAt})::bigint AS stale,
          AVG(CASE WHEN l.assembleias_realizadas > 0 THEN l.assembleias_com_dados_lance::numeric/l.assembleias_realizadas END)::text AS bid_coverage,
          AVG(CASE WHEN l.assembleias_realizadas > 0 THEN l.assembleias_com_dados_contemplacao::numeric/l.assembleias_realizadas END)::text AS award_coverage
        FROM active a LEFT JOIN latest l ON l.grupo_id=a.id`),
    ]);
    const snapshots = snapshotTotals[0] ?? {
      total: 0n,
      stale: 0n,
      bid_coverage: null,
      award_coverage: null,
    };
    return {
      totals: {
        administradorasAtivas,
        produtosAtivos,
        gruposAtivos,
        cotasAtivas,
        assembleias,
        lances,
        contemplacoes,
      },
      categories: categories.map((x) => ({
        key: x.key,
        label: x.key,
        value: Number(x.value),
      })),
      administrators: administrators.map((x) => ({
        ...x,
        value: Number(x.value),
      })),
      creditBands: creditBands.map((x) => ({ ...x, value: Number(x.value) })),
      snapshots: {
        total: Number(snapshots.total),
        staleGroups: Number(snapshots.stale),
        averageBidCoverage:
          snapshots.bid_coverage === null
            ? null
            : Number(snapshots.bid_coverage),
        averageAwardCoverage:
          snapshots.award_coverage === null
            ? null
            : Number(snapshots.award_coverage),
        staleAfterDays,
      },
    };
  }

  async quality(window: Window) {
    const [
      statuses,
      severities,
      currentResolved,
      previousResolved,
      topRules,
      criticalOpen,
    ] = await Promise.all([
      this.db.dataQualityIssue.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.db.dataQualityIssue.groupBy({
        by: ['severidade'],
        where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
        _count: { _all: true },
        orderBy: { severidade: 'asc' },
      }),
      this.db.dataQualityIssue.count({
        where: {
          status: 'RESOLVED',
          resolvedAt: { gte: window.from, lt: window.to },
        },
      }),
      this.db.dataQualityIssue.count({
        where: {
          status: 'RESOLVED',
          resolvedAt: { gte: window.previousFrom, lt: window.previousTo },
        },
      }),
      this.db.dataQualityIssue.groupBy({
        by: ['codigo'],
        where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
        _count: { _all: true },
        orderBy: { _count: { codigo: 'desc' } },
        take: 5,
      }),
      this.db.dataQualityIssue.count({
        where: {
          status: { in: ['OPEN', 'IN_REVIEW'] },
          severidade: 'CRITICAL',
        },
      }),
    ]);
    return {
      statuses: grouped(statuses, (x) => x.status),
      severities: grouped(severities, (x) => x.severidade),
      currentResolved,
      previousResolved,
      topRules: grouped(topRules, (x) => x.codigo),
      criticalOpen,
    };
  }

  async integrations(window: Window) {
    const eligible = ['SUCESSO', 'SUCESSO_PARCIAL', 'FALHA'] as const;
    const [statuses, runs, aggregate, duration, last, recent] =
      await Promise.all([
        this.db.integration.groupBy({
          by: ['status'],
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.db.integrationRun.groupBy({
          by: ['status'],
          where: { iniciadoEm: { gte: window.from, lt: window.to } },
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.db.integrationRun.aggregate({
          where: {
            iniciadoEm: { gte: window.from, lt: window.to },
            status: { in: [...eligible] },
          },
          _sum: { registrosRecebidos: true },
          _count: { _all: true },
        }),
        this.db.$queryRaw<Array<{ average_ms: string | null }>>(
          Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM (finalizado_em-iniciado_em))*1000)::text AS average_ms FROM integration_runs WHERE iniciado_em>=${window.from} AND iniciado_em<${window.to} AND status IN ('SUCESSO'::integration_run_status,'SUCESSO_PARCIAL'::integration_run_status,'FALHA'::integration_run_status) AND finalizado_em IS NOT NULL`,
        ),
        this.db.integration.aggregate({ _max: { ultimoSucessoEm: true } }),
        this.db.integrationRun.findMany({
          where: { iniciadoEm: { gte: window.from, lt: window.to } },
          orderBy: { iniciadoEm: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            iniciadoEm: true,
            finalizadoEm: true,
            integration: { select: { id: true, nome: true } },
          },
        }),
      ]);
    const success = runs.find((x) => x.status === 'SUCESSO')?._count._all ?? 0;
    const completed = runs
      .filter((x) => eligible.includes(x.status as (typeof eligible)[number]))
      .reduce((sum, x) => sum + x._count._all, 0);
    return {
      statuses: grouped(statuses, (x) => x.status),
      runs: grouped(runs, (x) => x.status),
      successRate: completed ? success / completed : null,
      averageDurationMs:
        duration[0]?.average_ms === null ||
        duration[0]?.average_ms === undefined
          ? null
          : Math.round(Number(duration[0].average_ms)),
      processedRecords: aggregate._sum.registrosRecebidos ?? 0,
      lastSuccessAt: last._max.ultimoSucessoEm,
      recent,
    };
  }

  async imports(window: Window) {
    const where = { iniciadaEm: { gte: window.from, lt: window.to } };
    const [statuses, aggregate, generatedIssues, recent] = await Promise.all([
      this.db.importacao.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.db.importacao.aggregate({
        where,
        _sum: { registrosProcessados: true },
      }),
      this.db.dataQualityIssue.count({
        where: {
          origem: 'IMPORTACAO',
          createdAt: { gte: window.from, lt: window.to },
        },
      }),
      this.db.importacao.findMany({
        where,
        orderBy: { iniciadaEm: 'desc' },
        take: 5,
        select: {
          id: true,
          nomeArquivo: true,
          tipo: true,
          status: true,
          iniciadaEm: true,
        },
      }),
    ]);
    return {
      statuses: grouped(statuses, (x) => x.status),
      processedRecords: aggregate._sum.registrosProcessados ?? 0,
      generatedIssues,
      recent,
    };
  }

  async crm(
    window: Window,
    scope: LeadScope,
    includeTeam: boolean,
    today: { start: Date; end: Date },
    now: Date,
    userScope: Prisma.UserWhereInput = {},
  ) {
    const base = { AND: [scope] };
    const active = { in: [...ACTIVE_LEAD_STATUSES] };
    const [
      activeNow,
      currentNew,
      previousNew,
      currentConverted,
      previousConverted,
      lostNow,
      funnel,
      origins,
      categories,
      todayContacts,
      overdue,
      upcoming,
      withoutNext,
      unassignedActive,
      recentLeads,
      recentInteractions,
      sellers,
      teamStatuses,
      teamOverdue,
      contacts,
    ] = await Promise.all([
      this.db.lead.count({ where: { ...base, status: active } }),
      this.db.lead.count({
        where: { ...base, createdAt: { gte: window.from, lt: window.to } },
      }),
      this.db.lead.count({
        where: {
          ...base,
          createdAt: { gte: window.previousFrom, lt: window.previousTo },
        },
      }),
      this.db.lead.count({
        where: {
          ...base,
          status: 'CONVERTIDO',
          convertidoEm: { gte: window.from, lt: window.to },
        },
      }),
      this.db.lead.count({
        where: {
          ...base,
          status: 'CONVERTIDO',
          convertidoEm: { gte: window.previousFrom, lt: window.previousTo },
        },
      }),
      this.db.lead.count({ where: { ...base, status: 'PERDIDO' } }),
      this.db.lead.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.db.lead.groupBy({
        by: ['origem'],
        where: { ...base, createdAt: { gte: window.from, lt: window.to } },
        _count: { _all: true },
        orderBy: { origem: 'asc' },
      }),
      this.db.lead.groupBy({
        by: ['categoriaInteresse'],
        where: {
          ...base,
          createdAt: { gte: window.from, lt: window.to },
          categoriaInteresse: { not: null },
        },
        _count: { _all: true },
        orderBy: { categoriaInteresse: 'asc' },
      }),
      this.db.lead.count({
        where: {
          ...base,
          status: active,
          proximoContatoEm: { gte: today.start, lt: today.end },
        },
      }),
      this.db.lead.count({
        where: { ...base, status: active, proximoContatoEm: { lt: now } },
      }),
      this.db.lead.count({
        where: {
          ...base,
          status: active,
          proximoContatoEm: { gte: today.end },
        },
      }),
      this.db.lead.count({
        where: { ...base, status: active, proximoContatoEm: null },
      }),
      includeTeam
        ? this.db.lead.count({ where: { ...base, status: active, responsavelId: null } })
        : Promise.resolve(0),
      this.db.lead.findMany({
        where: base,
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, status: true, createdAt: true },
      }),
      this.db.leadInteracao.findMany({
        where: { lead: base },
        orderBy: { ocorridoEm: 'desc' },
        take: 3,
        select: { id: true, tipo: true, ocorridoEm: true, leadId: true },
      }),
      includeTeam
        ? this.db.user.findMany({
            where: { AND: [userScope], role: 'VENDEDOR', ativo: true },
            orderBy: { nome: 'asc' },
            take: 10,
            select: { id: true, nome: true },
          })
        : Promise.resolve([]),
      includeTeam
        ? this.db.lead.groupBy({
            by: ['responsavelId', 'status'],
            where: { ...base, responsavelId: { not: null } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      includeTeam
        ? this.db.lead.groupBy({
            by: ['responsavelId'],
            where: {
              ...base, responsavelId: { not: null },
              status: active,
              proximoContatoEm: { lt: now },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      includeTeam
        ? this.db.leadInteracao.groupBy({
            by: ['criadoPorId'],
            where: {
              lead: base, criadoPor: userScope, criadoPorId: { not: null },
              ocorridoEm: { gte: window.from, lt: window.to },
              tipo: { in: ['LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO'] },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      activeNow,
      currentNew,
      previousNew,
      currentConverted,
      previousConverted,
      lostNow,
      funnel: grouped(funnel, (x) => x.status),
      origins: grouped(origins, (x) => x.origem),
      categories: categories.map((x) => ({
        key: x.categoriaInteresse ?? 'NAO_INFORMADA',
        label: x.categoriaInteresse ?? 'Não informada',
        value: x._count._all,
      })),
      contacts: {
        today: todayContacts,
        overdue,
        upcoming,
        withoutNextContact: withoutNext,
      },
      unassignedActive,
      recentLeads,
      recentInteractions,
      sellers,
      teamStatuses,
      teamOverdue,
      contactsPerformed: contacts,
    };
  }

  async operationalActivity(access: {
    quality: boolean;
    integrations: boolean;
    imports: boolean;
  }) {
    const [issues, runs, imports] = await Promise.all([
      access.quality
        ? this.db.dataQualityIssue.findMany({
            where: {
              severidade: 'CRITICAL',
              status: { in: ['OPEN', 'IN_REVIEW'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, codigo: true, status: true, createdAt: true },
          })
        : Promise.resolve([]),
      access.integrations
        ? this.db.integrationRun.findMany({
            orderBy: { iniciadoEm: 'desc' },
            take: 3,
            select: {
              id: true,
              status: true,
              iniciadoEm: true,
              integration: { select: { id: true, nome: true } },
            },
          })
        : Promise.resolve([]),
      access.imports
        ? this.db.importacao.findMany({
            orderBy: { iniciadaEm: 'desc' },
            take: 3,
            select: { id: true, status: true, iniciadaEm: true, tipo: true },
          })
        : Promise.resolve([]),
    ]);
    return { issues, runs, imports };
  }
}

export type DashboardRepositoryResult = Awaited<
  ReturnType<DashboardRepository['crm']>
>;
