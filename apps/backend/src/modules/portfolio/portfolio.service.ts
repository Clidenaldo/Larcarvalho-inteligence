import type {
  PortfolioSummary,
  TimelineItem,
  WalletItem,
  WalletQuery,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import {
  commercialScope,
  leadScope,
  saleScope,
} from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { fortalezaDayBounds } from '../leads/lead-rules.js';
import type { LeadsService } from '../leads/leads.service.js';
import type { FollowUpsService } from '../follow-ups/follow-ups.service.js';

/** Dias sem interação para considerar o contato desatualizado (regra explícita). */
export const STALE_CONTACT_DAYS = 7;
/** Teto de linhas para ordenações calculadas em memória (carteira). */
export const WALLET_COMPUTED_SORT_CAP = 500;

/**
 * Pesos da completude do perfil comercial (determinístico, soma 100).
 * Não é score de venda: mede apenas preenchimento do cadastro.
 */
export const PROFILE_COMPLETENESS_WEIGHTS = Object.freeze({
  contato: 15,
  categoria: 10,
  credito: 10 + 5,
  parcela: 15,
  prazo: 10,
  lance: 10,
  objetivo: 15,
  timeframe: 10,
});

interface ProfileInput {
  readonly categoriaInteresse: string | null;
  readonly dataPretendidaAquisicao: string | null;
  readonly email: string | null;
  readonly lanceDisponivelPercentual: string | null;
  readonly objetivo: string | null;
  readonly parcelaMaxima: string | null;
  readonly prazoMaximo: number | null;
  readonly prazoMinimo: number | null;
  readonly restricoes?: string | null;
  readonly telefone: string | null;
  readonly valorCreditoDesejado: string | null;
}

export function profileCompleteness(input: ProfileInput): {
  missingFields: string[];
  percent: number;
} {
  const missingFields: string[] = [];
  let percent = 0;
  if (input.telefone || input.email) percent += PROFILE_COMPLETENESS_WEIGHTS.contato;
  else missingFields.push('contato (telefone ou e-mail)');
  if (input.categoriaInteresse) percent += PROFILE_COMPLETENESS_WEIGHTS.categoria;
  else missingFields.push('categoria de interesse');
  if (input.valorCreditoDesejado) percent += PROFILE_COMPLETENESS_WEIGHTS.credito;
  else missingFields.push('crédito desejado');
  if (input.parcelaMaxima) percent += PROFILE_COMPLETENESS_WEIGHTS.parcela;
  else missingFields.push('parcela máxima');
  if (input.prazoMinimo !== null && input.prazoMaximo !== null)
    percent += PROFILE_COMPLETENESS_WEIGHTS.prazo;
  else missingFields.push('prazo desejado');
  if (input.lanceDisponivelPercentual) percent += PROFILE_COMPLETENESS_WEIGHTS.lance;
  else missingFields.push('lance disponível');
  if (input.objetivo) percent += PROFILE_COMPLETENESS_WEIGHTS.objetivo;
  else missingFields.push('objetivo');
  if (input.dataPretendidaAquisicao) percent += PROFILE_COMPLETENESS_WEIGHTS.timeframe;
  else missingFields.push('data pretendida de aquisição');
  return { missingFields, percent: Math.min(100, percent) };
}

const INCOMPLETE_OR = {
  OR: [
    { telefoneNormalizado: null, emailNormalizado: null },
    { categoriaInteresse: null },
    { valorCreditoDesejado: null },
    { parcelaMaxima: null },
    { prazoMinimo: null },
    { prazoMaximo: null },
    { lanceDisponivelPercentual: null },
    { objetivo: null },
    { dataPretendidaAquisicao: null },
  ],
} satisfies Prisma.LeadWhereInput;

const PROPOSALS_AWAITING = ['GENERATED', 'SENT', 'VIEWED'] as const;

const fail = (code: 'NOT_FOUND', message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });

export class PortfolioService {
  constructor(
    private readonly db: PrismaClient,
    private readonly leadsService: LeadsService,
    private readonly followUpsService: FollowUpsService,
  ) {}

