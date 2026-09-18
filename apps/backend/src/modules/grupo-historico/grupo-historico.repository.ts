import type { GrupoHistoricoListQuery } from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { decimalMedian } from './snapshot-statistics.js';

type Db = PrismaClient | Prisma.TransactionClient;
export const snapshotSelect = {
  id: true,
  grupoId: true,
  dataReferencia: true,
  origem: true,
  status: true,
  prazoMeses: true,
  quantidadeCotasDeclarada: true,
  quantidadeCotasRegistradas: true,
  quantidadeCotasAtivas: true,
  valorCreditoMinimo: true,
  valorCreditoMaximo: true,
  parcelaMedia: true,
  assembleiasRealizadas: true,
  assembleiasComDadosLance: true,
  assembleiasComDadosContemplacao: true,
  lancesRegistrados: true,
  lancesContemplados: true,
  contemplacoesRegistradas: true,
  contemplacoesSorteio: true,
  contemplacoesLance: true,
  contemplacoesOutras: true,
  percentualLanceContempladoMinimo: true,
  percentualLanceContempladoMaximo: true,
  percentualLanceContempladoMedio: true,
  percentualLanceContempladoMediano: true,
  issuesAbertas: true,
  issuesCriticas: true,
  createdAt: true,
  grupo: {
    select: {
      id: true,
      codigo: true,
      administradora: { select: { id: true, nome: true } },
      produto: { select: { id: true, nome: true } },
    },
  },
  criadoPor: { select: { id: true, nome: true, email: true } },
  fonteDados: { select: { id: true, nome: true } },
  importacao: { select: { id: true, nomeArquivo: true } },
} as const;
export type SnapshotRecord = Prisma.GrupoHistoricoGetPayload<{
  select: typeof snapshotSelect;
}>;

export class GrupoHistoricoRepository {
  constructor(private readonly db: Db) {}

  group(id: string) {
    return this.db.grupo.findUnique({
      where: { id },
      select: {
        id: true,
        administradoraId: true,
        produtoId: true,
        codigo: true,
        status: true,
        prazoMeses: true,
        quantidadeCotas: true,
        valorCreditoMinimo: true,
        valorCreditoMaximo: true,
      },
    });
  }

  byId(grupoId: string, id: string) {
    return this.db.grupoHistorico.findFirst({
      where: { id, grupoId },
      select: snapshotSelect,
    });
  }

  byIdempotency(grupoId: string, idempotencyKey: string) {
    return this.db.grupoHistorico.findUnique({
      where: { grupoId_idempotencyKey: { grupoId, idempotencyKey } },
      select: snapshotSelect,
    });
  }

