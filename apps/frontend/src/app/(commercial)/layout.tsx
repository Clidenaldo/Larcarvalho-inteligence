import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '../../components/app-shell';
import { getCurrentIdentity } from '../../services/api/auth';
import {
  getAppearanceConfiguration,
  getAdminTheme,
} from '../../services/api/experience';

export const dynamic = 'force-dynamic';

export default async function CommercialLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [identity, appearance, adminTheme] = await Promise.all([
    getCurrentIdentity(),
    getAppearanceConfiguration().catch(() => null),
    getAdminTheme().catch(() => null),
  ]);
  if (!identity) redirect('/login');
  return (
    <AppShell
      adminTheme={typeof adminTheme === 'string' ? null : adminTheme}
      appearance={typeof appearance === 'string' ? null : appearance}
      identity={identity}
    >
      {children}
    </AppShell>
  );
}
