import { defineConfig, devices } from '@playwright/test';
import { config as loadEnvironment } from 'dotenv';
loadEnvironment({ path: '.env', quiet: true });
const database = process.env.TEST_DATABASE_URL;
if (!database) throw new Error('TEST_DATABASE_URL is required');
const target = new URL(database);
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/larcarvalho_comparison_validation'
)
  throw new Error('Quota comparison E2E requires the local test database');

export default defineConfig({
  testDir: './tests/quota-comparison',
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: 'test-results/quota-comparison',
  use: {
    baseURL: 'http://localhost:3100',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://127.0.0.1:3101/api/v1/ready',
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        ...process.env,
        DATABASE_URL: database,
        BACKEND_PORT: '3101',
        FRONTEND_URL: 'http://localhost:3100',
        AUTH_LOGIN_RATE_LIMIT_MAX: '100',
      },
    },
    {
      command: 'npx next dev apps/frontend --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 180000,
      env: {
        ...process.env,
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:3101',
        PUBLIC_THEME_E2E: 'true',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3101',
        API_TIMEOUT_MS: '15000',
      },
    },
  ],
});
