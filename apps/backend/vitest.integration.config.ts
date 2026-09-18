import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/integration/**/*.spec.ts'],
    testTimeout: 15_000,
  },
});
