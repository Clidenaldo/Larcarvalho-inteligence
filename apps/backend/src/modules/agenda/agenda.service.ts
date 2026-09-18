import type {
  AgendaItem,
  AgendaQuery,
  AgendaResponse,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import {
  commercialScope,
  leadScope,
  saleScope,
} from '../../core/auth/data-scope.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { fortalezaDayBounds } from '../leads/lead-rules.js';

/** Janela padrão de próximos follow-ups em dias (item 7: constante documentada). */
export const FOLLOWUP_LOOKAHEAD_DAYS = 7;
/** Teto de itens por bloco da agenda (performance, item 30). */
export const AGENDA_BLOCK_CAP = 200;

const TERMINAL_STATUSES = ['CONVERTIDO', 'PERDIDO'] as const;

const includeAgendaFollowUp = {
  assignedUser: { select: { id: true, nome: true } },
  lead: {
    select: {
      categoriaInteresse: true,
      id: true,
      nome: true,
      responsavel: { select: { id: true, nome: true } },
      status: true,
    },
  },
} satisfies Prisma.FollowUpInclude;
type AgendaFollowUpRow = Prisma.FollowUpGetPayload<{ include: typeof includeAgendaFollowUp }>;

function fortalezaClock(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Fortaleza',
  }).format(date);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function overdueReason(dueAt: Date, now: Date): string {
  const days = daysBetween(dueAt, now);
  return days >= 1
    ? `Follow-up atrasado há ${days} dia(s).`
    : 'Follow-up com horário já passado hoje.';
}

export function priorityFor(kind: AgendaItem['kind']): number {
  switch (kind) {
    case 'FOLLOWUP_OVERDUE':
      return 1;
    case 'FOLLOWUP_TODAY':
      return 2;
    case 'PROPOSAL_NO_FOLLOWUP':
      return 3;
    case 'SALE_AWAITING_DOCUMENTS':
      return 3;
    case 'NO_NEXT_ACTION':
      return 4;
    case 'STALE_CONTACT':
      return 5;
    case 'FOLLOWUP_UPCOMING':
      return 6;
  }
}

/**
 * A coluna é VARCHAR no banco; os valores entram validados pelo contrato
 * (produtoCategoriaSchema) e saem validados pelo mesmo contrato.
 */
function categoriaOf(value: string | null): AgendaItem['categoria'] {
  return value as AgendaItem['categoria'];
}

function followUpItem(
  kind: AgendaItem['kind'],
  row: AgendaFollowUpRow,
  reason: string,
): AgendaItem {
  return {
    categoria: categoriaOf(row.lead.categoriaInteresse),
    dueAt: row.dueAt.toISOString(),
    followUpId: row.id,
    followUpTitle: row.title,
    followUpType: row.type,
    kind,
    leadId: row.lead.id,
    leadNome: row.lead.nome,
    leadStatus: row.lead.status,
    priority: priorityFor(kind),
    reason,
    responsavel: row.lead.responsavel,
  };
}

export class AgendaService {
  constructor(private readonly db: PrismaClient) {}

  private baseLeadFilter(
    actor: AuthContext,
    query: AgendaQuery,
  ): Prisma.LeadWhereInput[] {
    const conditions: Prisma.LeadWhereInput[] = [leadScope(actor)];
    if (query.stage) conditions.push({ status: query.stage });
    if (query.categoria) conditions.push({ categoriaInteresse: query.categoria });
    if (query.responsavelId) conditions.push({ responsavelId: query.responsavelId });
    if (query.semResponsavel) conditions.push({ responsavelId: null });
    if (query.teamId)
      conditions.push({
        OR: [
          { responsavel: { teamId: query.teamId } },
          { responsavelId: actor.user.id },
        ],
      });
    return conditions;
  }

  private followUpFilter(
    actor: AuthContext,
    query: AgendaQuery,
    extra: Prisma.FollowUpWhereInput,
  ): Prisma.FollowUpWhereInput {
    return {
      AND: [
        { lead: { AND: this.baseLeadFilter(actor, query) } },
        ...(query.type ? [{ type: query.type }] : []),
        extra,
      ],
    };
  }

