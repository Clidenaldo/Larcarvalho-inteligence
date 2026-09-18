import { importacaoIssueQuerySchema } from '@larcarvalho/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Pagination } from '../../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getImportacao,
  getImportacaoIssues,
} from '../../../../services/api/importacoes';

export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('importacoes.read'))
    redirect('/dashboard/forbidden');
  const { id } = await params;
  const query = importacaoIssueQuerySchema.parse(await searchParams);
  const [item, issues] = await Promise.all([
    getImportacao(id),
    getImportacaoIssues(id, query),
  ]);
  if (item === 'not-found') notFound();
  if (typeof item === 'string' || typeof issues === 'string')
    redirect('/dashboard/forbidden');
  const stats = [
    ['Linhas', item.totalRegistros],
    ['Válidas', item.registrosValidos],
    ['Inválidas', item.registrosInvalidos],
    ['Criadas', item.registrosCriados],
    ['Atualizadas', item.registrosAtualizados],
    ['Ignoradas', item.registrosIgnorados],
  ] as const;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Relatório da importação"
        title={item.nomeArquivo}
        description={`${item.tipo} · ${item.abaSelecionada ?? 'sem aba'} · iniciada por ${item.criadoPor?.nome ?? 'usuário legado'}`}
      />
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            tone={
              item.status === 'FALHOU'
                ? 'danger'
                : item.status === 'CONCLUIDA'
                  ? 'success'
                  : 'warning'
            }
          >
            {item.status}
          </Badge>
          <span className="text-sm text-slate-500">
            {item.mimeType} · {(item.tamanhoBytes / 1024).toFixed(1)} KB ·
            estratégia {item.estrategia ?? 'não definida'}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div className="rounded-lg bg-slate-50 p-4" key={label}>
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {item.erroResumo ? (
          <p className="mt-4 text-sm text-red-700">{item.erroResumo}</p>
        ) : null}
        <div className="mt-5">
          <p className="text-sm font-semibold">Mapeamento</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(item.mapeamento ?? {}).map(([field, column]) => (
              <span
                className="rounded bg-slate-100 px-2 py-1 text-xs"
                key={field}
              >
                {column} → {field}
              </span>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <div className="border-b p-5">
          <h2 className="font-semibold">Problemas por linha</h2>
          <p className="text-sm text-slate-500">
            Lista paginada; valores são limitados e não aparecem em logs.
          </p>
          {issues.total > 0 &&
          identity.permissions.includes('data_quality.read') ? (
            <Link
              className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)]"
              href={`/dashboard/qualidade-dados?importacaoId=${id}`}
            >
              Ver {issues.total} problemas no módulo de qualidade
            </Link>
          ) : null}
        </div>
        {issues.items.length === 0 ? (
          <EmptyState
            title="Nenhum problema"
            description="A validação não registrou erros ou avisos."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Linha',
                      'Campo',
                      'Valor recebido',
                      'Código',
                      'Problema',
                    ].map((label) => (
                      <th className="px-4 py-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.items.map((issue) => (
                    <tr className="border-t" key={issue.id}>
                      <td className="px-4 py-3">{issue.linha ?? '—'}</td>
                      <td className="px-4 py-3">{issue.campo ?? '—'}</td>
                      <td className="max-w-xs truncate px-4 py-3">
                        {issue.valorRecebido ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            issue.severidade === 'ERROR' ||
                            issue.severidade === 'CRITICAL'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {issue.codigo}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{issue.mensagem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={issues.page} totalPages={issues.totalPages} />
          </>
        )}
      </Card>
    </div>
  );
}
