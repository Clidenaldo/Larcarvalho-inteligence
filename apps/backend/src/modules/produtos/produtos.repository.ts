import type {
  CreateProdutoRequest,
  ProdutoListQuery,
  UpdateProdutoRequest,
} from '@larcarvalho/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export const produtoSelect = {
  id: true,
  administradoraId: true,
  nome: true,
  categoria: true,
  descricao: true,
  ativo: true,
  codigoExterno: true,
  createdAt: true,
  updatedAt: true,
  administradora: { select: { id: true, nome: true } },
} as const;
export type ProdutoRecord = Prisma.ProdutoGetPayload<{
  select: typeof produtoSelect;
}>;
type Db = Prisma.TransactionClient | PrismaClient;
export class ProdutosRepository {
  constructor(private readonly db: Db) {}
  find(id: string) {
    return this.db.produto.findUnique({ where: { id }, select: produtoSelect });
  }
  async list(query: ProdutoListQuery) {
    const where: Prisma.ProdutoWhereInput = {
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
      ...(query.categoria ? { categoria: query.categoria } : {}),
      ...(query.status === 'ativos'
        ? { ativo: true }
        : query.status === 'inativos'
          ? { ativo: false }
          : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' } },
              {
                codigoExterno: { contains: query.search, mode: 'insensitive' },
              },
              {
                administradora: {
                  nome: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.produto.findMany({
        where,
        select: produtoSelect,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.produto.count({ where }),
    ]);
    return { items, total };
  }
  create(input: CreateProdutoRequest): Promise<ProdutoRecord> {
    return this.db.produto.create({
      data: {
        ...input,
        descricao: input.descricao ?? null,
        codigoExterno: input.codigoExterno ?? null,
      },
      select: produtoSelect,
    });
  }
  update(id: string, input: UpdateProdutoRequest): Promise<ProdutoRecord> {
    const data: Prisma.ProdutoUpdateInput = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.categoria !== undefined) data.categoria = input.categoria;
    if ('descricao' in input) data.descricao = input.descricao ?? null;
    if ('codigoExterno' in input)
      data.codigoExterno = input.codigoExterno ?? null;
    if (input.administradoraId !== undefined)
      data.administradora = { connect: { id: input.administradoraId } };
    return this.db.produto.update({
      where: { id },
      data,
      select: produtoSelect,
    });
  }
  status(id: string, ativo: boolean): Promise<ProdutoRecord> {
    return this.db.produto.update({
      where: { id },
      data: { ativo },
      select: produtoSelect,
    });
  }
  administradora(id: string) {
    return this.db.administradora.findUnique({
      where: { id },
      select: { id: true, ativa: true },
    });
  }
}
