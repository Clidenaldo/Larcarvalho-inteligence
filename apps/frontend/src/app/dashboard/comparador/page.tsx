import { HelpLabel } from '../../../components/ui/field-help';
import {
  administradoraListQuerySchema,
  comparadorSearchQuerySchema,
  produtoCategorias,
  statusOperacionais,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { ComparadorResults } from '../../../components/comparador-results';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getAdministradoras } from '../../../services/api/administradoras';
import { getCurrentIdentity } from '../../../services/api/auth';
import { searchComparisonGroups } from '../../../services/api/comparador';

export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('comparador.read'))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const query = comparadorSearchQuerySchema.parse(raw);
  const [results, administrators] = await Promise.all([
    searchComparisonGroups(query),
    getAdministradoras(
      administradoraListQuerySchema.parse({
        page: 1,
        pageSize: 100,
        status: query.incluirInativos ? 'todas' : 'ativas',
      }),
    ),
  ]);
  if (typeof results === 'string') redirect('/dashboard/forbidden');
  const adminItems =
    typeof administrators === 'string' ? [] : administrators.items;
  const context = {
    categoria: query.categoria,
    valorCreditoDesejado: query.valorCreditoDesejado,
    parcelaMaxima: query.parcelaMaxima,
    prazoMinimo: query.prazoMinimo?.toString(),
    prazoMaximo: query.prazoMaximo?.toString(),
    lanceDisponivelPercentual: raw.lanceDisponivelPercentual,
  };
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Comparação objetiva"
        title="Comparador de Grupos e Planos"
        description="Filtre grupos e planos comerciais vigentes por dados reais e compare diferenças factuais, sem ranking ou recomendação."
      />
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" method="get">
          <Field helpKey="filter.relation" label="Categoria">
            <Select defaultValue={query.categoria} name="categoria">
              <option value="">Todas</option>
              {produtoCategorias.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.relation" label="Administradora">
            <Select
              defaultValue={query.administradoraId}
              name="administradoraId"
            >
              <option value="">Todas</option>
              {adminItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.credit" label="Crédito desejado">
            <Input
              defaultValue={query.valorCreditoDesejado}
              inputMode="decimal"
              name="valorCreditoDesejado"
            />
          </Field>
          <Field helpKey="filter.installment" label="Parcela máxima">
            <Input
              defaultValue={query.parcelaMaxima}
              inputMode="decimal"
              name="parcelaMaxima"
            />
          </Field>
          <Field helpKey="rule.minTerm" label="Prazo mínimo">
            <Input
              defaultValue={query.prazoMinimo}
              min="0"
              name="prazoMinimo"
              type="number"
            />
          </Field>
          <Field helpKey="rule.maxTerm" label="Prazo máximo">
            <Input
              defaultValue={query.prazoMaximo}
              min="0"
              name="prazoMaximo"
              type="number"
            />
          </Field>
          <Field helpKey="filter.bid" label="Lance disponível (%)">
            <Input
              defaultValue={raw.lanceDisponivelPercentual}
              inputMode="decimal"
              max="100"
              min="0"
              name="lanceDisponivelPercentual"
            />
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={query.status} name="status">
              {statusOperacionais.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.sort" label="Ordenação">
            <Select defaultValue={query.sort} name="sort">
              <option value="codigo">Código</option>
              <option value="administradora">Administradora</option>
              <option value="creditoMinimo">Crédito mínimo</option>
              <option value="creditoMaximo">Crédito máximo</option>
              <option value="prazo">Prazo</option>
              <option value="maisRecente">Snapshot mais recente</option>
            </Select>
          </Field>
          <HelpLabel
            helpKey="filter.inactive"
            className="flex items-center gap-2 text-sm"
          >
            <input
              defaultChecked={query.incluirInativos}
              name="incluirInativos"
              type="checkbox"
              value="true"
            />
            Incluir administradoras/produtos inativos
          </HelpLabel>
          <Button type="submit">Pesquisar</Button>
        </form>
      </Card>
      {results.items.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum grupo ou plano comercial encontrado"
            description="Ajuste os critérios objetivos da busca."
          />
        </Card>
      ) : (
        <>
          <ComparadorResults context={context} items={results.items} />
          <Pagination
            page={results.page}
            params={raw}
            totalPages={results.totalPages}
          />
        </>
      )}
      <p className="text-xs text-[var(--color-muted)]">
        Os dados apresentados são históricos e informativos. Resultados
        anteriores de assembleias e lances não garantem contemplação futura.
      </p>
    </div>
  );
}
