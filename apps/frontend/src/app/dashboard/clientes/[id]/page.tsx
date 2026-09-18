import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { AiAnalyzeButton } from '../../../../components/ai-analyze-button';
import { CustomerTimeline } from '../../../../components/customer-timeline';
import { FollowUpManager } from '../../../../components/follow-up-manager';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Pagination } from '../../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getCustomerOverview,
  getCustomerTimeline,
  getFollowUps,
} from '../../../../services/api/portfolio';

export const dynamic = 'force-dynamic';

const LEAD_READ = ['leads.read_own', 'leads.read_team', 'leads.read_all'] as const;

function formatDate(value: string | null) {
  if (!value) return 'Não informado';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatMoney(value: string | null) {
  if (!value) return 'Não informado';
  return `R$ ${value}`;
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!LEAD_READ.some((permission) => identity.permissions.includes(permission)))
    redirect('/dashboard/forbidden');
  const { id } = await params;
  const filters = await searchParams;
  const rawPage = Number(filters.timelinePage ?? '1');
  const timelinePage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [overview, timeline, followUps] = await Promise.all([
    getCustomerOverview(id),
    getCustomerTimeline(id, timelinePage, 20),
    getFollowUps({ leadId: id, page: 1, pageSize: 50, scope: 'all', sort: 'dueAt' }),
  ]);
  if (overview === 'unauthorized' || timeline === 'unauthorized' || followUps === 'unauthorized')
    redirect('/login');
  if (overview === 'not-found' || timeline === 'not-found' || followUps === 'not-found')
    notFound();
  if (overview === 'forbidden' || timeline === 'forbidden' || followUps === 'forbidden')
    redirect('/dashboard/forbidden');
  const lead = overview.lead;
  const canCreateFollowUp = identity.permissions.includes('leads.add_interaction');
  const canUpdateFollowUp = (
    ['leads.update_own', 'leads.update_team', 'leads.update_all'] as const
  ).some((permission) => identity.permissions.includes(permission));
  const canAnalyze = identity.permissions.includes('ai.lead_analysis');
  const pending = followUps.items.filter((item) => item.status === 'PENDING');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Cliente 360°"
        title={lead.nome}
        description={`Perfil comercial ${overview.completeness.percent}% completo · ${overview.simulationCount} simulação(ões) · ${overview.proposalCount} proposta(s) · ${overview.saleCount} venda(s)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{lead.status.replaceAll('_', ' ')}</Badge>
            {canAnalyze ? (
              <AiAnalyzeButton
                contextId={id}
                contextType="LEAD"
                label="Resumir cliente"
                message="Resuma este cliente"
                promptId="customer-360"
              />
            ) : null}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-2 p-5">
            <h3 className="font-semibold">Jornada do cliente</h3>
            <CustomerTimeline items={timeline.items} />
            <Pagination page={timeline.page} params={filters} totalPages={timeline.totalPages} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="space-y-2 p-5">
            <h3 className="font-semibold">Perfil comercial</h3>
            <dl className="grid gap-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Telefone</dt><dd>{lead.telefone ?? 'Não informado'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">E-mail</dt><dd className="max-w-44 truncate">{lead.email ?? 'Não informado'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Origem</dt><dd>{lead.origem}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Responsável</dt><dd>{lead.responsavel?.nome ?? 'Sem responsável'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Categoria</dt><dd>{lead.categoriaInteresse ?? 'Não informado'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Crédito desejado</dt><dd>{formatMoney(lead.valorCreditoDesejado)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Parcela máxima</dt><dd>{formatMoney(lead.parcelaMaxima)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Prazo</dt><dd>{lead.prazoMinimo ?? '?'} a {lead.prazoMaximo ?? '?'} meses</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Lance</dt><dd>{lead.lanceDisponivelPercentual ? `${lead.lanceDisponivelPercentual}%` : 'Não informado'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Objetivo</dt><dd className="max-w-44 truncate">{lead.objetivo ?? 'Não informado'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Aquisição pretendida</dt><dd>{formatDate(lead.dataPretendidaAquisicao)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-[var(--color-muted)]">Próximo contato</dt><dd>{lead.proximoContatoEm ? new Date(lead.proximoContatoEm).toLocaleString('pt-BR') : 'Não informado'}</dd></div>
            </dl>
            {overview.completeness.missingFields.length > 0 ? (
              <div>
                <h4 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  Informações faltantes
                </h4>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {overview.completeness.missingFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Link className="text-sm underline" href={`/dashboard/crm/leads/${lead.id}`}>
              Abrir no CRM
            </Link>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">Próximos passos</h3>
            <FollowUpManager
              canCreate={canCreateFollowUp}
              canUpdate={canUpdateFollowUp}
              items={pending}
              leadId={id}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
