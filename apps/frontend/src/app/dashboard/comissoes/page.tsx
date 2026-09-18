import { commissionDifference } from '../../../lib/commission-money';
import { commissionStatuses } from '@larcarvalho/shared';
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
import { getCommissions } from '../../../services/api/sales';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  PREVISTA: 'Prevista',
  CONFIRMADA: 'Confirmada',
  PARCIALMENTE_RECEBIDA: 'Parcial',
  RECEBIDA: 'Recebida',
  CANCELADA: 'Cancelada',
  ESTORNADA: 'Estornada',
};

export default async function ComissoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('commissions.read'))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const page = Number(raw.page) > 0 ? Number(raw.page) : 1;
  const status = commissionStatuses.includes(raw.status as never)
    ? (raw.status as (typeof commissionStatuses)[number])
    : undefined;
  const competencia = raw.competencia || undefined;
  const recebida =
    raw.recebida === 'true' || raw.recebida === 'false'
      ? raw.recebida
      : undefined;
  const filters = {
    page,
    pageSize: 20,
    ...(status ? { status } : {}),
    ...(competencia ? { competencia } : {}),
    ...(recebida ? { recebida: recebida as 'true' | 'false' } : {}),
  };
  const commissions = await getCommissions(filters);
  if (commissions === 'unauthorized') redirect('/login');
  if (commissions === 'forbidden') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Financeiro comercial"
        title="Comissões"
        description="Previstas, confirmadas, recebidas e estornadas — sempre com divergências visíveis."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Previstas</p>
          <p className="text-2xl font-semibold">
            R$ {commissions.resumo.previstas}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Confirmadas</p>
          <p className="text-2xl font-semibold">
            R$ {commissions.resumo.confirmadas}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Recebidas</p>
          <p className="text-2xl font-semibold">
            R$ {commissions.resumo.recebidas}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">A receber</p>
          <p className="text-2xl font-semibold">
            R$ {commissions.resumo.aReceber}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Estornadas</p>
          <p className="text-2xl font-semibold">
            R$ {commissions.resumo.estornadas}
          </p>
        </Card>
      </div>
      <Card className="p-5">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <Select defaultValue={status ?? ''} name="status">
              <option value="">Todos</option>
              {commissionStatuses.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item] ?? item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Competência (AAAA-MM)">
            <Input
              defaultValue={competencia}
              name="competencia"
              placeholder="2026-10"
            />
          </Field>
          <Field label="Recebimento">
            <Select defaultValue={recebida ?? ''} name="recebida">
              <option value="">Todas</option>
              <option value="true">Recebidas</option>
              <option value="false">Não recebidas</option>
            </Select>
          </Field>
          <Button className="self-end" type="submit">
            Filtrar
          </Button>
        </form>
      </Card>
      {commissions.items.length ? (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
                <thead className="bg-[var(--color-surface-subtle)] text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  <tr>
                    <th className="px-5 py-3">Tipo</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Previsto</th>
                    <th className="px-5 py-3">Confirmado</th>
                    <th className="px-5 py-3">Recebido</th>
                    <th className="px-5 py-3">Diferença</th>
                    <th className="px-5 py-3">Competência</th>
                    <th className="px-5 py-3">Venda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {commissions.items.map((commission) => (
                    <tr className="hover:bg-slate-50/70" key={commission.id}>
                      <td className="px-5 py-4">{commission.tipo}</td>
                      <td className="px-5 py-4">
                        <Badge
                          tone={
                            commission.status === 'RECEBIDA'
                              ? 'success'
                              : commission.status === 'CANCELADA' ||
                                  commission.status === 'ESTORNADA'
                                ? 'danger'
                                : 'info'
                          }
                        >
                          {statusLabels[commission.status] ?? commission.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        R$ {commission.valorPrevisto}
                      </td>
                      <td className="px-5 py-4">
                        {commission.valorConfirmado
                          ? `R$ ${commission.valorConfirmado}`
                          : '—'}
                      </td>
                      <td className="px-5 py-4">
                        R$ {commission.valorRecebido}
                      </td>
                      <td className="px-5 py-4">
                        {commission.valorConfirmado &&
                        commission.valorConfirmado !==
                          commission.valorPrevisto ? (
                          <span className="font-semibold text-amber-700">
                            R${' '}
                            {commissionDifference(
                              commission.valorConfirmado,
                              commission.valorPrevisto,
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">{commission.competencia}</td>
                      <td className="px-5 py-4">
                        <Link
                          className="underline"
                          href={`/dashboard/vendas/${commission.saleId}`}
                        >
                          Abrir venda
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={commissions.page}
              params={raw}
              totalPages={commissions.totalPages}
            />
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            title="Nenhuma comissão encontrada"
            description="Lance comissões previstas a partir do detalhe da venda."
          />
        </Card>
      )}
    </div>
  );
}
