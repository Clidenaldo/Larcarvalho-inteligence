import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '../../../../../../components/page-header';
import { Badge } from '../../../../../../components/ui/badge';
import { Card } from '../../../../../../components/ui/card';
import { formatBrl, formatDateTime } from '../../../../../../lib/formatters';
import { getCurrentIdentity } from '../../../../../../services/api/auth';
import { getGrupoSnapshot } from '../../../../../../services/api/grupo-historico';

export const dynamic = 'force-dynamic';
const money = (value: string | null) =>
  value === null ? 'Indisponível' : formatBrl(Number(value));
const percent = (value: string | null) =>
  value === null ? 'Indisponível' : `${Number(value).toLocaleString('pt-BR')}%`;
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; snapshotId: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('historico_grupos.read'))
    redirect('/dashboard/forbidden');
  const { id, snapshotId } = await params;
  const snapshot = await getGrupoSnapshot(id, snapshotId);
  if (typeof snapshot === 'string') redirect(`/dashboard/grupos/${id}`);
  const indicators = [
    ['Assembleias realizadas', snapshot.metricas.assembleiasRealizadas],
    ['Lances registrados', snapshot.metricas.lancesRegistrados],
    ['Lances contemplados', snapshot.metricas.lancesContemplados],
    ['Contemplações', snapshot.metricas.contemplacoesRegistradas],
    ['Por sorteio', snapshot.metricas.contemplacoesSorteio],
    ['Por lance', snapshot.metricas.contemplacoesLance],
  ] as const;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Histórico observado"
        title={`Snapshot do grupo ${snapshot.grupo.codigo}`}
        description={`Capturado em ${formatDateTime(snapshot.capturadoEm)} · ${snapshot.origem}`}
      />
      <Link
        className="text-sm font-semibold text-[var(--color-primary)]"
        href={`/dashboard/grupos/${id}#historico`}
      >
        ← Voltar ao histórico do grupo
      </Link>
      {snapshot.qualidade.issuesAbertas ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Link href={`/dashboard/qualidade-dados?grupoId=${id}`}>
            Dados com pendências de qualidade:{' '}
            {snapshot.qualidade.issuesAbertas}
            {snapshot.qualidade.issuesCriticas
              ? ` (${snapshot.qualidade.issuesCriticas} críticas)`
              : ''}
          </Link>
        </Card>
      ) : null}
      <Card className="p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt>Administradora</dt>
            <dd>{snapshot.grupo.administradora.nome}</dd>
          </div>
          <div>
            <dt>Produto</dt>
            <dd>{snapshot.grupo.produto?.nome ?? 'Não classificado'}</dd>
          </div>
          <div>
            <dt>Status observado</dt>
            <dd>
              <Badge>{snapshot.estado.status ?? 'Indisponível'}</Badge>
            </dd>
          </div>
          <div>
            <dt>Fonte</dt>
            <dd>{snapshot.fonteDados?.nome ?? snapshot.origem}</dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{snapshot.estado.prazoMeses ?? 'Indisponível'} meses</dd>
          </div>
          <div>
            <dt>Cotas declaradas</dt>
            <dd>
              {snapshot.estado.quantidadeCotasDeclarada ?? 'Indisponível'}
            </dd>
          </div>
          <div>
            <dt>Cotas registradas</dt>
            <dd>
              {snapshot.estado.quantidadeCotasRegistradas ?? 'Indisponível'}
            </dd>
          </div>
          <div>
            <dt>Cotas ativas</dt>
            <dd>{snapshot.estado.quantidadeCotasAtivas ?? 'Indisponível'}</dd>
          </div>
          <div>
            <dt>Crédito mínimo</dt>
            <dd>{money(snapshot.estado.valorCreditoMinimo)}</dd>
          </div>
          <div>
            <dt>Crédito máximo</dt>
            <dd>{money(snapshot.estado.valorCreditoMaximo)}</dd>
          </div>
          <div>
            <dt>Parcela média</dt>
            <dd>{money(snapshot.estado.parcelaMedia)}</dd>
          </div>
          <div>
            <dt>Registrado por</dt>
            <dd>{snapshot.criadoPor?.nome ?? 'Processo interno'}</dd>
          </div>
        </dl>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indicators.map(([label, value]) => (
          <Card className="p-5" key={label}>
            <p className="text-xs uppercase text-[var(--color-muted)]">
              {label}
            </p>
            <p className="mt-1 text-3xl font-semibold">{value ?? '—'}</p>
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="font-semibold">Percentuais de lances contemplados</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt>Mínimo</dt>
            <dd>
              {percent(snapshot.metricas.percentualLanceContempladoMinimo)}
            </dd>
          </div>
          <div>
            <dt>Média</dt>
            <dd>
              {percent(snapshot.metricas.percentualLanceContempladoMedio)}
            </dd>
          </div>
          <div>
            <dt>Mediana</dt>
            <dd>
              {percent(snapshot.metricas.percentualLanceContempladoMediano)}
            </dd>
          </div>
          <div>
            <dt>Máximo</dt>
            <dd>
              {percent(snapshot.metricas.percentualLanceContempladoMaximo)}
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="p-6">
        <h2 className="font-semibold">Cobertura no momento da captura</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-3">
          <div>
            <dt>Assembleias analisadas</dt>
            <dd>{snapshot.cobertura.assembleiasAnalisadas ?? '—'}</dd>
          </div>
          <div>
            <dt>Com dados de lance</dt>
            <dd>{snapshot.cobertura.assembleiasComDadosLance ?? '—'}</dd>
          </div>
          <div>
            <dt>Com contemplações</dt>
            <dd>{snapshot.cobertura.assembleiasComDadosContemplacao ?? '—'}</dd>
          </div>
        </dl>
      </Card>
      {snapshot.anterior ? (
        <Card className="p-6">
          <h2 className="font-semibold">Comparação com o snapshot anterior</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Comparação factual, sem interpretação comercial.
          </p>
          <dl className="mt-4 grid gap-5 sm:grid-cols-3">
            <div>
              <dt>Crédito máximo</dt>
              <dd>
                {money(snapshot.anterior.valorCreditoMaximo)} →{' '}
                {money(snapshot.estado.valorCreditoMaximo)}
              </dd>
            </div>
            <div>
              <dt>Prazo</dt>
              <dd>
                {snapshot.anterior.prazoMeses ?? '—'} →{' '}
                {snapshot.estado.prazoMeses ?? '—'} meses
              </dd>
            </div>
            <div>
              <dt>Cotas declaradas</dt>
              <dd>
                {snapshot.anterior.quantidadeCotasDeclarada ?? '—'} →{' '}
                {snapshot.estado.quantidadeCotasDeclarada ?? '—'}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
