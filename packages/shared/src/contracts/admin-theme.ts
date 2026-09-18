import { z } from 'zod';
import { hexColorSchema, type AppearanceConfiguration } from './experience.js';
import { publicContrastRatio } from './public-theme.js';

// Matches design-tokens.css and the existing administrative shell.
export const adminThemeDefaults = {
  primary: '#34806b',
  secondary: '#000000',
  accent: '#c05400',
  warning: '#9a5b08',
  background: '#f2f2f2',
  surface: '#ffffff',
  surfaceSubtle: '#f8fafc',
  text: '#000000',
  textMuted: '#6b7280',
  textSoft: '#475569',
  border: '#b7c2cb',
  borderStrong: '#0f172a',
  sidebarBackground: '#ffffff',
  sidebarText: '#475569',
  sidebarActive: '#34806b',
  sidebarActiveBackground: '#ebf2f0',
  headerBackground: '#ffffff',
  headerText: '#000000',
  cardBackground: '#ffffff',
  cardBorder: '#b7c2cb',
  tableHeaderBackground: '#f8fafc',
  tableHeaderText: '#475569',
  buttonPrimary: '#34806b',
  buttonPrimaryText: '#ffffff',
  inputBackground: '#ffffff',
  focus: '#34806b',
} as const;
export type AdminThemeKey = keyof typeof adminThemeDefaults;
export const adminThemeSchema = z
  .object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema,
    warning: hexColorSchema,
    background: hexColorSchema,
    surface: hexColorSchema,
    surfaceSubtle: hexColorSchema,
    text: hexColorSchema,
    textMuted: hexColorSchema,
    textSoft: hexColorSchema,
    border: hexColorSchema,
    borderStrong: hexColorSchema,
    sidebarBackground: hexColorSchema,
    sidebarText: hexColorSchema,
    sidebarActive: hexColorSchema,
    sidebarActiveBackground: hexColorSchema,
    headerBackground: hexColorSchema,
    headerText: hexColorSchema,
    cardBackground: hexColorSchema,
    cardBorder: hexColorSchema,
    tableHeaderBackground: hexColorSchema,
    tableHeaderText: hexColorSchema,
    buttonPrimary: hexColorSchema,
    buttonPrimaryText: hexColorSchema,
    inputBackground: hexColorSchema,
    focus: hexColorSchema,
  })
  .strict();
export type AdminTheme = z.infer<typeof adminThemeSchema>;
export const updateAdminThemeSchema = adminThemeSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos uma cor.',
  );
export type UpdateAdminTheme = z.infer<typeof updateAdminThemeSchema>;

// Legacy palettes remain the fallback until the first explicit admin-theme save.
export function adminThemeFromAppearance(
  appearance?: Pick<
    AppearanceConfiguration,
    | 'primaryColor'
    | 'secondaryColor'
    | 'accentColor'
    | 'warningColor'
    | 'lightBackground'
  > | null,
): AdminTheme {
  if (!appearance) return { ...adminThemeDefaults };
  const primary = hexColorSchema.parse(appearance.primaryColor);
  const soft =
    '#' +
    [1, 3, 5]
      .map((start) =>
        Math.round(
          Number.parseInt(primary.slice(start, start + 2), 16) * 0.1 +
            255 * 0.9,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return adminThemeSchema.parse({
    ...adminThemeDefaults,
    primary,
    buttonPrimary: primary,
    focus: primary,
    sidebarActive: primary,
    sidebarActiveBackground: soft,
    secondary: appearance.secondaryColor,
    accent: appearance.accentColor,
    warning: appearance.warningColor,
    background: appearance.lightBackground,
  });
}

export const adminThemeFields: ReadonlyArray<readonly [AdminThemeKey, string]> =
  [
    ['primary', 'Cor primária'],
    ['secondary', 'Cor secundária'],
    ['accent', 'Destaque'],
    ['warning', 'Alertas'],
    ['background', 'Fundo principal'],
    ['surface', 'Superfícies'],
    ['surfaceSubtle', 'Fundo dos detalhes'],
    ['text', 'Textos principais'],
    ['textMuted', 'Textos secundários'],
    ['textSoft', 'Textos de apoio'],
    ['border', 'Bordas'],
    ['borderStrong', 'Bordas dos campos'],
    ['sidebarBackground', 'Fundo da sidebar'],
    ['sidebarText', 'Texto da sidebar'],
    ['sidebarActive', 'Texto do item ativo'],
    ['sidebarActiveBackground', 'Fundo do item ativo'],
    ['headerBackground', 'Fundo do header'],
    ['headerText', 'Texto do header'],
    ['cardBackground', 'Fundo dos cards'],
    ['cardBorder', 'Bordas dos cards'],
    ['tableHeaderBackground', 'Cabeçalho das tabelas'],
    ['tableHeaderText', 'Texto das tabelas'],
    ['buttonPrimary', 'Botão primário'],
    ['buttonPrimaryText', 'Texto do botão primário'],
    ['inputBackground', 'Fundo dos campos'],
    ['focus', 'Foco e seleção'],
  ];
export const adminThemePresets: Readonly<Record<string, AdminTheme>> = {
  'Larcarvalho Admin': adminThemeDefaults,
  Sóbrio: {
    ...adminThemeDefaults,
    primary: '#334155',
    buttonPrimary: '#334155',
    sidebarActive: '#334155',
    sidebarActiveBackground: '#e2e8f0',
    focus: '#334155',
  },
  Escuro: {
    ...adminThemeDefaults,
    primary: '#86efac',
    secondary: '#334155',
    accent: '#fdba74',
    background: '#0f172a',
    surface: '#1e293b',
    surfaceSubtle: '#334155',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    textSoft: '#e2e8f0',
    border: '#64748b',
    borderStrong: '#94a3b8',
    sidebarBackground: '#111827',
    sidebarText: '#e2e8f0',
    sidebarActive: '#86efac',
    sidebarActiveBackground: '#1e293b',
    headerBackground: '#111827',
    headerText: '#f8fafc',
    cardBackground: '#1e293b',
    cardBorder: '#64748b',
    tableHeaderBackground: '#334155',
    tableHeaderText: '#f8fafc',
    buttonPrimary: '#86efac',
    buttonPrimaryText: '#052e16',
    inputBackground: '#0f172a',
    focus: '#86efac',
  },
  Claro: {
    ...adminThemeDefaults,
    background: '#ffffff',
    surfaceSubtle: '#f1f5f9',
  },
};
export function adminThemeContrast(theme: AdminTheme) {
  const pairs: ReadonlyArray<readonly [string, AdminThemeKey, AdminThemeKey]> =
    [
      ['Fundo e texto', 'text', 'background'],
      ['Superfícies', 'text', 'surface'],
      ['Cards e texto', 'text', 'cardBackground'],
      ['Textos secundários', 'textMuted', 'cardBackground'],
      ['Sidebar', 'sidebarText', 'sidebarBackground'],
      ['Item ativo', 'sidebarActive', 'sidebarActiveBackground'],
      ['Header', 'headerText', 'headerBackground'],
      ['Tabelas', 'tableHeaderText', 'tableHeaderBackground'],
      ['Botão primário', 'buttonPrimaryText', 'buttonPrimary'],
      ['Campos', 'text', 'inputBackground'],
    ];
  return pairs.map(([label, foreground, background]) => ({
    label,
    ratio: publicContrastRatio(theme[foreground], theme[background]),
  }));
}
