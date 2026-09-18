import type {
  Contemplacao,
  ContemplacaoListQuery,
  CreateContemplacaoRequest,
  Permission,
  UpdateContemplacaoRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  ContemplacoesRepository,
  type ContemplacaoRecord,
} from './contemplacoes.repository.js';
const fail = (
  code:
    | 'CONTEMPLACAO_NOT_FOUND'
    | 'CONTEMPLACAO_CONFLICT'
    | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const unique = (e: unknown) =>
  typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002';
const dto = (r: ContemplacaoRecord): Contemplacao => ({
  ...r,
  tipo: r.tipo as Contemplacao['tipo'],
  valorLance: r.valorLance?.toString() ?? null,
  percentualLance: r.percentualLance?.toString() ?? null,
  createdAt: r.createdAt.toISOString(),
  assembleia: {
    ...r.assembleia,
    dataAssembleia: r.assembleia.dataAssembleia.toISOString(),
  },
});
export class ContemplacoesService {
  private readonly repo;
  constructor(private readonly db: PrismaClient) {
    this.repo = new ContemplacoesRepository(db);
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
    repo: ContemplacoesRepository,
    assembleiaId: string,
    cotaId?: string,
  ) {
    const ass = await repo.assembleia(assembleiaId);
    if (!ass)
      throw fail('RELATIONSHIP_CONFLICT', 'Assembleia não encontrada', 409);
    if (cotaId) {
      const c = await repo.cota(cotaId);
      if (!c) throw fail('RELATIONSHIP_CONFLICT', 'Cota não encontrada', 409);
      if (c.grupoId !== ass.grupoId)
        throw fail('RELATIONSHIP_CONFLICT', 'Cota pertence a outro grupo', 409);
    }
  }
  async list(a: AuthContext, q: ContemplacaoListQuery) {
    this.allow(a, 'contemplacoes.read');
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
    this.allow(a, 'contemplacoes.read');
    const r = await this.repo.find(id);
    if (!r)
      throw fail('CONTEMPLACAO_NOT_FOUND', 'Contemplação não encontrada', 404);
    return dto(r);
  }
  async create(
    a: AuthContext,
    i: CreateContemplacaoRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'contemplacoes.create');
    try {
      return dto(
        await this.db.$transaction(async (tx) => {
          const repo = new ContemplacoesRepository(tx);
          await this.relation(repo, i.assembleiaId, i.cotaId);
          const r = await repo.create(i);
          await tx.auditLog.create({
            data: {
              action: 'CONTEMPLACAO_CREATED',
              actorId: a.user.id,
              entity: 'Contemplacao',
              entityId: r.id,
              metadata: {
                after: {
                  assembleiaId: r.assembleiaId,
                  cotaId: r.cotaId,
                  tipo: r.tipo,
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
          'CONTEMPLACAO_CONFLICT',
          'Código externo já existe nesta assembleia',
          409,
        );
      throw e;
    }
  }
  async update(
    a: AuthContext,
    id: string,
    i: UpdateContemplacaoRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'contemplacoes.update');
    try {
      return dto(
        await this.db.$transaction(async (tx) => {
          const repo = new ContemplacoesRepository(tx);
          const before = await repo.find(id);
          if (!before)
            throw fail(
              'CONTEMPLACAO_NOT_FOUND',
              'Contemplação não encontrada',
              404,
            );
          await this.relation(
            repo,
            i.assembleiaId ?? before.assembleiaId,
            'cotaId' in i ? i.cotaId : (before.cotaId ?? undefined),
          );
          const r = await repo.update(id, i);
          await tx.auditLog.create({
            data: {
              action: 'CONTEMPLACAO_UPDATED',
              actorId: a.user.id,
              entity: 'Contemplacao',
              entityId: id,
              metadata: {
                before: { tipo: before.tipo, cotaId: before.cotaId },
                after: { tipo: r.tipo, cotaId: r.cotaId },
                changedFields: Object.keys(i),
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
          'CONTEMPLACAO_CONFLICT',
          'Código externo já existe nesta assembleia',
          409,
        );
      throw e;
    }
  }
}
