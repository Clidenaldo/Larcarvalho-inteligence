import { redirect } from 'next/navigation';

import { MyAccountManager } from '../../../components/my-account-manager';
import { PageHeader } from '../../../components/page-header';
import { getMyAccount } from '../../../services/api/experience';

export default async function MyAccountPage() {
  const account = await getMyAccount();
  if (account === 'unauthorized') redirect('/login');
  if (account === 'forbidden' || account === 'not-found')
    redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Perfil do usuário"
        title="Minha conta"
        description="Atualize seus dados comerciais, preferências e credenciais sem expor informações de outros usuários."
      />
      <MyAccountManager account={account} />
    </div>
  );
}
