import type {
  Assembleia,
  AssembleiaListQuery,
  CreateAssembleiaRequest,
  Permission,
  UpdateAssembleiaRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  AssembleiasRepository,
  type AssembleiaRecord,
} from './assembleias.repository.js';
const fail = (
  code:
    'ASSEMBLEIA_NOT_FOUND' | 'ASSEMBLEIA_CONFLICT' | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
const dto = (r: AssembleiaRecord): Assembleia => ({
  ...r,
  status: r.status as Assembleia['status'],
  dataAssembleia: r.dataAssembleia.toISOString(),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
export class AssembleiasService {
  private readonly repo;
  constructor(private readonly db: PrismaClient) {
    this.repo = new AssembleiasRepository(db);
  }
  private allow(a: AuthContext, p: Permission) {
    if (!hasPermission(a, p))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }
  private async group(repo: AssembleiasRepository, id: string) {
    if (!(await repo.grupo(id)))
      throw fail('RELATIONSHIP_CONFLICT', 'Grupo não encontrado', 409);
  }
  async list(a: AuthContext, q: AssembleiaListQuery) {
    this.allow(a, 'assembleias.read');
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
    this.allow(a, 'assembleias.read');
    const r = await this.repo.find(id);
    if (!r)
      throw fail('ASSEMBLEIA_NOT_FOUND', 'Assembleia não encontrada', 404);
    return dto(r);
  }
  async create(a: AuthContext, i: CreateAssembleiaRequest, m: RequestMetadata) {
    this.allow(a, 'assembleias.create');
    try {
      return dto(
        await this.db.$transaction(async (tx) => {
          const repo = new AssembleiasRepository(tx);
          await this.group(repo, i.grupoId);
          const r = await repo.create(i);
          await tx.auditLog.create({
            data: {
              action: 'ASSEMBLEIA_CREATED',
              actorId: a.user.id,
              entity: 'Assembleia',
              entityId: r.id,
              metadata: {
                after: {
                  grupoId: r.grupoId,
                  numero: r.numero,
                  dataAssembleia: r.dataAssembleia.toISOString(),
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
          'ASSEMBLEIA_CONFLICT',
          'Número de assembleia já existe neste grupo',
          409,
        );
      throw e;
    }
  }
  async update(
    a: AuthContext,
    id: string,
    i: UpdateAssembleiaRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'assembleias.update');
    try {
      return dto(
        await this.db.$transaction(async (tx) => {
          const repo = new AssembleiasRepository(tx);
          const before = await repo.find(id);
          if (!before)
            throw fail(
              'ASSEMBLEIA_NOT_FOUND',
              'Assembleia não encontrada',
              404,
            );
          if (i.grupoId) await this.group(repo, i.grupoId);
          const r = await repo.update(id, i);
          await tx.auditLog.create({
            data: {
              action: 'ASSEMBLEIA_UPDATED',
              actorId: a.user.id,
              entity: 'Assembleia',
              entityId: id,
              metadata: { changedFields: Object.keys(i) },
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
          'ASSEMBLEIA_CONFLICT',
          'Número de assembleia já existe neste grupo',
          409,
        );
      throw e;
    }
  }
  async status(a: AuthContext, id: string, status: string, m: RequestMetadata) {
    this.allow(a, 'assembleias.update');
    return dto(
      await this.db.$transaction(async (tx) => {
        const repo = new AssembleiasRepository(tx);
        const before = await repo.find(id);
        if (!before)
          throw fail('ASSEMBLEIA_NOT_FOUND', 'Assembleia não encontrada', 404);
        const r = await repo.status(id, status);
        await tx.auditLog.create({
          data: {
            action: 'ASSEMBLEIA_STATUS_CHANGED',
            actorId: a.user.id,
            entity: 'Assembleia',
            entityId: id,
            metadata: { before: { status: before.status }, after: { status } },
            ipAddress: m.ipAddress ?? null,
            userAgent: m.userAgent?.slice(0, 2048) ?? null,
          },
        });
        return r;
      }),
    );
  }
}