  async summary(actor: AuthContext): Promise<PortfolioSummary> {
    const scope = leadScope(actor);
    const now = new Date();
    const today = fortalezaDayBounds(now);
    const staleCutoff = new Date(now.getTime() - STALE_CONTACT_DAYS * 86_400_000);
    const [totalLeads, overdueFollowUps, followUpsToday, proposalsAwaiting, staleContacts, incompleteProfiles] =
      await this.db.$transaction([
        this.db.lead.count({ where: scope }),
        this.db.followUp.count({
          where: { lead: scope, status: 'PENDING', dueAt: { lt: now } },
        }),
        this.db.followUp.count({
          where: {
            lead: scope,
            status: 'PENDING',
            dueAt: { gte: today.start, lt: today.end },
          },
        }),
        this.db.proposal.count({
          where: {
            deletedAt: null,
            AND: [commercialScope(actor, 'proposals')],
            status: { in: [...PROPOSALS_AWAITING] },
          },
        }),
        this.db.lead.count({
          where: {
            ...scope,
            status: { notIn: ['CONVERTIDO', 'PERDIDO'] },
            interacoes: { none: { createdAt: { gte: staleCutoff } } },
          },
        }),
        this.db.lead.count({ where: { ...scope, ...INCOMPLETE_OR } }),
      ]);
    return {
      followUpsToday,
      incompleteProfiles,
      overdueFollowUps,
      proposalsAwaiting,
      staleContacts,
      totalLeads,
    };
  }

  async myFollowUps(actor: AuthContext) {
    const base = {
      assignedUserId: actor.user.id,
      lead: leadScope(actor),
    } satisfies Prisma.FollowUpWhereInput;
    const now = new Date();
    const today = fortalezaDayBounds(now);
    const order = [{ dueAt: 'asc' as const }, { id: 'asc' as const }];
    const [todayRows, overdueRows, upcomingRows] = await this.db.$transaction([
      this.db.followUp.findMany({
        where: { ...base, status: 'PENDING', dueAt: { gte: today.start, lt: today.end } },
        include: followUpInclude,
        orderBy: order,
        take: 50,
      }),
      this.db.followUp.findMany({
        where: { ...base, status: 'PENDING', dueAt: { lt: now } },
        include: followUpInclude,
        orderBy: order,
        take: 50,
      }),
      this.db.followUp.findMany({
        where: { ...base, status: 'PENDING', dueAt: { gte: today.end } },
        include: followUpInclude,
        orderBy: order,
        take: 50,
      }),
    ]);
    const map = (rows: FollowUpRow[]) => rows.map((row) => mapFollowUpDto(row, now));
    return { overdue: map(overdueRows), today: map(todayRows), upcoming: map(upcomingRows) };
  }

