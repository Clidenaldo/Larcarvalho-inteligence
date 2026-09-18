import type {
  CotaListQuery,
  CreateCotaRequest,
  UpdateCotaRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export const cotaSelect = {
  id: true,
  grupoId: true,
  numero: true,
  status: true,
  valorCredito: true,
  prazoRestante: true,
  parcelaAtual: true,
  codigoExterno: true,
  createdAt: true,
  updatedAt: true,
  grupo: {
    select: {
      id: true,
      codigo: true,
      status: true,
      administradora: { select: { id: true, nome: true } },
      produto: { select: { id: true, nome: true, categoria: true } },
    },
  },
} as const;
export type CotaRecord = Prisma.CotaGetPayload<{ select: typeof cotaSelect }>;
type Db = Prisma.TransactionClient | PrismaClient;
export class CotasRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.cota.findUnique({ where: { id }, select: cotaSelect });
  }
  async list(query: CotaListQuery) {
    const where: Prisma.CotaWhereInput = {
      ...(query.grupoId ? { grupoId: query.grupoId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.administradoraId
        ? { grupo: { administradoraId: query.administradoraId } }
        : {}),
      ...(query.produtoId ? { grupo: { produtoId: query.produtoId } } : {}),
      ...(query.search
        ? {
            OR: [
              { numero: { contains: query.search, mode: 'insensitive' } },
              {
                codigoExterno: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.cota.findMany({
        where,
        select: cotaSelect,
        orderBy: [{ numero: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.cota.count({ where }),
    ]);
    return { items, total };
  }
  create(input: CreateCotaRequest): Promise<CotaRecord> {
    return this.db.cota.create({
      data: {
        grupoId: input.grupoId,
        numero: input.numero,
        status: input.status,
        valorCredito: input.valorCredito ?? null,
        parcelaAtual: input.parcelaAtual ?? null,
        codigoExterno: input.codigoExterno ?? null,
        prazoRestante: input.prazoRestante ?? null,
      },
      select: cotaSelect,
    });
  }
  update(id: string, input: UpdateCotaRequest): Promise<CotaRecord> {
    const data: Prisma.CotaUpdateInput = {};
    if (input.grupoId !== undefined)
      data.grupo = { connect: { id: input.grupoId } };
    for (const key of [
      'numero',
      'status',
      'prazoRestante',
      'valorCredito',
      'parcelaAtual',
      'codigoExterno',
    ] as const)
      if (key in input) Object.assign(data, { [key]: input[key] ?? null });
    return this.db.cota.update({ where: { id }, data, select: cotaSelect });
  }
  status(id: string, status: string): Promise<CotaRecord> {
    return this.db.cota.update({
      where: { id },
      data: { status },
      select: cotaSelect,
    });
  }
  grupo(id: string) {
    return this.db.grupo.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        prazoMeses: true,
        administradora: { select: { ativa: true } },
      },
    });
  }
}
