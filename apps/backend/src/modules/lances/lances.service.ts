import type {
  CreateLanceRequest,
  Lance,
  LanceListQuery,
  Permission,
  UpdateLanceRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import { LancesRepository, type LanceRecord } from './lances.repository.js';
const fail = (
  code: 'LANCE_NOT_FOUND' | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const dto = (r: LanceRecord): Lance => ({
  ...r,
  tipo: r.tipo as Lance['tipo'],
  origem: r.origem as Lance['origem'],
  percentual: r.percentual?.toString() ?? null,
  valor: r.valor?.toString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  assembleia: {
    ...r.assembleia,
    dataAssembleia: r.assembleia.dataAssembleia.toISOString(),
  },
});
export class LancesService {
  private readonly repo;
  constructor(private readonly db: PrismaClient) {
    this.repo = new LancesRepository(db);
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
    repo: LancesRepository,
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
  async list(a: AuthContext, q: LanceListQuery) {
    this.allow(a, 'lances.read');
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
    this.allow(a, 'lances.read');
    const r = await this.repo.find(id);
    if (!r) throw fail('LANCE_NOT_FOUND', 'Lance não encontrado', 404);
    return dto(r);
  }
  async create(a: AuthContext, i: CreateLanceRequest, m: RequestMetadata) {
    this.allow(a, 'lances.create');
    return dto(
      await this.db.$transaction(async (tx) => {
        const repo = new LancesRepository(tx);
        await this.relation(repo, i.assembleiaId, i.cotaId);
        const r = await repo.create(i);
        await tx.auditLog.create({
          data: {
            action: 'LANCE_CREATED',
            actorId: a.user.id,
            entity: 'Lance',
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
  }
  async update(
    a: AuthContext,
    id: string,
    i: UpdateLanceRequest,
    m: RequestMetadata,
  ) {
    this.allow(a, 'lances.update');
    return dto(
      await this.db.$transaction(async (tx) => {
        const repo = new LancesRepository(tx);
        const before = await repo.find(id);
        if (!before) throw fail('LANCE_NOT_FOUND', 'Lance não encontrado', 404);
        await this.relation(
          repo,
          i.assembleiaId ?? before.assembleiaId,
          'cotaId' in i ? i.cotaId : (before.cotaId ?? undefined),
        );
        const r = await repo.update(id, i);
        await tx.auditLog.create({
          data: {
            action: 'LANCE_UPDATED',
            actorId: a.user.id,
            entity: 'Lance',
            entityId: id,
            metadata: { changedFields: Object.keys(i) },
            ipAddress: m.ipAddress ?? null,
            userAgent: m.userAgent?.slice(0, 2048) ?? null,
          },
        });
        return r;
      }),
    );
  }
}
