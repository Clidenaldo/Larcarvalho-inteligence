import { getTeams } from '../../../services/api/access-management';
import { Field, Input, Select } from '../../../components/ui/field';
import { Button } from '../../../components/ui/button';
import { userRoles } from '@larcarvalho/shared';
import { roleLabels } from '../../../lib/identity';
import { redirect } from 'next/navigation';

import { PageHeader } from '../../../components/page-header';
import { UsersManager } from '../../../components/users-manager';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getUsers } from '../../../services/api/users';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('users.read'))
    redirect('/dashboard/forbidden');
  const filters = await searchParams;
  const rawPage = Number(filters.page ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [users, teams] = await Promise.all([
    getUsers(page, 20, filters),
    identity.permissions.includes('teams.read') ? getTeams() : null,
  ]);
  const teamItems = teams && typeof teams !== 'string' ? teams.items : [];
  if (users === 'unauthorized') redirect('/login');
  if (users === 'forbidden') redirect('/dashboard/forbidden');

  return (
    <div className="space-y-7">
      <PageHeader
        description="Crie contas, acompanhe status e gerencie papéis dentro dos limites da sua autorização."
        eyebrow="Administração"
        title="Usuários"
      />
      <form className="grid gap-3 rounded-xl border border-[var(--color-border)] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Buscar nome ou email">
          <Input name="busca" defaultValue={filters.busca} />
        </Field>
        <Field helpKey="filter.relation" label="Papel">
          <Select name="role" defaultValue={filters.role ?? ''}>
            <option value="">Todos</option>
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>
        </Field>
        <Field helpKey="filter.relation" label="Equipe">
          <Select name="teamId" defaultValue={filters.teamId ?? ''}>
            <option value="">Todas</option>
            {teamItems.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field helpKey="filter.status" label="Status">
          <Select name="ativo" defaultValue={filters.ativo ?? ''}>
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </Select>
        </Field>
        <Button type="submit">Filtrar</Button>
      </form>
      <UsersManager data={users} identity={identity} teams={teamItems} />
    </div>
  );
}
