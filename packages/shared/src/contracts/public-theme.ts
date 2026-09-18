import { z } from 'zod';
import { hexColorSchema } from './experience.js';

// Defaults mirror the public site's existing design tokens. Admin colors are separate.
export const publicThemeDefaults = {
  primary: '#34806b',
  secondary: '#000000',
  accent: '#c05400',
  background: '#f2f2f2',
  backgroundSecondary: '#ffffff',
  surface: '#ffffff',
  surfaceSubtle: '#f8fafc',
  text: '#000000',
  textMuted: '#475569',
  title: '#000000',
  border: '#b7c2cb',
  buttonPrimary: '#34806b',
  buttonPrimaryText: '#ffffff',
  buttonSecondary: '#ffffff',
  buttonSecondaryText: '#34806b',
  headerBackground: '#34806b',
  headerText: '#ffffff',
  footerBackground: '#000000',
  footerText: '#cbd5e1',
  heroBackground: '#34806b',
  heroText: '#ffffff',
  simulatorAccent: '#34806b',
  inputBackground: '#ffffff',
  focus: '#34806b',
} as const;
export type PublicThemeKey = keyof typeof publicThemeDefaults;
export const publicThemeSchema = z
  .object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    accent: hexColorSchema,
    background: hexColorSchema,
    backgroundSecondary: hexColorSchema,
    surface: hexColorSchema,
    surfaceSubtle: hexColorSchema,
    text: hexColorSchema,
    textMuted: hexColorSchema,
    title: hexColorSchema,
    border: hexColorSchema,
    buttonPrimary: hexColorSchema,
    buttonPrimaryText: hexColorSchema,
    buttonSecondary: hexColorSchema,
    buttonSecondaryText: hexColorSchema,
    headerBackground: hexColorSchema,
    headerText: hexColorSchema,
    footerBackground: hexColorSchema,
    footerText: hexColorSchema,
    heroBackground: hexColorSchema,
    heroText: hexColorSchema,
    simulatorAccent: hexColorSchema,
    inputBackground: hexColorSchema,
    focus: hexColorSchema,
  })
  .strict();
export type PublicTheme = z.infer<typeof publicThemeSchema>;
export const updatePublicThemeSchema = publicThemeSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos uma cor.',
  );
export type UpdatePublicTheme = z.infer<typeof updatePublicThemeSchema>;
export const publicThemeFields: ReadonlyArray<
  readonly [PublicThemeKey, string]
> = [
  ['primary', 'Cor primária'],
  ['secondary', 'Cor secundária'],
  ['accent', 'Cor de destaque'],
  ['background', 'Fundo principal'],
  ['backgroundSecondary', 'Fundo secundário'],
  ['surface', 'Cor dos cards'],
  ['surfaceSubtle', 'Fundo dos detalhes'],
  ['text', 'Textos principais'],
  ['textMuted', 'Textos secundários'],
  ['title', 'Títulos'],
  ['border', 'Bordas'],
  ['buttonPrimary', 'Botão primário'],
  ['buttonPrimaryText', 'Texto do botão primário'],
  ['buttonSecondary', 'Botão secundário'],
  ['buttonSecondaryText', 'Texto do botão secundário'],
  ['headerBackground', 'Fundo do header'],
  ['headerText', 'Textos do header'],
  ['footerBackground', 'Fundo do footer'],
  ['footerText', 'Textos do footer'],
  ['heroBackground', 'Fundo do hero'],
  ['heroText', 'Textos do hero'],
  ['simulatorAccent', 'Destaque do simulador'],
  ['inputBackground', 'Fundo dos campos'],
  ['focus', 'Foco e seleção'],
];
export const publicThemePresets: Readonly<Record<string, PublicTheme>> = {
  'Larcarvalho Público': publicThemeDefaults,
  'Azul profissional': {
    ...publicThemeDefaults,
    primary: '#1d4ed8',
    heroBackground: '#1e3a8a',
    headerBackground: '#1e3a8a',
    buttonPrimary: '#1d4ed8',
    buttonSecondaryText: '#1d4ed8',
    simulatorAccent: '#1d4ed8',
    focus: '#1d4ed8',
  },
  Verde: {
    ...publicThemeDefaults,
    primary: '#166534',
    heroBackground: '#14532d',
    headerBackground: '#14532d',
    buttonPrimary: '#166534',
    buttonSecondaryText: '#166534',
    simulatorAccent: '#166534',
    focus: '#166534',
  },
  Escuro: {
    ...publicThemeDefaults,
    primary: '#86efac',
    secondary: '#14532d',
    background: '#0f172a',
    backgroundSecondary: '#111827',
    surface: '#1e293b',
    surfaceSubtle: '#334155',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    title: '#ffffff',
    border: '#64748b',
    buttonPrimary: '#86efac',
    buttonPrimaryText: '#052e16',
    buttonSecondary: '#334155',
    buttonSecondaryText: '#ffffff',
    headerBackground: '#0f172a',
    footerBackground: '#020617',
    heroBackground: '#14532d',
    simulatorAccent: '#86efac',
    inputBackground: '#0f172a',
    focus: '#86efac',
  },
  Claro: {
    ...publicThemeDefaults,
    background: '#ffffff',
    backgroundSecondary: '#f8fafc',
    surfaceSubtle: '#f1f5f9',
    heroBackground: '#f1f5f9',
    heroText: '#0f172a',
    headerBackground: '#ffffff',
    headerText: '#0f172a',
  },
};

export function publicContrastRatio(a: string, b: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return null;
  const luminance = (color: string) =>
    [1, 3, 5].reduce((sum, start, index) => {
      const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255;
      const linear =
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      return sum + linear * ([0.2126, 0.7152, 0.0722][index] ?? 0);
    }, 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function publicThemeContrast(theme: PublicTheme) {
  const pairs: ReadonlyArray<
    readonly [string, PublicThemeKey, PublicThemeKey]
  > = [
    ['Fundo e texto', 'text', 'background'],
    ['Cards e texto', 'text', 'surface'],
    ['Botão primário', 'buttonPrimaryText', 'buttonPrimary'],
    ['Botão secundário', 'buttonSecondaryText', 'buttonSecondary'],
    ['Header e links', 'headerText', 'headerBackground'],
    ['Footer e textos', 'footerText', 'footerBackground'],
    ['Hero e textos', 'heroText', 'heroBackground'],
    ['Campos e texto', 'text', 'inputBackground'],
    ['Títulos nos cards', 'title', 'surface'],
    ['Textos secundários', 'textMuted', 'surface'],
  ];
  return pairs.map(([label, foreground, background]) => ({
    label,
    ratio: publicContrastRatio(theme[foreground], theme[background]),
  }));
}
