import { tabelaComercialItemListQuerySchema } from '@larcarvalho/shared';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { TabelaComercialDetailManager } from '../../../../components/tabela-comercial-detail-manager';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getTabelaComercial,
  getTabelaComercialItens,
} from '../../../../services/api/tabelas-comerciais';

export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('tabelas_comerciais.read'))
    redirect('/dashboard/forbidden');
  const { id } = await params;
  const query = tabelaComercialItemListQuerySchema.parse(await searchParams);
  const [table, items] = await Promise.all([
    getTabelaComercial(id),
    getTabelaComercialItens(id, query),
  ]);
  if (table === 'not-found') notFound();
  if (typeof table === 'string' || typeof items === 'string')
    redirect(
      table === 'unauthorized' || items === 'unauthorized'
        ? '/login'
        : '/dashboard/forbidden',
    );
  const conditions = [
    ['Produto', table.produto?.nome ?? 'Não vinculado'],
    ['Índice de correção', table.indiceCorrecao ?? '—'],
    [
      'Fundo de reserva',
      table.fundoReservaPercentual ? `${table.fundoReservaPercentual}%` : '—',
    ],
    [
      'Taxa de administração',
      table.taxaAdministracaoPercentual
        ? `${table.taxaAdministracaoPercentual}%`
        : '—',
    ],
    [
      'Taxa total',
      table.taxaTotalPercentual ? `${table.taxaTotalPercentual}%` : '—',
    ],
    [
      'Seguro de vida',
      table.seguroVidaPercentual ? `${table.seguroVidaPercentual}%` : '—',
    ],
    ['Participantes', table.participantesGrupo ?? '—'],
    ['Origem', table.origem],
  ] as const;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Tabela comercial"
        title={`${table.codigo} — ${table.nome}`}
        description={`${table.administradora.nome} · ${table.categoria} · vigência iniciada em ${table.inicioVigencia}`}
      />
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Badge tone={table.status === 'ATIVA' ? 'success' : 'neutral'}>
            {table.status}
          </Badge>
          <span className="text-sm text-slate-500">
            {table.fimVigencia
              ? `até ${table.fimVigencia}`
              : 'vigência sem término definido'}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {conditions.map(([label, current]) => (
            <div className="rounded-lg bg-slate-50 p-4" key={label}>
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <p className="mt-1 font-semibold">{current}</p>
            </div>
          ))}
        </div>
        {table.descricao ? (
          <p className="mt-5 text-sm text-slate-600">{table.descricao}</p>
        ) : null}
      </Card>
      <TabelaComercialDetailManager
        tableId={id}
        table={table}
        identity={identity}
        items={items}
      />
      <Card className="p-5">
        <h2 className="font-semibold">Auditoria resumida</h2>
        {table.auditoria.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {table.auditoria.map((event) => (
              <li key={event.id} className="flex justify-between gap-4">
                <span>{event.action}</span>
                <time className="text-slate-500">
                  {new Date(event.createdAt).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Nenhum evento registrado.
          </p>
        )}
      </Card>
    </div>
  );
}
