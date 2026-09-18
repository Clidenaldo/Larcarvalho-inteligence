import type { CommercialIntelligence, CommercialIntelligenceQuery } from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { dataScope, scopedUsers } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { resolveDashboardPeriod } from '../dashboard/dashboard.service.js';
import { FinancialDecimal } from '../sales/values.js';

const ACTIVE_LEADS: Prisma.EnumLeadStatusFilter = { notIn: ['CONVERTIDO', 'PERDIDO'] };
const OPEN_SALES = ['RASCUNHO', 'AGUARDANDO_DOCUMENTOS', 'DOCUMENTOS_RECEBIDOS', 'ENVIADA_ADMINISTRADORA', 'EM_ANALISE', 'APROVADA'] as const;
const PENDING_CONTRACTS = ['RASCUNHO', 'EMITIDO'] as const;

const comparison = (current: number, previous: number) => ({
  current, previous, changePercent: previous === 0 ? null : (current - previous) / previous,
});
const cents = (value: string) => BigInt(new FinancialDecimal(value).times(100).toFixed(0));
const money = (value: bigint) => new FinancialDecimal(value.toString()).div(100).toFixed(2);

export class CommercialIntelligenceService {
  constructor(private readonly db: PrismaClient) {}

  private resolveScope(actor: AuthContext, requested?: 'OWN' | 'TEAM' | 'ALL') {
    const maximum = dataScope(actor, 'sales');
    const available = maximum === 'ALL' ? ['OWN', 'TEAM', 'ALL'] as const : maximum === 'TEAM' ? ['OWN', 'TEAM'] as const : ['OWN'] as const;
    const scope = requested ?? maximum;
    if (!available.includes(scope as never)) throw new AppError({ code: 'FORBIDDEN', message: 'Escopo comercial nao autorizado', statusCode: 403 });
    return { scope, availableScopes: [...available] };
  }

