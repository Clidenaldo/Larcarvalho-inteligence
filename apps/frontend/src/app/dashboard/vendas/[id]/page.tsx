import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '../../../../components/page-header';
import { SaleDetail } from '../../../../components/sale-detail';
import { Badge } from '../../../../components/ui/badge';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getSale } from '../../../../services/api/sales';

const SALE_READ = ['sales.read_own', 'sales.read_team', 'sales.read_all'] as const;

export const dynamic = 'force-dynamic';

export default async function SalePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!SALE_READ.some((permission) => identity.permissions.includes(permission)))
    redirect('/dashboard/forbidden');
  const sale = await getSale(id);
  if (sale === 'unauthorized') redirect('/login');
  if (sale === 'forbidden') redirect('/dashboard/forbidden');
  if (sale === 'not-found') notFound();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação de venda"
        title={sale.numero}
        description={`Cliente ${sale.lead?.nome ?? ''} · crédito contratado R$ ${sale.valorCreditoContratado}`}
        actions={<Badge tone="info">{sale.status.replaceAll('_', ' ')}</Badge>}
      />
      <SaleDetail identity={identity} sale={sale} />
    </div>
  );
}
