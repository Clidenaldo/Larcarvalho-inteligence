import type {
  AdministradoraListQuery,
  CreateAdministradoraRequest,
  UpdateAdministradoraRequest,
} from '@larcarvalho/shared';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export const administradoraSelect = {
  ativa: true,
  cnpj: true,
  codigoExterno: true,
  createdAt: true,
  id: true,
  nome: true,
  nomeFantasia: true,
  site: true,
  updatedAt: true,
} as const;

export type AdministradoraRecord = Prisma.AdministradoraGetPayload<{
  select: typeof administradoraSelect;
}>;

type DatabaseClient = Prisma.TransactionClient | PrismaClient;

function updateData(
  input: UpdateAdministradoraRequest,
): Prisma.AdministradoraUpdateInput {
  const data: Prisma.AdministradoraUpdateInput = {};
  if (input.nome !== undefined) data.nome = input.nome;
  if ('nomeFantasia' in input) data.nomeFantasia = input.nomeFantasia ?? null;
  if ('cnpj' in input) data.cnpj = input.cnpj ?? null;
  if ('codigoExterno' in input)
    data.codigoExterno = input.codigoExterno ?? null;
  if ('site' in input) data.site = input.site ?? null;
  return data;
}

export class AdministradorasRepository {
  constructor(private readonly database: DatabaseClient) {}

  async list(
    query: AdministradoraListQuery,
  ): Promise<{ items: AdministradoraRecord[]; total: number }> {
    const normalizedDigits = query.search?.replace(/\D/g, '') ?? '';
    const where: Prisma.AdministradoraWhereInput = {
      ...(query.status === 'ativas' ? { ativa: true } : {}),
      ...(query.status === 'inativas' ? { ativa: false } : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' } },
              { nomeFantasia: { contains: query.search, mode: 'insensitive' } },
              {
                codigoExterno: { contains: query.search, mode: 'insensitive' },
              },
              ...(normalizedDigits
                ? [{ cnpj: { contains: normalizedDigits } }]
                : []),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.database.administradora.findMany({
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        select: administradoraSelect,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      this.database.administradora.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<AdministradoraRecord | null> {
    return this.database.administradora.findUnique({
      select: administradoraSelect,
      where: { id },
    });
  }

  create(input: CreateAdministradoraRequest): Promise<AdministradoraRecord> {
    return this.database.administradora.create({
      data: {
        cnpj: input.cnpj ?? null,
        codigoExterno: input.codigoExterno ?? null,
        nome: input.nome,
        nomeFantasia: input.nomeFantasia ?? null,
        site: input.site ?? null,
      },
      select: administradoraSelect,
    });
  }

  update(
    id: string,
    input: UpdateAdministradoraRequest,
  ): Promise<AdministradoraRecord> {
    return this.database.administradora.update({
      data: updateData(input),
      select: administradoraSelect,
      where: { id },
    });
  }

  setStatus(id: string, ativa: boolean): Promise<AdministradoraRecord> {
    return this.database.administradora.update({
      data: { ativa },
      select: administradoraSelect,
      where: { id },
    });
  }
}
