import type {
  CreateTabelaComercialItemRequest,
  CreateTabelaComercialRequest,
  TabelaComercialItemListQuery,
  TabelaComercialListQuery,
  UpdateTabelaComercialItemRequest,
  UpdateTabelaComercialRequest,
} from '@larcarvalho/shared';
import type {
  Prisma,
  PrismaClient,
  TabelaComercialStatus,
} from '../../generated/prisma/client.js';

export const tabelaComercialSelect = {
  id: true,
  administradoraId: true,
  produtoId: true,
  nome: true,
  codigo: true,
  categoria: true,
  inicioVigencia: true,
  fimVigencia: true,
  status: true,
  descricao: true,
  origem: true,
  indiceCorrecao: true,
  regraSeguro: true,
  regraContemplacao: true,
  lanceFacilitado: true,
  cartaoCredito: true,
  descricaoBem: true,
  fundoReservaPercentual: true,
  taxaAdministracaoPercentual: true,
  taxaTotalPercentual: true,
  seguroVidaPercentual: true,
  participantesGrupo: true,
  codigoPlanoNormal: true,
  codigoPlanoMaisPorMenos: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  administradora: { select: { id: true, nome: true } },
  produto: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} as const;

export const tabelaComercialItemSelect = {
  id: true,
  tabelaComercialId: true,
  codigoExterno: true,
  creditoReferencia: true,
  seguro: true,
  taxaAntecipadaValor: true,
  taxaAntecipadaPercentual: true,
  prazoMeses: true,
  modalidade: true,
  primeiraParcela: true,
  demaisParcelas: true,
  parcelaPadrao: true,
  fundoReservaPercentual: true,
  taxaAdministracaoPercentual: true,
  taxaTotalPercentual: true,
  seguroVidaPercentual: true,
  participantesGrupo: true,
  codigoPlano: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type TabelaComercialRecord = Prisma.TabelaComercialGetPayload<{
  select: typeof tabelaComercialSelect;
}>;
export type TabelaComercialItemRecord = Prisma.TabelaComercialItemGetPayload<{
  select: typeof tabelaComercialItemSelect;
}>;
type Db = PrismaClient | Prisma.TransactionClient;

function tableData(
  input: CreateTabelaComercialRequest,
): Prisma.TabelaComercialUncheckedCreateInput {
  return {
    ...input,
    produtoId: input.produtoId ?? null,
    fimVigencia: input.fimVigencia
      ? new Date(`${input.fimVigencia}T00:00:00.000Z`)
      : null,
    inicioVigencia: new Date(`${input.inicioVigencia}T00:00:00.000Z`),
    descricao: input.descricao ?? null,
    indiceCorrecao: input.indiceCorrecao ?? null,
    regraSeguro: input.regraSeguro ?? null,
    regraContemplacao: input.regraContemplacao ?? null,
    lanceFacilitado: input.lanceFacilitado ?? null,
    cartaoCredito: input.cartaoCredito ?? null,
    descricaoBem: input.descricaoBem ?? null,
    fundoReservaPercentual: input.fundoReservaPercentual ?? null,
    taxaAdministracaoPercentual: input.taxaAdministracaoPercentual ?? null,
    taxaTotalPercentual: input.taxaTotalPercentual ?? null,
    seguroVidaPercentual: input.seguroVidaPercentual ?? null,
    participantesGrupo: input.participantesGrupo ?? null,
    codigoPlanoNormal: input.codigoPlanoNormal ?? null,
    codigoPlanoMaisPorMenos: input.codigoPlanoMaisPorMenos ?? null,
    origem: 'MANUAL',
  };
}

function itemData(input: CreateTabelaComercialItemRequest) {
  return {
    codigoExterno: input.codigoExterno ?? null,
    creditoReferencia: input.creditoReferencia,
    seguro: input.seguro ?? null,
    taxaAntecipadaValor: input.taxaAntecipadaValor ?? null,
    taxaAntecipadaPercentual: input.taxaAntecipadaPercentual ?? null,
    prazoMeses: input.prazoMeses,
    modalidade: input.modalidade,
    primeiraParcela: input.primeiraParcela ?? null,
    demaisParcelas: input.demaisParcelas ?? null,
    parcelaPadrao: input.parcelaPadrao ?? null,
    fundoReservaPercentual: input.fundoReservaPercentual ?? null,
    taxaAdministracaoPercentual: input.taxaAdministracaoPercentual ?? null,
    taxaTotalPercentual: input.taxaTotalPercentual ?? null,
    seguroVidaPercentual: input.seguroVidaPercentual ?? null,
    participantesGrupo: input.participantesGrupo ?? null,
    codigoPlano: input.codigoPlano ?? null,
  };
}

export class TabelasComerciaisRepository {
  constructor(private readonly db: Db) {}

  find(id: string) {
    return this.db.tabelaComercial.findUnique({
      where: { id },
      select: tabelaComercialSelect,
    });
  }

  async list(query: TabelaComercialListQuery) {
    const vigencia = query.vigencia
      ? new Date(`${query.vigencia}T00:00:00.000Z`)
      : null;
    const and: Prisma.TabelaComercialWhereInput[] = [];
    if (vigencia)
      and.push({
        inicioVigencia: { lte: vigencia },
        OR: [{ fimVigencia: null }, { fimVigencia: { gte: vigencia } }],
      });
    if (query.search)
      and.push({
        OR: [
          { codigo: { contains: query.search, mode: 'insensitive' } },
          { nome: { contains: query.search, mode: 'insensitive' } },
          {
            administradora: {
              nome: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      });
    const where: Prisma.TabelaComercialWhereInput = {
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
      ...(query.categoria ? { categoria: query.categoria } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.arquivamento === 'ATIVAS'
        ? { deletedAt: null }
        : query.arquivamento === 'ARQUIVADAS'
          ? { deletedAt: { not: null } }
          : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.tabelaComercial.findMany({
        where,
        select: tabelaComercialSelect,
        orderBy: [{ inicioVigencia: 'desc' }, { codigo: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.tabelaComercial.count({ where }),
    ]);
    return { items, total };
  }

  create(input: CreateTabelaComercialRequest) {
    return this.db.tabelaComercial.create({
      data: tableData(input),
      select: tabelaComercialSelect,
    });
  }

  update(id: string, input: UpdateTabelaComercialRequest) {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Prisma.TabelaComercialUpdateInput;
    if ('produtoId' in input)
      data.produto = input.produtoId
        ? { connect: { id: input.produtoId } }
        : { disconnect: true };
    delete (data as Record<string, unknown>).produtoId;
    if ('fimVigencia' in input)
      data.fimVigencia = input.fimVigencia
        ? new Date(`${input.fimVigencia}T00:00:00.000Z`)
        : null;
    return this.db.tabelaComercial.update({
      where: { id },
      data,
      select: tabelaComercialSelect,
    });
  }

  status(id: string, status: TabelaComercialStatus) {
    return this.db.tabelaComercial.update({
      where: { id },
      data: { status },
      select: tabelaComercialSelect,
    });
  }

  archive(id: string) {
    return this.db.tabelaComercial.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: tabelaComercialSelect,
    });
  }

  restore(id: string) {
    return this.db.tabelaComercial.update({
      where: { id },
      data: { deletedAt: null },
      select: tabelaComercialSelect,
    });
  }

  async delete(id: string) {
    await this.db.tabelaComercialItem.deleteMany({
      where: { tabelaComercialId: id },
    });
    return this.db.tabelaComercial.delete({ where: { id } });
  }

  async listItems(
    tabelaComercialId: string,
    query: TabelaComercialItemListQuery,
  ) {
    const where = { tabelaComercialId };
    const [items, total] = await Promise.all([
      this.db.tabelaComercialItem.findMany({
        where,
        select: tabelaComercialItemSelect,
        orderBy: [
          { creditoReferencia: 'asc' },
          { prazoMeses: 'asc' },
          { modalidade: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.tabelaComercialItem.count({ where }),
    ]);
    return { items, total };
  }

  findItem(id: string) {
    return this.db.tabelaComercialItem.findUnique({
      where: { id },
      select: tabelaComercialItemSelect,
    });
  }

  createItem(
    tabelaComercialId: string,
    input: CreateTabelaComercialItemRequest,
  ) {
    return this.db.tabelaComercialItem.create({
      data: { tabelaComercialId, ...itemData(input) },
      select: tabelaComercialItemSelect,
    });
  }

  updateItem(id: string, input: UpdateTabelaComercialItemRequest) {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Prisma.TabelaComercialItemUpdateInput;
    return this.db.tabelaComercialItem.update({
      where: { id },
      data,
      select: tabelaComercialItemSelect,
    });
  }
}
