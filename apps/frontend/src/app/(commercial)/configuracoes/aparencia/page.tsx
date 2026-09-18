import { publicThemeDefaults } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';

import { AppearanceSettings } from '../../../../components/appearance-settings';
import { PageHeader } from '../../../../components/page-header';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getAppearanceConfiguration,
  getAdminPublicTheme,
  getAdminTheme,
} from '../../../../services/api/experience';

export default async function AppearanceConfigurationPage() {
  const [identity, appearance] = await Promise.all([
    getCurrentIdentity(),
    getAppearanceConfiguration(),
  ]);
  if (!identity || appearance === 'unauthorized') redirect('/login');
  if (
    !identity.permissions.some((permission) => permission === 'themes.public.manage' || permission === 'themes.admin.manage') ||
    appearance === 'forbidden' ||
    appearance === 'not-found'
  ) {
    redirect('/dashboard/forbidden');
  }
  const [publicTheme, adminTheme] = await Promise.all([
    identity.permissions.includes('themes.public.manage') ? getAdminPublicTheme() : publicThemeDefaults,
    getAdminTheme(),
  ]);
  if (adminTheme === 'unauthorized') redirect('/login');
  if (typeof adminTheme === 'string') redirect('/dashboard/forbidden');
  if (publicTheme === 'unauthorized') redirect('/login');
  if (typeof publicTheme === 'string') redirect('/dashboard/forbidden');
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Identidade Larcarvalho"
        title="Aparência"
        description="Configure marca, paleta e contraste da experiência comercial sem alterar regras financeiras."
      />
      <AppearanceSettings
        canPublic={identity.permissions.includes('themes.public.manage')}
        canAdmin={identity.permissions.includes('themes.admin.manage')}
        adminTheme={adminTheme}
        appearance={appearance}
        publicTheme={publicTheme}
      />
    </div>
  );
}
