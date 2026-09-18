import {
  adminThemeDefaults,
  adminThemeFields,
  adminThemeSchema,
  type AdminTheme,
} from '@larcarvalho/shared';
import type { CSSProperties } from 'react';

export function adminThemeAttributes(theme: AdminTheme) {
  return {
    'data-admin-card-background':
      theme.cardBackground !== adminThemeDefaults.cardBackground ||
      theme.surface !== adminThemeDefaults.surface
        ? 'custom'
        : undefined,
    'data-admin-card-border':
      theme.cardBorder !== adminThemeDefaults.cardBorder ||
      theme.border !== adminThemeDefaults.border
        ? 'custom'
        : undefined,
    'data-admin-table-background':
      theme.tableHeaderBackground !==
        adminThemeDefaults.tableHeaderBackground ||
      theme.surfaceSubtle !== adminThemeDefaults.surfaceSubtle
        ? 'custom'
        : undefined,
    'data-admin-table-text':
      theme.tableHeaderText !== adminThemeDefaults.tableHeaderText ||
      theme.textSoft !== adminThemeDefaults.textSoft
        ? 'custom'
        : undefined,
  };
}

export function adminThemeStyle(theme: AdminTheme): CSSProperties {
  const safe = adminThemeSchema.safeParse(theme);
  const values = safe.success ? safe.data : adminThemeDefaults;
  return {
    ...Object.fromEntries(
      adminThemeFields.map(([key]) => [
        `--admin-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        values[key],
      ]),
    ),
    '--admin-neutral-background':
      values.surfaceSubtle === adminThemeDefaults.surfaceSubtle
        ? 'var(--color-slate-100)'
        : values.surfaceSubtle,
    '--admin-neutral-muted':
      values.textMuted === adminThemeDefaults.textMuted
        ? 'var(--color-slate-500)'
        : values.textMuted,
    '--admin-neutral-subtle':
      values.surfaceSubtle === adminThemeDefaults.surfaceSubtle
        ? 'var(--color-slate-50)'
        : values.surfaceSubtle,
    '--admin-neutral-soft':
      values.textSoft === adminThemeDefaults.textSoft
        ? 'var(--color-slate-600)'
        : values.textSoft,
    '--admin-sidebar-muted':
      values.sidebarText === adminThemeDefaults.sidebarText
        ? values.textMuted
        : values.sidebarText,
    '--admin-sidebar-heading':
      values.sidebarText === adminThemeDefaults.sidebarText
        ? values.text
        : values.sidebarText,
    '--admin-header-muted':
      values.headerText === adminThemeDefaults.headerText
        ? values.textMuted
        : values.headerText,
  } as CSSProperties;
}
