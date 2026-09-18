import { FinancialDecimal } from './values.js';
import type {
  CommissionListQuery,
  CommissionRuleListQuery,
  CommissionStatus,
  ConfirmCommissionRequest,
  CreateCommissionRequest,
  CreateCommissionRuleRequest,
  ReceiveCommissionRequest,
  ReverseCommissionRequest,
  UpdateCommissionRuleRequest,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { requireAccess, saleScope } from '../../core/auth/data-scope.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';

const fail = (
  code: 'COMMISSION_NOT_FOUND' | 'COMMISSION_CONFLICT' | 'COMMISSION_FORBIDDEN',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });

const toCents = (value: string): bigint =>
  BigInt(new FinancialDecimal(value).times(100).toFixed(0));
const fromCents = (cents: bigint): string =>
  new FinancialDecimal(cents.toString()).div(100).toFixed(2);

export function calcCommissionCents(
  baseValor: string,
  percentual?: string | null,
  valorFixo?: string | null,
): bigint {
  if (valorFixo !== undefined && valorFixo !== null) return toCents(valorFixo);
  if (percentual !== undefined && percentual !== null)
    return BigInt(new FinancialDecimal(baseValor).times(percentual).toFixed(0));
  throw new AppError({
    code: 'COMMISSION_CONFLICT',
    message: 'Sem base de cálculo',
    statusCode: 422,
  });
}

function auditMeta(meta: RequestMetadata) {
  return {
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent?.slice(0, 2048) ?? null,
  };
}
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
const money = (value: { toString(): string } | null | undefined) => {
  if (value === undefined || value === null) return null;
  return new FinancialDecimal(value.toString()).toFixed(2);
};
const raw = (value: { toString(): string } | null | undefined) =>
  value === undefined || value === null ? null : value.toString();
const toIso = (value: Date | null | undefined) => {
  if (value === undefined || value === null) return null;
  return value.toISOString();
};

