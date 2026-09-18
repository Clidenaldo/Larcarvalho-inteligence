import { defineConfig, devices } from '@playwright/test';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: '.env', quiet: true });

const e2eDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!e2eDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for E2E');
{
  const target = new URL(e2eDatabaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname.slice(1) !== 'larcarvalho_test'
  )
    throw new Error('E2E must target the local larcarvalho_test database');
}

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3100',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command:
        'npm run build --workspace @larcarvalho/shared && npm run prisma:generate && npx tsx apps/backend/src/server.ts',
      url: 'http://127.0.0.1:3101/api/v1/ready',
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_URL: e2eDatabaseUrl,
        E2E_TEST: 'true',
        BACKEND_PORT: '3101',
        FRONTEND_URL: 'http://127.0.0.1:3100',
        AI_PROVIDER: 'mock',
        BACKEND_HOST: '127.0.0.1',
        AUTH_LOGIN_RATE_LIMIT_MAX: '100',
        AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: '600000',
      },
      timeout: 180 * 1000,
    },
    {
      command:
        'node --use-system-ca node_modules/next/dist/bin/next dev apps/frontend --port 3100 --webpack',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      env: {
        ...process.env,
        E2E_TEST: 'true',
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:3101',
        API_TIMEOUT_MS: '30000',
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3101',
      },
      timeout: 180 * 1000,
    },
  ],
});
