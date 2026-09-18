import type {
  CreateGrupoRequest,
  GrupoListQuery,
  UpdateGrupoRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
export const grupoSelect = {
  id: true,
  administradoraId: true,
  produtoId: true,
  codigo: true,
  status: true,
  dataInicio: true,
  dataEncerramento: true,
  prazoMeses: true,
  quantidadeCotas: true,
  valorCreditoMinimo: true,
  valorCreditoMaximo: true,
  createdAt: true,
  updatedAt: true,
  administradora: { select: { id: true, nome: true } },
  produto: { select: { id: true, nome: true, categoria: true } },
} as const;
export type GrupoRecord = Prisma.GrupoGetPayload<{
  select: typeof grupoSelect;
}>;
type Db = Prisma.TransactionClient | PrismaClient;
export class GruposRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.grupo.findUnique({ where: { id }, select: grupoSelect });
  }
  async list(query: GrupoListQuery) {
    const where: Prisma.GrupoWhereInput = {
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
      ...(query.produtoId ? { produtoId: query.produtoId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { codigo: { contains: query.search, mode: 'insensitive' } },
              {
                administradora: {
                  nome: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                produto: {
                  nome: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.grupo.findMany({
        where,
        select: grupoSelect,
        orderBy: [{ codigo: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.grupo.count({ where }),
    ]);
    return { items, total };
  }
  create(input: CreateGrupoRequest): Promise<GrupoRecord> {
    return this.db.grupo.create({
      data: {
        administradoraId: input.administradoraId,
        codigo: input.codigo,
        status: input.status,
        produtoId: input.produtoId ?? null,
        dataInicio: input.dataInicio
          ? new Date(`${input.dataInicio}T00:00:00.000Z`)
          : null,
        dataEncerramento: input.dataEncerramento
          ? new Date(`${input.dataEncerramento}T00:00:00.000Z`)
          : null,
        valorCreditoMinimo: input.valorCreditoMinimo ?? null,
        valorCreditoMaximo: input.valorCreditoMaximo ?? null,
        prazoMeses: input.prazoMeses ?? null,
        quantidadeCotas: input.quantidadeCotas ?? null,
      },
      select: grupoSelect,
    });
  }
  update(id: string, input: UpdateGrupoRequest): Promise<GrupoRecord> {
    const data: Prisma.GrupoUpdateInput = {};
    if (input.administradoraId !== undefined)
      data.administradora = { connect: { id: input.administradoraId } };
    if ('produtoId' in input)
      data.produto = input.produtoId
        ? { connect: { id: input.produtoId } }
        : { disconnect: true };
    for (const key of [
      'codigo',
      'status',
      'prazoMeses',
      'quantidadeCotas',
      'valorCreditoMinimo',
      'valorCreditoMaximo',
    ] as const)
      if (key in input) Object.assign(data, { [key]: input[key] ?? null });
    if ('dataInicio' in input)
      data.dataInicio = input.dataInicio
        ? new Date(`${input.dataInicio}T00:00:00.000Z`)
        : null;
    if ('dataEncerramento' in input)
      data.dataEncerramento = input.dataEncerramento
        ? new Date(`${input.dataEncerramento}T00:00:00.000Z`)
        : null;
    return this.db.grupo.update({ where: { id }, data, select: grupoSelect });
  }
  status(id: string, status: string): Promise<GrupoRecord> {
    return this.db.grupo.update({
      where: { id },
      data: { status },
      select: grupoSelect,
    });
  }
  administradora(id: string) {
    return this.db.administradora.findUnique({
      where: { id },
      select: { id: true, ativa: true },
    });
  }
  produto(id: string) {
    return this.db.produto.findUnique({
      where: { id },
      select: { id: true, administradoraId: true, ativo: true },
    });
  }
}
