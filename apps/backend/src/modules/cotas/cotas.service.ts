import type {
  Cota,
  CotaListQuery,
  CreateCotaRequest,
  Permission,
  UpdateCotaRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import { CotasRepository, type CotaRecord } from './cotas.repository.js';
const fail = (
  code: 'COTA_NOT_FOUND' | 'COTA_CONFLICT' | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
const dto = (x: CotaRecord): Cota => ({
  ...x,
  status: x.status as Cota['status'],
  grupo: {
    ...x.grupo,
    status: x.grupo.status as Cota['grupo']['status'],
    produto: x.grupo.produto
      ? {
          ...x.grupo.produto,
          categoria: x.grupo.produto.categoria as NonNullable<
            Cota['grupo']['produto']
          >['categoria'],
        }
      : null,
  },
  valorCredito: x.valorCredito?.toString() ?? null,
  parcelaAtual: x.parcelaAtual?.toString() ?? null,
  createdAt: x.createdAt.toISOString(),
  updatedAt: x.updatedAt.toISOString(),
});
export class CotasService {
  private readonly repo;
  constructor(private readonly prisma: PrismaClient) {
    this.repo = new CotasRepository(prisma);
  }
  private allow(a: AuthContext, p: Permission) {
    if (!hasPermission(a, p))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private async validGroup(repo: CotasRepository, id: string, prazo?: number) {
    const g = await repo.grupo(id);
    if (!g) throw fail('RELATIONSHIP_CONFLICT', 'Grupo não encontrado', 409);
    if (g.administradora.ativa === false)
      throw fail(
        'RELATIONSHIP_CONFLICT',
        'Administradora inativa não aceita novas cotas',
        409,
      );
    if (prazo !== undefined && g.prazoMeses !== null && prazo > g.prazoMeses)
      throw fail(
        'RELATIONSHIP_CONFLICT',
        'Prazo restante excede o prazo do grupo',
        409,
      );
  }
  async list(a: AuthContext, q: CotaListQuery) {
    this.allow(a, 'cotas.read');
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
    this.allow(a, 'cotas.read');
    const r = await this.repo.find(id);
    if (!r) throw fail('COTA_NOT_FOUND', 'Cota não encontrada', 404);
    return dto(r);
  }
  async create(a: AuthContext, input: CreateCotaRequest, m: RequestMetadata) {
    this.allow(a, 'cotas.create');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new CotasRepository(tx);
          await this.validGroup(repo, input.grupoId, input.prazoRestante);
          const r = await repo.create(input);
          await tx.auditLog.create({
            data: {
              action: 'COTA_CREATED',
              actorId: a.user.id,
              entity: 'Cota',
              entityId: r.id,
              metadata: { after: { numero: r.numero, grupoId: r.grupoId } },
              ipAddress: m.ipAddress ?? null,
              userAgent: m.userAgent?.slice(0, 2048) ?? null,
            },
          });
          return r;
        }),
      );
    } catch (e) {
      if (unique(e))
        throw fail('COTA_CONFLICT', 'Número já existe neste grupo', 409);
      throw e;
    }
  }
  async update(
    a: AuthContext,
    id: string,
    input: UpdateCotaRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'cotas.update');
    try {
      return dto(
        await this.prisma.$transaction(async (tx) => {
          const repo = new CotasRepository(tx);
          const before = await repo.find(id);
          if (!before) throw fail('COTA_NOT_FOUND', 'Cota não encontrada', 404);
          await this.validGroup(
            repo,
            input.grupoId ?? before.grupoId,
            input.prazoRestante,
          );
          const r = await repo.update(id, input);
          await tx.auditLog.create({
            data: {
              action: 'COTA_UPDATED',
              actorId: a.user.id,
              entity: 'Cota',
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
        throw fail('COTA_CONFLICT', 'Número já existe neste grupo', 409);
      throw e;
    }
  }
  async status(a: AuthContext, id: string, status: string, m: RequestMetadata) {
    this.allow(a, 'cotas.deactivate');
    return dto(
      await this.prisma.$transaction(async (tx) => {
        const repo = new CotasRepository(tx);
        if (!(await repo.find(id)))
          throw fail('COTA_NOT_FOUND', 'Cota não encontrada', 404);
        const r = await repo.status(id, status);
        await tx.auditLog.create({
          data: {
            action: status === 'ATIVO' ? 'COTA_ACTIVATED' : 'COTA_DEACTIVATED',
            actorId: a.user.id,
            entity: 'Cota',
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
