import type { ReactNode } from 'react';
import type { AdminTheme } from '@larcarvalho/shared';
import { adminThemeStyle, adminThemeAttributes } from '../lib/admin-theme';

export function AdminThemeScope({
  theme,
  children,
}: {
  theme: AdminTheme;
  children: ReactNode;
}) {
  return (
    <div
      className="admin-theme"
      style={adminThemeStyle(theme)}
      {...adminThemeAttributes(theme)}
    >
      {children}
    </div>
  );
}
