import { integrationRunListQuerySchema } from '@larcarvalho/shared';
import { notFound, redirect } from 'next/navigation';

import { IntegrationActions } from '../../../../components/integration-actions';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getIntegration,
  getIntegrationLogs,
  getIntegrationRuns,
} from '../../../../services/api/integrations';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('integrations.read'))
    redirect('/dashboard/forbidden');
  const { id } = await params;
  const query = integrationRunListQuerySchema.parse({ page: 1, pageSize: 20 });
  const [integration, runs, logs] = await Promise.all([
    getIntegration(id),
    getIntegrationRuns(id, query),
    getIntegrationLogs(id, query),
  ]);
  if (integration === 'not-found') notFound();
  if (typeof integration === 'string') redirect('/dashboard/forbidden');
  if (typeof runs === 'string' || typeof logs === 'string')
    redirect('/dashboard/forbidden');

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={integration.tipo}
        title={integration.nome}
        description="Teste conectividade sem importar, execute manualmente e acompanhe cada tentativa separadamente."
        actions={
          <Badge
            tone={
              integration.status === 'ATIVA'
                ? 'success'
                : integration.status === 'ERRO'
                  ? 'danger'
                  : 'warning'
            }
          >
            {integration.status}
          </Badge>
        }
      />
      <Card className="grid gap-5 p-5 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Administradora
          </p>
          <p className="mt-1">{integration.administradora?.nome ?? 'Geral'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Fonte de dados
          </p>
          <p className="mt-1">
            {integration.fonteDados?.nome ?? 'Não vinculada'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">
            Credencial
          </p>
          <p className="mt-1">
            {integration.configurado
              ? 'Configuração disponível'
              : 'Configuração pendente'}
          </p>
        </div>
        <div className="md:col-span-3">
          <IntegrationActions identity={identity} integration={integration} />
        </div>
      </Card>
      <Card>
        <div className="border-b p-5">
          <h3 className="font-semibold">Execuções</h3>
        </div>
        {runs.items.length === 0 ? (
          <EmptyState
            title="Nenhuma execução"
            description="Use Executar agora para iniciar um ciclo rastreável."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    'Início',
                    'Trigger',
                    'Status',
                    'Recebidos',
                    'Válidos',
                    'Inválidos',
                    'Criados',
                    'Atualizados',
                    'Ignorados',
                  ].map((label) => (
                    <th className="px-4 py-3" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.items.map((run) => (
                  <tr className="border-t" key={run.id}>
                    <td className="px-4 py-3">
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(run.iniciadoEm))}
                    </td>
                    <td className="px-4 py-3">{run.trigger}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          run.status === 'SUCESSO'
                            ? 'success'
                            : run.status === 'FALHA'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{run.registrosRecebidos}</td>
                    <td className="px-4 py-3">{run.registrosValidos}</td>
                    <td className="px-4 py-3">{run.registrosInvalidos}</td>
                    <td className="px-4 py-3">{run.registrosCriados}</td>
                    <td className="px-4 py-3">{run.registrosAtualizados}</td>
                    <td className="px-4 py-3">{run.registrosIgnorados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <div className="border-b p-5">
          <h3 className="font-semibold">Logs técnicos sanitizados</h3>
        </div>
        {logs.items.length === 0 ? (
          <EmptyState
            title="Nenhum log"
            description="Testes e execuções aparecerão aqui sem payloads ou segredos."
          />
        ) : (
          <div className="divide-y">
            {logs.items.map((log) => (
              <div
                className="grid gap-2 p-4 text-sm md:grid-cols-5"
                key={log.id}
              >
                <span>{log.evento ?? 'EVENTO'}</span>
                <span>{log.status}</span>
                <span>
                  {log.duracaoMs === null ? '—' : `${log.duracaoMs} ms`}
                </span>
                <span>{log.quantidade ?? '—'} registros</span>
                <span className="text-[var(--color-muted)]">
                  {log.mensagem ?? log.erroCodigo ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
