import { redirect } from 'next/navigation';

import { AiConfigurationManager } from '../../../../components/ai-configuration-manager';
import { PageHeader } from '../../../../components/page-header';
import { getAiConfig, getAiStatus } from '../../../../services/api/ai';
import { getCurrentIdentity } from '../../../../services/api/auth';

export const dynamic = 'force-dynamic';

export default async function AiConfigurationPage() {
  const [identity, status, config] = await Promise.all([
    getCurrentIdentity(),
    getAiStatus(),
    getAiConfig(),
  ]);
  if (!identity || status === 'unauthorized' || config === 'unauthorized')
    redirect('/login');
  if (status === 'forbidden' || config === 'forbidden') redirect('/dashboard/forbidden');
  if (!identity.permissions.includes('ai.settings'))
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Configurações"
        title="Inteligência Artificial"
        description="Camada central do copiloto comercial. Somente usuários autorizados. Nenhum segredo é exibido aqui."
      />
      <AiConfigurationManager status={status} canManage={true} />
    </div>
  );
}
