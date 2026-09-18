import type {
  CreateManualIssueRequest,
  DataQualityListQuery,
  Permission,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  evaluateAssembly,
  evaluateAward,
  evaluateEvent,
  evaluateGroup,
  evaluateProduct,
  evaluateQuota,
  type QualityFinding,
} from './quality-rules.js';

const batchSize = 500;
const fail = (
  code: 'DATA_QUALITY_ISSUE_NOT_FOUND' | 'DATA_QUALITY_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const issueSelect = {
  id: true,
  importacaoId: true,
  entidade: true,
  registroId: true,
  campo: true,
  linha: true,
  valorRecebido: true,
  codigo: true,
  severidade: true,
  status: true,
  origem: true,
  mensagem: true,
  metadata: true,
  administradoraId: true,
  produtoId: true,
  grupoId: true,
  resolvido: true,
  resolvedAt: true,
  resolutionAction: true,
  resolutionNote: true,
  createdAt: true,
  updatedAt: true,
  resolvedBy: { select: { id: true, nome: true, email: true } },
  importacao: {
    select: {
      id: true,
      nomeArquivo: true,
      fonteDados: { select: { nome: true } },
    },
  },
} as const;
type IssueRecord = Prisma.DataQualityIssueGetPayload<{
  select: typeof issueSelect;
}>;
interface Context {
  titulo: string;
  href: string | null;
  administradora: string | null;
  grupo: string | null;
}
const date = (value: Date | null) => value?.toISOString() ?? null;
const baseDto = (record: IssueRecord, contexto: Context) => ({
  ...record,
  importacao: record.importacao
    ? {
        id: record.importacao.id,
        nomeArquivo: record.importacao.nomeArquivo,
        fonte: record.importacao.fonteDados.nome,
      }
    : null,
  contexto,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  resolvedAt: date(record.resolvedAt),
});

