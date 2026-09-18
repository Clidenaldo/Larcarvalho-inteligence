import { agendaQuerySchema } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';

import { AgendaView } from '../../../components/agenda-view';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { Field, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAgenda, getTeamAgenda } from '../../../services/api/agenda';

export const dynamic = 'force-dynamic';

const LEAD_READ = ['leads.read_own', 'leads.read_team', 'leads.read_all'] as const;
const LEAD_UPDATE = ['leads.update_own', 'leads.update_team', 'leads.update_all'] as const;

export default async function AgendaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!LEAD_READ.some((permission) => identity.permissions.includes(permission)))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const query = agendaQuerySchema.parse({ ...raw, pageSize: raw.pageSize ?? '100' });
  const showTeam =
    identity.permissions.includes('leads.read_team') ||
    identity.permissions.includes('leads.read_all');
  const data = showTeam
    ? await getTeamAgenda(query)
    : await getAgenda(query);
  if (data === 'unauthorized') redirect('/login');
  if (data === 'forbidden') redirect('/dashboard/forbidden');
  const canComplete = identity.permissions.includes('leads.add_interaction');
  const canReschedule = LEAD_UPDATE.some((permission) =>
    identity.permissions.includes(permission),
  );
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação diária"
        title="Agenda comercial"
        description="O que precisa ser feito hoje, por ordem de prioridade operacional. Cada item explica o motivo."
      />
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" method="get">
          <Field label="Período (próximos dias)">
            <Select name="days" defaultValue={String(query.days)}>
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="14">14 dias</option>
              <option value="30">30 dias</option>
            </Select>
          </Field>
          <Field label="Tipo">
            <Select name="type" defaultValue={query.type ?? ''}>
              <option value="">Todos</option>
              <option value="CALL">Ligação</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">E-mail</option>
              <option value="MEETING">Reunião</option>
              <option value="OTHER">Outro</option>
            </Select>
          </Field>
          <Button type="submit">Filtrar</Button>
        </form>
      </Card>
      <AgendaView
        canComplete={canComplete}
        canReschedule={canReschedule}
        initial={data}
        showTeam={showTeam}
      />
    </div>
  );
}
