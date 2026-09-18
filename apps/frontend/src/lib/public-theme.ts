import {
  publicThemeDefaults,
  publicThemeFields,
  publicThemeSchema,
  type PublicTheme,
} from '@larcarvalho/shared';
import type { CSSProperties } from 'react';

export function publicThemeStyle(theme: PublicTheme): CSSProperties {
  // Only validated hex colors may enter inline CSS, including the live preview.
  const safe = publicThemeSchema.safeParse(theme);
  const values = safe.success ? safe.data : publicThemeDefaults;
  const tokens = Object.fromEntries(
    publicThemeFields.map(([key]) => [
      `--public-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      values[key],
    ]),
  );
  // The simulator originally has a transparent header and a light footer.
  // Preserve those contextual defaults while honoring customized header/footer colors.
  return {
    ...tokens,
    '--public-simulator-header-background':
      values.headerBackground === publicThemeDefaults.headerBackground
        ? 'transparent'
        : values.headerBackground,
    '--public-simulator-header-text':
      values.headerText === publicThemeDefaults.headerText &&
      values.headerBackground === publicThemeDefaults.headerBackground
        ? publicThemeDefaults.text
        : values.headerText,
    '--public-simulator-footer-background':
      values.footerBackground === publicThemeDefaults.footerBackground
        ? 'rgb(255 255 255 / 70%)'
        : values.footerBackground,
    '--public-simulator-footer-text':
      values.footerText === publicThemeDefaults.footerText &&
      values.footerBackground === publicThemeDefaults.footerBackground
        ? '#6b7280'
        : values.footerText,
  } as CSSProperties;
}
