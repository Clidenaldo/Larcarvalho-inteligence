import type {
  DashboardOverview,
  DashboardQuery,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { leadScope, scopedUsers, requireAccess } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import { fortalezaDayBounds } from '../leads/lead-rules.js';
import type { DashboardRepository } from './dashboard.repository.js';

export const DASHBOARD_TIME_ZONE = 'America/Fortaleza' as const;
export const SNAPSHOT_STALE_AFTER_DAYS = 7;
const DAY = 86_400_000;

const labels: Record<string, string> = {
  IMOVEL: 'Imóvel',
  AUTOMOVEL: 'Automóvel',
  MOTOCICLETA: 'Motocicleta',
  PESADOS: 'Pesados',
  SERVICOS: 'Serviços',
  OUTROS: 'Outros',
  OPEN: 'Abertas',
  IN_REVIEW: 'Em revisão',
  RESOLVED: 'Resolvidas',
  IGNORED: 'Ignoradas',
  INFO: 'Informativa',
  WARNING: 'Atenção',
  ERROR: 'Erro',
  CRITICAL: 'Crítica',
  NAO_CONFIGURADA: 'Não configurada',
  ATIVA: 'Ativa',
  PAUSADA: 'Pausada',
  ERRO: 'Erro',
  DESABILITADA: 'Desabilitada',
  PENDENTE: 'Pendente',
  EXECUTANDO: 'Executando',
  SUCESSO: 'Sucesso',
  SUCESSO_PARCIAL: 'Sucesso parcial',
  FALHA: 'Falha',
  CANCELADA: 'Cancelada',
  PRONTA: 'Pronta',
  PROCESSANDO: 'Processando',
  CONCLUIDA: 'Concluída',
  CONCLUIDA_COM_ERROS: 'Concluída com erros',
  FALHOU: 'Falhou',
  VALIDANDO: 'Validando',
  NOVO: 'Novo',
  EM_ATENDIMENTO: 'Em atendimento',
  CONTATO_REALIZADO: 'Contato realizado',
  QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta',
  NEGOCIACAO: 'Negociação',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
  SIMULADOR_PUBLICO: 'Simulador público',
  CADASTRO_MANUAL: 'Cadastro manual',
  WHATSAPP: 'WhatsApp',
  INDICACAO: 'Indicação',
  OUTRO: 'Outro',
};
const relabel = <T extends { key: string; label: string }>(items: T[]) =>
  items.map((item) => ({
    ...item,
    label: labels[item.key] ?? item.label.replaceAll('_', ' '),
  }));
const comparison = (current: number, previous: number) => ({
  current,
  previous,
  changePercent: previous === 0 ? null : (current - previous) / previous,
});

function localStart(date: string) {
  return new Date(`${date}T00:00:00-03:00`);
}
function dateLabel(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: DASHBOARD_TIME_ZONE,
  }).format(date);
}

