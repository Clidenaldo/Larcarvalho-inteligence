import type {
  CreateGrupoRequest,
  Grupo,
  GrupoListQuery,
  Permission,
  UpdateGrupoRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import { GruposRepository, type GrupoRecord } from './grupos.repository.js';
const fail = (
  code: 'GRUPO_NOT_FOUND' | 'GRUPO_CONFLICT' | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
const dto = (x: GrupoRecord): Grupo => ({
  ...x,
  status: x.status as Grupo['status'],
  produto: x.produto
    ? {
        ...x.produto,
        categoria: x.produto.categoria as NonNullable<
          Grupo['produto']
        >['categoria'],
      }
    : null,
  dataInicio: x.dataInicio?.toISOString().slice(0, 10) ?? null,
  dataEncerramento: x.dataEncerramento?.toISOString().slice(0, 10) ?? null,
  valorCreditoMinimo: x.valorCreditoMinimo?.toString() ?? null,
  valorCreditoMaximo: x.valorCreditoMaximo?.toString() ?? null,
  createdAt: x.createdAt.toISOString(),
  updatedAt: x.updatedAt.toISOString(),
});
export class GruposService {
  private readonly repo;
  constructor(private readonly prisma: PrismaClient) {
    this.repo = new GruposRepository(prisma);
  }
  private allow(a: AuthContext, p: Permission) {
    if (!hasPermission(a, p))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private async relation(
    repo: GruposRepository,
    input: {
      administradoraId?: string | undefined;
      produtoId?: string | undefined;
    },
  ) {
    if (input.administradoraId) {
      const a = await repo.administradora(input.administradoraId);
      if (!a)
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Administradora não encontrada',
          409,
        );
      if (!a.ativa)
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Administradora inativa não aceita novos grupos',
          409,
        );
    }
    if (input.produtoId) {
      const p = await repo.produto(input.produtoId);
      if (!p)
        throw fail('RELATIONSHIP_CONFLICT', 'Produto não encontrado', 409);
      if (
        input.administradoraId &&
        p.administradoraId !== input.administradoraId
      )
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Produto pertence a outra administradora',
          409,
        );
    }
  }
  async list(a: AuthContext, q: GrupoListQuery) {
    this.allow(a, 'grupos.read');
    const r = await this.repo.list(q);
    return {
      items: r.items.map(dto),
      page: q.page,
      pageSize: q.pageSize,
      total: r.total,
      totalPages: r.total ? Math.ceil(r.total / q.pageSize) : 0,
    };
  }
  async get(a: AuthContext, id: string) {
    this.allow(a, 'grupos.read');
    const r = await this.repo.find(id);
    if (!r) throw fail('GRUPO_NOT_FOUND', 'Grupo não encontrado', 404);
    return dto(r);
  }
  async create(a: AuthContext, input: CreateGrupoRequest, m: RequestMetadata) {
    this.allow(a, 'grupos.create');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new GruposRepository(tx);
          await this.relation(repo, input);
          const r = await repo.create(input);
          await tx.auditLog.create({
            data: {
              action: 'GRUPO_CREATED',
              actorId: a.user.id,
              entity: 'Grupo',
              entityId: r.id,
              metadata: {
                after: {
                  codigo: r.codigo,
                  administradoraId: r.administradoraId,
                },
              },
              ipAddress: m.ipAddress ?? null,
              userAgent: m.userAgent?.slice(0, 2048) ?? null,
            },
          });
          return r;
        }),
      );
    } catch (e) {
      if (unique(e))
        throw fail(
          'GRUPO_CONFLICT',
          'Código já existe nesta administradora',
          409,
        );
      throw e;
    }
  }
  async update(
    a: AuthContext,
    id: string,
    input: UpdateGrupoRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'grupos.update');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new GruposRepository(tx);
          const before = await repo.find(id);
          if (!before)
            throw fail('GRUPO_NOT_FOUND', 'Grupo não encontrado', 404);
          await this.relation(repo, {
            administradoraId: input.administradoraId ?? before.administradoraId,
            produtoId:
              'produtoId' in input
                ? input.produtoId
                : (before.produtoId ?? undefined),
          });
          const r = await repo.update(id, input);
          await tx.auditLog.create({
            data: {
              action: 'GRUPO_UPDATED',
              actorId: a.user.id,
              entity: 'Grupo',
              entityId: id,
              metadata: { changedFields: Object.keys(input) },
              ipAddress: m.ipAddress ?? null,
              userAgent: m.userAgent?.slice(0, 2048) ?? null,
            },
          });
          return r;
        }),
      );
    } catch (e) {
      if (unique(e))
        throw fail(
          'GRUPO_CONFLICT',
          'Código já existe nesta administradora',
          409,
        );
      throw e;
    }
  }
  async status(a: AuthContext, id: string, status: string, m: RequestMetadata) {
    this.allow(a, 'grupos.deactivate');
    return dto(
      await this.prisma.$transaction(async (tx) => {
        const repo = new GruposRepository(tx);
        if (!(await repo.find(id)))
          throw fail('GRUPO_NOT_FOUND', 'Grupo não encontrado', 404);
        const r = await repo.status(id, status);
        await tx.auditLog.create({
          data: {
            action:
              status === 'ATIVO' ? 'GRUPO_ACTIVATED' : 'GRUPO_DEACTIVATED',
            actorId: a.user.id,
            entity: 'Grupo',
            entityId: id,
            metadata: { status },
            ipAddress: m.ipAddress ?? null,
            userAgent: m.userAgent?.slice(0, 2048) ?? null,
          },
        });
        return r;
      }),
    );
  }
}
