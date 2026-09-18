import { redirect } from 'next/navigation';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getTeams } from '../../../services/api/access-management';
import { getUsers } from '../../../services/api/users';
import { TeamsManager } from '../../../components/teams-manager';
import { PageHeader } from '../../../components/page-header';
export default async function TeamsPage() {
  const identity = await getCurrentIdentity(); if (!identity) redirect('/login');
  if (!identity.permissions.includes('teams.read')) redirect('/dashboard/forbidden');
  const [teams, users] = await Promise.all([getTeams(), identity.permissions.includes('users.read') ? getUsers(1, 100) : null]);
  if (typeof teams === 'string') redirect(teams === 'unauthorized' ? '/login' : '/dashboard/forbidden');
  return <div className="space-y-6"><PageHeader title="Equipes" eyebrow="Gestão comercial" description="Organize os vendedores e defina os gestores responsáveis." /><TeamsManager teams={teams.items} users={users && typeof users !== 'string' ? users.items : []} identity={identity} /></div>;
}
