'use client';
import { useState } from 'react';
import type {
  AppearanceConfiguration,
  PublicTheme,
  AdminTheme,
} from '@larcarvalho/shared';
import { AppearanceConfigurationManager } from './appearance-configuration-manager';
import { PublicThemeManager } from './public-theme-manager';
import { AdminThemeManager } from './admin-theme-manager';
import { Button } from './ui/button';

export function AppearanceSettings({
  appearance,
  publicTheme,
  adminTheme,
  canPublic = true,
  canAdmin = true,
}: {
  appearance: AppearanceConfiguration;
  publicTheme: PublicTheme;
  adminTheme: AdminTheme;
  canPublic?: boolean;
  canAdmin?: boolean;
}) {
  const [area, setArea] = useState<'public' | 'admin'>(canPublic ? 'public' : 'admin');
  return (
    <div className="space-y-6">
      <nav aria-label="Área da aparência" className="flex flex-wrap gap-2">
        {canPublic && <Button
          aria-pressed={area === 'public'}
          variant={area === 'public' ? 'primary' : 'outline'}
          onClick={() => setArea('public')}
        >
          Área pública
        </Button>}
        {canAdmin && <Button
          aria-pressed={area === 'admin'}
          variant={area === 'admin' ? 'primary' : 'outline'}
          onClick={() => setArea('admin')}
        >
          Painel administrativo
        </Button>}
      </nav>
      {canPublic && <div hidden={area !== 'public'}>
        <PublicThemeManager theme={publicTheme} />
      </div>}
      {canAdmin && <div hidden={area !== 'admin'}>
        <AdminThemeManager theme={adminTheme} />
        <AppearanceConfigurationManager appearance={appearance} />
      </div>}
    </div>
  );
}
