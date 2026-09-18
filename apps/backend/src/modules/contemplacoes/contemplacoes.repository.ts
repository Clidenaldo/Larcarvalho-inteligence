import type {
  ContemplacaoListQuery,
  CreateContemplacaoRequest,
  UpdateContemplacaoRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export const contemplacaoSelect = {
  id: true,
  assembleiaId: true,
  cotaId: true,
  tipo: true,
  codigoExterno: true,
  valorLance: true,
  percentualLance: true,
  createdAt: true,
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
export type ContemplacaoRecord = Prisma.ContemplacaoGetPayload<{
  select: typeof contemplacaoSelect;
}>;
type Db = Prisma.TransactionClient | PrismaClient;
export class ContemplacoesRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.contemplacao.findUnique({
      where: { id },
      select: contemplacaoSelect,
    });
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
  async list(q: ContemplacaoListQuery) {
    const where: Prisma.ContemplacaoWhereInput = {
      ...(q.assembleiaId ? { assembleiaId: q.assembleiaId } : {}),
      ...(q.tipo ? { tipo: q.tipo } : {}),
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
      this.db.contemplacao.findMany({
        where,
        select: contemplacaoSelect,
        orderBy: [{ assembleia: { dataAssembleia: 'desc' } }, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.contemplacao.count({ where }),
    ]);
    return { items, total };
  }
  create(i: CreateContemplacaoRequest): Promise<ContemplacaoRecord> {
    return this.db.contemplacao.create({
      data: {
        assembleiaId: i.assembleiaId,
        cotaId: i.cotaId ?? null,
        tipo: i.tipo,
        codigoExterno: i.codigoExterno ?? null,
        valorLance: i.valorLance ?? null,
        percentualLance: i.percentualLance ?? null,
      },
      select: contemplacaoSelect,
    });
  }
  update(
    id: string,
    i: UpdateContemplacaoRequest,
  ): Promise<ContemplacaoRecord> {
    const data: Prisma.ContemplacaoUpdateInput = {};
    if (i.assembleiaId !== undefined)
      data.assembleia = { connect: { id: i.assembleiaId } };
    if ('cotaId' in i)
      data.cota = i.cotaId
        ? { connect: { id: i.cotaId } }
        : { disconnect: true };
    for (const k of [
      'tipo',
      'codigoExterno',
      'valorLance',
      'percentualLance',
    ] as const)
      if (k in i) Object.assign(data, { [k]: i[k] ?? null });
    return this.db.contemplacao.update({
      where: { id },
      data,
      select: contemplacaoSelect,
    });
  }
}
