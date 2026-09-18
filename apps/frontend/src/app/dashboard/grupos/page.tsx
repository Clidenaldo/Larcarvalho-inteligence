import {
  grupoListQuerySchema,
  administradoraListQuerySchema,
  produtoListQuerySchema,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { OperacionalManager } from '../../../components/operacional-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAdministradoras } from '../../../services/api/administradoras';
import { getGrupos, getProdutos } from '../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('grupos.read'))
    redirect('/dashboard/forbidden');
  const q = grupoListQuerySchema.parse(await searchParams),
    [data, admins, products] = await Promise.all([
      getGrupos(q),
      getAdministradoras(
        administradoraListQuerySchema.parse({
          page: 1,
          pageSize: 100,
          status: 'ativas',
        }),
      ),
      getProdutos(
        produtoListQuerySchema.parse({
          page: 1,
          pageSize: 100,
          status: 'ativos',
        }),
      ),
    ]);
  if (
    typeof data === 'string' ||
    typeof admins === 'string' ||
    typeof products === 'string'
  )
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Grupos"
        description="Grupos de consórcio preservados para histórico e classificação gradual."
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
          <Field helpKey="filter.relation" label="Produto">
            <Select defaultValue={q.produtoId} name="produtoId">
              <option value="">Todos</option>
              {products.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <OperacionalManager
        kind="grupos"
        data={data}
        identity={identity}
        administradoras={admins.items}
        produtos={products.items}
        params={{
          search: q.search,
          administradoraId: q.administradoraId,
          produtoId: q.produtoId,
          status: q.status,
        }}
      />
    </div>
  );
}
