import type { AiSource } from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AgendaService } from '../agenda/agenda.service.js';
import type { LeadsService } from '../leads/leads.service.js';
import type { PortfolioService } from '../portfolio/portfolio.service.js';
import type { ProposalsService } from '../proposals/proposals.service.js';
import type { SimulationsService } from '../simulations/simulations.service.js';
import type { CommissionsService } from '../sales/commissions.service.js';
import type { SalesService } from '../sales/sales.service.js';
import type { CommercialIntelligenceService } from '../commercial-intelligence/commercial-intelligence.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import {
  DATA_NOT_AVAILABLE,
  firstName,
  maskPii,
} from './guardrails.js';

export const MAX_COMPARISON_RESULTS = 5;
const NOT_INFORMED = 'não informado';

export interface AiAuthorizedFacts {
  readonly attentionPoints: string[];
  readonly facts: string[];
  readonly missingInformation: string[];
  readonly sources: AiSource[];
}

export const EMPTY_AUTHORIZED_FACTS: AiAuthorizedFacts = Object.freeze({
  attentionPoints: [],
  facts: [],
  missingInformation: [DATA_NOT_AVAILABLE],
  sources: [],
});

type LeadDetail = Awaited<ReturnType<LeadsService['get']>>;
type SimulationDetail = Awaited<ReturnType<SimulationsService['get']>>;
type SimulationScenario = NonNullable<SimulationDetail['scenarios']>[number];
type SimulationResultItem = SimulationScenario['results'][number];
type ProposalDetail = Awaited<ReturnType<ProposalsService['get']>>;

function scenariosOf(simulation: SimulationDetail): SimulationScenario[] {
  return simulation.scenarios ?? [];
}

export interface AiContextBuilderDeps {
  readonly agendaService?: AgendaService | null;
  readonly commissionsService?: CommissionsService | null;
  readonly leadsService?: LeadsService | null;
  readonly portfolioService?: PortfolioService | null;
  readonly proposalsService?: ProposalsService | null;
  readonly salesService?: SalesService | null;
  readonly simulationsService?: SimulationsService | null;
  readonly commercialIntelligenceService?: CommercialIntelligenceService | null;
  readonly knowledgeService?: KnowledgeService | null;
}

function money(value: string | null | undefined): string {
  return value === null || value === undefined || value === ''
    ? NOT_INFORMED
    : `R$ ${value}`;
}

function text(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  return normalized === '' ? NOT_INFORMED : normalized;
}

function maskedNote(value: string | null | undefined): string {
  if (!value || value.trim() === '') return NOT_INFORMED;
  const masked = maskPii(value.trim());
  return masked.length > 280 ? `${masked.slice(0, 280)}…` : masked;
}

function resultFacts(
  label: string,
  result: SimulationResultItem,
): { facts: string[]; missing: string[] } {
  const facts = [
    `${label} — administradora: ${text(result.administratorName)}`,
    `${label} — grupo/cota: ${text(result.groupCode)} / ${text(result.quotaNumber)}`,
    `${label} — crédito contratado: ${money(result.contractedCredit)}`,
    `${label} — crédito líquido: ${money(result.netCredit)}`,
    `${label} — parcela inicial: ${money(result.initialInstallment)}`,
    `${label} — parcela posterior: ${money(result.laterInstallment)}`,
    `${label} — prazo restante: ${result.remainingTermMonths ?? NOT_INFORMED} meses`,
    `${label} — lance total: ${money(result.totalBidAmount)} (${text(result.totalBidPercent)}%)`,
    `${label} — taxa de administração: ${money(result.administrationFee)}`,
    `${label} — status do cálculo: ${result.calculationStatus}`,
  ];
  const missing: string[] = [];
  if (result.adherenceScore === null || result.adherenceScore === undefined)
    missing.push(`${label}: aderência não calculada`);
  else facts.push(`${label} — aderência: ${result.adherenceScore}`);
  for (const warning of result.calculationWarnings.slice(0, 3))
    facts.push(`${label} — aviso: ${warning}`);
  for (const assumption of result.assumptions.slice(0, 3))
    facts.push(`${label} — premissa: ${assumption}`);
  return { facts, missing };
}

