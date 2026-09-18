import { notFound, redirect } from 'next/navigation';
import { AiAnalyzeButton } from '../../../../../components/ai-analyze-button';
import { LeadDetailManager } from '../../../../../components/lead-detail-manager';
import { PageHeader } from '../../../../../components/page-header';
import { Badge } from '../../../../../components/ui/badge';
import { getCurrentIdentity } from '../../../../../services/api/auth';
import { getLead } from '../../../../../services/api/leads';
import { getSimulationCatalog } from '../../../../../services/api/commercial';
import { getAssignmentUsers } from '../../../../../services/api/access-management';

export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  const { id } = await params;
  const lead = await getLead(id);
  if (lead === 'unauthorized') redirect('/login');
  if (lead === 'forbidden') redirect('/dashboard/forbidden');
  if (lead === 'not-found') notFound();
  const [usersResult, groupsResult] = await Promise.all([
    identity.permissions.includes('leads.assign')
      ? getAssignmentUsers()
      : Promise.resolve('forbidden' as const),
    getSimulationCatalog(),
  ]);
  const users = typeof usersResult === 'string' ? [] : usersResult.items;
  const groups =
    typeof groupsResult === 'string'
      ? []
      : groupsResult.groups.map((group) => ({
          id: group.id,
          codigo: group.codigo,
        }));
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="CRM · histórico comercial"
        title={lead.nome}
        description="Dados pessoais: use somente para o atendimento desta solicitação."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                lead.status === 'PERDIDO'
                  ? 'danger'
                  : lead.status === 'CONVERTIDO'
                    ? 'success'
                    : 'neutral'
              }
            >
              {lead.status.replaceAll('_', ' ')}
            </Badge>
            {identity.permissions.includes('ai.lead_analysis') ? (
              <AiAnalyzeButton
                contextId={id}
                contextType="LEAD"
                label="Analisar com IA"
                message="Analise este cliente"
                promptId="lead-analysis"
              />
            ) : null}
          </div>
        }
      />
      <LeadDetailManager
        groups={groups}
        lead={lead}
        permissions={[...identity.permissions]}
        users={users}
      />
    </div>
  );
}
