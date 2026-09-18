import type {
  CreateTabelaComercialItemRequest,
  CreateTabelaComercialRequest,
  Permission,
  TabelaComercial,
  TabelaComercialItem,
  TabelaComercialItemListQuery,
  TabelaComercialListQuery,
  UpdateTabelaComercialItemRequest,
  UpdateTabelaComercialRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type {
  PrismaClient,
  TabelaComercialStatus,
} from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  TabelasComerciaisRepository,
  type TabelaComercialItemRecord,
  type TabelaComercialRecord,
} from './tabelas-comerciais.repository.js';

const fail = (
  code:
    | 'TABELA_COMERCIAL_CONFLICT'
    | 'TABELA_COMERCIAL_NOT_FOUND'
    | 'ITEM_COMERCIAL_NOT_FOUND'
    | 'RELATIONSHIP_CONFLICT'
    | 'TABELA_COMERCIAL_DELETE_BLOCKED'
    | 'TABELA_COMERCIAL_CONFIRMATION_REQUIRED',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const unique = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002';
const date = (value: Date) => value.toISOString().slice(0, 10);
const decimal = (value: { toString(): string } | null) =>
  value?.toString() ?? null;

function dto(row: TabelaComercialRecord): TabelaComercial {
  return {
    ...row,
    categoria: row.categoria as TabelaComercial['categoria'],
    inicioVigencia: date(row.inicioVigencia),
    fimVigencia: row.fimVigencia ? date(row.fimVigencia) : null,
    fundoReservaPercentual: decimal(row.fundoReservaPercentual),
    taxaAdministracaoPercentual: decimal(row.taxaAdministracaoPercentual),
    taxaTotalPercentual: decimal(row.taxaTotalPercentual),
    seguroVidaPercentual: decimal(row.seguroVidaPercentual),
    quantidadeItens: row._count.itens,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    _count: undefined,
  } as TabelaComercial;
}

function itemDto(row: TabelaComercialItemRecord): TabelaComercialItem {
  return {
    ...row,
    creditoReferencia: row.creditoReferencia.toString(),
    seguro: decimal(row.seguro),
    taxaAntecipadaValor: decimal(row.taxaAntecipadaValor),
    taxaAntecipadaPercentual: decimal(row.taxaAntecipadaPercentual),
    primeiraParcela: decimal(row.primeiraParcela),
    demaisParcelas: decimal(row.demaisParcelas),
    parcelaPadrao: decimal(row.parcelaPadrao),
    fundoReservaPercentual: decimal(row.fundoReservaPercentual),
    taxaAdministracaoPercentual: decimal(row.taxaAdministracaoPercentual),
    taxaTotalPercentual: decimal(row.taxaTotalPercentual),
    seguroVidaPercentual: decimal(row.seguroVidaPercentual),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditData(actor: AuthContext, metadata: RequestMetadata) {
  return {
    actorId: actor.user.id,
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent?.slice(0, 2048) ?? null,
  };
}

export class TabelasComerciaisService {
  private readonly repository: TabelasComerciaisRepository;
  constructor(private readonly db: PrismaClient) {
    this.repository = new TabelasComerciaisRepository(db);
  }
  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private async relationships(
    administradoraId: string,
    produtoId?: string | null,
  ) {
    const admin = await this.db.administradora.findUnique({
      where: { id: administradoraId },
      select: { id: true, ativa: true },
    });
    if (!admin)
      throw fail('RELATIONSHIP_CONFLICT', 'Administradora não encontrada', 409);
    if (!admin.ativa)
      throw fail(
        'RELATIONSHIP_CONFLICT',
        'Administradora inativa não aceita nova tabela',
        409,
      );
    if (produtoId) {
      const product = await this.db.produto.findUnique({
        where: { id: produtoId },
        select: { administradoraId: true, ativo: true },
      });
      if (!product || product.administradoraId !== administradoraId)
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Produto não pertence à administradora',
          409,
        );
      if (!product.ativo)
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Produto inativo não pode ser vinculado',
          409,
        );
    }
  }
  private async deletionPolicy(id: string) {
    const dependentAudit = await this.db.auditLog.findFirst({
      where: {
        OR: [
          {
            entityId: id,
            NOT: { entity: { in: ['TabelaComercial', 'TabelaComercialItem'] } },
          },
          {
            metadata: { path: ['tabelaComercialId'], equals: id },
            NOT: { entity: { in: ['TabelaComercial', 'TabelaComercialItem'] } },
          },
        ],
      },
      select: { id: true },
    });

    return dependentAudit
      ? {
          permitida: false,
          motivos: [
            'Esta tabela possui hist?rico ou v?nculos e deve ser arquivada em vez de exclu?da definitivamente.',
          ],
        }
      : { permitida: true, motivos: [] };
  }

  async list(actor: AuthContext, query: TabelaComercialListQuery) {
    this.allow(actor, 'tabelas_comerciais.read');
    const { items, total } = await this.repository.list(query);
    return {
      items: items.map(dto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }
  async get(actor: AuthContext, id: string) {
    this.allow(actor, 'tabelas_comerciais.read');
    const row = await this.repository.find(id);
    if (!row)
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    const auditoria = await this.db.auditLog.findMany({
      where: {
        entity: { in: ['TabelaComercial', 'TabelaComercialItem'] },
        OR: [
          { entityId: id },
          { metadata: { path: ['tabelaComercialId'], equals: id } },
        ],
      },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      ...dto(row),
      auditoria: auditoria.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
      exclusaoFisica: await this.deletionPolicy(id),
    };
  }
  async create(
    actor: AuthContext,
    input: CreateTabelaComercialRequest,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.create');
    await this.relationships(input.administradoraId, input.produtoId);
    try {
      return dto(
        await this.db.$transaction(async (tx) => {
          const repo = new TabelasComerciaisRepository(tx);
          const row = await repo.create(input);
          await tx.auditLog.create({
            data: {
              ...auditData(actor, metadata),
              action: 'TABELA_COMERCIAL_CREATED',
              entity: 'TabelaComercial',
              entityId: row.id,
              metadata: {
                codigo: row.codigo,
                inicioVigencia: date(row.inicioVigencia),
              },
            },
          });
          return row;
        }),
      );
    } catch (error) {
      if (unique(error))
        throw fail(
          'TABELA_COMERCIAL_CONFLICT',
          'Já existe esta tabela para a administradora e vigência',
          409,
        );
      throw error;
    }
  }
  async update(
    actor: AuthContext,
    id: string,
    input: UpdateTabelaComercialRequest,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.update');
    const before = await this.repository.find(id);
    if (!before)
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    if (input.produtoId)
      await this.relationships(before.administradoraId, input.produtoId);
    if (input.fimVigencia && input.fimVigencia < date(before.inicioVigencia))
      throw fail(
        'TABELA_COMERCIAL_CONFLICT',
        'Fim da vigência deve ser igual ou posterior ao início',
        409,
      );
    const row = await this.db.$transaction(async (tx) => {
      const updated = await new TabelasComerciaisRepository(tx).update(
        id,
        input,
      );
      await tx.auditLog.create({
        data: {
          ...auditData(actor, metadata),
          action: 'TABELA_COMERCIAL_UPDATED',
          entity: 'TabelaComercial',
          entityId: id,
          metadata: { changedFields: Object.keys(input) },
        },
      });
      return updated;
    });
    return dto(row);
  }
  async status(
    actor: AuthContext,
    id: string,
    status: TabelaComercialStatus,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.update');
    if (!(await this.repository.find(id)))
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    const action =
      status === 'ATIVA'
        ? 'TABELA_COMERCIAL_ACTIVATED'
        : status === 'INATIVA'
          ? 'TABELA_COMERCIAL_DEACTIVATED'
          : 'TABELA_COMERCIAL_CLOSED';
    const row = await this.db.$transaction(async (tx) => {
      const updated = await new TabelasComerciaisRepository(tx).status(
        id,
        status,
      );
      await tx.auditLog.create({
        data: {
          ...auditData(actor, metadata),
          action,
          entity: 'TabelaComercial',
          entityId: id,
          metadata: { status },
        },
      });
      return updated;
    });
    return dto(row);
  }

  async archive(actor: AuthContext, id: string, metadata: RequestMetadata) {
    this.allow(actor, 'tabelas_comerciais.update');
    const before = await this.repository.find(id);
    if (!before)
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    const row = await this.db.$transaction(async (tx) => {
      const archived = await new TabelasComerciaisRepository(tx).archive(id);
      await tx.auditLog.create({
        data: {
          ...auditData(actor, metadata),
          action: 'TABELA_COMERCIAL_ARCHIVED',
          entity: 'TabelaComercial',
          entityId: id,
          metadata: { codigo: before.codigo, nome: before.nome },
        },
      });
      return archived;
    });
    return dto(row);
  }

  async restore(actor: AuthContext, id: string, metadata: RequestMetadata) {
    this.allow(actor, 'tabelas_comerciais.update');
    const before = await this.repository.find(id);
    if (!before)
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    const row = await this.db.$transaction(async (tx) => {
      const restored = await new TabelasComerciaisRepository(tx).restore(id);
      await tx.auditLog.create({
        data: {
          ...auditData(actor, metadata),
          action: 'TABELA_COMERCIAL_RESTORED',
          entity: 'TabelaComercial',
          entityId: id,
          metadata: { codigo: before.codigo, nome: before.nome },
        },
      });
      return restored;
    });
    return dto(row);
  }

  async delete(
    actor: AuthContext,
    id: string,
    confirmation: string,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.delete');
    if (confirmation !== 'EXCLUIR')
      throw fail(
        'TABELA_COMERCIAL_CONFIRMATION_REQUIRED',
        'Confirmação explícita EXCLUIR é obrigatória',
        400,
      );
    const before = await this.repository.find(id);
    if (!before)
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );

    const deletionPolicy = await this.deletionPolicy(id);
    if (!deletionPolicy.permitida)
      throw fail(
        'TABELA_COMERCIAL_DELETE_BLOCKED',
        'Esta tabela não pode ser excluída definitivamente porque possui histórico ou vínculos. Você pode arquivá-la.',
        409,
      );

    await this.db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          ...auditData(actor, metadata),
          action: 'TABELA_COMERCIAL_DELETED',
          entity: 'TabelaComercial',
          entityId: id,
          metadata: { codigo: before.codigo, nome: before.nome },
        },
      });
      await new TabelasComerciaisRepository(tx).delete(id);
    });
  }
  async items(
    actor: AuthContext,
    id: string,
    query: TabelaComercialItemListQuery,
  ) {
    this.allow(actor, 'tabelas_comerciais.read');
    if (!(await this.repository.find(id)))
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    const { items, total } = await this.repository.listItems(id, query);
    return {
      items: items.map(itemDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }
  async createItem(
    actor: AuthContext,
    tableId: string,
    input: CreateTabelaComercialItemRequest,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.create');
    if (!(await this.repository.find(tableId)))
      throw fail(
        'TABELA_COMERCIAL_NOT_FOUND',
        'Tabela comercial não encontrada',
        404,
      );
    try {
      return itemDto(
        await this.db.$transaction(async (tx) => {
          const row = await new TabelasComerciaisRepository(tx).createItem(
            tableId,
            input,
          );
          await tx.auditLog.create({
            data: {
              ...auditData(actor, metadata),
              action: 'ITEM_COMERCIAL_CREATED',
              entity: 'TabelaComercialItem',
              entityId: row.id,
              metadata: { tabelaComercialId: tableId },
            },
          });
          return row;
        }),
      );
    } catch (error) {
      if (unique(error))
        throw fail(
          'TABELA_COMERCIAL_CONFLICT',
          'Item comercial duplicado',
          409,
        );
      throw error;
    }
  }
  async updateItem(
    actor: AuthContext,
    tableId: string,
    itemId: string,
    input: UpdateTabelaComercialItemRequest,
    metadata: RequestMetadata,
  ) {
    this.allow(actor, 'tabelas_comerciais.update');
    const before = await this.repository.findItem(itemId);
    if (!before || before.tabelaComercialId !== tableId)
      throw fail(
        'ITEM_COMERCIAL_NOT_FOUND',
        'Item comercial não encontrado',
        404,
      );
    try {
      return itemDto(
        await this.db.$transaction(async (tx) => {
          const row = await new TabelasComerciaisRepository(tx).updateItem(
            itemId,
            input,
          );
          await tx.auditLog.create({
            data: {
              ...auditData(actor, metadata),
              action: 'ITEM_COMERCIAL_UPDATED',
              entity: 'TabelaComercialItem',
              entityId: itemId,
              metadata: {
                tabelaComercialId: tableId,
                changedFields: Object.keys(input),
              },
            },
          });
          return row;
        }),
      );
    } catch (error) {
      if (unique(error))
        throw fail(
          'TABELA_COMERCIAL_CONFLICT',
          'Item comercial duplicado',
          409,
        );
      throw error;
    }
  }
}
