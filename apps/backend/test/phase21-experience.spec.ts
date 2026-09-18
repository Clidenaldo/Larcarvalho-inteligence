import { describe, expect, it } from 'vitest';

import {
  assertAccessiblePalette,
  contrastRatio,
} from '../src/modules/experience/experience.service.js';

describe('phase 21 experience safeguards', () => {
  it('accepts the Larcarvalho palette with AA contrast', () => {
    expect(contrastRatio('#34806b', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(() =>
      assertAccessiblePalette({
        accentColor: '#c05400',
        darkBackground: '#1a1a1a',
        lightBackground: '#f2f2f2',
        primaryColor: '#34806b',
        secondaryColor: '#000000',
        warningColor: '#9a5b08',
      }),
    ).not.toThrow();
  });

  it('rejects inaccessible color choices', () => {
    expect(() =>
      assertAccessiblePalette({
        accentColor: '#f5f5f5',
        darkBackground: '#1a1a1a',
        lightBackground: '#ffffff',
        primaryColor: '#34806b',
        secondaryColor: '#000000',
        warningColor: '#9a5b08',
      }),
    ).toThrow('contraste AA');
  });
});
