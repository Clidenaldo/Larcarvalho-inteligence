import type { GrupoHistoricoListQuery, Permission } from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  GrupoHistoricoRepository,
  type SnapshotRecord,
} from './grupo-historico.repository.js';

const notFound = (message: string) =>
  new AppError({
    code: 'GRUPO_SNAPSHOT_NOT_FOUND',
    message,
    statusCode: 404,
  });
const isUnique = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';
const text = (value: { toString(): string } | null) =>
  value?.toString() ?? null;
const snapshotDto = (record: SnapshotRecord) => ({
  id: record.id,
  grupoId: record.grupoId,
  capturadoEm: record.dataReferencia.toISOString(),
  origem: record.origem,
  estado: {
    status: record.status,
    prazoMeses: record.prazoMeses,
    quantidadeCotasDeclarada: record.quantidadeCotasDeclarada,
    quantidadeCotasRegistradas: record.quantidadeCotasRegistradas,
    quantidadeCotasAtivas: record.quantidadeCotasAtivas,
    valorCreditoMinimo: text(record.valorCreditoMinimo),
    valorCreditoMaximo: text(record.valorCreditoMaximo),
    parcelaMedia: text(record.parcelaMedia),
  },
  metricas: {
    assembleiasRealizadas: record.assembleiasRealizadas,
    lancesRegistrados: record.lancesRegistrados,
    lancesContemplados: record.lancesContemplados,
    contemplacoesRegistradas: record.contemplacoesRegistradas,
    contemplacoesSorteio: record.contemplacoesSorteio,
    contemplacoesLance: record.contemplacoesLance,
    contemplacoesOutras: record.contemplacoesOutras,
    percentualLanceContempladoMinimo: text(
      record.percentualLanceContempladoMinimo,
    ),
    percentualLanceContempladoMaximo: text(
      record.percentualLanceContempladoMaximo,
    ),
    percentualLanceContempladoMedio: text(
      record.percentualLanceContempladoMedio,
    ),
    percentualLanceContempladoMediano: text(
      record.percentualLanceContempladoMediano,
    ),
  },
  cobertura: {
    assembleiasAnalisadas: record.assembleiasRealizadas,
    assembleiasComDadosLance: record.assembleiasComDadosLance,
    assembleiasComDadosContemplacao: record.assembleiasComDadosContemplacao,
  },
  qualidade: {
    issuesAbertas: record.issuesAbertas,
    issuesCriticas: record.issuesCriticas,
  },
  grupo: record.grupo,
  criadoPor: record.criadoPor,
  fonteDados: record.fonteDados,
  importacao: record.importacao,
  createdAt: record.createdAt.toISOString(),
});
export interface SnapshotSourceContext {
  origem:
    'MANUAL' | 'IMPORTACAO' | 'INTEGRACAO_FUTURA' | 'PROCESSAMENTO_INTERNO';
  fonteDadosId?: string;
  importacaoId?: string;
}

