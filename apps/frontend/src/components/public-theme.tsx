import type { ReactNode } from 'react';
import type { PublicTheme } from '@larcarvalho/shared';
import { publicThemeStyle } from '../lib/public-theme';

export function PublicThemeScope({
  theme,
  children,
}: {
  theme: PublicTheme;
  children: ReactNode;
}) {
  return (
    <div className="public-theme" style={publicThemeStyle(theme)}>
      {children}
    </div>
  );
}