export function resolveDashboardPeriod(
  query: DashboardQuery,
  now = new Date(),
) {
  const today = fortalezaDayBounds(now);
  let from: Date;
  let to = today.end;
  let label: string;
  if (query.period === 'custom') {
    from = localStart(query.from!);
    to = new Date(localStart(query.to!).getTime() + DAY);
    label = `${dateLabel(from)} a ${dateLabel(new Date(to.getTime() - DAY))}`;
  } else {
    const days =
      query.period === 'today' ? 1 : Number.parseInt(query.period, 10);
    from = new Date(today.start.getTime() - (days - 1) * DAY);
    label = query.period === 'today' ? 'Hoje' : `Últimos ${days} dias`;
  }
  const duration = to.getTime() - from.getTime();
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - duration),
    previousTo: from,
    label,
  };
}

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async overview(
    actor: AuthContext,
    query: DashboardQuery,
    now = new Date(),
  ): Promise<DashboardOverview> {
    requireAccess(actor, 'dashboard.read');
    const access = {
      consorcios: hasPermission(actor, 'grupos.read'),
      quality: hasPermission(actor, 'data_quality.read'),
      imports: hasPermission(actor, 'importacoes.read'),
      integrations: hasPermission(actor, 'integrations.read'),
      crmAll: hasPermission(actor, 'leads.read_all'),
      crmTeam: hasPermission(actor, 'leads.read_team'),
      crmOwn: hasPermission(actor, 'leads.read_own'),
    };
    if (
      query.responsibleId &&
      !access.crmAll && !access.crmTeam &&
      query.responsibleId !== actor.user.id
    )
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'A carteira de outro responsável não está autorizada',
        statusCode: 403,
      });
    if (query.responsibleId && !access.crmAll && !access.crmTeam && !access.crmOwn)
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso comercial não autorizado',
        statusCode: 403,
      });
    const window = resolveDashboardPeriod(query, now);
    const [
      consorciosRaw,
      qualityRaw,
      integrationsRaw,
      importsRaw,
      crmRaw,
      ops,
    ] = await Promise.all([
      access.consorcios
        ? this.repository.consorcios(now, SNAPSHOT_STALE_AFTER_DAYS)
        : null,
      access.quality ? this.repository.quality(window) : null,
      access.integrations ? this.repository.integrations(window) : null,
      access.imports ? this.repository.imports(window) : null,
      access.crmAll || access.crmTeam || access.crmOwn
        ? this.repository.crm(
            window,
            { AND: [leadScope(actor), ...(query.responsibleId ? [{ responsavelId: query.responsibleId }] : [])] },
            (access.crmAll || access.crmTeam) && !query.responsibleId,
            fortalezaDayBounds(now),
            now,
            access.crmAll ? {} : scopedUsers(actor),
          )
        : null,
      this.repository.operationalActivity({
        quality: access.quality,
        integrations: access.integrations,
        imports: access.imports,
      }),
    ]);
    const quality = qualityRaw
      ? {
          statuses: relabel(qualityRaw.statuses),
          severities: relabel(qualityRaw.severities),
          resolvedInPeriod: comparison(
            qualityRaw.currentResolved,
            qualityRaw.previousResolved,
          ),
          topRules: qualityRaw.topRules,
          criticalOpen: qualityRaw.criticalOpen,
        }
      : null;
    const integrations = integrationsRaw
      ? {
          statuses: relabel(integrationsRaw.statuses),
          runs: relabel(integrationsRaw.runs),
          successRate: integrationsRaw.successRate,
          averageDurationMs: integrationsRaw.averageDurationMs,
          processedRecords: integrationsRaw.processedRecords,
          lastSuccessAt: integrationsRaw.lastSuccessAt?.toISOString() ?? null,
          recent: integrationsRaw.recent.map((x) => ({
            id: x.id,
            label: x.integration.nome,
            status: labels[x.status] ?? x.status,
            occurredAt: x.iniciadoEm.toISOString(),
            href: `/dashboard/integracoes/${x.integration.id}`,
          })),
        }
      : null;
    const imports = importsRaw
      ? {
          statuses: relabel(importsRaw.statuses),
          processedRecords: importsRaw.processedRecords,
          generatedIssues: importsRaw.generatedIssues,
          recent: importsRaw.recent.map((x) => ({
            id: x.id,
            label: x.nomeArquivo ?? x.tipo ?? 'Importação',
            status: labels[x.status] ?? x.status,
            occurredAt: x.iniciadaEm.toISOString(),
            href: `/dashboard/importacoes/${x.id}`,
          })),
        }
      : null;
    let crm: DashboardOverview['crm'] = null;
    if (crmRaw) {
      const statusFor = (id: string, status: string) =>
        crmRaw.teamStatuses.find(
          (x) => x.responsavelId === id && x.status === status,
        )?._count._all ?? 0;
      crm = {
        scope: access.crmAll
          ? query.responsibleId
            ? 'RESPONSIBLE'
            : 'ALL'
          : access.crmTeam ? 'TEAM' : 'OWN',
        activeNow: crmRaw.activeNow,
        newInPeriod: comparison(crmRaw.currentNew, crmRaw.previousNew),
        convertedInPeriod: comparison(
          crmRaw.currentConverted,
          crmRaw.previousConverted,
        ),
        lostNow: crmRaw.lostNow,
        funnel: relabel(crmRaw.funnel),
        origins: relabel(crmRaw.origins),
        categories: relabel(crmRaw.categories),
        contacts: crmRaw.contacts,
        unassignedActive: crmRaw.unassignedActive,
        team: crmRaw.sellers.map((s) => ({
          responsibleId: s.id,
          responsible: s.nome,
          assigned: crmRaw.teamStatuses
            .filter((x) => x.responsavelId === s.id)
            .reduce((a, x) => a + x._count._all, 0),
          active: [
            'NOVO',
            'EM_ATENDIMENTO',
            'CONTATO_REALIZADO',
            'QUALIFICADO',
            'PROPOSTA',
            'NEGOCIACAO',
          ].reduce((a, x) => a + statusFor(s.id, x), 0),
          contactsPerformed:
            crmRaw.contactsPerformed.find((x) => x.criadoPorId === s.id)?._count
              ._all ?? 0,
          converted: statusFor(s.id, 'CONVERTIDO'),
          lost: statusFor(s.id, 'PERDIDO'),
          overdue:
            crmRaw.teamOverdue.find((x) => x.responsavelId === s.id)?._count
              ._all ?? 0,
        })),
      };
    }
    const consorcios = consorciosRaw
      ? { ...consorciosRaw, categories: relabel(consorciosRaw.categories) }
      : null;
    const attention: DashboardOverview['attention'] = [];
    if (quality?.criticalOpen)
      attention.push({
        id: 'critical-quality',
        severity: 'CRITICO',
        title: 'Issues críticas abertas',
        detail: 'Registros críticos abertos ou em revisão.',
        value: quality.criticalOpen,
        href: '/dashboard/qualidade-dados',
      });
    if (crm?.contacts.overdue)
      attention.push({
        id: 'overdue-contacts',
        severity: 'ALTO',
        title: 'Contatos atrasados',
        detail: 'Próximo contato anterior ao momento atual em lead ativo.',
        value: crm.contacts.overdue,
        href: '/dashboard/crm?proximoContato=ATRASADO',
      });
    if (crm?.unassignedActive)
      attention.push({
        id: 'unassigned-leads',
        severity: 'ALTO',
        title: 'Leads ativos sem responsável',
        detail: 'Leads ativos ainda não atribuídos.',
        value: crm.unassignedActive,
        href: '/dashboard/crm?semResponsavel=true',
      });
    const integrationErrors =
      integrations?.statuses.find((x) => x.key === 'ERRO')?.value ?? 0;
    if (integrationErrors)
      attention.push({
        id: 'integration-errors',
        severity: 'ALTO',
        title: 'Integrações em erro',
        detail: 'Integrações atualmente marcadas com erro.',
        value: integrationErrors,
        href: '/dashboard/integracoes?status=ERRO',
      });
    const failedRuns =
      integrations?.runs.find((x) => x.key === 'FALHA')?.value ?? 0;
    if (failedRuns)
      attention.push({
        id: 'failed-runs',
        severity: 'ALTO',
        title: 'Execuções com falha',
        detail: `Falhas em ${window.label.toLowerCase()}.`,
        value: failedRuns,
        href: '/dashboard/integracoes',
      });
    const failedImports =
      imports?.statuses.find((x) => x.key === 'FALHOU')?.value ?? 0;
    if (failedImports)
      attention.push({
        id: 'failed-imports',
        severity: 'ALTO',
        title: 'Importações com falha',
        detail: `Falhas em ${window.label.toLowerCase()}.`,
        value: failedImports,
        href: '/dashboard/importacoes',
      });
    if (consorcios?.snapshots.staleGroups)
      attention.push({
        id: 'stale-snapshots',
        severity: 'MEDIO',
        title: 'Grupos sem snapshot recente',
        detail: `Snapshot ausente ou anterior a ${SNAPSHOT_STALE_AFTER_DAYS} dias.`,
        value: consorcios.snapshots.staleGroups,
        href: '/dashboard/grupos',
      });
    const activity: DashboardOverview['activity'] = [];
    if (crmRaw) {
      for (const x of crmRaw.recentLeads)
        activity.push({
          id: `lead-${x.id}`,
          type: 'LEAD',
          label: 'Lead criado',
          detail: labels[x.status] ?? x.status,
          occurredAt: x.createdAt.toISOString(),
          href: `/dashboard/crm/leads/${x.id}`,
        });
      for (const x of crmRaw.recentInteractions)
        activity.push({
          id: `interaction-${x.id}`,
          type: 'INTERACTION',
          label: 'Interação comercial',
          detail: labels[x.tipo] ?? x.tipo,
          occurredAt: x.ocorridoEm.toISOString(),
          href: `/dashboard/crm/leads/${x.leadId}`,
        });
    }
    for (const x of ops.issues)
      activity.push({
        id: `quality-${x.id}`,
        type: 'QUALITY',
        label: 'Issue crítica',
        detail: x.codigo,
        occurredAt: x.createdAt.toISOString(),
        href: `/dashboard/qualidade-dados/${x.id}`,
      });
    for (const x of ops.runs)
      activity.push({
        id: `integration-${x.id}`,
        type: 'INTEGRATION',
        label: 'Execução de integração',
        detail: `${x.integration.nome} · ${labels[x.status] ?? x.status}`,
        occurredAt: x.iniciadoEm.toISOString(),
        href: `/dashboard/integracoes/${x.integration.id}`,
      });
    for (const x of ops.imports)
      activity.push({
        id: `import-${x.id}`,
        type: 'IMPORT',
        label: 'Importação',
        detail: `${x.tipo ?? 'Arquivo'} · ${labels[x.status] ?? x.status}`,
        occurredAt: x.iniciadaEm.toISOString(),
        href: `/dashboard/importacoes/${x.id}`,
      });
    activity.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return {
      generatedAt: now.toISOString(),
      period: {
        preset: query.period,
        label: window.label,
        timezone: DASHBOARD_TIME_ZONE,
        from: window.from.toISOString(),
        toExclusive: window.to.toISOString(),
        previousFrom: window.previousFrom.toISOString(),
        previousToExclusive: window.previousTo.toISOString(),
      },
      consorcios,
      quality,
      integrations,
      imports,
      crm,
      attention: attention.slice(0, 8),
      activity: activity.slice(0, 8),
    };
  }
}