export class GrupoHistoricoService {
  private readonly repository;
  constructor(private readonly prisma: PrismaClient) {
    this.repository = new GrupoHistoricoRepository(prisma);
  }
  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private auditMetadata(request: RequestMetadata) {
    return {
      ipAddress: request.ipAddress ?? null,
      userAgent: request.userAgent?.slice(0, 2048) ?? null,
    };
  }
  private async ensureGroup(grupoId: string) {
    if (!(await this.repository.group(grupoId)))
      throw notFound('Grupo não encontrado');
  }
  async list(
    actor: AuthContext,
    grupoId: string,
    query: GrupoHistoricoListQuery,
  ) {
    this.allow(actor, 'historico_grupos.read');
    await this.ensureGroup(grupoId);
    const result = await this.repository.list(grupoId, query);
    return {
      items: result.items.map(snapshotDto),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      totalPages: result.total ? Math.ceil(result.total / query.pageSize) : 0,
    };
  }
  async get(actor: AuthContext, grupoId: string, snapshotId: string) {
    this.allow(actor, 'historico_grupos.read');
    const record = await this.repository.byId(grupoId, snapshotId);
    if (!record) throw notFound('Snapshot não encontrado');
    const previous = await this.repository.previous(
      grupoId,
      record.dataReferencia,
      record.id,
    );
    return {
      ...snapshotDto(record),
      anterior: previous
        ? {
            id: previous.id,
            capturadoEm: previous.dataReferencia.toISOString(),
            valorCreditoMinimo: text(previous.valorCreditoMinimo),
            valorCreditoMaximo: text(previous.valorCreditoMaximo),
            prazoMeses: previous.prazoMeses,
            quantidadeCotasDeclarada: previous.quantidadeCotasDeclarada,
          }
        : null,
    };
  }
  async series(actor: AuthContext, grupoId: string) {
    this.allow(actor, 'historico_grupos.read');
    await this.ensureGroup(grupoId);
    const points = await this.repository.series(grupoId);
    return {
      grupoId,
      pontos: points.map((point) => ({
        snapshotId: point.id,
        capturadoEm: point.dataReferencia.toISOString(),
        valorCreditoMinimo: text(point.valorCreditoMinimo),
        valorCreditoMaximo: text(point.valorCreditoMaximo),
        prazoMeses: point.prazoMeses,
        quantidadeCotasDeclarada: point.quantidadeCotasDeclarada,
        percentualLanceContempladoMinimo: text(
          point.percentualLanceContempladoMinimo,
        ),
        percentualLanceContempladoMaximo: text(
          point.percentualLanceContempladoMaximo,
        ),
        percentualLanceContempladoMedio: text(
          point.percentualLanceContempladoMedio,
        ),
        percentualLanceContempladoMediano: text(
          point.percentualLanceContempladoMediano,
        ),
        contemplacoesRegistradas: point.contemplacoesRegistradas,
      })),
    };
  }
  async createManual(
    actor: AuthContext,
    grupoId: string,
    idempotencyKey: string,
    request: RequestMetadata,
  ) {
    return this.create(actor, grupoId, idempotencyKey, request, {
      origem: 'MANUAL',
    });
  }
  async create(
    actor: AuthContext,
    grupoId: string,
    idempotencyKey: string,
    request: RequestMetadata,
    source: SnapshotSourceContext,
  ) {
    this.allow(actor, 'historico_grupos.create');
    const existing = await this.repository.byIdempotency(
      grupoId,
      idempotencyKey,
    );
    if (existing) return this.get(actor, grupoId, existing.id);
    const capturedAt = new Date();
    try {
      const record = await this.prisma.$transaction(
        async (transaction) => {
          const repository = new GrupoHistoricoRepository(transaction);
          const group = await repository.group(grupoId);
          if (!group) throw notFound('Grupo não encontrado');
          const metrics = await repository.consolidate(grupoId, capturedAt);
          const snapshot = await repository.create({
            grupoId,
            dataReferencia: capturedAt,
            origem: source.origem,
            criadoPorId: actor.user.id,
            fonteDadosId: source.fonteDadosId ?? null,
            importacaoId: source.importacaoId ?? null,
            idempotencyKey,
            status: group.status,
            prazoMeses: group.prazoMeses,
            quantidadeCotasDeclarada: group.quantidadeCotas,
            quantidadeCotasRegistradas: metrics.registeredQuotas,
            quantidadeCotasAtivas: metrics.activeQuotas,
            valorCreditoMinimo: group.valorCreditoMinimo,
            valorCreditoMaximo: group.valorCreditoMaximo,
            parcelaMedia: metrics.averageInstallment,
            assembleiasRealizadas: metrics.assemblies,
            assembleiasComDadosLance: metrics.assembliesWithBids,
            assembleiasComDadosContemplacao: metrics.assembliesWithAwards,
            lancesRegistrados: metrics.bids,
            lancesContemplados: metrics.contemplatedBids,
            contemplacoesRegistradas: metrics.awards,
            contemplacoesSorteio: metrics.awardsByDraw,
            contemplacoesLance: metrics.awardsByBid,
            contemplacoesOutras: metrics.awardsOther,
            percentualLanceContempladoMinimo: metrics.minimumPercentage,
            percentualLanceContempladoMaximo: metrics.maximumPercentage,
            percentualLanceContempladoMedio: metrics.averagePercentage,
            percentualLanceContempladoMediano: metrics.medianPercentage,
            issuesAbertas: metrics.openIssues,
            issuesCriticas: metrics.criticalIssues,
          });
          await transaction.auditLog.create({
            data: {
              action: 'GRUPO_SNAPSHOT_CREATED',
              actorId: actor.user.id,
              entity: 'GrupoHistorico',
              entityId: snapshot.id,
              metadata: {
                grupoId,
                snapshotId: snapshot.id,
                fonte: source.origem,
                timestamp: capturedAt.toISOString(),
                cobertura: {
                  assembleiasAnalisadas: metrics.assemblies,
                  assembleiasComDadosLance: metrics.assembliesWithBids,
                  assembleiasComDadosContemplacao: metrics.assembliesWithAwards,
                },
              },
              ...this.auditMetadata(request),
            },
          });
          return snapshot;
        },
        { isolationLevel: 'RepeatableRead' },
      );
      return this.get(actor, grupoId, record.id);
    } catch (error) {
      if (isUnique(error)) {
        const duplicate = await this.repository.byIdempotency(
          grupoId,
          idempotencyKey,
        );
        if (duplicate) return this.get(actor, grupoId, duplicate.id);
      }
      await this.prisma.auditLog.create({
        data: {
          action: 'GRUPO_SNAPSHOT_FAILED',
          actorId: actor.user.id,
          entity: 'GrupoHistorico',
          metadata: {
            grupoId,
            fonte: source.origem,
            timestamp: capturedAt.toISOString(),
            erro: error instanceof Error ? error.name : 'UnknownError',
          },
          ...this.auditMetadata(request),
        },
      });
      throw error;
    }
  }
}
