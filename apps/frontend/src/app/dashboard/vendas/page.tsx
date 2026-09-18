import { saleStatuses } from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getSales } from '../../../services/api/sales';

export const dynamic = 'force-dynamic';

const SALE_READ = ['sales.read_own', 'sales.read_team', 'sales.read_all'] as const;

const statusLabels: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_DOCUMENTOS: 'Aguard. documentos',
  DOCUMENTOS_RECEBIDOS: 'Docs recebidos',
  ENVIADA_ADMINISTRADORA: 'Enviada adm.',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  CONTRATADA: 'Contratada',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
};

function money(value: string | null) {
  if (!value) return 'Não informado';
  return `R$ ${value}`;
}

export default async function VendasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!SALE_READ.some((permission) => identity.permissions.includes(permission)))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const page = Number(raw.page) > 0 ? Number(raw.page) : 1;
  const search = raw.search || undefined;
  const status = saleStatuses.includes(raw.status as never)
    ? (raw.status as (typeof saleStatuses)[number])
    : undefined;
  const periodoDe = raw.periodoDe || undefined;
  const periodoAte = raw.periodoAte || undefined;
  const [sales, emAnalise, contratadas, aguardandoDocs] = await Promise.all([
    getSales({
      page,
      pageSize: 20,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(periodoDe ? { periodoDe } : {}),
      ...(periodoAte ? { periodoAte } : {}),
    }),
    getSales({ page: 1, pageSize: 1, status: 'EM_ANALISE' }),
    getSales({ page: 1, pageSize: 1, status: 'CONTRATADA' }),
    getSales({ page: 1, pageSize: 1, status: 'AGUARDANDO_DOCUMENTOS' }),
  ]);
  if (sales === 'unauthorized') redirect('/login');
  if (sales === 'forbidden') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Pós-proposta"
        title="Vendas"
        description="Operações de venda a partir de propostas aceitas, com valores congelados no snapshot."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Vendas no escopo</p>
          <p className="text-2xl font-semibold">{sales.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Aguardando documentos</p>
          <p className="text-2xl font-semibold">
            {typeof aguardandoDocs === 'string' ? '—' : aguardandoDocs.total}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Em análise</p>
          <p className="text-2xl font-semibold">
            {typeof emAnalise === 'string' ? '—' : emAnalise.total}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Contratadas</p>
          <p className="text-2xl font-semibold">
            {typeof contratadas === 'string' ? '—' : contratadas.total}
          </p>
        </Card>
      </div>
      <Card className="p-5">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Venda ou cliente">
            <Input defaultValue={search} name="search" />
          </Field>
          <Field helpKey="sale.status" label="Status">
            <Select defaultValue={status ?? ''} name="status">
              <option value="">Todos</option>
              {saleStatuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item] ?? item}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.date" label="Período de">
            <Input defaultValue={periodoDe} name="periodoDe" type="date" />
          </Field>
          <Field helpKey="filter.date" label="Período até">
            <Input defaultValue={periodoAte} name="periodoAte" type="date" />
          </Field>
          <Button className="self-end" type="submit">
            Filtrar
          </Button>
        </form>
      </Card>
      {sales.items.length ? (
        <>
          <div className="grid gap-4">
            {sales.items.map((sale) => (
              <Link href={`/dashboard/vendas/${sale.id}`} key={sale.id}>
                <Card className="p-5 transition hover:border-indigo-700/30 hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-[var(--color-primary)]">
                        {sale.numero}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold">
                        {sale.lead?.nome ?? 'Cliente'}
                      </h3>
                      <p className="text-sm text-[var(--color-muted)]">
                        {sale.administradora?.nome ?? 'Administradora'} ·{' '}
                        {sale.responsavel?.nome ?? 'Sem responsável'}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone={sale.status === 'CONTRATADA' ? 'success' : sale.status === 'CANCELADA' || sale.status === 'RECUSADA' ? 'danger' : 'info'}>
                        {statusLabels[sale.status] ?? sale.status}
                      </Badge>
                      <p className="mt-2 text-sm font-semibold">
                        {money(sale.valorCreditoContratado)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination
            page={sales.page}
            params={{ search, status, periodoDe, periodoAte }}
            totalPages={sales.totalPages}
          />
        </>
      ) : (
        <Card>
          <EmptyState
            title="Nenhuma venda encontrada"
            description="Aceite uma proposta e use Gerar venda para iniciar a operação."
          />
        </Card>
      )}
    </div>
  );
}
