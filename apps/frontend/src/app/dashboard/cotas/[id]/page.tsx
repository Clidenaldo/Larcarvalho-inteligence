import { redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { formatBrl } from '../../../../lib/formatters';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getCota } from '../../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const i = await getCurrentIdentity();
  if (!i) redirect('/login');
  const c = await getCota((await params).id);
  if (typeof c === 'string') redirect('/dashboard/cotas');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Cotas"
        title={`Cota ${c.numero}`}
        description="Dados operacionais sem regras de contemplação nesta fase."
      />
      <Card className="p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt>Grupo</dt>
            <dd>{c.grupo.codigo}</dd>
          </div>
          <div>
            <dt>Administradora</dt>
            <dd>{c.grupo.administradora.nome}</dd>
          </div>
          <div>
            <dt>Produto</dt>
            <dd>{c.grupo.produto?.nome ?? 'Não classificado'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={c.status === 'ATIVO' ? 'success' : 'neutral'}>
                {c.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Crédito</dt>
            <dd>
              {c.valorCredito
                ? formatBrl(Number(c.valorCredito))
                : 'Não informado'}
            </dd>
          </div>
          <div>
            <dt>Parcela atual</dt>
            <dd>
              {c.parcelaAtual
                ? formatBrl(Number(c.parcelaAtual))
                : 'Não informada'}
            </dd>
          </div>
          <div>
            <dt>Prazo restante</dt>
            <dd>{c.prazoRestante ?? '—'}</dd>
          </div>
          <div>
            <dt>Código externo</dt>
            <dd>{c.codigoExterno ?? 'Não informado'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
