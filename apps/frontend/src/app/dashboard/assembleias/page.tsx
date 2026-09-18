import {
  assembleiaListQuerySchema,
  grupoListQuerySchema,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { AssembleiasManager } from '../../../components/assembleias-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAssembleias } from '../../../services/api/historico';
import { getGrupos } from '../../../services/api/operacional';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const i = await getCurrentIdentity();
  if (!i) redirect('/login');
  if (!i.permissions.includes('assembleias.read'))
    redirect('/dashboard/forbidden');
  const q = assembleiaListQuerySchema.parse(await searchParams),
    [data, groups] = await Promise.all([
      getAssembleias(q),
      getGrupos(grupoListQuerySchema.parse({ page: 1, pageSize: 100 })),
    ]);
  if (typeof data === 'string' || typeof groups === 'string')
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Histórico"
        title="Assembleias"
        description="Eventos reais por grupo e período, sem previsão ou promessa de contemplação."
      />
      <Card className="p-5">
        <form
          className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 xl:items-end"
          method="get"
        >
          <Field label="Buscar">
            <Input defaultValue={q.search} name="search" />
          </Field>
          <Field helpKey="filter.relation" label="Grupo">
            <Select defaultValue={q.grupoId} name="grupoId">
              <option value="">Todos</option>
              {groups.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.administradora.nome} · {g.codigo}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={q.status} name="status">
              <option value="">Todos</option>
              <option>AGENDADA</option>
              <option>REALIZADA</option>
              <option>CANCELADA</option>
            </Select>
          </Field>
          <Field helpKey="filter.date" label="Data inicial">
            <Input defaultValue={q.dataInicio} name="dataInicio" type="date" />
          </Field>
          <Field helpKey="filter.date" label="Data final">
            <Input defaultValue={q.dataFim} name="dataFim" type="date" />
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <AssembleiasManager
        data={data}
        identity={i}
        groups={groups.items}
        params={{
          search: q.search,
          grupoId: q.grupoId,
          status: q.status,
          dataInicio: q.dataInicio,
          dataFim: q.dataFim,
        }}
      />
    </div>
  );
}
