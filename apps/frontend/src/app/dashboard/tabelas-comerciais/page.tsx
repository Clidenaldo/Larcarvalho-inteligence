import {
  administradoraListQuerySchema,
  produtoListQuerySchema,
  tabelaComercialListQuerySchema,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { PageHeader } from '../../../components/page-header';
import { TabelasComerciaisManager } from '../../../components/tabelas-comerciais-manager';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Input, Select } from '../../../components/ui/field';
import { getAdministradoras } from '../../../services/api/administradoras';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getProdutos } from '../../../services/api/operacional';
import { getTabelasComerciais } from '../../../services/api/tabelas-comerciais';

export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('tabelas_comerciais.read'))
    redirect('/dashboard/forbidden');
  const query = tabelaComercialListQuerySchema.parse(await searchParams);
  const [data, admins, products] = await Promise.all([
    getTabelasComerciais(query),
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
    redirect(
      data === 'unauthorized' ||
        admins === 'unauthorized' ||
        products === 'unauthorized'
        ? '/login'
        : '/dashboard/forbidden',
    );
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Comercial"
        title="Tabelas comerciais"
        description="Planos, condições e vigências comerciais separados de grupos e cotas."
      />
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-6 md:items-end" method="get">
          <Field label="Código ou nome">
            <Input name="search" defaultValue={query.search} />
          </Field>
          <Field helpKey="filter.relation" label="Administradora">
            <Select
              name="administradoraId"
              defaultValue={query.administradoraId ?? ''}
            >
              <option value="">Todas</option>
              {admins.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Categoria">
            <Select name="categoria" defaultValue={query.categoria ?? ''}>
              <option value="">Todas</option>
              {[
                'IMOVEL',
                'AUTOMOVEL',
                'MOTOCICLETA',
                'PESADOS',
                'SERVICOS',
                'OUTROS',
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select name="status" defaultValue={query.status ?? ''}>
              <option value="">Todos</option>
              {['ATIVA', 'INATIVA', 'ENCERRADA'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.archive" label="Exibição">
            <Select name="arquivamento" defaultValue={query.arquivamento}>
              <option value="ATIVAS">Ativas</option>
              <option value="ARQUIVADAS">Arquivadas</option>
              <option value="TODAS">Todas</option>
            </Select>
          </Field>
          <Field helpKey="filter.date" label="Vigente em">
            <Input name="vigencia" type="date" defaultValue={query.vigencia} />
          </Field>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      <TabelasComerciaisManager
        data={data}
        identity={identity}
        administradoras={admins.items}
        produtos={products.items}
        params={{
          search: query.search,
          administradoraId: query.administradoraId,
          categoria: query.categoria,
          status: query.status,
          arquivamento: query.arquivamento,
          vigencia: query.vigencia,
        }}
      />
    </div>
  );
}
