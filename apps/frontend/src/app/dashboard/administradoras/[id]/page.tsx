import { redirect } from 'next/navigation';

import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { formatCnpj, formatDateTime } from '../../../../lib/formatters';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getAdministradora } from '../../../../services/api/administradoras';

export const dynamic = 'force-dynamic';

export default async function AdministradoraDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('administradoras.read'))
    redirect('/dashboard/forbidden');
  const item = await getAdministradora((await params).id);
  if (item === 'unauthorized') redirect('/login');
  if (item === 'forbidden') redirect('/dashboard/forbidden');
  if (item === 'not-found') redirect('/dashboard/administradoras');

  return (
    <div className="space-y-7">
      <PageHeader
        description="Dados institucionais cadastrados. Produtos, grupos e integrações permanecem fora do escopo desta fase."
        eyebrow="Administradoras"
        title={item.nome}
      />
      <Card className="p-6">
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Nome fantasia
            </dt>
            <dd className="mt-1 font-medium">
              {item.nomeFantasia ?? 'Não informado'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              CNPJ
            </dt>
            <dd className="mt-1 font-medium">{formatCnpj(item.cnpj)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Código externo
            </dt>
            <dd className="mt-1 font-medium">
              {item.codigoExterno ?? 'Não informado'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Site
            </dt>
            <dd className="mt-1 font-medium">
              {item.site ? (
                <a
                  className="text-[var(--color-primary)] underline"
                  href={item.site}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.site}
                </a>
              ) : (
                'Não informado'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Status
            </dt>
            <dd className="mt-1">
              <Badge tone={item.ativa ? 'success' : 'neutral'}>
                {item.ativa ? 'Ativa' : 'Inativa'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
              Atualizada em
            </dt>
            <dd className="mt-1 font-medium">
              {formatDateTime(item.updatedAt)}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