  previous(grupoId: string, capturedAt: Date, excludedId?: string) {
    return this.db.grupoHistorico.findFirst({
      where: {
        grupoId,
        dataReferencia: { lt: capturedAt },
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      orderBy: [{ dataReferencia: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        dataReferencia: true,
        valorCreditoMinimo: true,
        valorCreditoMaximo: true,
        prazoMeses: true,
        quantidadeCotasDeclarada: true,
      },
    });
  }

  async list(grupoId: string, query: GrupoHistoricoListQuery) {
    const where: Prisma.GrupoHistoricoWhereInput = {
      grupoId,
      ...(query.dataInicio || query.dataFim
        ? {
            dataReferencia: {
              ...(query.dataInicio
                ? { gte: new Date(`${query.dataInicio}T00:00:00.000Z`) }
                : {}),
              ...(query.dataFim
                ? { lte: new Date(`${query.dataFim}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.grupoHistorico.findMany({
        where,
        select: snapshotSelect,
        orderBy: [{ dataReferencia: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.grupoHistorico.count({ where }),
    ]);
    return { items, total };
  }

  series(grupoId: string) {
    return this.db.grupoHistorico.findMany({
      where: { grupoId },
      orderBy: [{ dataReferencia: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        dataReferencia: true,
        valorCreditoMinimo: true,
        valorCreditoMaximo: true,
        prazoMeses: true,
        quantidadeCotasDeclarada: true,
        percentualLanceContempladoMinimo: true,
        percentualLanceContempladoMaximo: true,
        percentualLanceContempladoMedio: true,
        percentualLanceContempladoMediano: true,
        contemplacoesRegistradas: true,
      },
    });
  }

  async consolidate(grupoId: string, capturedAt: Date) {
    const assemblyWhere: Prisma.AssembleiaWhereInput = {
      grupoId,
      status: 'REALIZADA',
      dataAssembleia: { lte: capturedAt },
      createdAt: { lte: capturedAt },
    };
    const lanceWhere: Prisma.LanceWhereInput = {
      createdAt: { lte: capturedAt },
      assembleia: assemblyWhere,
    };
    const awardWhere: Prisma.ContemplacaoWhereInput = {
      createdAt: { lte: capturedAt },
      assembleia: assemblyWhere,
    };
    const contemplatedPercentWhere: Prisma.LanceWhereInput = {
      ...lanceWhere,
      contemplado: true,
      percentual: { not: null },
    };
    // A transação interativa usa uma única conexão PostgreSQL. Estas
    // agregações são sequenciais para manter consistência sem consultas
    // concorrentes sobre o mesmo client do driver.
    const registeredQuotas = await this.db.cota.count({
      where: { grupoId, createdAt: { lte: capturedAt } },
    });
    const activeQuotas = await this.db.cota.count({
      where: { grupoId, status: 'ATIVO', createdAt: { lte: capturedAt } },
    });
    const installments = await this.db.cota.aggregate({
      where: { grupoId, createdAt: { lte: capturedAt } },
      _avg: { parcelaAtual: true },
    });
    const assemblies = await this.db.assembleia.count({ where: assemblyWhere });
    const bids = await this.db.lance.count({ where: lanceWhere });
    const contemplatedBids = await this.db.lance.count({
      where: { ...lanceWhere, contemplado: true },
    });
    const awards = await this.db.contemplacao.count({ where: awardWhere });
    const awardTypes = await this.db.contemplacao.groupBy({
      by: ['tipo'],
      where: awardWhere,
      _count: { _all: true },
    });
    const assembliesWithBids = await this.db.lance.groupBy({
      by: ['assembleiaId'],
      where: lanceWhere,
    });
    const assembliesWithAwards = await this.db.contemplacao.groupBy({
      by: ['assembleiaId'],
      where: awardWhere,
    });
    const bidPercentages = await this.db.lance.aggregate({
      where: contemplatedPercentWhere,
      _count: { percentual: true },
      _min: { percentual: true },
      _max: { percentual: true },
      _avg: { percentual: true },
    });
    const openIssues = await this.db.dataQualityIssue.count({
      where: {
        grupoId,
        createdAt: { lte: capturedAt },
        status: { in: ['OPEN', 'IN_REVIEW'] },
      },
    });
    const criticalIssues = await this.db.dataQualityIssue.count({
      where: {
        grupoId,
        createdAt: { lte: capturedAt },
        status: { in: ['OPEN', 'IN_REVIEW'] },
        severidade: 'CRITICAL',
      },
    });
    const percentageCount = bidPercentages._count.percentual;
    const middle = percentageCount
      ? await this.db.lance.findMany({
          where: contemplatedPercentWhere,
          orderBy: [{ percentual: 'asc' }, { id: 'asc' }],
          skip: Math.floor((percentageCount - 1) / 2),
          take: percentageCount % 2 === 0 ? 2 : 1,
          select: { percentual: true },
        })
      : [];
    const byType = new Map(
      awardTypes.map((item) => [item.tipo, item._count._all]),
    );
    return {
      registeredQuotas,
      activeQuotas,
      averageInstallment: installments._avg.parcelaAtual,
      assemblies,
      bids,
      contemplatedBids,
      awards,
      awardsByDraw: byType.get('SORTEIO') ?? 0,
      awardsByBid: byType.get('LANCE') ?? 0,
      awardsOther:
        awards - (byType.get('SORTEIO') ?? 0) - (byType.get('LANCE') ?? 0),
      assembliesWithBids: assembliesWithBids.length,
      assembliesWithAwards: assembliesWithAwards.length,
      minimumPercentage: bidPercentages._min.percentual,
      maximumPercentage: bidPercentages._max.percentual,
      averagePercentage: bidPercentages._avg.percentual,
      medianPercentage: decimalMedian(
        middle.flatMap((item) => (item.percentual ? [item.percentual] : [])),
      ),
      openIssues,
      criticalIssues,
    };
  }

  create(data: Prisma.GrupoHistoricoUncheckedCreateInput) {
    return this.db.grupoHistorico.create({ data, select: snapshotSelect });
  }
}
