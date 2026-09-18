import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['test/integration/**', 'node_modules/**'],
    testTimeout: 15_000,
  },
});