function dto(row: {
  id: string;
  saleId: string;
  administradoraId: string | null;
  tipo: CommissionStatus | string;
  status: CommissionStatus;
  baseCalculo: string;
  baseValor: { toString(): string };
  percentual: { toString(): string } | null;
  valorPrevisto: { toString(): string };
  valorConfirmado: { toString(): string } | null;
  valorRecebido: { toString(): string };
  competencia: string;
  dataPrevistaPagamento: Date | null;
  dataConfirmacao: Date | null;
  dataRecebimento: Date | null;
  referenciaExterna: string | null;
  observacoes: string | null;
  regraSnapshot: unknown;
  estornoDeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    saleId: row.saleId,
    administradoraId: row.administradoraId,
    tipo: row.tipo,
    status: row.status,
    baseCalculo: row.baseCalculo,
    baseValor: new FinancialDecimal(row.baseValor.toString()).toFixed(2),
    percentual: raw(row.percentual),
    valorPrevisto: new FinancialDecimal(row.valorPrevisto.toString()).toFixed(
      2,
    ),
    valorConfirmado: money(row.valorConfirmado),
    valorRecebido: new FinancialDecimal(row.valorRecebido.toString()).toFixed(
      2,
    ),
    competencia: row.competencia,
    dataPrevistaPagamento: toIso(row.dataPrevistaPagamento),
    dataConfirmacao: toIso(row.dataConfirmacao),
    dataRecebimento: toIso(row.dataRecebimento),
    referenciaExterna: row.referenciaExterna,
    observacoes: row.observacoes,
    regraSnapshot: (row.regraSnapshot ?? null) as Record<
      string,
      unknown
    > | null,
    estornoDeId: row.estornoDeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class CommissionsService {
  constructor(private readonly db: PrismaClient) {}

  private async saleInScope(
    saleId: string,
    actor: AuthContext,
    action: 'read' | 'update' = 'read',
  ) {
    const sale = await this.db.sale.findFirst({
      where: { AND: [{ id: saleId }, saleScope(actor, action)] },
      select: {
        id: true,
        status: true,
        administradoraId: true,
        valorCreditoContratado: true,
        valorParcelaContratada: true,
      },
    });
    if (!sale) throw fail('COMMISSION_NOT_FOUND', 'Venda não encontrada', 404);
    return sale;
  }

  private async commissionInScope(id: string, actor: AuthContext) {
    const commission = await this.db.commission.findUnique({
      where: { id },
      include: { sale: { select: { id: true } } },
    });
    if (!commission)
      throw fail('COMMISSION_NOT_FOUND', 'Comissão não encontrada', 404);
    await this.saleInScope(commission.saleId, actor, 'read');
    return commission;
  }

  async list(actor: AuthContext, query: CommissionListQuery) {
    requireAccess(actor, 'commissions.read');
    const saleFilter: Record<string, unknown> = {
      AND: [saleScope(actor, 'read')],
    };
    if (query.responsavelUserId)
      saleFilter.responsavelUserId = query.responsavelUserId;
    if (query.teamId) saleFilter.teamId = query.teamId;
    const where = {
      AND: [
        { sale: saleFilter },
        ...(query.saleId ? [{ saleId: query.saleId }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.tipo ? [{ tipo: query.tipo }] : []),
        ...(query.administradoraId
          ? [{ administradoraId: query.administradoraId }]
          : []),
        ...(query.competencia ? [{ competencia: query.competencia }] : []),
        ...(query.recebida === 'true' ? [{ status: 'RECEBIDA' }] : []),
        ...(query.recebida === 'false'
          ? [{ status: { not: 'RECEBIDA' } }]
          : []),
        ...(query.periodoDe
          ? [{ createdAt: { gte: new Date(query.periodoDe) } }]
          : []),
        ...(query.periodoAte
          ? [{ createdAt: { lte: new Date(query.periodoAte) } }]
          : []),
      ],
    } as never;
    const [items, total, sums] = await Promise.all([
      this.db.commission.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.commission.count({ where }),
      this.db.commission.groupBy({
        by: ['status'],
        where,
        _sum: {
          valorPrevisto: true,
          valorConfirmado: true,
          valorRecebido: true,
        },
      }),
    ]);
    const sumBy = (
      status: string,
      field: 'valorPrevisto' | 'valorConfirmado' | 'valorRecebido',
    ) =>
      sums
        .filter((s) => s.status === status)
        .reduce(
          (acc, s) => acc.plus(s._sum[field]?.toString() ?? '0'),
          new FinancialDecimal(0),
        );
    const confirmed = sumBy('CONFIRMADA', 'valorConfirmado').plus(
      sumBy('PARCIALMENTE_RECEBIDA', 'valorConfirmado'),
    );
    return {
      items: items.map(dto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      resumo: {
        previstas: sumBy('PREVISTA', 'valorPrevisto').toFixed(2),
        confirmadas: confirmed.toFixed(2),
        recebidas: sumBy('RECEBIDA', 'valorRecebido')
          .plus(sumBy('PARCIALMENTE_RECEBIDA', 'valorRecebido'))
          .toFixed(2),
        aReceber: confirmed
          .minus(sumBy('PARCIALMENTE_RECEBIDA', 'valorRecebido'))
          .toFixed(2),
        estornadas: sumBy('ESTORNADA', 'valorRecebido').toFixed(2),
      },
    };
  }

  private async resolveRule(
    ruleId: string,
    saleAdministradoraId: string | null,
  ) {
    const rule = await this.db.commissionRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule || !rule.ativo)
      throw fail(
        'COMMISSION_CONFLICT',
        'Regra de comissão inválida ou inativa',
        409,
      );
    if (saleAdministradoraId && rule.administradoraId !== saleAdministradoraId)
      throw fail('COMMISSION_CONFLICT', 'Regra de outra administradora', 409);
    return rule;
  }

  async create(
    actor: AuthContext,
    saleId: string,
    input: CreateCommissionRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commissions.create');
    const sale = await this.saleInScope(saleId, actor, 'update');
    if (['CANCELADA', 'RECUSADA'].includes(sale.status))
      throw fail(
        'COMMISSION_CONFLICT',
        'Venda finalizada não recebe comissão',
        409,
      );
    if (input.tipo === 'ESTORNO')
      throw fail('COMMISSION_CONFLICT', 'Estorno só via reversão', 409);
    if (input.tipo === 'PRINCIPAL') {
      const existing = await this.db.commission.findFirst({
        where: { saleId, tipo: 'PRINCIPAL', status: { not: 'CANCELADA' } },
        select: { id: true },
      });
      if (existing)
        throw fail(
          'COMMISSION_CONFLICT',
          'Venda já possui comissão principal',
          409,
        );
    }
    let regraSnapshot: Record<string, unknown> | null = null;
    let valorPrevistoCents: bigint;
    if (input.regraId) {
      const rule = await this.resolveRule(input.regraId, sale.administradoraId);
      regraSnapshot = {
        regraId: rule.id,
        tipoBase: rule.tipoBase,
        percentual: rule.percentual?.toString() ?? null,
        valorFixo: rule.valorFixo?.toString() ?? null,
        vigenciaInicio: rule.vigenciaInicio.toISOString(),
        prioridade: rule.prioridade,
      };
      valorPrevistoCents = calcCommissionCents(
        input.baseValor,
        rule.percentual?.toString() ?? input.percentual ?? null,
        rule.valorFixo?.toString() ?? null,
      );
    } else if (input.valorPrevisto !== undefined) {
      valorPrevistoCents = toCents(input.valorPrevisto);
    } else {
      valorPrevistoCents = calcCommissionCents(
        input.baseValor,
        input.percentual ?? null,
        null,
      );
    }
    const created = await this.db.$transaction(async (tx) => {
      const commission = await tx.commission.create({
        data: defined({
          saleId,
          administradoraId: input.administradoraId ?? sale.administradoraId,
          tipo: input.tipo,
          baseCalculo: input.baseCalculo,
          baseValor: input.baseValor,
          percentual: input.percentual ?? undefined,
          valorPrevisto: fromCents(valorPrevistoCents),
          competencia: input.competencia,
          dataPrevistaPagamento: input.dataPrevistaPagamento
            ? new Date(input.dataPrevistaPagamento)
            : null,
          referenciaExterna: input.referenciaExterna ?? null,
          observacoes: input.observacoes ?? null,
          regraSnapshot: regraSnapshot as never,
        }) as never,
      });
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_CREATED',
          actorId: actor.user.id,
          entity: 'Commission',
          entityId: commission.id,
          metadata: {
            saleId,
            tipo: input.tipo,
            valorPrevisto: fromCents(valorPrevistoCents),
          },
          ...auditMeta(meta),
        },
      });
      return commission;
    });
    return dto(created);
  }

  async confirm(
    actor: AuthContext,
    id: string,
    input: ConfirmCommissionRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commissions.confirm');
    const commission = await this.commissionInScope(id, actor);
    if (commission.status !== 'PREVISTA')
      throw fail(
        'COMMISSION_CONFLICT',
        `Comissão ${commission.status} não pode ser confirmada`,
        409,
      );
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.commission.updateMany({
        where: {
          id,
          updatedAt: input.expectedUpdatedAt
            ? new Date(input.expectedUpdatedAt)
            : commission.updatedAt,
          status: commission.status,
          valorRecebido: commission.valorRecebido,
        },
        data: {
          status: 'CONFIRMADA',
          valorConfirmado: input.valorConfirmado,
          dataConfirmacao: input.dataConfirmacao
            ? new Date(input.dataConfirmacao)
            : new Date(),
          observacoes: input.observacoes ?? commission.observacoes,
        },
      });
      if (!result.count)
        throw fail(
          'COMMISSION_CONFLICT',
          'A comissão foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_CONFIRMED',
          actorId: actor.user.id,
          entity: 'Commission',
          entityId: id,
          metadata: {
            previsto: commission.valorPrevisto.toString(),
            confirmado: input.valorConfirmado,
            diferenca: fromCents(
              toCents(input.valorConfirmado) -
                toCents(commission.valorPrevisto.toString()),
            ),
          },
          ...auditMeta(meta),
        },
      });
      return tx.commission.findFirstOrThrow({ where: { id } });
    });
    return dto(updated);
  }

  async receive(
    actor: AuthContext,
    id: string,
    input: ReceiveCommissionRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commissions.receive');
    const commission = await this.commissionInScope(id, actor);
    if (!['CONFIRMADA', 'PARCIALMENTE_RECEBIDA'].includes(commission.status))
      throw fail(
        'COMMISSION_CONFLICT',
        `Comissão ${commission.status} não pode receber`,
        409,
      );
    const referencia = (
      commission.valorConfirmado ?? commission.valorPrevisto
    ).toString();
    const acumulado =
      toCents(commission.valorRecebido.toString()) +
      toCents(input.valorRecebido);
    const alvo = toCents(referencia);
    if (acumulado > alvo && !text(input.observacoes))
      throw fail(
        'COMMISSION_CONFLICT',
        'Valor acima do confirmado exige justificativa',
        422,
      );
    const status: CommissionStatus =
      acumulado >= alvo ? 'RECEBIDA' : 'PARCIALMENTE_RECEBIDA';
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.commission.updateMany({
        where: {
          id,
          updatedAt: input.expectedUpdatedAt
            ? new Date(input.expectedUpdatedAt)
            : commission.updatedAt,
          status: commission.status,
          valorRecebido: commission.valorRecebido,
        },
        data: {
          status,
          valorRecebido: fromCents(acumulado),
          dataRecebimento: input.dataRecebimento
            ? new Date(input.dataRecebimento)
            : new Date(),
          referenciaExterna:
            input.referenciaExterna ?? commission.referenciaExterna,
          observacoes: input.observacoes ?? commission.observacoes,
        },
      });
      if (!result.count)
        throw fail(
          'COMMISSION_CONFLICT',
          'A comissão foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_RECEIVED',
          actorId: actor.user.id,
          entity: 'Commission',
          entityId: id,
          metadata: {
            recebidoAgora: input.valorRecebido,
            acumulado: fromCents(acumulado),
            referencia: referencia,
            status,
          },
          ...auditMeta(meta),
        },
      });
      return tx.commission.findFirstOrThrow({ where: { id } });
    });
    return dto(updated);
  }

  async reverse(
    actor: AuthContext,
    id: string,
    input: ReverseCommissionRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commissions.reverse');
    const commission = await this.commissionInScope(id, actor);
    if (!['RECEBIDA', 'PARCIALMENTE_RECEBIDA'].includes(commission.status))
      throw fail(
        'COMMISSION_CONFLICT',
        'Somente comissão recebida pode ser estornada',
        409,
      );
    if (commission.tipo === 'ESTORNO')
      throw fail('COMMISSION_CONFLICT', 'Estorno não pode ser estornado', 409);
    const result = await this.db.$transaction(async (tx) => {
      const locked = await tx.commission.updateMany({
        where: {
          id,
          updatedAt: input.expectedUpdatedAt
            ? new Date(input.expectedUpdatedAt)
            : commission.updatedAt,
          status: commission.status,
          valorRecebido: commission.valorRecebido,
        },
        data: { status: 'ESTORNADA' },
      });
      if (!locked.count)
        throw fail(
          'COMMISSION_CONFLICT',
          'A comissão foi alterada por outra pessoa',
          409,
        );
      const estorno = await tx.commission.create({
        data: {
          saleId: commission.saleId,
          administradoraId: commission.administradoraId,
          tipo: 'ESTORNO',
          status: 'CONFIRMADA',
          baseCalculo: commission.baseCalculo,
          baseValor: commission.valorRecebido,
          valorPrevisto: commission.valorRecebido,
          valorConfirmado: commission.valorRecebido,
          competencia: commission.competencia,
          observacoes: input.observacoes ?? null,
          estornoDeId: commission.id,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_REVERSED',
          actorId: actor.user.id,
          entity: 'Commission',
          entityId: id,
          metadata: {
            estornoId: estorno.id,
            valor: commission.valorRecebido.toString(),
            motivo: input.motivo,
          },
          ...auditMeta(meta),
        },
      });
      return {
        original: await tx.commission.findFirstOrThrow({ where: { id } }),
        estorno,
      };
    });
    return { original: dto(result.original), estorno: dto(result.estorno) };
  }

  async cancel(actor: AuthContext, id: string, meta: RequestMetadata) {
    requireAccess(actor, 'commissions.create');
    const commission = await this.commissionInScope(id, actor);
    if (!['PREVISTA', 'CONFIRMADA'].includes(commission.status))
      throw fail(
        'COMMISSION_CONFLICT',
        `Comissão ${commission.status} não pode ser cancelada`,
        409,
      );
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.commission.updateMany({
        where: {
          id,
          updatedAt: commission.updatedAt,
          status: commission.status,
          valorRecebido: commission.valorRecebido,
        },
        data: { status: 'CANCELADA' },
      });
      if (!result.count)
        throw fail(
          'COMMISSION_CONFLICT',
          'A comissão foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_CANCELLED',
          actorId: actor.user.id,
          entity: 'Commission',
          entityId: id,
          metadata: { saleId: commission.saleId },
          ...auditMeta(meta),
        },
      });
      return tx.commission.findFirstOrThrow({ where: { id } });
    });
    return dto(updated);
  }

  // ---- Regras ----
  async listRules(actor: AuthContext, query: CommissionRuleListQuery) {
    requireAccess(actor, 'commission_rules.read');
    const where = {
      AND: [
        ...(query.administradoraId
          ? [{ administradoraId: query.administradoraId }]
          : []),
        ...(query.ativo !== undefined
          ? [{ ativo: query.ativo === 'true' }]
          : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.db.commissionRule.findMany({
        where,
        orderBy: [{ prioridade: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.commissionRule.count({ where }),
    ]);
    return {
      items: items.map((r) => ({
        ...r,
        percentual: raw(r.percentual),
        valorFixo: money(r.valorFixo),
        vigenciaInicio: r.vigenciaInicio.toISOString().slice(0, 10),
        vigenciaFim: r.vigenciaFim
          ? r.vigenciaFim.toISOString().slice(0, 10)
          : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async createRule(
    actor: AuthContext,
    input: CreateCommissionRuleRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commission_rules.manage');
    if (
      input.vigenciaFim &&
      String(input.vigenciaFim) < String(input.vigenciaInicio)
    )
      throw fail(
        'COMMISSION_CONFLICT',
        'Vigência final anterior ao início',
        422,
      );
    const created = await this.db.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({
        data: {
          ...(defined(input) as Record<string, never>),
          vigenciaInicio: new Date(input.vigenciaInicio),
          vigenciaFim: input.vigenciaFim
            ? new Date(input.vigenciaFim)
            : undefined,
        } as never,
      });
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_RULE_CREATED',
          actorId: actor.user.id,
          entity: 'CommissionRule',
          entityId: rule.id,
          metadata: { administradoraId: rule.administradoraId },
          ...auditMeta(meta),
        },
      });
      return rule;
    });
    return {
      ...created,
      percentual: raw(created.percentual),
      valorFixo: money(created.valorFixo),
      vigenciaInicio: created.vigenciaInicio.toISOString().slice(0, 10),
      vigenciaFim: created.vigenciaFim
        ? created.vigenciaFim.toISOString().slice(0, 10)
        : null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateRule(
    actor: AuthContext,
    id: string,
    input: UpdateCommissionRuleRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'commission_rules.manage');
    const { expectedUpdatedAt, vigenciaInicio, vigenciaFim, ...values } = input;
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.commissionRule.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt
            ? { updatedAt: new Date(expectedUpdatedAt) }
            : {}),
        },
        data: {
          ...(defined(values) as Record<string, never>),
          ...(vigenciaInicio
            ? { vigenciaInicio: new Date(vigenciaInicio) }
            : {}),
          ...(vigenciaFim !== undefined
            ? { vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null }
            : {}),
        } as never,
      });
      if (!result.count)
        throw fail(
          'COMMISSION_CONFLICT',
          'A regra foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'COMMISSION_RULE_UPDATED',
          actorId: actor.user.id,
          entity: 'CommissionRule',
          entityId: id,
          metadata: { campos: Object.keys(values) },
          ...auditMeta(meta),
        },
      });
      return tx.commissionRule.findFirstOrThrow({ where: { id } });
    });
    return {
      ...updated,
      percentual: raw(updated.percentual),
      valorFixo: money(updated.valorFixo),
      vigenciaInicio: updated.vigenciaInicio.toISOString().slice(0, 10),
      vigenciaFim: updated.vigenciaFim
        ? updated.vigenciaFim.toISOString().slice(0, 10)
        : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /** Regra vigente mais específica para (admin, produto, categoria, data). */
  async matchRule(
    administradoraId: string,
    produtoId: string | null,
    categoria: string | null,
    referencia: Date,
  ) {
    const rules = await this.db.commissionRule.findMany({
      where: {
        administradoraId,
        ativo: true,
        vigenciaInicio: { lte: referencia },
        OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: referencia } }],
      },
      orderBy: [{ prioridade: 'desc' }, { updatedAt: 'desc' }],
    });
    const score = (r: (typeof rules)[number]) =>
      (r.produtoId && produtoId && r.produtoId === produtoId ? 4 : 0) +
      (r.categoria && categoria && r.categoria === categoria ? 2 : 0) +
      (!r.produtoId && !r.categoria ? 1 : 0);
    const ranked = rules
      .map((r) => ({ r, score: score(r) }))
      .filter((x) => x.score > 0 || (!x.r.produtoId && !x.r.categoria))
      .sort((a, b) => b.score - a.score || b.r.prioridade - a.r.prioridade);
    return ranked[0]?.r ?? null;
  }
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}
