import { cotaListQuerySchema, grupoListQuerySchema } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { OperacionalManager } from '../../../components/operacional-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getCotas, getGrupos } from '../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('cotas.read'))
    redirect('/dashboard/forbidden');
  const q = cotaListQuerySchema.parse(await searchParams),
    [data, groups] = await Promise.all([
      getCotas(q),
      getGrupos(grupoListQuerySchema.parse({ page: 1, pageSize: 100 })),
    ]);
  if (typeof data === 'string' || typeof groups === 'string')
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Cotas"
        description="Posições de grupos, sem regras de assembleia, lance ou contemplação nesta fase."
      />
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-3 md:items-end" method="get">
          <Field label="Buscar">
            <Input defaultValue={q.search} name="search" />
          </Field>
          <Field helpKey="filter.relation" label="Grupo">
            <Select defaultValue={q.grupoId} name="grupoId">
              <option value="">Todos</option>
              {groups.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.codigo}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <OperacionalManager
        kind="cotas"
        data={data}
        identity={identity}
        grupos={groups.items}
        params={{ search: q.search, grupoId: q.grupoId, status: q.status }}
      />
    </div>
  );
}
