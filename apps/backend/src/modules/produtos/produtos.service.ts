import type {
  CreateProdutoRequest,
  Permission,
  Produto,
  ProdutoListQuery,
  UpdateProdutoRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  ProdutosRepository,
  type ProdutoRecord,
} from './produtos.repository.js';
const error = (
  code: 'PRODUTO_NOT_FOUND' | 'PRODUTO_CONFLICT' | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const dto = (x: ProdutoRecord): Produto => ({
  ...x,
  categoria: x.categoria as Produto['categoria'],
  createdAt: x.createdAt.toISOString(),
  updatedAt: x.updatedAt.toISOString(),
});
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
export class ProdutosService {
  private readonly repo;
  constructor(private readonly prisma: PrismaClient) {
    this.repo = new ProdutosRepository(prisma);
  }
  private allow(a: AuthContext, p: Permission) {
    if (!hasPermission(a, p))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private async validAdmin(repo: ProdutosRepository, id: string) {
    const admin = await repo.administradora(id);
    if (!admin)
      throw error(
        'RELATIONSHIP_CONFLICT',
        'Administradora não encontrada',
        409,
      );
    if (!admin.ativa)
      throw error(
        'RELATIONSHIP_CONFLICT',
        'Administradora inativa não aceita novos produtos',
        409,
      );
  }
  async list(a: AuthContext, q: ProdutoListQuery) {
    this.allow(a, 'produtos.read');
    const { items, total } = await this.repo.list(q);
    return {
      items: items.map(dto),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: total ? Math.ceil(total / q.pageSize) : 0,
    };
  }
  async get(a: AuthContext, id: string) {
    this.allow(a, 'produtos.read');
    const row = await this.repo.find(id);
    if (!row) throw error('PRODUTO_NOT_FOUND', 'Produto não encontrado', 404);
    return dto(row);
  }
  async create(
    a: AuthContext,
    input: CreateProdutoRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'produtos.create');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new ProdutosRepository(tx);
          await this.validAdmin(repo, input.administradoraId);
          const row = await repo.create(input);
          await tx.auditLog.create({
            data: {
              action: 'PRODUTO_CREATED',
              actorId: a.user.id,
              entity: 'Produto',
              entityId: row.id,
              metadata: {
                after: {
                  nome: row.nome,
                  administradoraId: row.administradoraId,
                },
              },
              ipAddress: m.ipAddress ?? null,
              userAgent: m.userAgent?.slice(0, 2048) ?? null,
            },
          });
          return row;
        }),
      );
    } catch (e) {
      if (unique(e))
        throw error(
          'PRODUTO_CONFLICT',
          'Produto duplicado para esta administradora',
          409,
        );
      throw e;
    }
  }
  async update(
    a: AuthContext,
    id: string,
    input: UpdateProdutoRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'produtos.update');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new ProdutosRepository(tx);
          const before = await repo.find(id);
          if (!before)
            throw error('PRODUTO_NOT_FOUND', 'Produto não encontrado', 404);
          if (input.administradoraId)
            await this.validAdmin(repo, input.administradoraId);
          const row = await repo.update(id, input);
          await tx.auditLog.create({
            data: {
              action: 'PRODUTO_UPDATED',
              actorId: a.user.id,
              entity: 'Produto',
              entityId: id,
              metadata: {
                before: { nome: before.nome },
                after: { nome: row.nome },
                changedFields: Object.keys(input),
              },
              ipAddress: m.ipAddress ?? null,
              userAgent: m.userAgent?.slice(0, 2048) ?? null,
            },
          });
          return row;
        }),
      );
    } catch (e) {
      if (unique(e))
        throw error(
          'PRODUTO_CONFLICT',
          'Produto duplicado para esta administradora',
          409,
        );
      throw e;
    }
  }
  async status(a: AuthContext, id: string, ativo: boolean, m: RequestMetadata) {
    this.allow(a, 'produtos.deactivate');
    return dto(
      await this.prisma.$transaction(async (tx) => {
        const repo = new ProdutosRepository(tx);
        if (!(await repo.find(id)))
          throw error('PRODUTO_NOT_FOUND', 'Produto não encontrado', 404);
        const row = await repo.status(id, ativo);
        await tx.auditLog.create({
          data: {
            action: ativo ? 'PRODUTO_ACTIVATED' : 'PRODUTO_DEACTIVATED',
            actorId: a.user.id,
            entity: 'Produto',
            entityId: id,
            metadata: { ativa: ativo },
            ipAddress: m.ipAddress ?? null,
            userAgent: m.userAgent?.slice(0, 2048) ?? null,
          },
        });
        return row;
      }),
    );
  }
}
