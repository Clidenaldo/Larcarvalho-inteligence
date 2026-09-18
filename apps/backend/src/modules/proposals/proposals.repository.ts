import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export const proposalInclude = {
  createdBy: { select: { nome: true } },
  lead: { select: { nome: true, responsavelId: true } },
  simulation: { select: { category: true } },
  items: { orderBy: { position: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ProposalInclude;

export type ProposalRecord = Prisma.ProposalGetPayload<{
  include: typeof proposalInclude;
}>;

export class ProposalsRepository {
  constructor(readonly db: PrismaClient) {}

  findById(id: string, scope: Prisma.ProposalWhereInput = {}) {
    return this.db.proposal.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: proposalInclude,
    });
  }

  list(where: Prisma.ProposalWhereInput, page: number, pageSize: number) {
    return Promise.all([
      this.db.proposal.findMany({
        where,
        include: proposalInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.proposal.count({ where }),
    ]);
  }
}
