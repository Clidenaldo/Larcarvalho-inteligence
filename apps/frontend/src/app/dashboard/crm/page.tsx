import { HelpLabel } from '../../../components/ui/field-help';
import {
  leadListQuerySchema,
  leadOrigins,
  leadStatuses,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LeadCreateForm } from '../../../components/lead-create-form';
import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getLeads } from '../../../services/api/leads';

export const dynamic = 'force-dynamic';
const labels: Record<string, string> = {
  NOVO: 'Novos',
  EM_ATENDIMENTO: 'Em atendimento',
  CONTATO_REALIZADO: 'Contato realizado',
  QUALIFICADO: 'Qualificados',
  PROPOSTA: 'Propostas',
  NEGOCIACAO: 'Negociação',
  CONVERTIDO: 'Convertidos',
  PERDIDO: 'Perdidos',
};
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Fortaleza',
      }).format(new Date(value))
    : 'Não definido';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (
    !identity.permissions.some(
      (permission) =>
        permission === 'leads.read_all' ||
        permission === 'leads.read_team' ||
        permission === 'leads.read_own',
    )
  )
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const query = leadListQuerySchema.parse(raw);
  const result = await getLeads(query);
  if (result === 'unauthorized') redirect('/login');
  if (result === 'forbidden') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Relacionamento comercial"
        title={identity.user.role === 'VENDEDOR' ? 'Meus leads' : 'CRM'}
        description="Acompanhe contatos, interesses e etapas reais do funil comercial."
      />
      {identity.permissions.includes('leads.create') ? (
        <LeadCreateForm />
      ) : null}
      <section
        aria-label="Resumo do funil"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {leadStatuses.map((status) => (
          <Card className="p-4" key={status}>
            <p className="text-xs text-[var(--color-muted)]">
              {labels[status]}
            </p>
            <strong className="mt-1 block text-2xl">
              {result.summary[status]}
            </strong>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Sem responsável</p>
          <strong className="mt-1 block text-2xl">
            {result.summary.semResponsavel}
          </strong>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">
            Contatos atrasados
          </p>
          <strong className="mt-1 block text-2xl text-[var(--color-danger)]">
            {result.summary.atrasados}
          </strong>
        </Card>
      </section>
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Field label="Busca">
            <Input
              defaultValue={query.busca}
              name="busca"
              placeholder="Nome, telefone ou e-mail"
            />
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={query.status} name="status">
              <option value="">Todos</option>
              {leadStatuses.map((item) => (
                <option key={item} value={item}>
                  {labels[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.origin" label="Origem">
            <Select defaultValue={query.origem} name="origem">
              <option value="">Todas</option>
              {leadOrigins.map((item) => (
                <option key={item}>{item.replaceAll('_', ' ')}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.nextContact" label="Próximo contato">
            <Select defaultValue={query.proximoContato} name="proximoContato">
              <option value="">Todos</option>
              <option value="HOJE">Hoje</option>
              <option value="ATRASADO">Atrasados</option>
              <option value="FUTURO">Futuros</option>
            </Select>
          </Field>
          <Field helpKey="filter.sort" label="Ordenação">
            <Select defaultValue={query.sort} name="sort">
              <option value="maisRecentes">Mais recentes</option>
              <option value="maisAntigos">Mais antigos</option>
              <option value="proximoContato">Próximo contato</option>
              <option value="nome">Nome</option>
              <option value="status">Status</option>
            </Select>
          </Field>
          {identity.permissions.includes('leads.read_all') ? (
            <HelpLabel
              helpKey="filter.unassigned"
              className="flex items-center gap-2 text-sm"
            >
              <input
                defaultChecked={query.semResponsavel}
                name="semResponsavel"
                type="checkbox"
                value="true"
              />
              Somente não atribuídos
            </HelpLabel>
          ) : null}
          <Button type="submit">Filtrar</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        {result.items.length === 0 ? (
          <EmptyState
            title="Nenhum lead encontrado"
            description="Ajuste os filtros ou registre um novo contato."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="p-4">Lead</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Responsável</th>
                  <th className="p-4">Próximo contato</th>
                  <th className="p-4">Origem</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((lead) => (
                  <tr
                    className="border-t border-[var(--color-border)]"
                    key={lead.id}
                  >
                    <td className="p-4">
                      <Link
                        className="font-semibold text-[var(--color-primary)] hover:underline"
                        href={`/dashboard/crm/leads/${lead.id}`}
                      >
                        {lead.nome}
                      </Link>
                      <p className="text-xs text-[var(--color-muted)]">
                        {lead.telefone ?? lead.email}
                      </p>
                    </td>
                    <td className="p-4">
                      <Badge
                        tone={
                          lead.status === 'PERDIDO'
                            ? 'danger'
                            : lead.status === 'CONVERTIDO'
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {labels[lead.status]}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {lead.responsavel?.nome ?? 'Não atribuído'}
                    </td>
                    <td className="p-4">
                      <span
                        className={
                          lead.atrasado
                            ? 'font-semibold text-[var(--color-danger)]'
                            : ''
                        }
                      >
                        {date(lead.proximoContatoEm)}
                      </span>
                    </td>
                    <td className="p-4">{lead.origem.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination
        page={result.page}
        params={raw}
        totalPages={result.totalPages}
      />
    </div>
  );
}
