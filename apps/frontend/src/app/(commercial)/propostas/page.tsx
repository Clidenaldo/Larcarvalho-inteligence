import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getProposals } from '../../../services/api/commercial';
import { getAdministradoras } from '../../../services/api/administradoras';
import { getLeads } from '../../../services/api/leads';
import { getUsers } from '../../../services/api/users';

export default async function ProposalsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const page =
    typeof raw.page === 'string' &&
    Number.isInteger(Number(raw.page)) &&
    Number(raw.page) > 0
      ? Number(raw.page)
      : 1;
  const search = typeof raw.search === 'string' ? raw.search : undefined;
  const category = typeof raw.category === 'string' ? raw.category : undefined;
  const administratorId =
    typeof raw.administratorId === 'string' ? raw.administratorId : undefined;
  const leadId = typeof raw.leadId === 'string' ? raw.leadId : undefined;
  const createdById =
    typeof raw.createdById === 'string' ? raw.createdById : undefined;
  const from = typeof raw.from === 'string' ? raw.from : undefined;
  const to = typeof raw.to === 'string' ? raw.to : undefined;
  const status =
    typeof raw.status === 'string' &&
    [
      'DRAFT',
      'GENERATED',
      'SENT',
      'VIEWED',
      'ACCEPTED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED',
    ].includes(raw.status)
      ? (raw.status as 'DRAFT')
      : undefined;
  const [proposals, administrators, leads, users] = await Promise.all([
    getProposals({
      page,
      pageSize: 50,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category: category as 'IMOVEL' } : {}),
      ...(administratorId ? { administratorId } : {}),
      ...(leadId ? { leadId } : {}),
      ...(createdById ? { createdById } : {}),
      ...(from ? { from: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59.999Z`) } : {}),
    }),
    getAdministradoras({ page: 1, pageSize: 100, status: 'ativas' }),
    getLeads({ page: 1, pageSize: 100, sort: 'maisRecentes' }),
    getUsers(1, 100),
  ]);
  if (proposals === 'unauthorized') redirect('/login');
  if (proposals === 'forbidden') redirect('/dashboard/forbidden');
  if (proposals === 'not-found') redirect('/propostas');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pipeline comercial"
        title="Propostas"
        description="Consulte propostas por cliente, número, status e período sem ultrapassar os limites da carteira."
        actions={
          <Link href="/simulacoes/nova">
            <Button>Nova simulação</Button>
          </Link>
        }
      />
      <Card className="p-5">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cliente ou número">
            <Input defaultValue={search} name="search" />
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={status ?? ''} name="status">
              <option value="">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="GENERATED">Gerada</option>
              <option value="SENT">Enviada</option>
              <option value="VIEWED">Visualizada</option>
              <option value="ACCEPTED">Aceita</option>
              <option value="REJECTED">Recusada</option>
              <option value="EXPIRED">Expirada</option>
              <option value="CANCELLED">Cancelada</option>
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Cliente">
            <Select defaultValue={leadId ?? ''} name="leadId">
              <option value="">Todos</option>
              {typeof leads === 'string'
                ? null
                : leads.items.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.nome}
                    </option>
                  ))}
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Vendedor">
            <Select defaultValue={createdById ?? ''} name="createdById">
              <option value="">Todos permitidos</option>
              {typeof users === 'string'
                ? null
                : users.items.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                    </option>
                  ))}
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Categoria">
            <Select defaultValue={category ?? ''} name="category">
              <option value="">Todas</option>
              <option value="IMOVEL">Imóvel</option>
              <option value="AUTOMOVEL">Automóvel</option>
              <option value="MOTOCICLETA">Moto</option>
              <option value="PESADOS">Caminhão / Pesados</option>
              <option value="SERVICOS">Serviços</option>
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Administradora">
            <Select defaultValue={administratorId ?? ''} name="administratorId">
              <option value="">Todas</option>
              {typeof administrators === 'string'
                ? null
                : administrators.items.map((administrator) => (
                    <option key={administrator.id} value={administrator.id}>
                      {administrator.nome}
                    </option>
                  ))}
            </Select>
          </Field>
          <Field helpKey="filter.date" label="Data inicial">
            <Input defaultValue={from} name="from" type="date" />
          </Field>
          <Field helpKey="filter.date" label="Data final">
            <Input defaultValue={to} name="to" type="date" />
          </Field>
          <Button className="self-end" type="submit">
            Filtrar
          </Button>
        </form>
      </Card>
      {proposals.items.length ? (
        <>
          <div className="grid gap-4">
            {proposals.items.map((proposal) => (
              <Link href={`/propostas/${proposal.id}`} key={proposal.id}>
                <Card className="p-5 transition hover:border-indigo-700/30 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-[var(--color-primary)]">
                        {proposal.number} · v{proposal.version}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">
                        {proposal.clientName}
                      </h3>
                      <p className="text-sm text-[var(--color-muted)]">
                        {proposal.title} · {proposal.sellerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone="info">{proposal.status}</Badge>
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Válida até{' '}
                        {new Date(proposal.validUntil).toLocaleDateString(
                          'pt-BR',
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination
            page={proposals.page}
            params={{
              search,
              status,
              category,
              administratorId,
              leadId,
              createdById,
              from,
              to,
            }}
            totalPages={proposals.totalPages}
          />
        </>
      ) : (
        <Card>
          <EmptyState
            title="Nenhuma proposta encontrada"
            description="Crie uma simulação e selecione até três cenários completos."
          />
        </Card>
      )}
    </div>
  );
}
