'use client';
import {
  publicThemeDefaults,
  publicThemeFields,
  publicThemePresets,
  publicThemeSchema,
  publicThemeContrast,
  type PublicTheme,
} from '@larcarvalho/shared';
import { ColorThemeEditor } from './color-theme-editor';
import { PublicThemePreview } from './public-theme-preview';

export function PublicThemeManager({ theme }: { theme: PublicTheme }) {
  return (
    <ColorThemeEditor
      theme={theme}
      defaults={publicThemeDefaults}
      fields={publicThemeFields}
      presets={publicThemePresets}
      parse={publicThemeSchema.parse}
      contrastChecks={publicThemeContrast}
      area="public"
      previewModes={['Landing Page', 'Simulador', 'Resultado']}
      renderPreview={(draft, mode) => (
        <PublicThemePreview
          theme={draft}
          mode={
            mode === 'Simulador' || mode === 'Resultado' ? mode : 'Landing Page'
          }
        />
      )}
    />
  );
}
