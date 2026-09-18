import { administradoraListQuerySchema } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';

import { AdministradorasManager } from '../../../components/administradoras-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAdministradoras } from '../../../services/api/administradoras';

export const dynamic = 'force-dynamic';

export default async function AdministradorasPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
  }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('administradoras.read'))
    redirect('/dashboard/forbidden');
  const params = administradoraListQuerySchema.parse(await searchParams);
  const data = await getAdministradoras(params);
  if (data === 'unauthorized') redirect('/login');
  if (data === 'forbidden') redirect('/dashboard/forbidden');
  if (data === 'not-found') redirect('/dashboard/administradoras');

  return (
    <div className="space-y-7">
      <PageHeader
        description="Mantenha a base comercial de administradoras com dados rastreáveis e sem exclusão física."
        eyebrow="Operação"
        title="Administradoras"
      />
      <Card className="p-5">
        <form
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-end"
          method="get"
        >
          <Field label="Buscar">
            <Input
              defaultValue={params.search}
              maxLength={200}
              name="search"
              placeholder="Nome, CNPJ ou código externo"
            />
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={params.status} name="status">
              <option value="todas">Todas</option>
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
            </Select>
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <AdministradorasManager
        data={data}
        identity={identity}
        status={params.status}
        {...(params.search ? { search: params.search } : {})}
      />
    </div>
  );
}