  async getAgenda(actor: AuthContext, query: AgendaQuery): Promise<AgendaResponse> {
    const now = new Date();
    const today = fortalezaDayBounds(now);
    const lookaheadEnd = new Date(today.end.getTime() + query.days * 86_400_000);
    const skip = (query.page - 1) * query.pageSize;
    const staleCutoff = new Date(now.getTime() - 7 * 86_400_000);

    const [overdueRows, overdueTotal, todayRows, todayTotal, upcomingRows, upcomingTotal] =
      await this.db.$transaction([
        this.db.followUp.findMany({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { lt: now },
          }),
          include: includeAgendaFollowUp,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.followUp.count({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { lt: now },
          }),
        }),
        this.db.followUp.findMany({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { gte: today.start, lt: today.end },
          }),
          include: includeAgendaFollowUp,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.followUp.count({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { gte: today.start, lt: today.end },
          }),
        }),
        this.db.followUp.findMany({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { gte: today.end, lt: lookaheadEnd },
          }),
          include: includeAgendaFollowUp,
          orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.followUp.count({
          where: this.followUpFilter(actor, query, {
            status: 'PENDING',
            dueAt: { gte: today.end, lt: lookaheadEnd },
          }),
        }),
      ]);

    const [inactiveLeads, inactiveTotal, staleRows, staleTotal, proposals, proposalsTotal, completedToday, salesAwaitingRows, salesAwaitingTotal] =
      await this.db.$transaction([
        this.db.lead.findMany({
          where: {
            AND: [
              ...this.baseLeadFilter(actor, query),
              { status: { notIn: [...TERMINAL_STATUSES] } },
              { followUps: { none: { status: 'PENDING' } } },
            ],
          },
          select: {
            categoriaInteresse: true,
            id: true,
            nome: true,
            responsavel: { select: { id: true, nome: true } },
            status: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.lead.count({
          where: {
            AND: [
              ...this.baseLeadFilter(actor, query),
              { status: { notIn: [...TERMINAL_STATUSES] } },
              { followUps: { none: { status: 'PENDING' } } },
            ],
          },
        }),
        this.db.lead.findMany({
          where: {
            AND: [
              ...this.baseLeadFilter(actor, query),
              { status: { notIn: [...TERMINAL_STATUSES] } },
              { interacoes: { none: { createdAt: { gte: staleCutoff } } } },
            ],
          },
          select: {
            categoriaInteresse: true,
            id: true,
            interacoes: { orderBy: { ocorridoEm: 'desc' }, select: { ocorridoEm: true }, take: 1 },
            nome: true,
            responsavel: { select: { id: true, nome: true } },
            status: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.lead.count({
          where: {
            AND: [
              ...this.baseLeadFilter(actor, query),
              { status: { notIn: [...TERMINAL_STATUSES] } },
              { interacoes: { none: { createdAt: { gte: staleCutoff } } } },
            ],
          },
        }),
        this.db.proposal.findMany({
          where: {
            deletedAt: null,
            AND: [commercialScope(actor, 'proposals')],
            status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
            lead: {
              AND: [
                ...this.baseLeadFilter(actor, query),
                { followUps: { none: { status: 'PENDING' } } },
              ],
            },
          },
          select: {
            id: true,
            lead: {
              select: {
                categoriaInteresse: true,
                id: true,
                nome: true,
                responsavel: { select: { id: true, nome: true } },
                status: true,
              },
            },
            number: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.proposal.count({
          where: {
            deletedAt: null,
            AND: [commercialScope(actor, 'proposals')],
            status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
            lead: {
              AND: [
                ...this.baseLeadFilter(actor, query),
                { followUps: { none: { status: 'PENDING' } } },
              ],
            },
          },
        }),
        this.db.followUp.count({
          where: {
            lead: { AND: this.baseLeadFilter(actor, query) },
            status: 'COMPLETED',
            completedAt: { gte: today.start, lt: today.end },
          },
        }),
        this.db.sale.findMany({
          where: {
            AND: [saleScope(actor, 'read')],
            status: 'AGUARDANDO_DOCUMENTOS',
            lead: {
              AND: [
                ...this.baseLeadFilter(actor, query),
                { followUps: { none: { status: 'PENDING' } } },
              ],
            },
          },
          select: {
            id: true,
            numero: true,
            lead: {
              select: {
                categoriaInteresse: true,
                id: true,
                nome: true,
                responsavel: { select: { id: true, nome: true } },
                status: true,
              },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip,
          take: Math.min(query.pageSize, AGENDA_BLOCK_CAP),
        }),
        this.db.sale.count({
          where: {
            AND: [saleScope(actor, 'read')],
            status: 'AGUARDANDO_DOCUMENTOS',
            lead: {
              AND: [
                ...this.baseLeadFilter(actor, query),
                { followUps: { none: { status: 'PENDING' } } },
              ],
            },
          },
        }),
      ]);

    return {
      completedToday,
      distribution: [],
      noNextAction: inactiveLeads.map((lead) => ({
        categoria: categoriaOf(lead.categoriaInteresse),
        dueAt: null,
        followUpId: null,
        followUpTitle: null,
        followUpType: null,
        kind: 'NO_NEXT_ACTION' as const,
        leadId: lead.id,
        leadNome: lead.nome,
        leadStatus: lead.status,
        priority: priorityFor('NO_NEXT_ACTION'),
        reason: 'Não existe próxima ação cadastrada.',
        responsavel: lead.responsavel,
      })),
      overdue: overdueRows.map((row) =>
        followUpItem('FOLLOWUP_OVERDUE', row, overdueReason(row.dueAt, now)),
      ),
      proposalsAwaiting: proposals.map((proposal) => ({
        categoria: categoriaOf(proposal.lead.categoriaInteresse),
        dueAt: null,
        followUpId: null,
        followUpTitle: null,
        followUpType: null,
        kind: 'PROPOSAL_NO_FOLLOWUP' as const,
        leadId: proposal.lead.id,
        leadNome: proposal.lead.nome,
        leadStatus: proposal.lead.status,
        priority: priorityFor('PROPOSAL_NO_FOLLOWUP'),
        reason: `Proposta ${proposal.number} enviada e nenhum retorno foi agendado.`,
        responsavel: proposal.lead.responsavel,
      })),
      salesAwaiting: salesAwaitingRows.map((sale) => ({
        categoria: categoriaOf(sale.lead.categoriaInteresse),
        dueAt: null,
        followUpId: null,
        followUpTitle: null,
        followUpType: null,
        kind: 'SALE_AWAITING_DOCUMENTS' as const,
        leadId: sale.lead.id,
        leadNome: sale.lead.nome,
        leadStatus: sale.lead.status,
        priority: priorityFor('SALE_AWAITING_DOCUMENTS'),
        reason: `Venda ${sale.numero} aguarda documentos e nenhum retorno foi agendado.`,
        responsavel: sale.lead.responsavel,
      })),
      staleContacts: staleRows.map((lead) => {
        const last = lead.interacoes[0]?.ocorridoEm ?? null;
        return {
          categoria: categoriaOf(lead.categoriaInteresse),
          dueAt: null,
          followUpId: null,
          followUpTitle: null,
          followUpType: null,
          kind: 'STALE_CONTACT' as const,
          leadId: lead.id,
          leadNome: lead.nome,
          leadStatus: lead.status,
          priority: priorityFor('STALE_CONTACT'),
          reason: last
            ? `Cliente está sem interação há ${Math.max(0, daysBetween(last, now))} dias.`
            : 'Cliente sem nenhuma interação registrada.',
          responsavel: lead.responsavel,
        };
      }),
      today: todayRows.map((row) =>
        followUpItem(
          'FOLLOWUP_TODAY',
          row,
          `Vence hoje às ${fortalezaClock(row.dueAt)}.`,
        ),
      ),
      totals: {
        noNextAction: inactiveTotal,
        overdue: overdueTotal,
        proposalsAwaiting: proposalsTotal,
        salesAwaiting: salesAwaitingTotal,
        staleContacts: staleTotal,
        today: todayTotal,
        upcoming: upcomingTotal,
      },
      upcoming: upcomingRows.map((row) =>
        followUpItem(
          'FOLLOWUP_UPCOMING',
          row,
          `Vence em ${row.dueAt.toISOString().slice(0, 10)}.`,
        ),
      ),
      withoutFutureAgenda: [],
    };
  }

  async getTeamAgenda(
    actor: AuthContext,
    query: AgendaQuery,
  ): Promise<AgendaResponse> {
    const agenda = await this.getAgenda(actor, query);
    const now = new Date();
    const pending = await this.db.followUp.findMany({
      where: {
        lead: { AND: this.baseLeadFilter(actor, query) },
        status: 'PENDING',
        dueAt: { lt: new Date(fortalezaDayBounds(now).end.getTime() + query.days * 86_400_000) },
      },
      select: {
        dueAt: true,
        lead: { select: { responsavel: { select: { id: true, nome: true } } } },
      },
      take: 500,
    });
    const byUser = new Map<string, { nome: string; overdue: number; today: number }>();
    const today = fortalezaDayBounds(now);
    for (const item of pending) {
      const owner = item.lead.responsavel;
      if (!owner) continue;
      const entry = byUser.get(owner.id) ?? { nome: owner.nome, overdue: 0, today: 0 };
      if (item.dueAt < now) entry.overdue += 1;
      else if (item.dueAt >= today.start && item.dueAt < today.end) entry.today += 1;
      byUser.set(owner.id, entry);
    }
    const teamIds = [...(actor.teamIds ?? [])];
    const members = await this.db.user.findMany({
      where: {
        ativo: true,
        ...(teamIds.length > 0 ? { teamId: { in: teamIds } } : { role: { in: ['VENDEDOR', 'GESTOR'] } }),
      },
      select: { id: true, nome: true },
      take: 200,
    });
    const withFuture = new Set<string>();
    const assigned = await this.db.followUp.findMany({
      where: {
        lead: { AND: this.baseLeadFilter(actor, query) },
        status: 'PENDING',
        OR: [
          { assignedUserId: { in: members.map((member) => member.id) } },
          { lead: { responsavelId: { in: members.map((member) => member.id) } } },
        ],
      },
      select: { assignedUserId: true, lead: { select: { responsavelId: true } } },
      take: 500,
    });
    for (const item of assigned) {
      if (item.assignedUserId) withFuture.add(item.assignedUserId);
      if (item.lead.responsavelId) withFuture.add(item.lead.responsavelId);
    }
    return {
      ...agenda,
      distribution: [...byUser.entries()].map(([userId, entry]) => ({
        nome: entry.nome,
        overdue: entry.overdue,
        today: entry.today,
        userId,
      })),
      withoutFutureAgenda: members
        .filter((member) => !withFuture.has(member.id))
        .map((member) => ({ nome: member.nome, userId: member.id })),
    };
  }
}
