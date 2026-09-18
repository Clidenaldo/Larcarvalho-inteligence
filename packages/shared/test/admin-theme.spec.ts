import { describe, expect, it } from 'vitest';
import {
  adminThemeDefaults,
  adminThemeFromAppearance,
  adminThemeSchema,
  adminThemePresets,
  adminThemeContrast,
  updateAdminThemeSchema,
} from '../src/contracts/admin-theme.js';
import {
  publicThemeDefaults,
  publicThemeSchema,
} from '../src/contracts/public-theme.js';

describe('independent administrative contract', () => {
  it('preserves defaults and validates all presets', () => {
    expect(adminThemeFromAppearance()).toEqual(adminThemeDefaults);
    expect(adminThemeDefaults).toMatchObject({
      sidebarBackground: '#ffffff',
      headerBackground: '#ffffff',
      cardBackground: '#ffffff',
      text: '#000000',
    });
    for (const theme of Object.values(adminThemePresets))
      expect(adminThemeSchema.parse(theme)).toEqual(theme);
  });
  it('rejects mixed namespaces and CSS injection, accepts strict partial colors', () => {
    expect(adminThemeSchema.safeParse(publicThemeDefaults).success).toBe(false);
    expect(publicThemeSchema.safeParse(adminThemeDefaults).success).toBe(false);
    for (const input of [
      {},
      { primary: 'url(bad)' },
      { footerText: '#ffffff' },
      { publicTheme: publicThemeDefaults },
    ])
      expect(updateAdminThemeSchema.safeParse(input).success).toBe(false);
    expect(updateAdminThemeSchema.parse({ sidebarText: '#ABCDEF' })).toEqual({
      sidebarText: '#abcdef',
    });
  });
  it('checks administrative contrast pairs independently without changing colors', () => {
    const theme = {
      ...adminThemeDefaults,
      sidebarText: '#ffffff',
      buttonPrimaryText: adminThemeDefaults.buttonPrimary,
    };
    const checks = adminThemeContrast(theme);
    expect(checks.find(({ label }) => label === 'Sidebar')?.ratio).toBe(1);
    expect(checks.find(({ label }) => label === 'Botão primário')?.ratio).toBe(
      1,
    );
    expect(
      checks.find(({ label }) => label === 'Tabelas')?.ratio,
    ).toBeGreaterThan(4.5);
    expect(theme.sidebarText).toBe('#ffffff');
    expect(adminThemeContrast({ ...theme, text: 'bad' })[0]?.ratio).toBeNull();
  });
});
