import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Validate the built application without dev-server compilation or HMR races.
const servers = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  ...base,
  testMatch: 'vendas.spec.ts',
  projects: base.projects?.filter((project) => project.name === 'chromium'),
  webServer: servers.map((server, index) =>
    index === 1
      ? {
          ...server,
          command: 'node --use-system-ca scripts/start-sales-e2e.mjs',
          env: {
            ...server.env,
            E2E_TEST: 'false',
            PORT: '3100',
            HOSTNAME: '127.0.0.1',
          },
        }
      : server,
  ),
});
