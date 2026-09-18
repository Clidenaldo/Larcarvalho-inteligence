import { parseEnvironment, type AppConfig } from '../../src/config/env.js';

export function createTestConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return parseEnvironment({
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    ...overrides,
  });
}
