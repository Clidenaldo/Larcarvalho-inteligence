import { FinancialDecimal, hasChanges } from './values.js';
import {
  SALE_DOCUMENT_TEMPLATE,
  saleTransitions,
  type AssignSaleRequest,
  type CancelSaleRequest,
  type ChangeSaleStatusRequest,
  type CreateSaleRequest,
  type SaleListQuery,
  type SaleOrigin,
  type SaleStatus,
  type UpdateDocumentStatusRequest,
  type UpdateSaleRequest,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import {
  commercialScope,
  requireAccess,
  saleScope,
  scopedUsers,
} from '../../core/auth/data-scope.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';

const fail = (
  code: 'SALE_NOT_FOUND' | 'SALE_CONFLICT' | 'SALE_FORBIDDEN',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};
const NOT_INFORMED = 'Não informado';
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

const saleInclude = {
  lead: { select: { id: true, nome: true } },
  administradora: { select: { id: true, nome: true } },
  produto: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.SaleInclude;

type SaleRow = Prisma.SaleGetPayload<{ include: typeof saleInclude }> & {
  proposal: { number: string };
};

function toIso(value: Date | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.toISOString();
}
const money = (
  value: { toString(): string } | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new FinancialDecimal(value.toString()).toFixed(2);
};

function dto(row: SaleRow, proposalNumero: string | null) {
  return {
    id: row.id,
    numero: row.numero,
    leadId: row.leadId,
    lead: row.lead ? { id: row.lead.id, nome: row.lead.nome } : null,
    proposalId: row.proposalId,
    proposalNumero,
    proposalItemId: row.proposalItemId,
    administradoraId: row.administradoraId,
    administradora: row.administradora
      ? { id: row.administradora.id, nome: row.administradora.nome }
      : null,
    produtoId: row.produtoId,
    produto: row.produto
      ? { id: row.produto.id, nome: row.produto.nome }
      : null,
    grupoId: row.grupoId,
    cotaId: row.cotaId,
    responsavelUserId: row.responsavelUserId,
    responsavel: row.responsavel
      ? { id: row.responsavel.id, nome: row.responsavel.nome }
      : null,
    teamId: row.teamId,
    origemVenda: row.origemVenda as SaleOrigin,
    canalVenda: row.canalVenda,
    valorCreditoContratado: money(row.valorCreditoContratado) ?? '0.00',
    valorParcelaContratada: money(row.valorParcelaContratada) ?? null,
    prazoContratado: row.prazoContratado,
    status: row.status as SaleStatus,
    dataAceite: row.dataAceite.toISOString(),
    dataVenda: toIso(row.dataVenda) ?? null,
    dataEnvioAdministradora: toIso(row.dataEnvioAdministradora) ?? null,
    dataContratacao: toIso(row.dataContratacao) ?? null,
    dataCancelamento: toIso(row.dataCancelamento) ?? null,
    motivoCancelamento: row.motivoCancelamento,
    observacoes: row.observacoes,
    snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditMeta(meta: RequestMetadata) {
  return {
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent?.slice(0, 2048) ?? null,
  };
}

export class SalesService {
  constructor(private readonly db: PrismaClient) {}

  private async accessible(
    id: string,
    actor: AuthContext,
    action: 'read' | 'update' = 'read',
  ) {
    const sale = await this.db.sale.findFirst({
      where: { AND: [{ id }, saleScope(actor, action)] },
      include: { ...saleInclude, proposal: { select: { number: true } } },
    });
    if (!sale) throw fail('SALE_NOT_FOUND', 'Venda não encontrada', 404);
    return sale as SaleRow;
  }

  async list(actor: AuthContext, query: SaleListQuery) {
    requireAccess(
      actor,
      hasPermission(actor, 'sales.read_all')
        ? 'sales.read_all'
        : hasPermission(actor, 'sales.read_team')
          ? 'sales.read_team'
          : 'sales.read_own',
    );
    const where: Prisma.SaleWhereInput = {
      AND: [
        saleScope(actor, 'read'),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.administradoraId
          ? [{ administradoraId: query.administradoraId }]
          : []),
        ...(query.produtoId ? [{ produtoId: query.produtoId }] : []),
        ...(query.responsavelUserId
          ? [{ responsavelUserId: query.responsavelUserId }]
          : []),
        ...(query.teamId ? [{ teamId: query.teamId }] : []),
        ...(query.periodoDe
          ? [{ createdAt: { gte: new Date(query.periodoDe) } }]
          : []),
        ...(query.periodoAte
          ? [{ createdAt: { lte: new Date(query.periodoAte) } }]
          : []),
        ...(query.search
          ? [
              {
                OR: [
                  {
                    numero: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    lead: {
                      nome: {
                        contains: query.search,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.db.sale.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { ...saleInclude, proposal: { select: { number: true } } },
      }),
      this.db.sale.count({ where }),
    ]);
    return {
      items: items.map((row) =>
        dto(row as SaleRow, (row as SaleRow).proposal.number),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async get(actor: AuthContext, id: string) {
    const sale = await this.accessible(id, actor, 'read');
    const [contracts, documents, commissions, history, auditTrail] =
      await Promise.all([
        this.db.saleContract.findMany({
          where: { saleId: id },
          orderBy: { createdAt: 'asc' },
        }),
        this.db.saleDocument.findMany({
          where: { saleId: id },
          orderBy: { tipo: 'asc' },
        }),
        hasPermission(actor, 'commissions.read')
          ? this.db.commission.findMany({
              where: { saleId: id },
              orderBy: { createdAt: 'asc' },
            })
          : Promise.resolve([]),
        this.db.saleStatusHistory.findMany({
          where: { saleId: id },
          orderBy: { createdAt: 'asc' },
          include: { changedBy: { select: { id: true, nome: true } } },
        }),
        hasPermission(actor, 'audit.read')
          ? this.db.auditLog.findMany({
              where: {
                OR: [
                  { entity: 'Sale', entityId: id },
                  {
                    entity: 'SaleContract',
                    entityId: {
                      in: (
                        await this.db.saleContract.findMany({
                          where: { saleId: id },
                          select: { id: true },
                        })
                      ).map((c) => c.id),
                    },
                  },
                ],
              },
              orderBy: { createdAt: 'desc' },
              take: 50,
            })
          : Promise.resolve([]),
      ]);
    return {
      ...dto(sale, sale.proposal.number),
      contracts: contracts.map((c) => ({
        ...c,
        valorCredito: money(c.valorCredito) ?? null,
        valorParcela: money(c.valorParcela) ?? null,
        dataEmissao: toIso(c.dataEmissao) ?? null,
        dataAssinatura: toIso(c.dataAssinatura) ?? null,
        dataInicio: toIso(c.dataInicio) ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      documents: documents.map((d) => ({
        ...d,
        recebidoEm: toIso(d.recebidoEm) ?? null,
        validadoEm: toIso(d.validadoEm) ?? null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      commissions: commissions.map((c) => ({
        ...c,
        baseValor: new FinancialDecimal(c.baseValor.toString()).toFixed(2),
        percentual: c.percentual?.toString() ?? null,
        valorPrevisto: new FinancialDecimal(c.valorPrevisto.toString()).toFixed(
          2,
        ),
        valorConfirmado: money(c.valorConfirmado) ?? null,
        valorRecebido: new FinancialDecimal(c.valorRecebido.toString()).toFixed(
          2,
        ),
        dataPrevistaPagamento: toIso(c.dataPrevistaPagamento) ?? null,
        dataConfirmacao: toIso(c.dataConfirmacao) ?? null,
        dataRecebimento: toIso(c.dataRecebimento) ?? null,
        regraSnapshot: (c.regraSnapshot ?? null) as Record<
          string,
          unknown
        > | null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      commissionsHidden: !hasPermission(actor, 'commissions.read'),
      statusHistory: history.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        changedBy: h.changedBy,
        createdAt: h.createdAt.toISOString(),
      })),
      auditTrail: auditTrail.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        createdAt: a.createdAt.toISOString(),
        metadata: (a.metadata ?? null) as Record<string, unknown> | null,
      })),
    };
  }

  async createFromProposal(
    actor: AuthContext,
    input: CreateSaleRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'sales.create');
    const proposal = await this.db.proposal.findFirst({
      where: {
        AND: [
          { id: input.proposalId, deletedAt: null },
          commercialScope(actor, 'proposals', 'read'),
        ],
      },
      include: {
        items: { where: { id: input.proposalItemId } },
        lead: { select: { id: true, responsavelId: true } },
      },
    });
    if (!proposal) throw fail('SALE_NOT_FOUND', 'Proposta não encontrada', 404);
    if (proposal.status !== 'ACCEPTED')
      throw fail('SALE_CONFLICT', 'Somente propostas aceitas geram venda', 409);
    const item = proposal.items[0];
    if (!item)
      throw fail('SALE_CONFLICT', 'Item da proposta não encontrado', 409);
    const existing = await this.db.sale.findFirst({
      where: { proposalId: proposal.id, proposalItemId: item.id },
      select: { id: true, numero: true },
    });
    if (existing)
      throw fail(
        'SALE_CONFLICT',
        `Item já gerou a venda ${existing.numero}`,
        409,
      );

    const fs = (item.financialSnapshot ?? {}) as Record<string, unknown>;
    const credito = text(fs.contractedCredit ?? fs.netCredit ?? fs.credito);
    if (!credito)
      throw fail(
        'SALE_CONFLICT',
        'Item sem crédito contratado no snapshot',
        409,
      );
    const responsavelId =
      input.responsavelUserId ?? proposal.lead.responsavelId ?? actor.user.id;
    const responsavel = await this.db.user.findUnique({
      where: { id: responsavelId },
      select: { id: true, ativo: true, role: true, teamId: true },
    });
    if (
      !responsavel?.ativo ||
      !['VENDEDOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN'].includes(responsavel.role)
    )
      throw fail('SALE_CONFLICT', 'Responsável comercial inválido', 409);
    if (!hasPermission(actor, 'sales.read_all')) {
      const allowed = await this.db.user.findFirst({
        where: { AND: [{ id: responsavelId }, scopedUsers(actor)] },
        select: { id: true },
      });
      if (!allowed)
        throw fail('SALE_FORBIDDEN', 'Responsável fora do seu escopo', 403);
    }
    if (input.grupoId) {
      const grupo = await this.db.grupo.findUnique({
        where: { id: input.grupoId },
        select: { id: true },
      });
      if (!grupo) throw fail('SALE_CONFLICT', 'Grupo não encontrado', 409);
    }
    if (input.cotaId) {
      const cota = await this.db.cota.findUnique({
        where: { id: input.cotaId },
        select: { id: true, grupoId: true },
      });
      if (!cota) throw fail('SALE_CONFLICT', 'Cota não encontrada', 409);
      if (input.grupoId && cota.grupoId !== input.grupoId)
        throw fail(
          'SALE_CONFLICT',
          'Cota não pertence ao grupo informado',
          409,
        );
    }

    const snapshot = {
      administradoraId: text(fs.administratorId ?? fs.administradoraId),
      administradoraNome:
        text(fs.administratorName ?? fs.administradoraNome) ?? NOT_INFORMED,
      produtoId: text(fs.productId ?? fs.produtoId),
      produtoNome: text(fs.productName ?? fs.produtoNome) ?? NOT_INFORMED,
      categoria: text(fs.category ?? fs.categoria) ?? NOT_INFORMED,
      plano: text(fs.planName ?? fs.codigoPlano ?? fs.plano) ?? NOT_INFORMED,
      credito,
      parcela:
        text(
          fs.initialInstallment ??
            fs.firstInstallment ??
            fs.parcela ??
            fs.parcelaPadrao,
        ) ?? NOT_INFORMED,
      prazoMeses:
        typeof fs.totalTermMonths === 'number'
          ? fs.totalTermMonths
          : typeof fs.termMonths === 'number'
            ? fs.termMonths
            : typeof fs.prazoMeses === 'number'
              ? fs.prazoMeses
              : null,
      adherenceScore:
        typeof fs.adherenceScore === 'number'
          ? fs.adherenceScore
          : typeof fs.aderencia === 'number'
            ? fs.aderencia
            : null,
      taxaAdministracao:
        text(fs.administrationFee ?? fs.taxaAdministracao) ?? NOT_INFORMED,
      fundoReserva: text(fs.reserveFund ?? fs.fundoReserva) ?? NOT_INFORMED,
      seguro: text(fs.insurance ?? fs.seguro) ?? NOT_INFORMED,
      lance:
        text(fs.totalBidAmount ?? fs.ownBidAmount ?? fs.lance) ?? NOT_INFORMED,
      regraComercial:
        text(fs.commercialRule ?? fs.regraComercial) ?? NOT_INFORMED,
      propostaNumero: proposal.number,
      propostaVersao: proposal.version,
      propostaEmitidaEm: proposal.issuedAt?.toISOString() ?? null,
      itemDescricao: item.description,
    };
    const year = new Date().getFullYear();

    const created = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sale-seq-${year}`}))`;
      const seq = await tx.saleSequence.upsert({
        where: { year },
        create: { year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const numero = `VEN-${year}-${String(seq.lastNumber).padStart(6, '0')}`;
      const sale = await tx.sale.create({
        data: {
          numero,
          leadId: proposal.leadId,
          proposalId: proposal.id,
          proposalItemId: item.id,
          administradoraId: snapshot.administradoraId,
          produtoId: snapshot.produtoId,
          grupoId: input.grupoId ?? null,
          cotaId: input.cotaId ?? null,
          responsavelUserId: responsavelId,
          teamId: input.teamId ?? responsavel.teamId ?? null,
          origemVenda: input.origemVenda,
          canalVenda: input.canalVenda ?? null,
          valorCreditoContratado: credito,
          valorParcelaContratada:
            snapshot.parcela !== NOT_INFORMED &&
            !Number.isNaN(Number(snapshot.parcela))
              ? snapshot.parcela
              : null,
          prazoContratado: snapshot.prazoMeses,
          status: 'RASCUNHO',
          dataAceite: input.dataAceite
            ? new Date(input.dataAceite)
            : new Date(),
          observacoes: input.observacoes ?? null,
          snapshot: snapshot as Prisma.InputJsonValue,
          createdById: actor.user.id,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'RASCUNHO',
              changedById: actor.user.id,
              reason: `Venda gerada da proposta ${proposal.number}`,
            },
          },
          documents: {
            create: SALE_DOCUMENT_TEMPLATE.map((doc) => ({
              tipo: doc.tipo,
              obrigatorio: doc.obrigatorio,
            })),
          },
        },
        include: { ...saleInclude, proposal: { select: { number: true } } },
      });
      await tx.auditLog.create({
        data: {
          action: 'SALE_CREATED',
          actorId: actor.user.id,
          entity: 'Sale',
          entityId: sale.id,
          metadata: {
            numero,
            proposalId: proposal.id,
            proposalItemId: item.id,
            leadId: proposal.leadId,
          },
          ...auditMeta(meta),
        },
      });
      return sale;
    });
    return dto(created as SaleRow, proposal.number);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateSaleRequest,
    meta: RequestMetadata,
  ) {
    const sale = await this.accessible(id, actor, 'update');
    if (['CONTRATADA', 'CANCELADA', 'RECUSADA'].includes(sale.status))
      throw fail(
        'SALE_CONFLICT',
        'Venda finalizada não pode ser alterada',
        409,
      );
    const { expectedUpdatedAt, ...values } = input;
    if (
      expectedUpdatedAt &&
      sale.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
    )
      throw fail('SALE_CONFLICT', 'A venda foi alterada por outra pessoa', 409);
    if (!hasChanges(sale, values))
      return dto(sale as SaleRow, (sale as SaleRow).proposal.number);
    if (values.cotaId && values.grupoId) {
      const cota = await this.db.cota.findUnique({
        where: { id: values.cotaId },
        select: { grupoId: true },
      });
      if (!cota || cota.grupoId !== values.grupoId)
        throw fail(
          'SALE_CONFLICT',
          'Cota não pertence ao grupo informado',
          409,
        );
    }
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.sale.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt
            ? { updatedAt: new Date(expectedUpdatedAt) }
            : {}),
        },
        data: defined(values) as Prisma.SaleUpdateManyMutationInput,
      });
      if (!result.count)
        throw fail(
          'SALE_CONFLICT',
          'A venda foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'SALE_UPDATED',
          actorId: actor.user.id,
          entity: 'Sale',
          entityId: id,
          metadata: { campos: Object.keys(values) },
          ...auditMeta(meta),
        },
      });
      return tx.sale.findFirstOrThrow({
        where: { id },
        include: { ...saleInclude, proposal: { select: { number: true } } },
      });
    });
    return dto(updated as SaleRow, (updated as SaleRow).proposal.number);
  }

  async changeStatus(
    actor: AuthContext,
    id: string,
    input: ChangeSaleStatusRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'sales.change_status');
    const sale = await this.accessible(id, actor, 'update');
    if (!saleTransitions[sale.status as SaleStatus].includes(input.status))
      throw fail(
        'SALE_CONFLICT',
        `Transição inválida de ${sale.status} para ${input.status}`,
        409,
      );
    const now = new Date();
    const data: Prisma.SaleUpdateInput = { status: input.status };
    if (sale.status === 'RASCUNHO') data.dataVenda = now;
    if (input.status === 'ENVIADA_ADMINISTRADORA')
      data.dataEnvioAdministradora = now;
    if (input.status === 'CONTRATADA') data.dataContratacao = now;
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.sale.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data,
      });
      if (!result.count)
        throw fail(
          'SALE_CONFLICT',
          'A venda foi alterada por outra pessoa',
          409,
        );
      await tx.saleStatusHistory.create({
        data: {
          saleId: id,
          fromStatus: sale.status,
          toStatus: input.status,
          changedById: actor.user.id,
          reason: input.observacoes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'SALE_STATUS_CHANGED',
          actorId: actor.user.id,
          entity: 'Sale',
          entityId: id,
          metadata: { de: sale.status, para: input.status },
          ...auditMeta(meta),
        },
      });
      return tx.sale.findFirstOrThrow({
        where: { id },
        include: { ...saleInclude, proposal: { select: { number: true } } },
      });
    });
    return dto(updated as SaleRow, (updated as SaleRow).proposal.number);
  }

  async assign(
    actor: AuthContext,
    id: string,
    input: AssignSaleRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'sales.assign');
    const sale = await this.accessible(id, actor, 'update');
    const target = await this.db.user.findUnique({
      where: { id: input.responsavelUserId },
      select: { id: true, ativo: true, role: true },
    });
    if (
      !target?.ativo ||
      !['VENDEDOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN'].includes(target.role)
    )
      throw fail('SALE_CONFLICT', 'Responsável comercial inválido', 409);
    if (!hasPermission(actor, 'sales.read_all')) {
      const allowed = await this.db.user.findFirst({
        where: { AND: [{ id: input.responsavelUserId }, scopedUsers(actor)] },
        select: { id: true },
      });
      if (!allowed)
        throw fail('SALE_FORBIDDEN', 'Responsável fora do seu escopo', 403);
    }
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.sale.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: { responsavelUserId: input.responsavelUserId },
      });
      if (!result.count)
        throw fail(
          'SALE_CONFLICT',
          'A venda foi alterada por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'SALE_ASSIGNED',
          actorId: actor.user.id,
          entity: 'Sale',
          entityId: id,
          metadata: {
            de: sale.responsavelUserId,
            para: input.responsavelUserId,
            motivo: input.motivo ?? null,
          },
          ...auditMeta(meta),
        },
      });
      return tx.sale.findFirstOrThrow({
        where: { id },
        include: { ...saleInclude, proposal: { select: { number: true } } },
      });
    });
    return dto(updated as SaleRow, (updated as SaleRow).proposal.number);
  }

  async cancel(
    actor: AuthContext,
    id: string,
    input: CancelSaleRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'sales.cancel');
    const sale = await this.accessible(id, actor, 'update');
    if (['CONTRATADA', 'CANCELADA', 'RECUSADA'].includes(sale.status))
      throw fail(
        'SALE_CONFLICT',
        `Venda ${sale.status} não pode ser cancelada`,
        409,
      );
    const blocking = await this.db.commission.findMany({
      where: {
        saleId: id,
        status: { in: ['RECEBIDA', 'PARCIALMENTE_RECEBIDA'] },
      },
      select: { id: true },
    });
    if (blocking.length > 0)
      throw fail(
        'SALE_CONFLICT',
        'Venda possui comissão recebida: faça o estorno antes de cancelar',
        409,
      );
    const now = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.sale.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: {
          status: 'CANCELADA',
          dataCancelamento: now,
          motivoCancelamento: input.motivo,
          observacoes: input.observacoes ?? sale.observacoes,
        },
      });
      if (!result.count)
        throw fail(
          'SALE_CONFLICT',
          'A venda foi alterada por outra pessoa',
          409,
        );
      await tx.saleStatusHistory.create({
        data: {
          saleId: id,
          fromStatus: sale.status,
          toStatus: 'CANCELADA',
          changedById: actor.user.id,
          reason: input.motivo,
        },
      });
      const openCommissions = await tx.commission.findMany({
        where: { saleId: id, status: { in: ['PREVISTA', 'CONFIRMADA'] } },
        select: { id: true },
      });
      for (const commission of openCommissions) {
        await tx.commission.update({
          where: { id: commission.id },
          data: { status: 'CANCELADA' },
        });
        await tx.auditLog.create({
          data: {
            action: 'COMMISSION_CANCELLED',
            actorId: actor.user.id,
            entity: 'Commission',
            entityId: commission.id,
            metadata: { saleId: id, motivo: 'Cancelamento da venda' },
            ...auditMeta(meta),
          },
        });
      }
      await tx.auditLog.create({
        data: {
          action: 'SALE_CANCELLED',
          actorId: actor.user.id,
          entity: 'Sale',
          entityId: id,
          metadata: {
            de: sale.status,
            motivo: input.motivo,
            comissoesCanceladas: openCommissions.length,
          },
          ...auditMeta(meta),
        },
      });
      return tx.sale.findFirstOrThrow({
        where: { id },
        include: { ...saleInclude, proposal: { select: { number: true } } },
      });
    });
    return dto(updated as SaleRow, (updated as SaleRow).proposal.number);
  }

  async updateDocument(
    actor: AuthContext,
    saleId: string,
    documentId: string,
    input: UpdateDocumentStatusRequest,
    meta: RequestMetadata,
  ) {
    const sale = await this.accessible(saleId, actor, 'update');
    if (['CANCELADA'].includes(sale.status))
      throw fail(
        'SALE_CONFLICT',
        'Venda cancelada: documentos bloqueados',
        409,
      );
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const result = await tx.saleDocument.updateMany({
        where: {
          id: documentId,
          saleId,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: defined({
          status: input.status,
          referencia: input.referencia ?? undefined,
          observacoes: input.observacoes ?? undefined,
          recebidoEm: input.status === 'RECEBIDO' ? now : undefined,
          validadoEm: input.status === 'VALIDADO' ? now : undefined,
        }) as Prisma.SaleDocumentUpdateManyMutationInput,
      });
      if (!result.count)
        throw fail(
          'SALE_CONFLICT',
          'Documento não encontrado ou alterado por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: 'SALE_DOCUMENT_UPDATED',
          actorId: actor.user.id,
          entity: 'SaleDocument',
          entityId: documentId,
          metadata: { saleId, status: input.status },
          ...auditMeta(meta),
        },
      });
      return tx.saleDocument.findFirstOrThrow({ where: { id: documentId } });
    });
  }
}
