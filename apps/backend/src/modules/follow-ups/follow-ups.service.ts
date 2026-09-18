import type {
  CreateFollowUpRequest,
  FollowUpListQuery,
  SetFollowUpStatusRequest,
  UpdateFollowUpRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { leadScope, requireAccess } from '../../core/auth/data-scope.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { fortalezaDayBounds } from '../leads/lead-rules.js';

const includeFollowUp = {
  assignedUser: { select: { id: true, nome: true } },
  createdBy: { select: { id: true, nome: true } },
  lead: { select: { id: true, nome: true } },
} satisfies Prisma.FollowUpInclude;
type FollowUpRow = Prisma.FollowUpGetPayload<{ include: typeof includeFollowUp }>;

export function isFollowUpOverdue(
  followUp: { dueAt: Date; status: string },
  now = new Date(),
): boolean {
  return followUp.status === 'PENDING' && followUp.dueAt < now;
}

function mapFollowUp(row: FollowUpRow, now = new Date()) {
  return {
    assignedUser: row.assignedUser,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    dueAt: row.dueAt.toISOString(),
    id: row.id,
    isOverdue: isFollowUpOverdue(row, now),
    lead: row.lead,
    leadId: row.leadId,
    notes: row.notes,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const fail = (code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR', message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });

export class FollowUpsService {
  constructor(private readonly db: PrismaClient) {}

  private scoped(context: AuthContext): Prisma.FollowUpWhereInput {
    return { lead: leadScope(context) };
  }

  private async mutable(context: AuthContext, id: string) {
    const followUp = await this.db.followUp.findFirst({
      where: { id, lead: leadScope(context, 'update') },
      include: includeFollowUp,
    });
    if (!followUp) throw fail('NOT_FOUND', 'Follow-up não encontrado', 404);
    return followUp;
  }

  async list(context: AuthContext, query: FollowUpListQuery) {
    const now = new Date();
    const today = fortalezaDayBounds(now);
    const where: Prisma.FollowUpWhereInput = {
      AND: [
        this.scoped(context),
        ...(query.leadId ? [{ leadId: query.leadId }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.assignedToMe !== undefined
          ? query.assignedToMe
            ? [{ assignedUserId: context.user.id }]
            : [{ NOT: { assignedUserId: context.user.id } }]
          : []),
        ...(query.scope === 'today'
          ? [{ status: 'PENDING' as const, dueAt: { gte: today.start, lt: today.end } }]
          : []),
        ...(query.scope === 'overdue'
          ? [{ status: 'PENDING' as const, dueAt: { lt: now } }]
          : []),
        ...(query.scope === 'upcoming'
          ? [{ status: 'PENDING' as const, dueAt: { gte: today.end } }]
          : []),
      ],
    };
    const [rows, total] = await this.db.$transaction([
      this.db.followUp.findMany({
        where,
        include: includeFollowUp,
        orderBy:
          query.sort === 'createdAt'
            ? [{ createdAt: 'desc' }, { id: 'asc' }]
            : [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.followUp.count({ where }),
    ]);
    return {
      items: rows.map((row) => mapFollowUp(row, now)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async get(context: AuthContext, id: string) {
    const followUp = await this.db.followUp.findFirst({
      where: { id, ...this.scoped(context) },
      include: includeFollowUp,
    });
    if (!followUp) throw fail('NOT_FOUND', 'Follow-up não encontrado', 404);
    return mapFollowUp(followUp);
  }

  async create(context: AuthContext, input: CreateFollowUpRequest) {
    requireAccess(context, 'leads.add_interaction');
    const lead = await this.db.lead.findFirst({
      where: { id: input.leadId, ...leadScope(context) },
      select: { id: true },
    });
    if (!lead) throw fail('NOT_FOUND', 'Lead não encontrado', 404);
    if (input.assignedUserId) {
      const assigned = await this.db.user.findUnique({
        where: { id: input.assignedUserId },
        select: { ativo: true },
      });
      if (!assigned || !assigned.ativo)
        throw fail('VALIDATION_ERROR', 'Responsável inválido para o follow-up', 400);
    }
    const created = await this.db.$transaction(async (tx) => {
      const row = await tx.followUp.create({
        data: {
          leadId: input.leadId,
          assignedUserId: input.assignedUserId ?? null,
          dueAt: new Date(input.dueAt),
          type: input.type,
          title: input.title.trim(),
          notes: input.notes ?? null,
          createdById: context.user.id,
        },
        include: includeFollowUp,
      });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'FOLLOWUP_CREATED',
          entity: 'FollowUp',
          entityId: row.id,
          metadata: { leadId: input.leadId, type: input.type },
        },
      });
      return row;
    });
    return mapFollowUp(created);
  }

  async update(context: AuthContext, id: string, input: UpdateFollowUpRequest) {
    const current = await this.mutable(context, id);
    if (current.status !== 'PENDING')
      throw fail('CONFLICT', 'Follow-up já finalizado', 409);
    const { expectedUpdatedAt, ...values } = input;
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.followUp.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}),
        },
        data: {
          ...(values.title !== undefined ? { title: values.title.trim() } : {}),
          ...(values.notes !== undefined ? { notes: values.notes } : {}),
          ...(values.dueAt !== undefined ? { dueAt: new Date(values.dueAt) } : {}),
          ...(values.type !== undefined ? { type: values.type } : {}),
          ...(values.assignedUserId !== undefined
            ? { assignedUserId: values.assignedUserId }
            : {}),
        },
      });
      if (!result.count)
        throw fail('CONFLICT', 'O follow-up foi alterado por outra pessoa', 409);
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'FOLLOWUP_UPDATED',
          entity: 'FollowUp',
          entityId: id,
          metadata: { leadId: current.leadId },
        },
      });
      const row = await tx.followUp.findUniqueOrThrow({
        where: { id },
        include: includeFollowUp,
      });
      return row;
    });
    return mapFollowUp(updated);
  }

  async setStatus(context: AuthContext, id: string, input: SetFollowUpStatusRequest) {
    requireAccess(context, 'leads.add_interaction');
    const current = await this.mutable(context, id);
    if (current.status !== 'PENDING')
      throw fail('CONFLICT', 'Follow-up já finalizado', 409);
    const now = new Date();
    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.followUp.updateMany({
        where: {
          id,
          status: 'PENDING',
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: {
          status: input.status,
          completedAt: input.status === 'COMPLETED' ? now : null,
        },
      });
      if (!result.count)
        throw fail('CONFLICT', 'O follow-up foi alterado por outra pessoa', 409);
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action:
            input.status === 'COMPLETED' ? 'FOLLOWUP_COMPLETED' : 'FOLLOWUP_CANCELED',
          entity: 'FollowUp',
          entityId: id,
          metadata: { leadId: current.leadId },
        },
      });
      return tx.followUp.findUniqueOrThrow({ where: { id }, include: includeFollowUp });
    });
    return mapFollowUp(updated);
  }
}
