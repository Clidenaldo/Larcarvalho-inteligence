import { redirect } from 'next/navigation';

import { CommercialConfigurationManager } from '../../../../components/commercial-configuration-manager';
import { PageHeader } from '../../../../components/page-header';
import { getAdministradoras } from '../../../../services/api/administradoras';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getCommercialConfiguration,
  getProductCommercialRules,
} from '../../../../services/api/commercial';
import { getProdutos } from '../../../../services/api/operacional';

export default async function CommercialConfigurationPage() {
  const [identity, configuration, rules, administrators, products] =
    await Promise.all([
      getCurrentIdentity(),
      getCommercialConfiguration(),
      getProductCommercialRules({ page: 1, pageSize: 100 }),
      getAdministradoras({ page: 1, pageSize: 100, status: 'ativas' }),
      getProdutos({ page: 1, pageSize: 100, status: 'ativos' }),
    ]);
  if (!identity || configuration === 'unauthorized' || rules === 'unauthorized')
    redirect('/login');
  if (
    configuration === 'forbidden' ||
    configuration === 'not-found' ||
    rules === 'forbidden' ||
    rules === 'not-found'
  )
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Governança financeira"
        title="Configuração comercial"
        description="Regras versionadas e auditáveis. Valores ausentes nunca são substituídos por condições fictícias."
      />
      <CommercialConfigurationManager
        configuration={configuration}
        rules={rules.items}
        administrators={
          typeof administrators === 'string' ? [] : administrators.items
        }
        products={typeof products === 'string' ? [] : products.items}
        canManageConfiguration={identity.permissions.includes(
          'commercial_config.update',
        )}
        canManageRules={identity.permissions.includes(
          'commercial_rules.manage',
        )}
      />
    </div>
  );
}
