import { FinancialDecimal, hasChanges } from './values.js';
import {
  contractTransitions,
  type ContractStatus,
  type CreateContractRequest,
  type UpdateContractRequest,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { requireAccess, saleScope } from '../../core/auth/data-scope.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';

const fail = (
  code: 'CONTRACT_NOT_FOUND' | 'CONTRACT_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });

const money = (value: { toString(): string } | null | undefined) => {
  if (value === undefined || value === null) return null;
  return new FinancialDecimal(value.toString()).toFixed(2);
};
const toIso = (value: Date | null | undefined) => {
  if (value === undefined || value === null) return null;
  return value.toISOString();
};
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
function dto(row: {
  id: string;
  saleId: string;
  numeroContrato: string | null;
  numeroPropostaAdministradora: string | null;
  numeroCota: string | null;
  grupoCodigo: string | null;
  statusContrato: ContractStatus;
  dataEmissao: Date | null;
  dataAssinatura: Date | null;
  dataInicio: Date | null;
  valorCredito: { toString(): string } | null;
  valorParcela: { toString(): string } | null;
  prazo: number | null;
  documentoReferencia: string | null;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    saleId: row.saleId,
    numeroContrato: row.numeroContrato,
    numeroPropostaAdministradora: row.numeroPropostaAdministradora,
    numeroCota: row.numeroCota,
    grupoCodigo: row.grupoCodigo,
    statusContrato: row.statusContrato,
    dataEmissao: toIso(row.dataEmissao),
    dataAssinatura: toIso(row.dataAssinatura),
    dataInicio: toIso(row.dataInicio),
    valorCredito: money(row.valorCredito),
    valorParcela: money(row.valorParcela),
    prazo: row.prazo,
    documentoReferencia: row.documentoReferencia,
    observacoes: row.observacoes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class SaleContractsService {
  constructor(private readonly db: PrismaClient) {}

  private async saleInScope(
    saleId: string,
    actor: AuthContext,
    action: 'read' | 'update' = 'read',
  ) {
    const sale = await this.db.sale.findFirst({
      where: { AND: [{ id: saleId }, saleScope(actor, action)] },
      select: { id: true, status: true },
    });
    if (!sale) throw fail('CONTRACT_NOT_FOUND', 'Venda não encontrada', 404);
    return sale;
  }

  async list(actor: AuthContext, saleId: string) {
    requireAccess(actor, 'contracts.read');
    await this.saleInScope(saleId, actor, 'read');
    const items = await this.db.saleContract.findMany({
      where: { saleId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map(dto);
  }

  async create(
    actor: AuthContext,
    saleId: string,
    input: CreateContractRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'contracts.create');
    const sale = await this.saleInScope(saleId, actor, 'update');
    if (['CANCELADA', 'RECUSADA'].includes(sale.status))
      throw fail(
        'CONTRACT_CONFLICT',
        'Venda finalizada não recebe contrato',
        409,
      );
    const open = await this.db.saleContract.findFirst({
      where: { saleId, statusContrato: { not: 'CANCELADO' } },
      select: { id: true },
    });
    if (open)
      throw fail(
        'CONTRACT_CONFLICT',
        'Venda já possui contrato ativo em fluxo',
        409,
      );
    const created = await this.db.$transaction(async (tx) => {
      const contract = await tx.saleContract.create({
        data: { saleId, ...defined(input as Record<string, unknown>) } as never,
      });
      await tx.auditLog.create({
        data: {
          action: 'CONTRACT_CREATED',
          actorId: actor.user.id,
          entity: 'SaleContract',
          entityId: contract.id,
          metadata: { saleId },
          ...auditMeta(meta),
        },
      });
      return contract;
    });
    return dto(created);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateContractRequest,
    meta: RequestMetadata,
  ) {
    requireAccess(actor, 'contracts.update');
    const current = await this.db.saleContract.findUnique({
      where: { id },
      include: { sale: { select: { id: true, status: true } } },
    });
    if (!current)
      throw fail('CONTRACT_NOT_FOUND', 'Contrato não encontrado', 404);
    await this.saleInScope(current.saleId, actor, 'update');
    const { expectedUpdatedAt, statusContrato, ...values } = input;
    if (
      expectedUpdatedAt &&
      current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
    )
      throw fail(
        'CONTRACT_CONFLICT',
        'O contrato foi alterado por outra pessoa',
        409,
      );
    if (!hasChanges(current, { ...values, statusContrato }))
      return dto(current);
    if (
      statusContrato &&
      !contractTransitions[current.statusContrato as ContractStatus].includes(
        statusContrato,
      )
    )
      throw fail(
        'CONTRACT_CONFLICT',
        `Transição inválida de ${current.statusContrato} para ${statusContrato}`,
        409,
      );
    if (
      statusContrato === 'ATIVO' &&
      !['APROVADA', 'CONTRATADA'].includes(current.sale.status)
    )
      throw fail(
        'CONTRACT_CONFLICT',
        'Contrato só ativa com venda aprovada ou contratada',
        409,
      );
    const now = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.saleContract.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt
            ? { updatedAt: new Date(expectedUpdatedAt) }
            : {}),
        },
        data: defined({
          ...values,
          ...(statusContrato ? { statusContrato } : {}),
          ...(statusContrato === 'ASSINADO' ? { dataAssinatura: now } : {}),
        }) as never,
      });
      if (!result.count)
        throw fail(
          'CONTRACT_CONFLICT',
          'O contrato foi alterado por outra pessoa',
          409,
        );
      await tx.auditLog.create({
        data: {
          action: statusContrato
            ? 'CONTRACT_STATUS_CHANGED'
            : 'CONTRACT_UPDATED',
          actorId: actor.user.id,
          entity: 'SaleContract',
          entityId: id,
          metadata: statusContrato
            ? { de: current.statusContrato, para: statusContrato }
            : { campos: Object.keys(values) },
          ...auditMeta(meta),
        },
      });
      return tx.saleContract.findFirstOrThrow({ where: { id } });
    });
    return dto(updated);
  }
}
