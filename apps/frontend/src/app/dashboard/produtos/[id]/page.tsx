import { redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getProduto } from '../../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const i = await getCurrentIdentity();
  if (!i) redirect('/login');
  const p = await getProduto((await params).id);
  if (typeof p === 'string') redirect('/dashboard/produtos');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Produtos"
        title={p.nome}
        description="Dados institucionais e área preparada para grupos relacionados."
      />
      <Card className="p-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt>Administradora</dt>
            <dd>{p.administradora.nome}</dd>
          </div>
          <div>
            <dt>Categoria</dt>
            <dd>{p.categoria}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={p.ativo ? 'success' : 'neutral'}>
                {p.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Código externo</dt>
            <dd>{p.codigoExterno ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Descrição</dt>
            <dd>{p.descricao ?? 'Não informada'}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
