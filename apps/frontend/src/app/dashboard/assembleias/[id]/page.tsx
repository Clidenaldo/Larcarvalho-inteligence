import {
  contemplacaoListQuerySchema,
  cotaListQuerySchema,
  lanceListQuerySchema,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { AssembleiaEvents } from '../../../../components/assembleia-events';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { formatDateTime } from '../../../../lib/formatters';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getAssembleia,
  getContemplacoes,
  getLances,
} from '../../../../services/api/historico';
import { getCotas } from '../../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const i = await getCurrentIdentity();
  if (!i) redirect('/login');
  const id = (await params).id,
    a = await getAssembleia(id);
  if (typeof a === 'string') redirect('/dashboard/assembleias');
  const [l, c, q] = await Promise.all([
    getLances(lanceListQuerySchema.parse({ assembleiaId: id, pageSize: 100 })),
    getContemplacoes(
      contemplacaoListQuerySchema.parse({ assembleiaId: id, pageSize: 100 }),
    ),
    getCotas(cotaListQuerySchema.parse({ grupoId: a.grupoId, pageSize: 100 })),
  ]);
  if (typeof l === 'string' || typeof c === 'string' || typeof q === 'string')
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Assembleias"
        title={a.numero ? `Assembleia ${a.numero}` : 'Assembleia sem número'}
        description={`${a.grupo.administradora.nome} · Grupo ${a.grupo.codigo}`}
      />
      <Card className="p-6">
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt>Produto</dt>
            <dd>{a.grupo.produto?.nome ?? 'Não classificado'}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{formatDateTime(a.dataAssembleia)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge
                tone={
                  a.status === 'REALIZADA'
                    ? 'success'
                    : a.status === 'CANCELADA'
                      ? 'danger'
                      : 'info'
                }
              >
                {a.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Grupo</dt>
            <dd>{a.grupo.codigo}</dd>
          </div>
        </dl>
      </Card>
      <AssembleiaEvents
        assembleiaId={id}
        cotas={q.items}
        lances={l.items}
        contemplacoes={c.items}
        identity={i}
      />
    </div>
  );
}
