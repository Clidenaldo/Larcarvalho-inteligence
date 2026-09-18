'use client';
import {
  adminThemeDefaults,
  adminThemeFields,
  adminThemePresets,
  adminThemeSchema,
  adminThemeContrast,
  type AdminTheme,
} from '@larcarvalho/shared';
import { ColorThemeEditor } from './color-theme-editor';
import { AdminThemePreview } from './admin-theme-preview';

export function AdminThemeManager({ theme }: { theme: AdminTheme }) {
  return (
    <ColorThemeEditor
      theme={theme}
      defaults={adminThemeDefaults}
      fields={adminThemeFields}
      presets={adminThemePresets}
      parse={adminThemeSchema.parse}
      contrastChecks={adminThemeContrast}
      area="admin"
      previewModes={['Dashboard']}
      renderPreview={(draft) => <AdminThemePreview theme={draft} />}
    />
  );
}
