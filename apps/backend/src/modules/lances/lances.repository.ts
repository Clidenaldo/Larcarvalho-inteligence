import type {
  CreateLanceRequest,
  LanceListQuery,
  UpdateLanceRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export const lanceSelect = {
  id: true,
  assembleiaId: true,
  cotaId: true,
  tipo: true,
  percentual: true,
  valor: true,
  contemplado: true,
  origem: true,
  createdAt: true,
  updatedAt: true,
  assembleia: {
    select: {
      id: true,
      numero: true,
      dataAssembleia: true,
      grupo: {
        select: {
          id: true,
          codigo: true,
          administradora: { select: { id: true, nome: true } },
          produto: { select: { id: true, nome: true } },
        },
      },
    },
  },
  cota: { select: { id: true, numero: true } },
} as const;
export type LanceRecord = Prisma.LanceGetPayload<{
  select: typeof lanceSelect;
}>;
type Db = Prisma.TransactionClient | PrismaClient;
export class LancesRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.lance.findUnique({ where: { id }, select: lanceSelect });
  }
  assembleia(id: string) {
    return this.db.assembleia.findUnique({
      where: { id },
      select: { id: true, grupoId: true },
    });
  }
  cota(id: string) {
    return this.db.cota.findUnique({
      where: { id },
      select: { id: true, grupoId: true },
    });
  }
  async list(q: LanceListQuery) {
    const where: Prisma.LanceWhereInput = {
      ...(q.assembleiaId ? { assembleiaId: q.assembleiaId } : {}),
      ...(q.tipo ? { tipo: q.tipo } : {}),
      ...(q.contemplado !== undefined ? { contemplado: q.contemplado } : {}),
      ...(q.grupoId ? { assembleia: { grupoId: q.grupoId } } : {}),
      ...(q.administradoraId
        ? { assembleia: { grupo: { administradoraId: q.administradoraId } } }
        : {}),
      ...(q.dataInicio || q.dataFim
        ? {
            assembleia: {
              dataAssembleia: {
                ...(q.dataInicio
                  ? { gte: new Date(`${q.dataInicio}T00:00:00.000Z`) }
                  : {}),
                ...(q.dataFim
                  ? { lte: new Date(`${q.dataFim}T23:59:59.999Z`) }
                  : {}),
              },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.lance.findMany({
        where,
        select: lanceSelect,
        orderBy: [{ assembleia: { dataAssembleia: 'desc' } }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.lance.count({ where }),
    ]);
    return { items, total };
  }
  create(i: CreateLanceRequest): Promise<LanceRecord> {
    return this.db.lance.create({
      data: {
        assembleiaId: i.assembleiaId,
        cotaId: i.cotaId ?? null,
        tipo: i.tipo,
        percentual: i.percentual ?? null,
        valor: i.valor ?? null,
        contemplado: i.contemplado ?? null,
        origem: i.origem,
      },
      select: lanceSelect,
    });
  }
  update(id: string, i: UpdateLanceRequest): Promise<LanceRecord> {
    const data: Prisma.LanceUpdateInput = {};
    if (i.assembleiaId !== undefined)
      data.assembleia = { connect: { id: i.assembleiaId } };
    if ('cotaId' in i)
      data.cota = i.cotaId
        ? { connect: { id: i.cotaId } }
        : { disconnect: true };
    for (const k of [
      'tipo',
      'percentual',
      'valor',
      'contemplado',
      'origem',
    ] as const)
      if (k in i) Object.assign(data, { [k]: i[k] ?? null });
    return this.db.lance.update({ where: { id }, data, select: lanceSelect });
  }
}
