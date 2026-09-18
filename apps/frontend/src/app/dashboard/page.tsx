import { dashboardQuerySchema } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';

import { AgendaTodayBlock } from '../../components/agenda-today-block';
import { DashboardOverviewView } from '../../components/dashboard-overview';
import { DashboardPeriodFilter } from '../../components/dashboard-period-filter';
import { PageHeader } from '../../components/page-header';
import { roleLabels } from '../../lib/identity';
import { getAgenda } from '../../services/api/agenda';
import { getCurrentIdentity } from '../../services/api/auth';
import { getDashboardOverview } from '../../services/api/dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = dashboardQuerySchema.safeParse({
    period: typeof raw.period === 'string' ? raw.period : undefined,
    from: typeof raw.from === 'string' ? raw.from : undefined,
    to: typeof raw.to === 'string' ? raw.to : undefined,
  });
  const query = parsed.success ? parsed.data : dashboardQuerySchema.parse({});
  const [identity, data] = await Promise.all([
    getCurrentIdentity(),
    getDashboardOverview(query),
  ]);
  if (!identity || data === 'unauthorized') redirect('/login');
  if (data === 'forbidden') redirect('/dashboard/forbidden');
  const canSeeAgenda = (
    ['leads.read_own', 'leads.read_team', 'leads.read_all'] as const
  ).some((permission) => identity.permissions.includes(permission));
  const agenda = canSeeAgenda
    ? await getAgenda({ days: 7, page: 1, pageSize: 1 })
    : 'forbidden';
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={roleLabels[identity.user.role]}
        title="Dashboard"
        description="Indicadores factuais, tendências descritivas e pendências operacionais."
        actions={<DashboardPeriodFilter query={query} />}
      />
      {typeof agenda !== 'string' ? (
        <AgendaTodayBlock
          today={agenda.totals.today}
          overdue={agenda.totals.overdue}
          proposalsAwaiting={agenda.totals.proposalsAwaiting}
          noNextAction={agenda.totals.noNextAction}
        />
      ) : null}
      <DashboardOverviewView data={data} />
    </div>
  );
}
