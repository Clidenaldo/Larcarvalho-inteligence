import { describe, expect, it } from 'vitest';

import {
  EnvironmentConfigurationError,
  parseEnvironment,
} from '../src/config/env.js';

describe('environment configuration', () => {
  it('provides safe local defaults', () => {
    expect(parseEnvironment({})).toEqual({
      AI_ALLOWED_MODELS: '',
      AI_BASE_URL: 'https://api.openai.com/v1',
      AI_CONTEXT_RESERVE_TOKENS: 1000,
      AI_DAILY_COST_LIMIT_MICROS: undefined,
      AI_DAILY_TOKEN_LIMIT: undefined,
      AI_EMBEDDING_MODEL: undefined,
      AI_EMBEDDING_PROVIDER: 'none',
      AI_ENABLED: true,
      AI_FALLBACK_PROVIDER: 'none',
      AI_MAX_OUTPUT_TOKENS: 1200,
      AI_MAX_TOKENS_PER_REQUEST: undefined,
      AI_MODEL: 'larcarvalho-copilot-v1',
      AI_MONTHLY_COST_LIMIT_MICROS: undefined,
      AI_PROVIDER: 'mock',
      AI_RESOURCES:
        'commercial_copilot,lead_analysis,simulation_explain,comparison_analysis,draft_messages,manager_summary,knowledge_grounded_answer,integration_analysis',
      AI_RETRIEVAL_MODE: 'lexical',
      AI_RRF_K: 60,
      AI_STREAMING_ENABLED: true,
      AI_TEMPERATURE: 0.2,
      AI_TIMEOUT_MS: 15000,
      AI_TOP_K: 5,
      AUTH_LOGIN_RATE_LIMIT_MAX: 5,
      AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: 60_000,
      AUTH_SESSION_TTL_HOURS: 12,
      BACKEND_HOST: '0.0.0.0',
      BACKEND_PORT: 3001,
      DATABASE_CONNECTION_TIMEOUT_MS: 3_000,
      DATABASE_POOL_MAX: 10,
      FRONTEND_URL: 'http://localhost:3000',
      INTEGRATION_REST_ALLOWED_HOSTS: '',
      KNOWLEDGE_MAX_BYTES: 15_728_640,
      LOG_LEVEL: 'info',
      METRICS_ENABLED: false,
      NODE_ENV: 'development',
      PUBLIC_SIMULATOR_CANDIDATE_LIMIT: 100,
      PUBLIC_SIMULATOR_RATE_LIMIT_MAX: 30,
      PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS: 600_000,
      PUBLIC_SIMULATOR_TIMEOUT_MS: 5_000,
      PUBLIC_LEAD_RATE_LIMIT_MAX: 10,
      PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS: 600_000,
      REQUEST_BODY_LIMIT_BYTES: 1_048_576,
      REQUEST_TIMEOUT_MS: 10_000,
      SLOW_DATABASE_QUERY_THRESHOLD_MS: 500,
      SLOW_REQUEST_THRESHOLD_MS: 1000,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('parses typed overrides', () => {
    expect(
      parseEnvironment({
        BACKEND_PORT: '4100',
        LOG_LEVEL: 'debug',
        NODE_ENV: 'test',
        REQUEST_TIMEOUT_MS: '2500',
      }),
    ).toMatchObject({
      BACKEND_PORT: 4100,
      LOG_LEVEL: 'debug',
      NODE_ENV: 'test',
      REQUEST_TIMEOUT_MS: 2500,
    });
  });

  it('fails fast with field names but without raw values', () => {
    const invalidPort = 'not-a-port-secret-value';

    expect(() => parseEnvironment({ BACKEND_PORT: invalidPort })).toThrowError(
      EnvironmentConfigurationError,
    );

    try {
      parseEnvironment({ BACKEND_PORT: invalidPort });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as Error).message).toContain('BACKEND_PORT');
      expect((error as Error).message).not.toContain(invalidPort);
    }
  });

  it('accepts only PostgreSQL connection URLs', () => {
    const databaseUrl =
      'postgresql://user:password@localhost:5432/database?schema=public';

    expect(parseEnvironment({ DATABASE_URL: databaseUrl })).toMatchObject({
      DATABASE_URL: databaseUrl,
    });
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'mysql://user:password@localhost/db' }),
    ).toThrowError(EnvironmentConfigurationError);
  });

  it('does not expose DATABASE_URL contents in validation errors', () => {
    const invalidDatabaseUrl =
      'postgresql://user:plain-text-secret@localhost:not-a-port/database';

    expect(() =>
      parseEnvironment({ DATABASE_URL: invalidDatabaseUrl }),
    ).toThrow(EnvironmentConfigurationError);

    try {
      parseEnvironment({ DATABASE_URL: invalidDatabaseUrl });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).not.toContain('plain-text-secret');
    }
  });
});
