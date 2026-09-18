import {
  assembleiaListQuerySchema,
  cotaListQuerySchema,
  grupoHistoricoListQuerySchema,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { Pagination } from '../../../../components/ui/pagination';
import { formatBrl, formatDateTime } from '../../../../lib/formatters';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getAssembleias } from '../../../../services/api/historico';
import { getCotas, getGrupo } from '../../../../services/api/operacional';
import { getDataQualityIssues } from '../../../../services/api/data-quality';
import { GrupoSnapshotButton } from '../../../../components/grupo-snapshot-button';
import { HistoricoSeries } from '../../../../components/historico-series';
import { EmptyState } from '../../../../components/ui/empty-state';
import {
  getGrupoHistorico,
  getGrupoHistoricoSeries,
} from '../../../../services/api/grupo-historico';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  const id = (await params).id;
  const grupo = await getGrupo(id);
  if (typeof grupo === 'string') redirect('/dashboard/grupos');
  const canReadHistory = identity.permissions.includes('historico_grupos.read');
  const [cotas, assembleias, quality, history, series] = await Promise.all([
    getCotas(
      cotaListQuerySchema.parse({ ...(await searchParams), grupoId: id }),
    ),
    getAssembleias(
      assembleiaListQuerySchema.parse({ grupoId: id, pageSize: 5 }),
    ),
    identity.permissions.includes('data_quality.read')
      ? getDataQualityIssues({
          page: 1,
          pageSize: 1,
          grupoId: id,
          pendentes: true,
        })
      : Promise.resolve(null),
    canReadHistory
      ? getGrupoHistorico(
          id,
          grupoHistoricoListQuerySchema.parse({ page: 1, pageSize: 5 }),
        )
      : Promise.resolve(null),
    canReadHistory ? getGrupoHistoricoSeries(id) : Promise.resolve(null),
  ]);
  if (typeof cotas === 'string' || typeof assembleias === 'string')
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Grupos"
        title={`Grupo ${grupo.codigo}`}
        description="Cotas e últimas assembleias reais; indicadores e tendências permanecem para fases futuras."
      />
      {quality && typeof quality !== 'string' && quality.total > 0 ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Link
            className="font-semibold"
            href={`/dashboard/qualidade-dados?grupoId=${id}`}
          >
            {quality.total} problema(s) de qualidade aberto(s) neste grupo
          </Link>
        </Card>
      ) : null}
      <Card className="p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt>Administradora</dt>
            <dd>{grupo.administradora.nome}</dd>
          </div>
          <div>
            <dt>Produto</dt>
            <dd>{grupo.produto?.nome ?? 'Não classificado'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={grupo.status === 'ATIVO' ? 'success' : 'neutral'}>
                {grupo.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Datas</dt>
            <dd>
              {grupo.dataInicio ?? '—'} a {grupo.dataEncerramento ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{grupo.prazoMeses ?? '—'} meses</dd>
          </div>
          <div>
            <dt>Crédito</dt>
            <dd>
              {grupo.valorCreditoMinimo
                ? formatBrl(Number(grupo.valorCreditoMinimo))
                : '—'}{' '}
              /{' '}
              {grupo.valorCreditoMaximo
                ? formatBrl(Number(grupo.valorCreditoMaximo))
                : '—'}
            </dd>
          </div>
        </dl>
      </Card>
      {history &&
      series &&
      typeof history !== 'string' &&
      typeof series !== 'string' ? (
        <section className="space-y-4" id="historico">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Histórico</h2>
              <p className="text-sm text-[var(--color-muted)]">
                Snapshots imutáveis do estado observado deste grupo.
              </p>
            </div>
            {identity.permissions.includes('historico_grupos.create') ? (
              <GrupoSnapshotButton grupoId={id} />
            ) : null}
          </div>
          <Card className="overflow-hidden">
            {history.items.length === 0 ? (
              <EmptyState
                title="Nenhum histórico registrado para este grupo."
                description="Registre o estado atual para iniciar a série temporal."
                action={
                  identity.permissions.includes('historico_grupos.create') ? (
                    <GrupoSnapshotButton grupoId={id} />
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y">
                {history.items.map((snapshot) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-4 p-4"
                    key={snapshot.id}
                  >
                    <div>
                      <Link
                        className="font-semibold text-[var(--color-primary)]"
                        href={`/dashboard/grupos/${id}/historico/${snapshot.id}`}
                      >
                        {formatDateTime(snapshot.capturadoEm)}
                      </Link>
                      <p className="text-xs text-[var(--color-muted)]">
                        {snapshot.origem} ·{' '}
                        {snapshot.estado.status ?? 'Status indisponível'}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p>
                        {snapshot.metricas.contemplacoesRegistradas ?? '—'}{' '}
                        contemplações
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {snapshot.qualidade.issuesAbertas ?? '—'} pendências de
                        qualidade
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <HistoricoSeries series={series} />
        </section>
      ) : null}
      <Card className="overflow-hidden">
        <div className="border-b p-5 font-semibold">Últimas assembleias</div>
        {assembleias.items.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-muted)]">
            Nenhuma assembleia registrada.
          </p>
        ) : (
          <ul className="divide-y">
            {assembleias.items.map((assembleia) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                key={assembleia.id}
              >
                <Link
                  className="text-[var(--color-primary)]"
                  href={`/dashboard/assembleias/${assembleia.id}`}
                >
                  {assembleia.numero
                    ? `Assembleia ${assembleia.numero}`
                    : 'Assembleia sem número'}
                </Link>
                <span className="text-sm text-[var(--color-muted)]">
                  {formatDateTime(assembleia.dataAssembleia)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b p-5 font-semibold">Cotas reais do grupo</div>
        {cotas.items.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-muted)]">
            Nenhuma cota cadastrada.
          </p>
        ) : (
          <ul className="divide-y">
            {cotas.items.map((cota) => (
              <li className="flex justify-between p-4" key={cota.id}>
                <Link
                  className="text-[var(--color-primary)]"
                  href={`/dashboard/cotas/${cota.id}`}
                >
                  Cota {cota.numero}
                </Link>
                <Badge tone={cota.status === 'ATIVO' ? 'success' : 'neutral'}>
                  {cota.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={cotas.page} totalPages={cotas.totalPages} />
      </Card>
    </div>
  );
}
