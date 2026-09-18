import { integrationListQuerySchema } from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { IntegrationCreateForm } from '../../../components/integration-create-form';
import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { EmptyState } from '../../../components/ui/empty-state';
import { Pagination } from '../../../components/ui/pagination';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getIntegrations } from '../../../services/api/integrations';

export const dynamic = 'force-dynamic';
const statusLabel = {
  NAO_CONFIGURADA: 'Não configurada',
  ATIVA: 'Ativa',
  PAUSADA: 'Pausada',
  ERRO: 'Erro',
  DESABILITADA: 'Desabilitada',
} as const;
const typeLabel = {
  MOCK: 'Mock',
  REST_API: 'REST',
  SOAP: 'SOAP',
  SFTP: 'SFTP',
  FILE_PULL: 'Arquivo remoto',
  WEBHOOK: 'Webhook',
  MANUAL_IMPORT: 'Importação manual',
} as const;

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('integrations.read'))
    redirect('/dashboard/forbidden');
  const query = integrationListQuerySchema.parse(await searchParams);
  const data = await getIntegrations(query);
  if (typeof data === 'string') redirect('/dashboard/forbidden');

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação técnica"
        title="Integrações"
        description="Connectors autorizados, execuções isoladas e logs sanitizados. Nenhuma administradora real é conectada sem documentação e credenciais oficiais."
      />
      <IntegrationCreateForm identity={identity} />
      <Card>
        <div className="border-b p-5">
          <h3 className="font-semibold">Integrações configuradas</h3>
        </div>
        {data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma integração"
            description="Cadastre um connector controlado ou deixe um futuro fornecedor como não configurado."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Nome',
                      'Connector',
                      'Administradora',
                      'Status',
                      'Configuração',
                      'Último sucesso',
                      'Ações',
                    ].map((label) => (
                      <th className="px-4 py-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr className="border-t" key={item.id}>
                      <td className="px-4 py-3 font-medium">{item.nome}</td>
                      <td className="px-4 py-3">{typeLabel[item.tipo]}</td>
                      <td className="px-4 py-3">
                        {item.administradora?.nome ?? 'Geral'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            item.status === 'ATIVA'
                              ? 'success'
                              : item.status === 'ERRO'
                                ? 'danger'
                                : item.status === 'PAUSADA'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {statusLabel[item.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {item.configurado ? 'Pronta' : 'Pendente'}
                      </td>
                      <td className="px-4 py-3">
                        {item.ultimoSucessoEm
                          ? new Intl.DateTimeFormat('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(item.ultimoSucessoEm))
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="font-semibold text-[var(--color-primary)] hover:underline"
                          href={`/dashboard/integracoes/${item.id}`}
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
