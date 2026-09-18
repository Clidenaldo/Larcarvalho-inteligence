import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export const simulationInclude = {
  createdBy: { select: { nome: true } },
  lead: { select: { nome: true, responsavelId: true } },
  favorites: { select: { userId: true } },
  scenarios: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      snapshots: {
        orderBy: { calculatedAt: 'desc' as const },
        take: 1,
      },
      results: {
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.SimulationInclude;

export type SimulationRecord = Prisma.SimulationGetPayload<{
  include: typeof simulationInclude;
}>;

export class SimulationsRepository {
  constructor(readonly db: PrismaClient) {}

  findById(id: string, scope: Prisma.SimulationWhereInput = {}) {
    return this.db.simulation.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: simulationInclude,
    });
  }

  list(where: Prisma.SimulationWhereInput, page: number, pageSize: number) {
    return Promise.all([
      this.db.simulation.findMany({
        where,
        include: simulationInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.simulation.count({ where }),
    ]);
  }

  activeConfiguration() {
    return this.db.commercialConfiguration.findFirst({
      where: { active: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  activeCommercialTables(input: {
    category: string;
    administratorIds: string[];
    productIds: string[];
  }) {
    const now = new Date();

    return this.db.tabelaComercial.findMany({
      where: {
        categoria: input.category,
        status: 'ATIVA',
        deletedAt: null,
        inicioVigencia: { lte: now },
        administradora: {
          ativa: true,
        },
        AND: [
          {
            OR: [
              { fimVigencia: null },
              { fimVigencia: { gte: now } },
            ],
          },
          ...(input.administratorIds.length
            ? [
                {
                  administradoraId: {
                    in: input.administratorIds,
                  },
                },
              ]
            : []),
          ...(input.productIds.length
            ? [
                {
                  OR: [
                    {
                      produtoId: {
                        in: input.productIds,
                      },
                    },
                    {
                      produtoId: null,
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      include: {
        administradora: {
          select: {
            id: true,
            nome: true,
            ativa: true,
            updatedAt: true,
          },
        },
        produto: {
          select: {
            id: true,
            nome: true,
            ativo: true,
            categoria: true,
            updatedAt: true,
          },
        },
        itens: {
          orderBy: [
            { creditoReferencia: 'asc' },
            { prazoMeses: 'asc' },
            { id: 'asc' },
          ],
        },
      },
      orderBy: [
        {
          administradora: {
            nome: 'asc',
          },
        },
        {
          inicioVigencia: 'desc',
        },
        {
          codigo: 'asc',
        },
      ],
    });
  }
  activeRules(input: {
    category: string;
    administratorIds: string[];
    productIds: string[];
  }) {
    const now = new Date();
    return this.db.productCommercialRule.findMany({
      where: {
        category: input.category,
        active: true,
        deletedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
        ...(input.administratorIds.length
          ? { administradoraId: { in: input.administratorIds } }
          : {}),
        ...(input.productIds.length
          ? { produtoId: { in: input.productIds } }
          : {}),
      },
      include: {
        administradora: {
          select: { nome: true, ativa: true, updatedAt: true },
        },
        produto: { select: { nome: true, ativo: true, updatedAt: true } },
      },
      orderBy: [{ administradora: { nome: 'asc' } }, { version: 'desc' }],
    });
  }
}
