import { redirect } from 'next/navigation';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getManagedUser, getPermissionMatrix, getTeams, getUserPermissions } from '../../../../services/api/access-management';
import { UserAccessEditor } from '../../../../components/user-access-editor';
import { PageHeader } from '../../../../components/page-header';
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('users.read')) redirect('/dashboard/forbidden');
  const { id } = await params;
  const [user, teams, access, matrix] = await Promise.all([getManagedUser(id), identity.permissions.includes('teams.read') ? getTeams() : null, identity.permissions.includes('users.permissions.manage') ? getUserPermissions(id) : null, identity.permissions.includes('users.permissions.manage') ? getPermissionMatrix() : null]);
  if (typeof user === 'string') redirect(user === 'unauthorized' ? '/login' : '/dashboard/forbidden');
  return <div className="space-y-6"><PageHeader title={user.nome} eyebrow="Gestão de acesso" description="Dados, equipe e permissões efetivas do usuário." /><UserAccessEditor key={user.updatedAt} user={user} identity={identity} teams={teams && typeof teams !== 'string' ? teams.items : []} access={typeof access === 'string' ? null : access} matrix={typeof matrix === 'string' ? null : matrix} /></div>;
}
