import { notFound, redirect } from 'next/navigation';

import { AiAnalyzeButton } from '../../../../components/ai-analyze-button';
import { PageHeader } from '../../../../components/page-header';
import { SimulationDetail } from '../../../../components/simulation-detail';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getSimulation } from '../../../../services/api/commercial';
import { getLeads } from '../../../../services/api/leads';

export default async function SimulationPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [simulation, leads, identity] = await Promise.all([
    getSimulation(id),
    getLeads({ page: 1, pageSize: 100, sort: 'maisRecentes' }),
    getCurrentIdentity(),
  ]);
  if (simulation === 'unauthorized' || leads === 'unauthorized' || !identity)
    redirect('/login');
  if (simulation === 'not-found') notFound();
  if (simulation === 'forbidden') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Simulação salva"
        title={simulation.number}
        description="Resultados reproduzíveis, com versão da regra, origem dos dados e premissas registradas."
        actions={
          identity.permissions.includes('ai.simulation_explain') ? (
            <AiAnalyzeButton
              contextId={id}
              contextType="SIMULATION"
              label="Explicar com IA"
              message="Explique esta simulação"
              promptId="simulation-explanation"
            />
          ) : null
        }
      />
      <SimulationDetail
        key={simulation.id}
        simulation={simulation}
        leads={typeof leads === 'string' ? [] : leads.items}
      />
    </div>
  );
}
