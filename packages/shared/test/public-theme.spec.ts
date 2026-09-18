import { describe, expect, it } from 'vitest';
import {
  publicThemeDefaults,
  publicThemeSchema,
  publicThemePresets,
  updatePublicThemeSchema,
  publicContrastRatio,
  publicThemeContrast,
} from '../src/contracts/public-theme.js';

describe('public theme contract', () => {
  it('preserves the Larcarvalho default and validates every preset', () => {
    expect(publicThemeDefaults).toMatchObject({
      primary: '#34806b',
      background: '#f2f2f2',
      surface: '#ffffff',
      buttonPrimary: '#34806b',
    });
    for (const theme of Object.values(publicThemePresets))
      expect(publicThemeSchema.parse(theme)).toEqual(theme);
  });
  it('accepts color patches including low contrast but rejects arbitrary CSS and internal data', () => {
    expect(
      updatePublicThemeSchema.parse({
        primary: '#FFFFFF',
        background: '#ffffff',
        buttonPrimary: '#ffffff',
      }),
    ).toEqual({
      primary: '#ffffff',
      background: '#ffffff',
      buttonPrimary: '#ffffff',
    });
    for (const value of [
      'red',
      '#fff',
      '#123456;background:red',
      'url(javascript:alert(1))',
    ])
      expect(
        updatePublicThemeSchema.safeParse({ primary: value }).success,
      ).toBe(false);
    expect(updatePublicThemeSchema.safeParse({}).success).toBe(false);
    expect(
      publicThemeSchema.safeParse({ ...publicThemeDefaults, secret: 'private' })
        .success,
    ).toBe(false);
  });
  it('reports poor contrast without modifying chosen colors', () => {
    expect(publicContrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(publicContrastRatio('#000000', '#ffffff')).toBe(21);
    expect(publicContrastRatio('bad', '#ffffff')).toBeNull();
    const theme = { ...publicThemeDefaults, text: '#ffffff' };
    expect(
      publicThemeContrast(theme).find(
        (check) => check.label === 'Cards e texto',
      )?.ratio,
    ).toBe(1);
    expect(theme.text).toBe('#ffffff');
  });
});
