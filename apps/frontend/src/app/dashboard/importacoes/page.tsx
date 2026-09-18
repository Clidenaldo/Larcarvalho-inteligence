import { importacaoListQuerySchema } from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ImportacoesWizard } from '../../../components/importacoes-wizard';
import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getImportacoes } from '../../../services/api/importacoes';

export const dynamic = 'force-dynamic';
const statusLabel: Record<string, string> = {
  PENDENTE: 'Pendente',
  VALIDANDO: 'Validando',
  PRONTA: 'Pronta',
  PROCESSANDO: 'Processando',
  CONCLUIDA: 'Concluída',
  CONCLUIDA_COM_ERROS: 'Com erros',
  FALHOU: 'Falhou',
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('importacoes.read'))
    redirect('/dashboard/forbidden');
  const query = importacaoListQuerySchema.parse(await searchParams);
  const data = await getImportacoes(query);
  if (typeof data === 'string') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Dados"
        title="Importações"
        description="Envie CSV, XLSX ou XLS, revise o mapeamento e confirme somente após a validação."
      />
      <ImportacoesWizard identity={identity} />
      <Card>
        <div className="border-b p-5">
          <h2 className="font-semibold">Histórico de importações</h2>
        </div>
        {data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma importação"
            description="O primeiro arquivo validado aparecerá aqui."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Arquivo',
                      'Tipo',
                      'Status',
                      'Linhas',
                      'Sucessos',
                      'Erros',
                      'Usuário',
                      'Data',
                      'Ações',
                    ].map((item) => (
                      <th className="px-4 py-3" key={item}>
                        {item}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr className="border-t" key={item.id}>
                      <td className="px-4 py-3 font-medium">
                        {item.nomeArquivo}
                      </td>
                      <td className="px-4 py-3">{item.tipo}</td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            item.status === 'FALHOU'
                              ? 'danger'
                              : item.status === 'CONCLUIDA'
                                ? 'success'
                                : item.status === 'CONCLUIDA_COM_ERROS'
                                  ? 'warning'
                                  : 'info'
                          }
                        >
                          {statusLabel[item.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{item.totalRegistros}</td>
                      <td className="px-4 py-3">
                        {item.registrosCriados + item.registrosAtualizados}
                      </td>
                      <td className="px-4 py-3">{item.registrosInvalidos}</td>
                      <td className="px-4 py-3">
                        {item.criadoPor?.nome ?? 'Legado'}
                      </td>
                      <td className="px-4 py-3">
                        {new Intl.DateTimeFormat('pt-BR').format(
                          new Date(item.createdAt),
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="font-semibold text-[var(--color-primary)] hover:underline"
                          href={`/dashboard/importacoes/${item.id}`}
                        >
                          Detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} />
          </>
        )}
      </Card>
    </div>
  );
}