export class DataQualityService {
  constructor(private readonly db: PrismaClient) {}
  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private metadata(request: RequestMetadata) {
    return {
      ipAddress: request.ipAddress ?? null,
      userAgent: request.userAgent?.slice(0, 2048) ?? null,
    };
  }
  private async record(id: string) {
    const record = await this.db.dataQualityIssue.findUnique({
      where: { id },
      select: issueSelect,
    });
    if (!record)
      throw fail(
        'DATA_QUALITY_ISSUE_NOT_FOUND',
        'Problema de qualidade não encontrado',
        404,
      );
    return record;
  }
  private async contexts(
    records: readonly IssueRecord[],
  ): Promise<Map<string, Context>> {
    const ids = (entity: string) =>
      records
        .filter((item) => item.entidade === entity && item.registroId)
        .map((item) => item.registroId!);
    const [admins, products, groups, quotas, assemblies] = await Promise.all([
      this.db.administradora.findMany({
        where: { id: { in: ids('Administradora') } },
        select: { id: true, nome: true },
      }),
      this.db.produto.findMany({
        where: { id: { in: ids('Produto') } },
        select: {
          id: true,
          nome: true,
          administradora: { select: { nome: true } },
        },
      }),
      this.db.grupo.findMany({
        where: { id: { in: ids('Grupo') } },
        select: {
          id: true,
          codigo: true,
          administradora: { select: { nome: true } },
        },
      }),
      this.db.cota.findMany({
        where: { id: { in: ids('Cota') } },
        select: {
          id: true,
          numero: true,
          grupo: {
            select: {
              codigo: true,
              administradora: { select: { nome: true } },
            },
          },
        },
      }),
      this.db.assembleia.findMany({
        where: { id: { in: ids('Assembleia') } },
        select: {
          id: true,
          numero: true,
          grupo: {
            select: {
              codigo: true,
              administradora: { select: { nome: true } },
            },
          },
        },
      }),
    ]);
    const result = new Map<string, Context>();
    for (const item of admins)
      result.set(`Administradora:${item.id}`, {
        titulo: item.nome,
        href: `/dashboard/administradoras/${item.id}`,
        administradora: item.nome,
        grupo: null,
      });
    for (const item of products)
      result.set(`Produto:${item.id}`, {
        titulo: item.nome,
        href: `/dashboard/produtos/${item.id}`,
        administradora: item.administradora.nome,
        grupo: null,
      });
    for (const item of groups)
      result.set(`Grupo:${item.id}`, {
        titulo: `Grupo ${item.codigo}`,
        href: `/dashboard/grupos/${item.id}`,
        administradora: item.administradora.nome,
        grupo: item.codigo,
      });
    for (const item of quotas)
      result.set(`Cota:${item.id}`, {
        titulo: `Cota ${item.numero}`,
        href: `/dashboard/cotas/${item.id}`,
        administradora: item.grupo.administradora.nome,
        grupo: item.grupo.codigo,
      });
    for (const item of assemblies)
      result.set(`Assembleia:${item.id}`, {
        titulo: item.numero
          ? `Assembleia ${item.numero}`
          : 'Assembleia sem número',
        href: `/dashboard/assembleias/${item.id}`,
        administradora: item.grupo.administradora.nome,
        grupo: item.grupo.codigo,
      });
    for (const item of records)
      if (!result.has(`${item.entidade}:${item.registroId}`))
        result.set(`${item.entidade}:${item.registroId}`, {
          titulo: item.registroId
            ? `${item.entidade} ${item.registroId.slice(0, 12)}`
            : item.entidade,
          href: null,
          administradora: null,
          grupo: null,
        });
    return result;
  }
  async list(actor: AuthContext, query: DataQualityListQuery) {
    this.allow(actor, 'data_quality.read');
    const where: Prisma.DataQualityIssueWhereInput = {
      ...(query.status
        ? { status: query.status }
        : query.pendentes
          ? { status: { in: ['OPEN', 'IN_REVIEW'] } }
          : {}),
      ...(query.severidade ? { severidade: query.severidade } : {}),
      ...(query.origem ? { origem: query.origem } : {}),
      ...(query.codigo ? { codigo: query.codigo } : {}),
      ...(query.entidade ? { entidade: query.entidade } : {}),
      ...(query.importacaoId ? { importacaoId: query.importacaoId } : {}),
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
      ...(query.produtoId ? { produtoId: query.produtoId } : {}),
      ...(query.grupoId ? { grupoId: query.grupoId } : {}),
      ...(query.dataInicio || query.dataFim
        ? {
            createdAt: {
              ...(query.dataInicio
                ? { gte: new Date(`${query.dataInicio}T00:00:00.000Z`) }
                : {}),
              ...(query.dataFim
                ? { lte: new Date(`${query.dataFim}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { codigo: { contains: query.search, mode: 'insensitive' } },
              { mensagem: { contains: query.search, mode: 'insensitive' } },
              { campo: { contains: query.search, mode: 'insensitive' } },
              { registroId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.dataQualityIssue.findMany({
        where,
        select: issueSelect,
        orderBy: [{ severidade: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.dataQualityIssue.count({ where }),
    ]);
    const contexts = await this.contexts(items);
    return {
      items: items.map((item) => {
        const { metadata: _metadata, ...dto } = baseDto(
          item,
          contexts.get(`${item.entidade}:${item.registroId}`)!,
        );
        return dto;
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }
  async get(actor: AuthContext, id: string) {
    this.allow(actor, 'data_quality.read');
    const record = await this.record(id);
    const contexts = await this.contexts([record]);
    const history = await this.db.auditLog.findMany({
      where: { entity: 'DataQualityIssue', entityId: id },
      select: { action: true, actorId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...baseDto(
        record,
        contexts.get(`${record.entidade}:${record.registroId}`)!,
      ),
      historico: history.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
  async summary(actor: AuthContext) {
    this.allow(actor, 'data_quality.read');
    const [abertas, criticas, erros, avisos, resolvidas] = await Promise.all([
      this.db.dataQualityIssue.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      }),
      this.db.dataQualityIssue.count({
        where: {
          status: { in: ['OPEN', 'IN_REVIEW'] },
          severidade: 'CRITICAL',
        },
      }),
      this.db.dataQualityIssue.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW'] }, severidade: 'ERROR' },
      }),
      this.db.dataQualityIssue.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW'] }, severidade: 'WARNING' },
      }),
      this.db.dataQualityIssue.count({ where: { status: 'RESOLVED' } }),
    ]);
    return { abertas, criticas, erros, avisos, resolvidas };
  }
  private async transition(
    actor: AuthContext,
    id: string,
    status: 'IN_REVIEW' | 'RESOLVED' | 'IGNORED' | 'OPEN',
    action: string,
    payload: { resolutionAction?: string; note?: string },
    request: RequestMetadata,
  ) {
    const current = await this.record(id);
    const allowed =
      status === 'OPEN'
        ? ['RESOLVED', 'IGNORED'].includes(current.status)
        : status === 'IN_REVIEW'
          ? current.status === 'OPEN'
          : ['OPEN', 'IN_REVIEW'].includes(current.status);
    if (!allowed)
      throw fail(
        'DATA_QUALITY_CONFLICT',
        'Transição de status não permitida',
        409,
      );
    const done = status === 'RESOLVED' || status === 'IGNORED';
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.dataQualityIssue.update({
        where: { id },
        data: {
          status,
          resolvido: done,
          resolvedAt: done ? new Date() : null,
          resolvedById: done ? actor.user.id : null,
          resolutionAction: done ? (payload.resolutionAction ?? null) : null,
          resolutionNote: payload.note ?? null,
        },
        select: issueSelect,
      });
      await tx.auditLog.create({
        data: {
          action,
          actorId: actor.user.id,
          entity: 'DataQualityIssue',
          entityId: id,
          metadata: {
            from: current.status,
            to: status,
            ...(payload.resolutionAction
              ? { acaoRealizada: payload.resolutionAction }
              : {}),
            ...(payload.note ? { observacao: payload.note } : {}),
          },
          ...this.metadata(request),
        },
      });
      return result;
    });
    const contexts = await this.contexts([updated]);
    const history = await this.db.auditLog.findMany({
      where: { entity: 'DataQualityIssue', entityId: id },
      select: { action: true, actorId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...baseDto(
        updated,
        contexts.get(`${updated.entidade}:${updated.registroId}`)!,
      ),
      historico: history.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
  review(
    actor: AuthContext,
    id: string,
    note: string | undefined,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'data_quality.review');
    return this.transition(
      actor,
      id,
      'IN_REVIEW',
      'DATA_QUALITY_ISSUE_REVIEW_STARTED',
      { ...(note ? { note } : {}) },
      request,
    );
  }
  resolve(
    actor: AuthContext,
    id: string,
    action: string,
    note: string | undefined,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'data_quality.resolve');
    return this.transition(
      actor,
      id,
      'RESOLVED',
      'DATA_QUALITY_ISSUE_RESOLVED',
      { resolutionAction: action, ...(note ? { note } : {}) },
      request,
    );
  }
  ignore(
    actor: AuthContext,
    id: string,
    justification: string,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'data_quality.resolve');
    return this.transition(
      actor,
      id,
      'IGNORED',
      'DATA_QUALITY_ISSUE_IGNORED',
      { resolutionAction: 'IGNORED_WITH_JUSTIFICATION', note: justification },
      request,
    );
  }
  reopen(
    actor: AuthContext,
    id: string,
    note: string | undefined,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'data_quality.resolve');
    return this.transition(
      actor,
      id,
      'OPEN',
      'DATA_QUALITY_ISSUE_REOPENED',
      { ...(note ? { note } : {}) },
      request,
    );
  }
  private async entityContext(
    entity: CreateManualIssueRequest['entidade'],
    id: string,
  ) {
    if (entity === 'Administradora') {
      const item = await this.db.administradora.findUnique({
        where: { id },
        select: { id: true },
      });
      return item ? { administradoraId: id } : null;
    }
    if (entity === 'Produto') {
      const item = await this.db.produto.findUnique({
        where: { id },
        select: { administradoraId: true },
      });
      return item
        ? { administradoraId: item.administradoraId, produtoId: id }
        : null;
    }
    if (entity === 'Grupo') {
      const item = await this.db.grupo.findUnique({
        where: { id },
        select: { administradoraId: true, produtoId: true },
      });
      return item
        ? {
            administradoraId: item.administradoraId,
            produtoId: item.produtoId,
            grupoId: id,
          }
        : null;
    }
    if (entity === 'Cota') {
      const item = await this.db.cota.findUnique({
        where: { id },
        select: {
          grupo: {
            select: { id: true, administradoraId: true, produtoId: true },
          },
        },
      });
      return item
        ? {
            administradoraId: item.grupo.administradoraId,
            produtoId: item.grupo.produtoId,
            grupoId: item.grupo.id,
          }
        : null;
    }
    if (entity === 'Assembleia') {
      const item = await this.db.assembleia.findUnique({
        where: { id },
        select: {
          grupo: {
            select: { id: true, administradoraId: true, produtoId: true },
          },
        },
      });
      return item
        ? {
            administradoraId: item.grupo.administradoraId,
            produtoId: item.grupo.produtoId,
            grupoId: item.grupo.id,
          }
        : null;
    }
    const exists =
      entity === 'Lance'
        ? await this.db.lance.findUnique({
            where: { id },
            select: { id: true },
          })
        : entity === 'Contemplacao'
          ? await this.db.contemplacao.findUnique({
              where: { id },
              select: { id: true },
            })
          : await this.db.importacao.findUnique({
              where: { id },
              select: { id: true },
            });
    return exists ? {} : null;
  }
  async createManual(
    actor: AuthContext,
    input: CreateManualIssueRequest,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'data_quality.review');
    const context = await this.entityContext(input.entidade, input.entidadeId);
    if (!context)
      throw fail(
        'DATA_QUALITY_CONFLICT',
        'Registro relacionado não encontrado',
        409,
      );
    const issue = await this.db.$transaction(async (tx) => {
      const created = await tx.dataQualityIssue.create({
        data: {
          entidade: input.entidade,
          registroId: input.entidadeId,
          campo: input.campo ?? null,
          codigo: 'MANUAL_REVIEW_REQUIRED',
          severidade: input.severidade,
          origem: 'AUDITORIA_MANUAL',
          mensagem: input.mensagem,
          ...context,
        },
        select: issueSelect,
      });
      await tx.auditLog.create({
        data: {
          action: 'DATA_QUALITY_ISSUE_CREATED_MANUALLY',
          actorId: actor.user.id,
          entity: 'DataQualityIssue',
          entityId: created.id,
          metadata: {
            entidade: input.entidade,
            entidadeId: input.entidadeId,
            severidade: input.severidade,
          },
          ...this.metadata(request),
        },
      });
      return created;
    });
    getBusinessMetrics().recordDataQualityIssue(
      input.severidade === 'CRITICAL'
        ? 'critical'
        : input.severidade === 'ERROR'
          ? 'major'
          : 'minor',
      'open',
    );
    const contexts = await this.contexts([issue]);
    return {
      ...baseDto(issue, contexts.get(`${issue.entidade}:${issue.registroId}`)!),
      historico: [],
    };
  }
  private key(finding: QualityFinding) {
    return `${finding.code}|${finding.entity}|${finding.entityId}|${finding.field ?? '-'}`;
  }
  private async persistFindings(
    findings: QualityFinding[],
    active: Set<string>,
  ) {
    let created = 0,
      existing = 0;
    for (const finding of findings) {
      const dedupKey = this.key(finding);
      active.add(dedupKey);
      const before = await this.db.dataQualityIssue.findUnique({
        where: { dedupKey },
        select: { id: true, status: true },
      });
      if (!before) {
        await this.db.dataQualityIssue.create({
          data: {
            dedupKey,
            codigo: finding.code,
            entidade: finding.entity,
            registroId: finding.entityId,
            campo: finding.field ?? null,
            mensagem: finding.message,
            severidade: finding.severity,
            origem: 'VALIDACAO_INTERNA',
            administradoraId: finding.administradoraId ?? null,
            produtoId: finding.produtoId ?? null,
            grupoId: finding.grupoId ?? null,
          },
        });
        getBusinessMetrics().recordDataQualityIssue(
          finding.severity === 'CRITICAL'
            ? 'critical'
            : finding.severity === 'ERROR'
              ? 'major'
              : 'minor',
          'open',
        );
        created++;
      } else {
        existing++;
        if (before.status === 'RESOLVED')
          await this.db.$transaction([
            this.db.dataQualityIssue.update({
              where: { id: before.id },
              data: {
                status: 'OPEN',
                resolvido: false,
                resolvedAt: null,
                resolvedById: null,
                resolutionAction: null,
                resolutionNote: 'Problema voltou a ser detectado pelo scanner',
              },
            }),
            this.db.auditLog.create({
              data: {
                action: 'DATA_QUALITY_ISSUE_REOPENED',
                entity: 'DataQualityIssue',
                entityId: before.id,
                metadata: { automatico: true, motivo: 'REAPPEARED_ON_SCAN' },
              },
            }),
          ]);
        else
          await this.db.dataQualityIssue.update({
            where: { id: before.id },
            data: {
              mensagem: finding.message,
              severidade: finding.severity,
              administradoraId: finding.administradoraId ?? null,
              produtoId: finding.produtoId ?? null,
              grupoId: finding.grupoId ?? null,
            },
          });
      }
    }
    return { created, existing };
  }
  async scan(actor: AuthContext, request: RequestMetadata) {
    this.allow(actor, 'data_quality.scan');
    const started = await this.db.auditLog.create({
      data: {
        action: 'DATA_QUALITY_SCAN_STARTED',
        actorId: actor.user.id,
        entity: 'DataQualityScan',
        ...this.metadata(request),
      },
    });
    let evaluated = 0,
      created = 0,
      existing = 0;
    const active = new Set<string>();
    const process = async <T extends { id: string }>(
      fetch: (cursor?: string) => Promise<T[]>,
      evaluate: (record: T) => QualityFinding[],
    ) => {
      let cursor: string | undefined;
      let hasNextBatch = true;
      while (hasNextBatch) {
        const rows = await fetch(cursor);
        if (!rows.length) {
          hasNextBatch = false;
          continue;
        }
        evaluated += rows.length;
        const result = await this.persistFindings(
          rows.flatMap(evaluate),
          active,
        );
        created += result.created;
        existing += result.existing;
        cursor = rows.at(-1)!.id;
        if (rows.length < batchSize) hasNextBatch = false;
      }
    };
    try {
      await process(
        (cursor) =>
          this.db.produto.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              ativo: true,
              administradoraId: true,
              administradora: { select: { ativa: true } },
            },
          }),
        evaluateProduct,
      );
      await process(
        (cursor) =>
          this.db.grupo.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              status: true,
              administradoraId: true,
              produtoId: true,
              administradora: { select: { ativa: true } },
              produto: { select: { ativo: true, administradoraId: true } },
            },
          }),
        evaluateGroup,
      );
      await process(
        (cursor) =>
          this.db.cota.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              status: true,
              prazoRestante: true,
              grupoId: true,
              grupo: {
                select: {
                  status: true,
                  prazoMeses: true,
                  administradoraId: true,
                  produtoId: true,
                },
              },
            },
          }),
        evaluateQuota,
      );
      const now = new Date();
      await process(
        (cursor) =>
          this.db.assembleia.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              status: true,
              dataAssembleia: true,
              grupoId: true,
              grupo: { select: { administradoraId: true, produtoId: true } },
            },
          }),
        (item) => evaluateAssembly(item, now),
      );
      await process(
        (cursor) =>
          this.db.lance.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              cota: { select: { grupoId: true } },
              assembleia: {
                select: {
                  grupoId: true,
                  grupo: {
                    select: { administradoraId: true, produtoId: true },
                  },
                },
              },
            },
          }),
        (item) => evaluateEvent(item, 'Lance'),
      );
      await process(
        (cursor) =>
          this.db.contemplacao.findMany({
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              tipo: true,
              valorLance: true,
              percentualLance: true,
              cota: { select: { grupoId: true } },
              assembleia: {
                select: {
                  grupoId: true,
                  grupo: {
                    select: { administradoraId: true, produtoId: true },
                  },
                },
              },
            },
          }),
        evaluateAward,
      );
      const stale = await this.db.dataQualityIssue.findMany({
        where: {
          origem: 'VALIDACAO_INTERNA',
          status: { in: ['OPEN', 'IN_REVIEW'] },
          dedupKey: { not: null },
        },
        select: { id: true, dedupKey: true },
      });
      let autoResolved = 0;
      for (const issue of stale)
        if (issue.dedupKey && !active.has(issue.dedupKey)) {
          await this.db.$transaction([
            this.db.dataQualityIssue.update({
              where: { id: issue.id },
              data: {
                status: 'RESOLVED',
                resolvido: true,
                resolvedAt: new Date(),
                resolutionAction: 'AUTO_RESOLVED_BY_REVALIDATION',
                resolutionNote: 'A regra deixou de detectar o problema',
              },
            }),
            this.db.auditLog.create({
              data: {
                action: 'DATA_QUALITY_ISSUE_AUTO_RESOLVED',
                entity: 'DataQualityIssue',
                entityId: issue.id,
                metadata: { motivo: 'AUTO_RESOLVED_BY_REVALIDATION' },
              },
            }),
          ]);
          autoResolved++;
        }
      const result = {
        registrosAvaliados: evaluated,
        issuesNovas: created,
        issuesExistentes: existing,
        resolvidasAutomaticamente: autoResolved,
      };
      await this.db.auditLog.create({
        data: {
          action: 'DATA_QUALITY_SCAN_COMPLETED',
          actorId: actor.user.id,
          entity: 'DataQualityScan',
          entityId: started.id,
          metadata: result,
          ...this.metadata(request),
        },
      });
      return result;
    } catch (error) {
      await this.db.auditLog.create({
        data: {
          action: 'DATA_QUALITY_SCAN_FAILED',
          actorId: actor.user.id,
          entity: 'DataQualityScan',
          entityId: started.id,
          metadata: {
            erro: error instanceof Error ? error.name : 'UnknownError',
          },
          ...this.metadata(request),
        },
      });
      throw error;
    }
  }
  countOpenForGroup(actor: AuthContext, grupoId: string) {
    this.allow(actor, 'data_quality.read');
    return this.db.dataQualityIssue.count({
      where: { grupoId, status: { in: ['OPEN', 'IN_REVIEW'] } },
    });
  }
}
