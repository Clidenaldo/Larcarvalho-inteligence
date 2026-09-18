import type {
  AssembleiaListQuery,
  CreateAssembleiaRequest,
  UpdateAssembleiaRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export const assembleiaSelect = {
  id: true,
  grupoId: true,
  numero: true,
  dataAssembleia: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  grupo: {
    select: {
      id: true,
      codigo: true,
      administradora: { select: { id: true, nome: true } },
      produto: { select: { id: true, nome: true } },
    },
  },
} as const;
export type AssembleiaRecord = Prisma.AssembleiaGetPayload<{
  select: typeof assembleiaSelect;
}>;
type Db = Prisma.TransactionClient | PrismaClient;
export class AssembleiasRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.assembleia.findUnique({
      where: { id },
      select: assembleiaSelect,
    });
  }
  grupo(id: string) {
    return this.db.grupo.findUnique({ where: { id }, select: { id: true } });
  }
  async list(q: AssembleiaListQuery) {
    const where: Prisma.AssembleiaWhereInput = {
      ...(q.grupoId ? { grupoId: q.grupoId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.administradoraId
        ? { grupo: { administradoraId: q.administradoraId } }
        : {}),
      ...(q.produtoId ? { grupo: { produtoId: q.produtoId } } : {}),
      ...(q.search
        ? {
            OR: [
              { numero: { contains: q.search, mode: 'insensitive' } },
              {
                grupo: { codigo: { contains: q.search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
      ...(q.dataInicio || q.dataFim
        ? {
            dataAssembleia: {
              ...(q.dataInicio
                ? { gte: new Date(`${q.dataInicio}T00:00:00.000Z`) }
                : {}),
              ...(q.dataFim
                ? { lte: new Date(`${q.dataFim}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.assembleia.findMany({
        where,
        select: assembleiaSelect,
        orderBy: [{ dataAssembleia: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.assembleia.count({ where }),
    ]);
    return { items, total };
  }
  create(i: CreateAssembleiaRequest): Promise<AssembleiaRecord> {
    return this.db.assembleia.create({
      data: {
        grupoId: i.grupoId,
        numero: i.numero ?? null,
        dataAssembleia: new Date(i.dataAssembleia),
        status: i.status,
      },
      select: assembleiaSelect,
    });
  }
  update(id: string, i: UpdateAssembleiaRequest): Promise<AssembleiaRecord> {
    const data: Prisma.AssembleiaUpdateInput = {};
    if (i.grupoId !== undefined) data.grupo = { connect: { id: i.grupoId } };
    if ('numero' in i) data.numero = i.numero ?? null;
    if (i.dataAssembleia !== undefined)
      data.dataAssembleia = new Date(i.dataAssembleia);
    if (i.status !== undefined) data.status = i.status;
    return this.db.assembleia.update({
      where: { id },
      data,
      select: assembleiaSelect,
    });
  }
  status(id: string, status: string): Promise<AssembleiaRecord> {
    return this.db.assembleia.update({
      where: { id },
      data: { status },
      select: assembleiaSelect,
    });
  }
}
