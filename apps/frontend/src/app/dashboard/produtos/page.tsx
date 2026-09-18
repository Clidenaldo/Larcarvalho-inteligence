import {
  produtoListQuerySchema,
  administradoraListQuerySchema,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { OperacionalManager } from '../../../components/operacional-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAdministradoras } from '../../../services/api/administradoras';
import { getProdutos } from '../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('produtos.read'))
    redirect('/dashboard/forbidden');
  const q = produtoListQuerySchema.parse(await searchParams),
    [data, admins] = await Promise.all([
      getProdutos(q),
      getAdministradoras(
        administradoraListQuerySchema.parse({
          page: 1,
          pageSize: 100,
          status: 'ativas',
        }),
      ),
    ]);
  if (typeof data === 'string' || typeof admins === 'string')
    redirect(
      data === 'unauthorized' || admins === 'unauthorized'
        ? '/login'
        : '/dashboard/forbidden',
    );
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Produtos"
        description="Modalidades comerciais vinculadas a administradoras ativas."
      />
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-4 md:items-end" method="get">
          <Field label="Buscar">
            <Input defaultValue={q.search} name="search" />
          </Field>
          <Field helpKey="filter.relation" label="Administradora">
            <Select defaultValue={q.administradoraId} name="administradoraId">
              <option value="">Todas</option>
              {admins.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={q.status} name="status">
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </Select>
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <OperacionalManager
        kind="produtos"
        data={data}
        identity={identity}
        administradoras={admins.items}
        params={{
          search: q.search,
          administradoraId: q.administradoraId,
          status: q.status,
        }}
      />
    </div>
  );
}
