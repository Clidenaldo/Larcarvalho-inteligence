import { leadStatuses, produtoCategorias, walletQuerySchema } from '@larcarvalho/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getPortfolioSummary, getWallet } from '../../../services/api/portfolio';

export const dynamic = 'force-dynamic';

const LEAD_READ = ['leads.read_own', 'leads.read_team', 'leads.read_all'] as const;

export default async function CarteiraPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!LEAD_READ.some((permission) => identity.permissions.includes(permission)))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const filters = walletQuerySchema.parse(raw);
  const [summary, wallet] = await Promise.all([
    getPortfolioSummary(),
    getWallet(filters),
  ]);
  if (summary === 'unauthorized' || wallet === 'unauthorized') redirect('/login');
  if (summary === 'not-found' || wallet === 'not-found') notFound();
  if (summary === 'forbidden' || wallet === 'forbidden')
    redirect('/dashboard/forbidden');
  const canFilterTeam = identity.permissions.includes('leads.read_all');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Relacionamento"
        title="Minha carteira"
        description="Clientes, follow-ups e próximos passos do seu escopo autorizado."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Follow-ups hoje</p>
          <p className="text-2xl font-semibold">{summary.followUpsToday}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Atrasados</p>
          <p className="text-2xl font-semibold">{summary.overdueFollowUps}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Sem retorno recente</p>
          <p className="text-2xl font-semibold">{summary.staleContacts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Propostas aguardando</p>
          <p className="text-2xl font-semibold">{summary.proposalsAwaiting}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Perfis incompletos</p>
          <p className="text-2xl font-semibold">{summary.incompleteProfiles}</p>
        </Card>
      </div>
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" method="get">
          <Field label="Status">
            <Select name="status" defaultValue={filters.status ?? ''}>
              <option value="">Todos</option>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select name="categoria" defaultValue={filters.categoria ?? ''}>
              <option value="">Todas</option>
              {produtoCategorias.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Follow-up">
            <Select name="followUp" defaultValue={filters.followUp ?? ''}>
              <option value="">Qualquer</option>
              <option value="overdue">Em atraso</option>
              <option value="today">Para hoje</option>
              <option value="upcoming">Futuros</option>
              <option value="none">Sem follow-up</option>
            </Select>
          </Field>
          <Field label="Ordenação">
            <Select name="sort" defaultValue={filters.sort}>
              <option value="proximoFollowUp">Próximo follow-up</option>
              <option value="ultimoContato">Último contato</option>
              <option value="criacao">Criação</option>
              <option value="nome">Nome</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.comProposta === true}
              name="comProposta"
              type="checkbox"
              value="true"
            />
            Com proposta
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.comSimulacao === true}
              name="comSimulacao"
              type="checkbox"
              value="true"
            />
            Com simulação
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.semContatoRecente === true}
              name="semContatoRecente"
              type="checkbox"
              value="true"
            />
            Sem contato recente (7 dias)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.perfilIncompleto === true}
              name="perfilIncompleto"
              type="checkbox"
              value="true"
            />
            Perfil incompleto
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.comVenda === true}
              name="comVenda"
              type="checkbox"
              value="true"
            />
            Com venda
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.emContratacao === true}
              name="emContratacao"
              type="checkbox"
              value="true"
            />
            Em contratação
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.contratada === true}
              name="contratada"
              type="checkbox"
              value="true"
            />
            Contratada
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              defaultChecked={filters.vendaCancelada === true}
              name="vendaCancelada"
              type="checkbox"
              value="true"
            />
            Venda cancelada
          </label>
          {canFilterTeam ? (
            <Field label="Equipe (ID)">
              <Input name="teamId" defaultValue={filters.teamId ?? ''} />
            </Field>
          ) : null}
          <Button type="submit">Filtrar</Button>
        </form>
      </Card>
      {wallet.items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum cliente na carteira"
            description="Ajuste os filtros ou cadastre um novo lead no CRM."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                <tr>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Responsável</th>
                  <th className="px-5 py-3">Próximo contato</th>
                  <th className="px-5 py-3">Perfil</th>
                  <th className="px-5 py-3">Sinais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {wallet.items.map((item) => (
                  <tr className="hover:bg-slate-50/70" key={item.id}>
                    <td className="px-5 py-4">
                      <Link className="font-semibold underline" href={`/dashboard/clientes/${item.id}`}>
                        {item.nome}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone="neutral">{item.status.replaceAll('_', ' ')}</Badge>
                    </td>
                    <td className="px-5 py-4">{item.responsavel?.nome ?? 'Sem responsável'}</td>
                    <td className="px-5 py-4 text-xs">
                      {item.proximoContatoEm
                        ? new Date(item.proximoContatoEm).toLocaleString('pt-BR')
                        : 'Não informado'}
                      {item.overdueFollowUps > 0 ? (
                        <span className="ml-2 font-semibold text-[var(--color-danger)]">
                          {item.overdueFollowUps} em atraso
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">{item.completeness}%</td>
                    <td className="px-5 py-4 text-xs">
                      {[
                        item.hasProposal ? 'Proposta' : null,
                        item.hasSimulation ? 'Simulação' : null,
                        item.hasSale ? `Venda ${item.saleNumero ?? ''} (${(item.saleStatus ?? '').replaceAll('_', ' ')})` : null,
                        item.activeFollowUps > 0 ? `${item.activeFollowUps} follow-up(s)` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={wallet.page} params={raw} totalPages={wallet.totalPages} />
        </Card>
      )}
    </div>
  );
}