  async overview(actor: AuthContext, query: CommercialIntelligenceQuery, now = new Date()): Promise<CommercialIntelligence> {
    const { scope, availableScopes } = this.resolveScope(actor, query.scope);
    const window = resolveDashboardPeriod(query, now);
    const users: Prisma.UserWhereInput = scope === 'OWN' ? { id: actor.user.id } : scope === 'TEAM' ? scopedUsers(actor) : {};
    const leads: Prisma.LeadWhereInput = scope === 'ALL' ? {} : { responsavel: users };
    const sales: Prisma.SaleWhereInput = scope === 'ALL' ? {} : { responsavel: users };
    const commercial = scope === 'ALL' ? {} : { OR: [{ createdBy: users }, { lead: { responsavel: users } }] };
    const current = { gte: window.from, lt: window.to };
    const previous = { gte: window.previousFrom, lt: window.previousTo };

    const results = await Promise.all([
      this.db.lead.count({ where: { AND: [leads, { status: ACTIVE_LEADS }] } }),
      this.db.followUp.count({ where: { lead: leads, status: 'PENDING' } }),
      this.db.followUp.count({ where: { lead: leads, status: 'PENDING', dueAt: { lt: now } } }),
      this.db.simulation.count({ where: { AND: [commercial, { deletedAt: null, createdAt: current }] } }),
      this.db.simulation.count({ where: { AND: [commercial, { deletedAt: null, createdAt: previous }] } }),
      this.db.proposal.count({ where: { AND: [commercial, { deletedAt: null, createdAt: current }] } }),
      this.db.proposal.count({ where: { AND: [commercial, { deletedAt: null, createdAt: previous }] } }),
      this.db.proposalStatusHistory.count({ where: { proposal: { AND: [commercial, { deletedAt: null }] }, toStatus: 'ACCEPTED', createdAt: current } }),
      this.db.proposalStatusHistory.count({ where: { proposal: { AND: [commercial, { deletedAt: null }] }, toStatus: 'ACCEPTED', createdAt: previous } }),
      this.db.sale.count({ where: { AND: [sales, { status: { in: [...OPEN_SALES] } }] } }),
      this.db.sale.count({ where: { AND: [sales, { status: 'CONTRATADA', dataContratacao: current }] } }),
      this.db.sale.count({ where: { AND: [sales, { status: 'CONTRATADA', dataContratacao: previous }] } }),
      this.db.sale.count({ where: { AND: [sales, { status: 'CANCELADA', dataCancelamento: current }] } }),
      this.db.sale.count({ where: { AND: [sales, { status: 'CANCELADA', dataCancelamento: previous }] } }),
      this.db.sale.count({ where: { AND: [sales, { documents: { some: { obrigatorio: true, status: { in: ['PENDENTE', 'REJEITADO'] } } } }] } }),
      this.db.saleContract.count({ where: { sale: sales, statusContrato: { in: [...PENDING_CONTRACTS] } } }),
      this.db.proposal.count({ where: { AND: [commercial, { deletedAt: null, status: { in: ['GENERATED', 'SENT', 'VIEWED'] }, lead: { followUps: { none: { status: 'PENDING' } } } }] } }),
      this.db.lead.count({ where: { AND: [leads, { status: ACTIVE_LEADS, followUps: { none: { status: 'PENDING' } } }] } }),
      this.db.lead.count({ where: { AND: [leads, { status: ACTIVE_LEADS, interacoes: { none: { ocorridoEm: { gte: new Date(now.getTime() - 7 * 86_400_000) } } } }] } }),
      this.db.user.findMany({ where: { AND: [users, { ativo: true }] }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      this.db.simulation.findMany({ where: { AND: [commercial, { deletedAt: null, createdAt: current }] }, select: { createdAt: true, createdById: true } }),
      this.db.proposal.findMany({ where: { AND: [commercial, { deletedAt: null, createdAt: current }] }, select: { createdAt: true, createdById: true, status: true } }),
      this.db.sale.findMany({ where: { AND: [sales, { dataAceite: current }] }, select: { dataAceite: true, responsavelUserId: true, contracts: { select: { id: true } } } }),
    ]);
    const [activeClients, pendingFollowUps, overdueFollowUps, simulationsNow, simulationsPrevious, proposalsNow, proposalsPrevious, acceptedNow, acceptedPrevious, openSales, completedNow, completedPrevious, canceledNow, canceledPrevious, pendingDocuments, pendingContracts, proposalNoFollowup, noNextAction, staleContact, sellers, simulationRows, proposalRows, saleRows] = results;

    const performance = await Promise.all(sellers.map(async (seller) => {
      const sellerLead = { responsavelId: seller.id };
      const [active, overdue, simulations, proposals, accepted, salesCount, contracts] = await Promise.all([
        this.db.lead.count({ where: { ...sellerLead, status: ACTIVE_LEADS } }),
        this.db.followUp.count({ where: { lead: sellerLead, status: 'PENDING', dueAt: { lt: now } } }),
        this.db.simulation.count({ where: { createdById: seller.id, deletedAt: null, createdAt: current } }),
        this.db.proposal.count({ where: { createdById: seller.id, deletedAt: null, createdAt: current } }),
        this.db.proposal.count({ where: { createdById: seller.id, deletedAt: null, status: 'ACCEPTED', createdAt: current } }),
        this.db.sale.count({ where: { responsavelUserId: seller.id, createdAt: current } }),
        this.db.saleContract.count({ where: { sale: { responsavelUserId: seller.id }, createdAt: current, statusContrato: { not: 'CANCELADO' } } }),
      ]);
      return { sellerId: seller.id, seller: seller.nome, activeClients: active, overdueFollowUps: overdue, simulations, proposals, acceptedProposals: accepted, sales: salesCount, contracts };
    }));

    const series = new Map<string, { date: string; simulations: number; proposals: number; sales: number }>();
    const add = (date: Date, key: 'simulations' | 'proposals' | 'sales') => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(date);
      const row = series.get(day) ?? { date: day, simulations: 0, proposals: 0, sales: 0 };
      row[key]++; series.set(day, row);
    };
    simulationRows.forEach((x) => add(x.createdAt, 'simulations'));
    proposalRows.forEach((x) => add(x.createdAt, 'proposals'));
    saleRows.forEach((x) => add(x.dataAceite, 'sales'));

    const response: CommercialIntelligence = {
      generatedAt: now.toISOString(), scope, availableScopes,
      period: { preset: query.period, label: window.label, timezone: 'America/Fortaleza', from: window.from.toISOString(), toExclusive: window.to.toISOString(), previousFrom: window.previousFrom.toISOString(), previousToExclusive: window.previousTo.toISOString() },
      summary: { activeClients, pendingFollowUps, overdueFollowUps, simulations: comparison(simulationsNow, simulationsPrevious), proposals: comparison(proposalsNow, proposalsPrevious), acceptedProposals: comparison(acceptedNow, acceptedPrevious), openSales, completedSales: comparison(completedNow, completedPrevious), canceledSales: comparison(canceledNow, canceledPrevious), pendingDocuments, pendingContracts },
      pipeline: [
        { key: 'SIMULATIONS', label: 'Simulacoes', count: simulationsNow, href: '/simulacoes/nova' },
        { key: 'PROPOSALS', label: 'Propostas', count: proposalsNow, href: '/propostas' },
        { key: 'ACCEPTED', label: 'Propostas aceitas', count: acceptedNow, href: '/propostas?status=ACCEPTED' },
        { key: 'SALES', label: 'Vendas', count: saleRows.length, href: '/dashboard/vendas' },
        { key: 'CONTRACTED', label: 'Contratadas', count: completedNow, href: '/dashboard/vendas?status=CONTRATADA' },
      ],
      conversions: [
        { key: 'PROPOSAL_ACCEPTANCE', label: 'Propostas aceitas', numerator: acceptedNow, denominator: proposalsNow, rate: proposalsNow ? acceptedNow / proposalsNow : null },
        { key: 'ACCEPTED_TO_SALE', label: 'Vendas por proposta aceita', numerator: saleRows.length, denominator: acceptedNow, rate: acceptedNow ? saleRows.length / acceptedNow : null },
      ],
      attention: ([
        { type: 'FOLLOWUP_OVERDUE', severity: 'HIGH', reason: 'Follow-ups pendentes com vencimento anterior a agora.', count: overdueFollowUps, href: '/dashboard/agenda' },
        { type: 'SALE_DOCUMENT_PENDING', severity: 'HIGH', reason: 'Vendas com documento obrigatorio pendente ou rejeitado.', count: pendingDocuments, href: '/dashboard/vendas?status=AGUARDANDO_DOCUMENTOS' },
        { type: 'CONTRACT_PENDING', severity: 'MEDIUM', reason: 'Contratos em rascunho ou emitidos.', count: pendingContracts, href: '/dashboard/vendas?contractStatus=RASCUNHO' },
        { type: 'PROPOSAL_NO_FOLLOWUP', severity: 'MEDIUM', reason: 'Propostas abertas sem follow-up pendente.', count: proposalNoFollowup, href: '/propostas' },
        { type: 'NO_NEXT_ACTION', severity: 'MEDIUM', reason: 'Clientes ativos sem follow-up pendente.', count: noNextAction, href: '/dashboard/carteira' },
        { type: 'STALE_CONTACT', severity: 'LOW', reason: 'Clientes ativos sem interacao nos ultimos 7 dias.', count: staleContact, href: '/dashboard/carteira' },
      ] satisfies CommercialIntelligence['attention']).filter((item) => item.count > 0),
      performance, timeseries: [...series.values()].sort((a, b) => a.date.localeCompare(b.date)),
      sources: ['Cliente 360', 'Agenda', 'Simulacoes', 'Propostas', 'Vendas', 'Contratos'],
    };

    if (hasPermission(actor, 'commissions.read')) {
      const rows = await this.db.commission.findMany({ where: { sale: sales, tipo: { not: 'ESTORNO' }, status: { notIn: ['CANCELADA', 'ESTORNADA'] } }, select: { status: true, valorPrevisto: true, valorConfirmado: true, valorRecebido: true } });
      let expected = 0n, confirmed = 0n, received = 0n;
      for (const row of rows) {
        expected += cents(row.valorPrevisto.toString());
        if (row.valorConfirmado) confirmed += cents(row.valorConfirmado.toString());
        received += cents(row.valorRecebido.toString());
      }
      response.financial = { expected: money(expected), confirmed: money(confirmed), received: money(received), confirmedReceivable: money(confirmed > received ? confirmed - received : 0n) };
      response.sources.push('Comissoes');
    }
    return response;
  }
}
