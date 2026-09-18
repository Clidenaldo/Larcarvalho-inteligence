import { notFound, redirect } from 'next/navigation';

import { AiAnalyzeButton } from '../../../../components/ai-analyze-button';
import { PageHeader } from '../../../../components/page-header';
import { ProposalDetail } from '../../../../components/proposal-detail';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getProposal, getProposalVersions } from '../../../../services/api/commercial';
import { getFollowUps } from '../../../../services/api/portfolio';

const PROPOSAL_UPDATE = [
  'proposals.update_own',
  'proposals.update_team',
  'proposals.update_all',
] as const;

export default async function ProposalPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [proposal, identity] = await Promise.all([
    getProposal(id),
    getCurrentIdentity(),
  ]);
  if (proposal === 'unauthorized' || !identity) redirect('/login');
  if (proposal === 'forbidden') redirect('/dashboard/forbidden');
  if (proposal === 'not-found') notFound();
  const [versions, followUps] = await Promise.all([
    getProposalVersions(id),
    getFollowUps({ leadId: proposal.leadId, page: 1, pageSize: 1, scope: 'all', sort: 'dueAt', status: 'PENDING' }),
  ]);
  if (versions === 'unauthorized' || followUps === 'unauthorized') redirect('/login');
  if (versions === 'forbidden' || followUps === 'forbidden')
    redirect('/dashboard/forbidden');
  if (versions === 'not-found' || followUps === 'not-found') notFound();
  const canEdit =
    proposal.status === 'DRAFT' &&
    PROPOSAL_UPDATE.some((permission) => identity.permissions.includes(permission));
  const canCreateVersion = identity.permissions.includes('proposals.create');
  const canCreateSale =
    proposal.status === 'ACCEPTED' && identity.permissions.includes('sales.create');
  const suggestFollowUp =
    ['GENERATED', 'SENT', 'VIEWED'].includes(proposal.status) && followUps.total === 0;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Proposta comercial"
        title={`${proposal.number} · v${proposal.version}`}
        description="Condição financeira congelada no momento da geração, com histórico auditável."
        actions={
          identity.permissions.includes('ai.use') ? (
            <AiAnalyzeButton
              contextId={id}
              contextType="PROPOSAL"
              label="Resumir com IA"
              message="Resuma esta proposta"
              promptId="commercial-copilot"
            />
          ) : null
        }
      />
      <ProposalDetail
        canCreateVersion={canCreateVersion}
        canCreateSale={canCreateSale}
        canEdit={canEdit}
        proposal={proposal}
        suggestFollowUp={suggestFollowUp}
        versions={versions}
      />
    </div>
  );
}