  async wallet(actor: AuthContext, query: WalletQuery) {
    const scope = leadScope(actor);
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_CONTACT_DAYS * 86_400_000);
    const today = fortalezaDayBounds(now);
    const conditions: Prisma.LeadWhereInput[] = [scope];
    if (query.status) conditions.push({ status: query.status });
    if (query.categoria) conditions.push({ categoriaInteresse: query.categoria });
    if (query.responsavelId) conditions.push({ responsavelId: query.responsavelId });
    if (query.teamId)
      conditions.push({
        OR: [
          { responsavel: { teamId: query.teamId } },
          { responsavelId: actor.user.id },
        ],
      });
    if (query.followUp === 'overdue')
      conditions.push({ followUps: { some: { status: 'PENDING', dueAt: { lt: now } } } });
    if (query.followUp === 'today')
      conditions.push({
        followUps: {
          some: { status: 'PENDING', dueAt: { gte: today.start, lt: today.end } },
        },
      });
    if (query.followUp === 'upcoming')
      conditions.push({
        followUps: { some: { status: 'PENDING', dueAt: { gte: today.end } } },
      });
    if (query.followUp === 'none')
      conditions.push({ followUps: { none: { status: 'PENDING' } } });
    if (query.comProposta !== undefined)
      conditions.push(
        query.comProposta ? { proposals: { some: {} } } : { proposals: { none: {} } },
      );
    if (query.comVenda !== undefined)
      conditions.push(
        query.comVenda ? { sales: { some: {} } } : { sales: { none: {} } },
      );
    if (query.emContratacao)
      conditions.push({
        sales: { some: { status: { in: ['AGUARDANDO_DOCUMENTOS', 'DOCUMENTOS_RECEBIDOS', 'ENVIADA_ADMINISTRADORA', 'EM_ANALISE', 'APROVADA'] } } },
      });
    if (query.contratada)
      conditions.push({ sales: { some: { status: 'CONTRATADA' } } });
    if (query.vendaCancelada)
      conditions.push({ sales: { some: { status: 'CANCELADA' } } });
    if (query.comSimulacao !== undefined)
      conditions.push(
        query.comSimulacao
          ? { simulations: { some: {} } }
          : { simulations: { none: {} } },
      );
    if (query.semContatoRecente)
      conditions.push({
        status: { notIn: ['CONVERTIDO', 'PERDIDO'] },
        interacoes: { none: { createdAt: { gte: staleCutoff } } },
      });
    if (query.perfilIncompleto) conditions.push(INCOMPLETE_OR);
    const where: Prisma.LeadWhereInput = { AND: conditions };
    if (query.sort === 'criacao' || query.sort === 'nome') {
      const [rows, total] = await this.db.$transaction([
        this.db.lead.findMany({
          where,
          include: walletInclude,
          orderBy:
            query.sort === 'nome'
              ? [{ nome: 'asc' as const }, { id: 'asc' as const }]
              : [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.lead.count({ where }),
      ]);
      return {
        items: rows.map((row) => mapWalletItem(row, now)),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      };
    }
    const rows = await this.db.lead.findMany({
      where,
      include: walletInclude,
      take: WALLET_COMPUTED_SORT_CAP,
    });
    const items = rows.map((row) => mapWalletItem(row, now));
    const withKeys = items.map((item) => ({
      item,
      key:
        query.sort === 'ultimoContato'
          ? (item.ultimoContatoEm ?? '')
          : nextFollowUpKey(item),
    }));
    withKeys.sort((a, b) =>
      query.sort === 'ultimoContato'
        ? b.key.localeCompare(a.key)
        : a.key.localeCompare(b.key),
    );
    const total = withKeys.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      items: withKeys.slice(start, start + query.pageSize).map((entry) => entry.item),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async timeline(
    actor: AuthContext,
    leadId: string,
    page: number,
    pageSize: number,
  ) {
    const lead = await this.db.lead.findFirst({
      where: { id: leadId, ...leadScope(actor) },
      select: { createdAt: true, id: true, nome: true },
    });
    if (!lead) throw fail('NOT_FOUND', 'Lead não encontrado', 404);
    const [interacoes, simulations, proposals, proposalEvents, followUps, sales, saleEvents, contracts] = await this.db.$transaction([
      this.db.leadInteracao.findMany({
        where: { leadId },
        include: { criadoPor: { select: { nome: true } } },
        orderBy: [{ ocorridoEm: 'desc' }],
        take: 200,
      }),
      this.db.simulation.findMany({
        where: { deletedAt: null, leadId },
        select: { createdAt: true, id: true, number: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.proposal.findMany({
        where: { deletedAt: null, leadId },
        select: { createdAt: true, id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.proposalStatusHistory.findMany({
        where: { proposal: { deletedAt: null, leadId } },
        include: {
          changedBy: { select: { nome: true } },
          proposal: { select: { number: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.followUp.findMany({
        where: { leadId },
        include: { assignedUser: { select: { nome: true } } },
        orderBy: { dueAt: 'desc' },
        take: 200,
      }),
      this.db.sale.findMany({
        where: { leadId, AND: [saleScope(actor, 'read')] },
        select: { createdAt: true, id: true, numero: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.saleStatusHistory.findMany({
        where: { sale: { leadId, AND: [saleScope(actor, 'read')] } },
        include: {
          changedBy: { select: { nome: true } },
          sale: { select: { numero: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.db.saleContract.findMany({
        where: { sale: { leadId, AND: [saleScope(actor, 'read')] } },
        select: {
          createdAt: true, id: true, numeroContrato: true, statusContrato: true,
          sale: { select: { numero: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    // Comissões só com permissão financeira (segregação também na timeline).
    const commissions = hasPermission(actor, 'commissions.read')
      ? await this.db.commission.findMany({
          where: { sale: { leadId, AND: [saleScope(actor, 'read')] } },
          select: {
            createdAt: true, id: true, tipo: true, status: true,
            valorPrevisto: true, sale: { select: { numero: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : [];
    const items: TimelineItem[] = [
      {
        actorName: null,
        id: `lead-${lead.id}`,
        kind: 'LEAD_CREATED',
        occurredAt: lead.createdAt.toISOString(),
        origin: 'lead',
        summary: `Lead ${lead.nome} criado`,
      },
      ...interacoes.map((item) => ({
        actorName: item.criadoPor?.nome ?? null,
        id: `interaction-${item.id}`,
        kind: 'INTERACTION' as const,
        occurredAt: item.ocorridoEm.toISOString(),
        origin: 'interaction' as const,
        summary: `${interactionLabel(item.tipo)}: ${truncate(item.descricao, 140)}`,
      })),
      ...simulations.map((item) => ({
        actorName: null,
        id: `simulation-${item.id}`,
        kind: 'SIMULATION_CREATED' as const,
        occurredAt: item.createdAt.toISOString(),
        origin: 'simulation' as const,
        summary: `Simulação ${item.number} criada`,
      })),
      ...proposals.map((item) => ({
        actorName: null,
        id: `proposal-${item.id}`,
        kind: 'PROPOSAL_CREATED' as const,
        occurredAt: item.createdAt.toISOString(),
        origin: 'proposal' as const,
        summary: `Proposta ${item.number} criada (${item.status})`,
      })),
      ...proposalEvents
        .filter((item) => item.fromStatus !== null)
        .map((item) => ({
          actorName: item.changedBy?.nome ?? null,
          id: `proposal-status-${item.id}`,
          kind: 'PROPOSAL_STATUS_CHANGED' as const,
          occurredAt: item.createdAt.toISOString(),
          origin: 'proposal' as const,
          summary: `Proposta ${item.proposal.number}: ${item.fromStatus} → ${item.toStatus}${item.reason ? ` — ${item.reason}` : ''}`,
        })),
      ...sales.map((item) => ({
        actorName: null,
        id: `sale-${item.id}`,
        kind: 'SALE_CREATED' as const,
        occurredAt: item.createdAt.toISOString(),
        origin: 'sale' as const,
        summary: `Venda ${item.numero} criada (${item.status})`,
      })),
      ...saleEvents
        .filter((item) => item.fromStatus !== null)
        .map((item) => ({
          actorName: item.changedBy?.nome ?? null,
          id: `sale-status-${item.id}`,
          kind: 'SALE_STATUS_CHANGED' as const,
          occurredAt: item.createdAt.toISOString(),
          origin: 'sale' as const,
          summary: `Venda ${item.sale.numero}: ${item.fromStatus} → ${item.toStatus}${item.reason ? ` — ${item.reason}` : ''}`,
        })),
      ...contracts.map((item) => ({
        actorName: null,
        id: `contract-${item.id}`,
        kind: 'CONTRACT_CREATED' as const,
        occurredAt: item.createdAt.toISOString(),
        origin: 'contract' as const,
        summary: `Contrato ${item.numeroContrato ?? item.id.slice(0, 8)} da venda ${item.sale.numero} (${item.statusContrato})`,
      })),
      ...commissions.map((item) => ({
        actorName: null,
        id: `commission-${item.id}`,
        kind: 'COMMISSION_CREATED' as const,
        occurredAt: item.createdAt.toISOString(),
        origin: 'commission' as const,
        summary: `Comissão ${item.tipo} da venda ${item.sale.numero}: previsto ${item.valorPrevisto.toString()} (${item.status})`,
      })),
      ...followUps.flatMap((item) => [
        {
          actorName: item.assignedUser?.nome ?? null,
          id: `followup-scheduled-${item.id}`,
          kind: 'FOLLOWUP_SCHEDULED' as const,
          occurredAt: item.createdAt.toISOString(),
          origin: 'followup' as const,
          summary: `Follow-up agendado: ${item.title}`,
        },
        ...(item.status === 'COMPLETED'
          ? [{
            actorName: item.assignedUser?.nome ?? null,
            id: `followup-completed-${item.id}`,
            kind: 'FOLLOWUP_COMPLETED' as const,
            occurredAt: (item.completedAt ?? item.updatedAt).toISOString(),
            origin: 'followup' as const,
            summary: `Follow-up concluído: ${item.title}`,
          }]
          : []),
        ...(item.status === 'CANCELED'
          ? [{
            actorName: item.assignedUser?.nome ?? null,
            id: `followup-canceled-${item.id}`,
            kind: 'FOLLOWUP_CANCELED' as const,
            occurredAt: item.updatedAt.toISOString(),
            origin: 'followup' as const,
            summary: `Follow-up cancelado: ${item.title}`,
          }]
          : []),
      ]),
    ];
    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    };
  }

  async customer360(actor: AuthContext, leadId: string) {
    const [lead, activeFollowUps, recentTimeline, simulationCount, proposalCount, saleCount] =
      await Promise.all([
        this.leadsService.get(actor, leadId),
        this.followUpsService.list(actor, {
          leadId,
          page: 1,
          pageSize: 10,
          scope: 'all',
          sort: 'dueAt',
          status: 'PENDING',
        }),
        this.timeline(actor, leadId, 1, 10),
        this.db.simulation.count({
          where: { deletedAt: null, leadId, AND: [commercialScope(actor, 'simulations')] },
        }),
        this.db.proposal.count({
          where: { deletedAt: null, leadId, AND: [commercialScope(actor, 'proposals')] },
        }),
        this.db.sale.count({
          where: { leadId, AND: [saleScope(actor, 'read')] },
        }),
      ]);
    return {
      activeFollowUps: activeFollowUps.items,
      completeness: profileCompleteness(lead),
      lead,
      proposalCount,
      recentTimeline: recentTimeline.items,
      saleCount,
      simulationCount,
    };
  }
}

type FollowUpRow = {
  assignedUser: { id: string; nome: string } | null;
  completedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; nome: string } | null;
  dueAt: Date;
  id: string;
  lead: { id: string; nome: string };
  leadId: string;
  notes: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  title: string;
  type: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'OTHER';
  updatedAt: Date;
};

const followUpInclude = {
  assignedUser: { select: { id: true, nome: true } },
  createdBy: { select: { id: true, nome: true } },
  lead: { select: { id: true, nome: true } },
} satisfies Prisma.FollowUpInclude;

function mapFollowUpDto(row: FollowUpRow, now: Date) {
  return {
    assignedUser: row.assignedUser,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    dueAt: row.dueAt.toISOString(),
    id: row.id,
    isOverdue: row.status === 'PENDING' && row.dueAt < now,
    lead: row.lead,
    leadId: row.leadId,
    notes: row.notes,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const walletInclude = {
  _count: {
    select: {
      followUps: { where: { status: 'PENDING' } },
      proposals: true,
      sales: true,
      simulations: { where: { deletedAt: null } },
    },
  },
  sales: {
    orderBy: { createdAt: 'desc' as const },
    select: { numero: true, status: true },
    take: 1,
  },
  followUps: {
    where: { status: 'PENDING' },
    select: { dueAt: true },
  },
  interacoes: {
    orderBy: { ocorridoEm: 'desc' as const },
    select: { ocorridoEm: true },
    take: 1,
  },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.LeadInclude;

type WalletRow = Prisma.LeadGetPayload<{ include: typeof walletInclude }>;

function nextFollowUpKey(item: WalletItem): string {
  return item.proximoContatoEm ?? '9999';
}

function mapWalletItem(row: WalletRow, now: Date): WalletItem {
  const pendingDueAts = row.followUps.map((item) => item.dueAt.toISOString()).sort();
  const overdueFollowUps = pendingDueAts.filter((dueAt) => dueAt < now.toISOString()).length;
  const completeness = profileCompleteness({
    categoriaInteresse: row.categoriaInteresse,
    dataPretendidaAquisicao: row.dataPretendidaAquisicao?.toISOString().slice(0, 10) ?? null,
    email: row.emailNormalizado,
    lanceDisponivelPercentual: row.lanceDisponivelPercentual?.toFixed() ?? null,
    objetivo: row.objetivo,
    parcelaMaxima: row.parcelaMaxima?.toFixed() ?? null,
    prazoMaximo: row.prazoMaximo,
    prazoMinimo: row.prazoMinimo,
    telefone: row.telefoneNormalizado,
    valorCreditoDesejado: row.valorCreditoDesejado?.toFixed() ?? null,
  });
  return {
    activeFollowUps: row._count.followUps,
    completeness: completeness.percent,
    hasProposal: row._count.proposals > 0,
    hasSimulation: row._count.simulations > 0,
    hasSale: row._count.sales > 0,
    saleStatus: row.sales[0]?.status ?? null,
    saleNumero: row.sales[0]?.numero ?? null,
    id: row.id,
    nome: row.nome,
    overdueFollowUps,
    proximoContatoEm: pendingDueAts[0] ?? row.proximoContatoEm?.toISOString() ?? null,
    responsavel: row.responsavel,
    status: row.status,
    ultimoContatoEm: row.interacoes[0]?.ocorridoEm.toISOString() ?? null,
  };
}

function truncate(value: string, max: number): string {
  const normalized = value.trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function interactionLabel(tipo: string): string {
  const labels: Record<string, string> = {
    EMAIL: 'E-mail',
    LIGACAO: 'Ligação',
    NOTA: 'Nota',
    OUTRO: 'Registro',
    REUNIAO: 'Reunião',
    STATUS: 'Mudança de estágio',
    WHATSAPP: 'WhatsApp',
  };
  return labels[tipo] ?? 'Registro';
}

export type { TimelineItem };