/**
 * Loads only data the authenticated actor may already see, reusing the
 * existing services (which enforce OWN/TEAM/ALL and answer 404 out of scope).
 * The model never receives raw Prisma rows — only minimal DTO facts.
 */
export class AiContextBuilder {
  constructor(private readonly deps: AiContextBuilderDeps) {}

  async buildKnowledgeContext(
    actor: AuthContext,
    question: string,
    limit = 5,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.knowledgeService) return EMPTY_AUTHORIZED_FACTS;
    return this.deps.knowledgeService.buildKnowledgeFacts(actor, question, limit);
  }

  async buildCommercialManagement(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.commercialIntelligenceService) return EMPTY_AUTHORIZED_FACTS;
    const data = await this.deps.commercialIntelligenceService.overview(actor, { period: '30d' });
    const facts = [
      `Escopo: ${data.scope}; periodo: ${data.period.label}.`,
      `Clientes ativos: ${data.summary.activeClients}.`,
      `Follow-ups pendentes: ${data.summary.pendingFollowUps}; atrasados: ${data.summary.overdueFollowUps}.`,
      `Simulacoes: ${data.summary.simulations.current}; propostas: ${data.summary.proposals.current}; aceitas: ${data.summary.acceptedProposals.current}.`,
      `Vendas abertas: ${data.summary.openSales}; concluidas no periodo: ${data.summary.completedSales.current}.`,
      `Vendas com documentos pendentes: ${data.summary.pendingDocuments}; contratos pendentes: ${data.summary.pendingContracts}.`,
      ...data.conversions.map((x) => `${x.label}: ${x.numerator} de ${x.denominator}${x.rate === null ? ' (sem denominador)' : ` (${(x.rate * 100).toFixed(1)}%)`}.`),
    ];
    if (data.financial) facts.push(`Comissao prevista: R$ ${data.financial.expected}; confirmada: R$ ${data.financial.confirmed}; recebida: R$ ${data.financial.received}; saldo confirmado a receber: R$ ${data.financial.confirmedReceivable}.`);
    return {
      facts,
      attentionPoints: data.attention.map((x) => `${x.count} - ${x.reason}`),
      missingInformation: [],
      sources: data.sources.map((label) => ({ kind: label, label })),
    };
  }

  async buildLeadContext(
    actor: AuthContext,
    leadId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.leadsService) return EMPTY_AUTHORIZED_FACTS;
    const lead: LeadDetail = await this.deps.leadsService.get(actor, leadId);
    const facts = [
      `Lead: ${lead.nome}`,
      `Status: ${lead.status}`,
      `Categoria de interesse: ${text(lead.categoriaInteresse)}`,
      `Crédito desejado: ${money(lead.valorCreditoDesejado)}`,
      `Parcela máxima: ${money(lead.parcelaMaxima)}`,
      `Prazo: ${lead.prazoMinimo ?? '?'} a ${lead.prazoMaximo ?? '?'} meses`,
      `Lance disponível: ${text(lead.lanceDisponivelPercentual)}%`,
      `Responsável: ${lead.responsavel ? firstName(lead.responsavel.nome) : NOT_INFORMED}`,
      `Próximo contato: ${lead.proximoContatoEm ?? NOT_INFORMED}`,
      `Observações: ${maskedNote(lead.observacoes)}`,
    ];
    for (const interest of lead.interesses.slice(0, 5)) {
      facts.push(
        `Interesse: ${interest.administradora} ${interest.grupo} (aderência capturada: ${interest.indiceAderenciaCapturado ?? NOT_INFORMED})`,
      );
    }
    for (const interaction of lead.interacoes.slice(-3)) {
      facts.push(
        `Interação (${interaction.tipo}): ${maskedNote(interaction.descricao)}`,
      );
    }
    const missingInformation: string[] = [];
    if (!lead.parcelaMaxima) missingInformation.push('parcela mensal confortável');
    if (!lead.lanceDisponivelPercentual) missingInformation.push('recurso disponível para lance');
    if (lead.prazoMinimo === null || lead.prazoMaximo === null)
      missingInformation.push('prazo desejado de aquisição');
    if (!lead.proximoContatoEm) missingInformation.push('data do próximo contato');
    if (!lead.categoriaInteresse) missingInformation.push('categoria de interesse');
    const attentionPoints: string[] = [];
    if (lead.atrasado) attentionPoints.push('Follow-up vencido: este lead está com retorno em atraso.');
    if (!lead.proximoContatoEm && lead.status !== 'CONVERTIDO' && lead.status !== 'PERDIDO')
      attentionPoints.push('Sem próximo contato agendado.');
    return {
      attentionPoints,
      facts,
      missingInformation,
      sources: [{ kind: 'Lead', label: `Lead — ${firstName(lead.nome)}` }],
    };
  }

  async searchMyLeads(
    actor: AuthContext,
    limit = 10,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.leadsService) return EMPTY_AUTHORIZED_FACTS;
    const page = await this.deps.leadsService.list(actor, {
      page: 1,
      pageSize: Math.min(Math.max(limit, 1), 20),
      sort: 'proximoContato',
    });
    const facts = [
      `Leads no seu escopo: ${page.total}`,
      `Com retorno em atraso: ${page.summary.atrasados}`,
      `Sem responsável: ${page.summary.semResponsavel}`,
    ];
    for (const item of page.items.slice(0, 10)) {
      facts.push(
        `${item.nome} — ${item.status} — próximo contato: ${item.proximoContatoEm ?? NOT_INFORMED}`,
      );
    }
    const attentionPoints: string[] = [];
    if (page.summary.atrasados > 0)
      attentionPoints.push(`${page.summary.atrasados} lead(s) com follow-up vencido.`);
    const incomplete = page.items.filter(
      (item) => !item.parcelaMaxima || item.prazoMaximo === null,
    ).length;
    if (incomplete > 0)
      attentionPoints.push(`${incomplete} lead(s) com perfil incompleto (parcela ou prazo).`);
    return {
      attentionPoints,
      facts,
      missingInformation:
        page.total === 0 ? ['Nenhum lead no seu escopo atual.'] : [],
      sources: [{ kind: 'CRM', label: 'Carteira de leads do seu escopo' }],
    };
  }

  async buildSimulationContext(
    actor: AuthContext,
    simulationId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.simulationsService) return EMPTY_AUTHORIZED_FACTS;
    const simulation: SimulationDetail = await this.deps.simulationsService.get(
      actor,
      simulationId,
    );
    const facts = [
      `Simulação ${simulation.number} — categoria: ${simulation.category}`,
      `Crédito desejado: ${money(simulation.requestedCredit)}`,
      `Prazo desejado: ${simulation.desiredTermMonths} meses`,
      `Lance próprio: ${money(simulation.ownBidAmount)} — lance embutido: ${text(simulation.embeddedBidPercent)}%`,
      `Status: ${simulation.status}`,
      `Lead vinculado: ${simulation.leadName ? firstName(simulation.leadName) : NOT_INFORMED}`,
      `Criada em: ${simulation.createdAt}`,
    ];
    const missingInformation: string[] = [];
    const attentionPoints: string[] = [];
    const sources: AiSource[] = [
      { kind: 'Simulação', label: `Simulação ${simulation.number}` },
    ];
    const allResults = scenariosOf(simulation).flatMap((scenario) =>
      scenario.results.map((result) => ({ result, scenario: scenario.name })),
    );
    if (allResults.length === 0) {
      missingInformation.push('Nenhum resultado calculado para esta simulação.');
      return { attentionPoints, facts, missingInformation, sources };
    }
    for (const { result, scenario } of allResults.slice(0, 5)) {
      const label = `Resultado ${result.administratorName ?? 'alternativa'} (${scenario})`;
      const built = resultFacts(label, result);
      facts.push(...built.facts);
      missingInformation.push(...built.missing);
      sources.push({
        kind: 'Resultado',
        label: `${result.administratorName ?? 'Alternativa'} ${result.groupCode ?? ''} ${result.quotaNumber ?? ''}`.trim(),
      });
      if (result.calculationStatus !== 'COMPLETE')
        attentionPoints.push(`${label}: cálculo ${result.calculationStatus}.`);
    }
    if (allResults.length > 5)
      facts.push(`E mais ${allResults.length - 5} resultado(s) nesta simulação.`);
    return { attentionPoints, facts, missingInformation, sources };
  }

  async explainAdherence(
    actor: AuthContext,
    simulationId: string,
    resultId?: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.simulationsService) return EMPTY_AUTHORIZED_FACTS;
    const simulation = await this.deps.simulationsService.get(actor, simulationId);
    const allResults = scenariosOf(simulation).flatMap((scenario) => scenario.results);
    const scored = allResults.filter(
      (item) => item.adherenceScore !== null && item.adherenceScore !== undefined,
    );
    if (scored.length === 0) {
      return {
        attentionPoints: [],
        facts: [`Simulação ${simulation.number} sem aderência calculada.`],
        missingInformation: ['Aderência não calculada para os resultados.'],
        sources: [{ kind: 'Simulação', label: `Simulação ${simulation.number}` }],
      };
    }
    const target =
      (resultId
        ? scored.find((item) => item.id === resultId)
        : [...scored].sort(
            (a, b) => (b.adherenceScore ?? 0) - (a.adherenceScore ?? 0),
          )[0]) ?? scored[0];
    if (!target) {
      return {
        attentionPoints: [],
        facts: [],
        missingInformation: ['Resultado não encontrado nesta simulação.'],
        sources: [{ kind: 'Simulação', label: `Simulação ${simulation.number}` }],
      };
    }
    return {
      attentionPoints:
        target.calculationStatus !== 'COMPLETE'
          ? [`Aderência calculada sobre resultado com status ${target.calculationStatus}.`]
          : [],
      facts: [
        `Aderência (snapshot armazenado, sem recálculo): ${target.adherenceScore}`,
        `Alternativa: ${text(target.administratorName)} ${text(target.groupCode)} ${text(target.quotaNumber)}`,
        `Parcela inicial: ${money(target.initialInstallment)} — crédito líquido: ${money(target.netCredit)}`,
        `Destaques do cálculo: ${(target.badges ?? []).join(', ') || 'nenhum'}`,
      ],
      missingInformation: [
        'Decomposição detalhada por critério indisponível no snapshot; valores acima são os armazenados no cálculo original.',
      ],
      sources: [
        { kind: 'Índice de Aderência', label: `Aderência ${target.adherenceScore} (snapshot)` },
      ],
    };
  }

  async compareResults(
    actor: AuthContext,
    simulationId: string,
    resultIds: readonly string[],
  ): Promise<AiAuthorizedFacts> {
    if (resultIds.length > MAX_COMPARISON_RESULTS) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: `Selecione no máximo ${MAX_COMPARISON_RESULTS} resultados.`,
        statusCode: 400,
      });
    }
    if (!this.deps.simulationsService) return EMPTY_AUTHORIZED_FACTS;
    const simulation = await this.deps.simulationsService.get(actor, simulationId);
    const byId = new Map(
      scenariosOf(simulation).flatMap((scenario) => scenario.results).map((result) => [result.id, result]),
    );
    const missing = resultIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new AppError({
        code: 'SIMULATION_NOT_FOUND',
        message: 'Um ou mais resultados não pertencem a esta simulação.',
        statusCode: 404,
      });
    }
    const facts = [
      `Comparação de ${resultIds.length} resultado(s) da simulação ${simulation.number} (snapshots originais, sem recálculo).`,
    ];
    const missingInformation: string[] = [];
    const sources: AiSource[] = [
      { kind: 'Simulação', label: `Simulação ${simulation.number}` },
    ];
    resultIds.forEach((id, index) => {
      const result = byId.get(id);
      if (!result) return;
      const label = `Alternativa ${String.fromCharCode(65 + index)}`;
      const built = resultFacts(label, result);
      facts.push(...built.facts);
      missingInformation.push(...built.missing);
      sources.push({
        kind: 'Resultado',
        label: `${result.administratorName ?? 'Alternativa'} ${result.groupCode ?? ''} ${result.quotaNumber ?? ''}`.trim(),
      });
    });
    return { attentionPoints: [], facts, missingInformation, sources };
  }

  async buildProposalContext(
    actor: AuthContext,
    proposalId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.proposalsService) return EMPTY_AUTHORIZED_FACTS;
    const proposal: ProposalDetail = await this.deps.proposalsService.get(
      actor,
      proposalId,
    );
    const facts = [
      `Proposta ${proposal.number} (versão ${proposal.version}) — status: ${proposal.status}`,
      `Título: ${text(proposal.title)}`,
      `Cliente: ${proposal.clientName ? firstName(proposal.clientName) : NOT_INFORMED}`,
      `Validade: ${proposal.validUntil ?? NOT_INFORMED}`,
      `Resumo do objetivo: ${maskedNote(proposal.objectiveSummary)}`,
    ];
    const missingInformation: string[] = [];
    const sources: AiSource[] = [
      { kind: 'Proposta', label: `Proposta ${proposal.number}` },
    ];
    for (const [index, item] of proposal.items.slice(0, 5).entries()) {
      const snapshot = item.financialSnapshot;
      facts.push(
        `Item ${index + 1} ${item.description} (snapshot original): crédito ${money(snapshot?.contractedCredit ?? null)} — parcela ${money(snapshot?.initialInstallment ?? null)} — prazo ${snapshot?.remainingTermMonths ?? NOT_INFORMED} meses`,
      );
    }
    for (const event of proposal.statusHistory.slice(-5)) {
      facts.push(
        `Histórico: ${event.fromStatus ?? 'criação'} → ${event.toStatus}${event.reason ? ` — ${event.reason}` : ''}`,
      );
    }
    if (proposal.items.length > 5)
      facts.push(`E mais ${proposal.items.length - 5} item(ns) nesta proposta.`);
    if (proposal.items.length === 0)
      missingInformation.push('Proposta sem itens.');
    return { attentionPoints: [], facts, missingInformation, sources };
  }

  async buildCustomer360(
    actor: AuthContext,
    leadId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.portfolioService) return EMPTY_AUTHORIZED_FACTS;
    const overview = await this.deps.portfolioService.customer360(actor, leadId);
    const lead = overview.lead;
    const facts = [
      `Cliente: ${lead.nome} — status: ${lead.status}`,
      `Categoria: ${text(lead.categoriaInteresse)} — crédito desejado: ${money(lead.valorCreditoDesejado)}`,
      `Parcela máxima: ${money(lead.parcelaMaxima)} — prazo: ${lead.prazoMinimo ?? '?'} a ${lead.prazoMaximo ?? '?'} meses`,
      `Lance disponível: ${text(lead.lanceDisponivelPercentual)}%`,
      `Objetivo: ${text(lead.objetivo)}`,
      `Data pretendida de aquisição: ${lead.dataPretendidaAquisicao ?? NOT_INFORMED}`,
      `Restrições: ${text(lead.restricoes)}`,
      `Responsável: ${lead.responsavel ? firstName(lead.responsavel.nome) : NOT_INFORMED}`,
      `Perfil comercial: ${overview.completeness.percent}% completo`,
      `Jornada: ${overview.simulationCount} simulação(ões), ${overview.proposalCount} proposta(s)`,
    ];
    for (const item of overview.recentTimeline.slice(0, 8)) {
      facts.push(`Histórico: ${item.summary}`);
    }
    for (const followUp of overview.activeFollowUps.slice(0, 5)) {
      facts.push(
        `Follow-up pendente: ${followUp.title} — vencimento ${followUp.dueAt}${followUp.isOverdue ? ' (em atraso)' : ''}`,
      );
    }
    return {
      attentionPoints: overview.activeFollowUps.some((item) => item.isOverdue)
        ? ['Existe follow-up em atraso para este cliente.']
        : [],
      facts,
      missingInformation: overview.completeness.missingFields.map(
        (field) => `Informação faltante: ${field}`,
      ),
      sources: [
        { kind: 'Cliente', label: `Cliente — ${firstName(lead.nome)}` },
        { kind: 'Interações', label: 'Histórico de interações' },
        { kind: 'Simulações', label: `${overview.simulationCount} simulação(ões)` },
        { kind: 'Propostas', label: `${overview.proposalCount} proposta(s)` },
      ],
    };
  }

  async getMyFollowUpsFacts(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.portfolioService) return EMPTY_AUTHORIZED_FACTS;
    const board = await this.deps.portfolioService.myFollowUps(actor);
    const facts = [
      `Follow-ups vencidos: ${board.overdue.length}`,
      `Follow-ups para hoje: ${board.today.length}`,
      `Próximos follow-ups: ${board.upcoming.length}`,
    ];
    for (const item of [...board.overdue, ...board.today].slice(0, 10)) {
      facts.push(
        `${item.isOverdue ? 'Em atraso' : 'Hoje'}: ${item.title} — ${item.lead.nome} — vencimento ${item.dueAt}`,
      );
    }
    return {
      attentionPoints:
        board.overdue.length > 0
          ? [`${board.overdue.length} follow-up(s) em atraso.`]
          : [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Follow-ups', label: 'Meus follow-ups' }],
    };
  }

  async getPortfolioFacts(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.portfolioService) return EMPTY_AUTHORIZED_FACTS;
    const summary = await this.deps.portfolioService.summary(actor);
    return {
      attentionPoints:
        summary.overdueFollowUps > 0
          ? [`${summary.overdueFollowUps} follow-up(s) vencido(s) na carteira.`]
          : [],
      facts: [
        `Clientes na carteira: ${summary.totalLeads}`,
        `Follow-ups vencidos: ${summary.overdueFollowUps}`,
        `Follow-ups para hoje: ${summary.followUpsToday}`,
        `Propostas aguardando retorno: ${summary.proposalsAwaiting}`,
        `Clientes sem contato recente: ${summary.staleContacts}`,
        `Perfis incompletos: ${summary.incompleteProfiles}`,
      ],
      missingInformation: [],
      sources: [{ kind: 'Carteira', label: 'Resumo da carteira' }],
    };
  }

  async getMyAgendaFacts(
    actor: AuthContext,
    days = 7,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.agendaService) return EMPTY_AUTHORIZED_FACTS;
    const agenda = await this.deps.agendaService.getAgenda(actor, {
      days,
      page: 1,
      pageSize: 50,
    });
    const facts = [
      `Follow-ups vencidos: ${agenda.totals.overdue}`,
      `Follow-ups para hoje: ${agenda.totals.today}`,
      `Próximos follow-ups: ${agenda.totals.upcoming}`,
      `Propostas aguardando retorno: ${agenda.totals.proposalsAwaiting}`,
      `Clientes sem próxima ação: ${agenda.totals.noNextAction}`,
    ];
    const sequence = [
      ...agenda.overdue.slice(0, 5),
      ...agenda.today.slice(0, 5),
      ...agenda.proposalsAwaiting.slice(0, 3),
    ];
    for (const item of sequence) {
      facts.push(`Prioridade ${item.priority}: ${item.leadNome} — ${item.reason}`);
    }
    return {
      attentionPoints:
        agenda.totals.overdue > 0
          ? [`${agenda.totals.overdue} follow-up(s) em atraso.`]
          : [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Agenda', label: 'Minha agenda operacional' }],
    };
  }

  async getTeamAgendaFacts(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.agendaService) return EMPTY_AUTHORIZED_FACTS;
    const agenda = await this.deps.agendaService.getTeamAgenda(actor, {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    const facts = [
      `Follow-ups vencidos na equipe: ${agenda.totals.overdue}`,
      `Follow-ups para hoje: ${agenda.totals.today}`,
      `Propostas aguardando: ${agenda.totals.proposalsAwaiting}`,
      `Atividades concluídas hoje: ${agenda.completedToday}`,
    ];
    for (const entry of agenda.distribution.slice(0, 10)) {
      facts.push(`${entry.nome}: ${entry.overdue} em atraso, ${entry.today} para hoje`);
    }
    for (const member of agenda.withoutFutureAgenda.slice(0, 10)) {
      facts.push(`${member.nome} sem agenda futura.`);
    }
    return {
      attentionPoints:
        agenda.totals.overdue > 0
          ? [`${agenda.totals.overdue} follow-up(s) em atraso na equipe.`]
          : [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Agenda', label: 'Agenda da equipe' }],
    };
  }

  async getAttentionFacts(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.agendaService) return EMPTY_AUTHORIZED_FACTS;
    const agenda = await this.deps.agendaService.getAgenda(actor, {
      days: 7,
      page: 1,
      pageSize: 50,
    });
    const facts: string[] = [];
    for (const item of [...agenda.overdue, ...agenda.today].slice(0, 10)) {
      facts.push(`${item.kind}: ${item.leadNome} — ${item.reason}`);
    }
    for (const item of [...agenda.proposalsAwaiting, ...agenda.noNextAction].slice(0, 5)) {
      facts.push(`${item.kind}: ${item.leadNome} — ${item.reason}`);
    }
    return {
      attentionPoints:
        agenda.totals.overdue > 0
          ? [`${agenda.totals.overdue} item(ns) exigem atenção imediata.`]
          : [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Agenda', label: 'Itens que exigem atenção' }],
    };
  }

  async buildDashboardSummary(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.leadsService) return EMPTY_AUTHORIZED_FACTS;
    const page = await this.deps.leadsService.list(actor, {
      page: 1,
      pageSize: 1,
      sort: 'maisRecentes',
    });
    const facts = [
      `Leads no seu escopo: ${page.total}`,
      `Novos: ${page.summary.NOVO} — em atendimento: ${page.summary.EM_ATENDIMENTO} — qualificados: ${page.summary.QUALIFICADO}`,
      `Em negociação: ${page.summary.NEGOCIACAO} — com proposta: ${page.summary.PROPOSTA}`,
      `Convertidos: ${page.summary.CONVERTIDO} — perdidos: ${page.summary.PERDIDO}`,
      `Follow-ups vencidos: ${page.summary.atrasados}`,
    ];
    return {
      attentionPoints:
        page.summary.atrasados > 0
          ? [`${page.summary.atrasados} follow-up(s) vencido(s) no seu escopo.`]
          : [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Painel', label: 'Resumo do funil do seu escopo' }],
    };
  }

  /**
   * Venda autorizada (somente leitura). Comissão só aparece com
   * commissions.read — segregação financeira também na IA.
   */
  async buildSaleContext(
    actor: AuthContext,
    saleId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.salesService) return EMPTY_AUTHORIZED_FACTS;
    const sale = await this.deps.salesService.get(actor, saleId);
    const facts = [
      `Venda: ${sale.numero} — status: ${sale.status}`,
      `Cliente: ${firstName(sale.lead?.nome ?? 'cliente')}`,
      `Origem: ${sale.origemVenda}${sale.canalVenda ? ` (${sale.canalVenda})` : ''}`,
      `Crédito contratado: ${money(sale.valorCreditoContratado)}`,
      `Parcela contratada: ${money(sale.valorParcelaContratada)}`,
      `Prazo contratado: ${sale.prazoContratado ?? NOT_INFORMED} meses`,
      `Responsável: ${sale.responsavel ? firstName(sale.responsavel.nome) : NOT_INFORMED}`,
      `Proposta de origem: ${text(sale.proposalNumero)}`,
      `Documentos: ${sale.documents.map((d) => `${d.tipo}=${d.status}`).join(', ') || NOT_INFORMED}`,
      `Contratos: ${sale.contracts.map((c) => `${c.numeroContrato ?? c.id.slice(0, 8)}=${c.statusContrato}`).join(', ') || NOT_INFORMED}`,
    ];
    const missingInformation: string[] = [];
    for (const doc of sale.documents.filter((d) => d.obrigatorio && d.status === 'PENDENTE')) {
      missingInformation.push(`Documento pendente: ${doc.tipo}`);
    }
    const attentionPoints: string[] = [];
    if (hasPermission(actor, 'commissions.read')) {
      for (const commission of sale.commissions.slice(0, 5)) {
        facts.push(
          `Comissão ${commission.tipo}: previsto ${money(commission.valorPrevisto)}, confirmado ${money(commission.valorConfirmado)}, recebido ${money(commission.valorRecebido)} (${commission.status})`,
        );
        if (commission.valorConfirmado && commission.valorConfirmado !== commission.valorPrevisto) {
          attentionPoints.push(
            `Divergência na comissão ${commission.tipo}: previsto ${money(commission.valorPrevisto)} × confirmado ${money(commission.valorConfirmado)}.`,
          );
        }
      }
    } else {
      missingInformation.push('Comissões ocultas: sem permissão financeira.');
    }
    for (const entry of sale.statusHistory.slice(-3)) {
      facts.push(`Histórico: ${entry.fromStatus ?? '—'} → ${entry.toStatus} (${entry.createdAt})`);
    }
    return {
      attentionPoints,
      facts,
      missingInformation,
      sources: [{ kind: 'Venda', label: `Venda ${sale.numero}` }],
    };
  }

  async buildCommissionContext(
    actor: AuthContext,
    commissionId: string,
  ): Promise<AiAuthorizedFacts> {
    if (!this.deps.commissionsService) return EMPTY_AUTHORIZED_FACTS;
    if (!hasPermission(actor, 'commissions.read')) return EMPTY_AUTHORIZED_FACTS;
    const rows = await this.deps.commissionsService.list(actor, {
      page: 1,
      pageSize: 100,
    });
    const commission = rows.items.find((item) => item.id === commissionId);
    if (!commission) return EMPTY_AUTHORIZED_FACTS;
    return {
      attentionPoints:
        commission.valorConfirmado && commission.valorConfirmado !== commission.valorPrevisto
          ? [`Divergência: previsto ${money(commission.valorPrevisto)} × confirmado ${money(commission.valorConfirmado)}.`]
          : [],
      facts: [
        `Comissão ${commission.tipo} — status: ${commission.status}`,
        `Base: ${commission.baseCalculo} de ${money(commission.baseValor)}`,
        `Previsto: ${money(commission.valorPrevisto)}`,
        `Confirmado: ${money(commission.valorConfirmado)}`,
        `Recebido: ${money(commission.valorRecebido)}`,
        `Competência: ${commission.competencia}`,
      ],
      missingInformation: [],
      sources: [{ kind: 'Comissão', label: `Comissão ${commission.tipo}` }],
    };
  }

  async getMySalesPipeline(actor: AuthContext): Promise<AiAuthorizedFacts> {
    if (!this.deps.salesService) return EMPTY_AUTHORIZED_FACTS;
    const page = await this.deps.salesService.list(actor, { page: 1, pageSize: 100 });
    const byStatus = new Map<string, number>();
    for (const sale of page.items) {
      byStatus.set(sale.status, (byStatus.get(sale.status) ?? 0) + 1);
    }
    const facts = [`Vendas no seu escopo: ${page.total}`];
    for (const [status, count] of byStatus) {
      facts.push(`${status}: ${count}`);
    }
    for (const sale of page.items.slice(0, 5)) {
      facts.push(`Venda ${sale.numero}: ${sale.status} — crédito ${money(sale.valorCreditoContratado)}`);
    }
    return {
      attentionPoints: [],
      facts,
      missingInformation: [],
      sources: [{ kind: 'Vendas', label: 'Pipeline do seu escopo' }],
    };
  }
}
