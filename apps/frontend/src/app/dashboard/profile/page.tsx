import { Mail, Shield, UserRound } from 'lucide-react';
import { redirect } from 'next/navigation';

import { ChangePasswordForm } from '../../../components/change-password-form';
import { PageHeader } from '../../../components/page-header';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { roleLabels } from '../../../lib/identity';
import { getCurrentIdentity } from '../../../services/api/auth';

export default async function ProfilePage() {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  const details = [
    { icon: UserRound, label: 'Nome', value: identity.user.nome },
    { icon: Mail, label: 'Email', value: identity.user.email },
    { icon: Shield, label: 'Papel', value: roleLabels[identity.user.role] },
  ];
  return (
    <div className="space-y-7">
      <PageHeader
        description="Consulte sua identidade e mantenha sua credencial de acesso atualizada."
        eyebrow="Conta"
        title="Meu perfil"
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Dados da conta</h3>
            <Badge tone="success">Sessão ativa</Badge>
          </div>
          <dl className="mt-6 space-y-5">
            {details.map(({ icon: Icon, label, value }) => (
              <div className="flex gap-3" key={label}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-muted)]">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-6">
          <h3 className="font-semibold">Segurança</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
            Ao alterar sua senha, todas as outras sessões serão revogadas.
          </p>
          <div className="mt-6">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
