import { describe, expect, it } from 'vitest';
import { assertE2eDatabase } from '../src/config/e2e-safety.js';

describe('E2E database isolation', () => {
  it('allows normal startup with the development database', () => {
    expect(() =>
      assertE2eDatabase(undefined, 'postgresql://localhost/larcarvalho'),
    ).not.toThrow();
  });
  it('allows the dedicated local test database', () => {
    expect(() =>
      assertE2eDatabase('true', 'postgresql://localhost/larcarvalho_test'),
    ).not.toThrow();
  });
  it.each([
    undefined,
    'postgresql://localhost/larcarvalho',
    'postgresql://localhost/larcarvalho_prod',
    'postgresql://remote/larcarvalho_test',
  ])('rejects unsafe E2E target %s', (url) => {
    expect(() => assertE2eDatabase('true', url)).toThrow();
  });
});
