import {
  dataQualityEntities,
  dataQualityListQuerySchema,
  dataQualityOrigins,
  dataQualitySeverities,
  dataQualityStatuses,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DataQualityScan } from '../../../components/data-quality-scan';
import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Field, Input, Select } from '../../../components/ui/field';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import {
  getDataQualityIssues,
  getDataQualitySummary,
} from '../../../services/api/data-quality';
export const dynamic = 'force-dynamic';
const severityTone = (value: string) =>
  value === 'CRITICAL' || value === 'ERROR'
    ? 'danger'
    : value === 'WARNING'
      ? 'warning'
      : 'info';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('data_quality.read'))
    redirect('/dashboard/forbidden');
  const query = dataQualityListQuerySchema.parse(await searchParams);
  const [data, summary] = await Promise.all([
    getDataQualityIssues(query),
    getDataQualitySummary(),
  ]);
  if (typeof data === 'string' || typeof summary === 'string')
    redirect('/dashboard/forbidden');
  const counters = [
    ['Abertas', summary.abertas],
    ['Críticas', summary.criticas],
    ['Erros', summary.erros],
    ['Avisos', summary.avisos],
    ['Resolvidas', summary.resolvidas],
  ] as const;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Confiabilidade operacional"
        title="Qualidade dos Dados"
        description="Investigue inconsistências reais, acompanhe sua origem e registre decisões de saneamento."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {counters.map(([label, value]) => (
          <Card className="p-4" key={label}>
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <DataQualityScan identity={identity} />
      <Card className="p-5">
        <form
          className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 xl:items-end"
          method="get"
        >
          <Field label="Busca">
            <Input
              defaultValue={query.search}
              name="search"
              placeholder="Código, mensagem ou campo"
            />
          </Field>
          <Field helpKey="filter.status" label="Status">
            <Select defaultValue={query.status} name="status">
              <option value="">Todos</option>
              {dataQualityStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.quality" label="Severidade">
            <Select defaultValue={query.severidade} name="severidade">
              <option value="">Todas</option>
              {dataQualitySeverities.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.origin" label="Origem">
            <Select defaultValue={query.origem} name="origem">
              <option value="">Todas</option>
              {dataQualityOrigins.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="filter.quality" label="Entidade">
            <Select defaultValue={query.entidade} name="entidade">
              <option value="">Todas</option>
              {dataQualityEntities.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Filtrar</Button>
        </form>
      </Card>
      <Card>
        {data.items.length === 0 ? (
          <EmptyState
            title="Nenhum problema encontrado"
            description="Execute a verificação ou ajuste os filtros."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Severidade',
                      'Problema',
                      'Entidade',
                      'Origem',
                      'Status',
                      'Data',
                      'Ações',
                    ].map((label) => (
                      <th className="px-4 py-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((issue) => (
                    <tr className="border-t" key={issue.id}>
                      <td className="px-4 py-3">
                        <Badge tone={severityTone(issue.severidade)}>
                          {issue.severidade}
                        </Badge>
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <p className="font-medium">{issue.codigo}</p>
                        <p className="text-xs text-slate-500">
                          {issue.mensagem}
                        </p>
                      </td>
                      <td className="px-4 py-3">{issue.contexto.titulo}</td>
                      <td className="px-4 py-3">{issue.origem}</td>
                      <td className="px-4 py-3">
                        <Badge>{issue.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {new Intl.DateTimeFormat('pt-BR').format(
                          new Date(issue.createdAt),
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="font-semibold text-[var(--color-primary)]"
                          href={`/dashboard/qualidade-dados/${issue.id}`}
                        >
                          Investigar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              params={{
                search: query.search,
                status: query.status,
                severidade: query.severidade,
                origem: query.origem,
                entidade: query.entidade,
                importacaoId: query.importacaoId,
                grupoId: query.grupoId,
                administradoraId: query.administradoraId,
                produtoId: query.produtoId,
              }}
              totalPages={data.totalPages}
            />
          </>
        )}
      </Card>
    </div>
  );
}
