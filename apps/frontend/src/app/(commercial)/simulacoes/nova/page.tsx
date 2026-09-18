import { redirect } from 'next/navigation';

import { PageHeader } from '../../../../components/page-header';
import { SimulationCreateForm } from '../../../../components/simulation-create-form';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getLeads } from '../../../../services/api/leads';
import { getSimulationCatalog, getSimulationCatalogFavorites } from '../../../../services/api/commercial';

export default async function NewSimulationPage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('simulations.create')) redirect('/dashboard/forbidden');
  const [catalog, leads, favorites] = await Promise.all([getSimulationCatalog(), getLeads({ page: 1, pageSize: 100, sort: 'maisRecentes' }), getSimulationCatalogFavorites()]);
  if (typeof catalog === 'string') redirect(catalog === 'unauthorized' ? '/login' : '/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Motor comercial"
        title="Nova simulação"
        description="Compare cenários calculados exclusivamente com regras comerciais versionadas e dados disponíveis no sistema."
      />
      <SimulationCreateForm
        administrators={catalog.administrators}
        products={catalog.products}
        groups={catalog.groups}
        quotas={catalog.quotas}
        leads={typeof leads === 'string' ? [] : leads.items}
        favoriteAdministratorIds={
          typeof favorites === 'string' ? [] : favorites.administratorIds
        }
        favoriteProductIds={
          typeof favorites === 'string' ? [] : favorites.productIds
        }
      />
    </div>
  );
}
