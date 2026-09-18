import { z } from 'zod';

const optionalDatabaseUrlSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z
    .url()
    .refine(
      (value) =>
        value.startsWith('postgres://') || value.startsWith('postgresql://'),
    )
    .optional(),
);

const environmentSchema = z.object({
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(60_000),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  BACKEND_HOST: z.string().trim().min(1).default('0.0.0.0'),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(30_000)
    .default(3_000),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_URL: optionalDatabaseUrlSchema,
  FRONTEND_URL: z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
    .default('http://localhost:3000'),
  INTEGRATION_REST_ALLOWED_HOSTS: z.string().trim().default(''),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PUBLIC_SIMULATOR_CANDIDATE_LIMIT: z.coerce
    .number()
    .int()
    .min(20)
    .max(200)
    .default(100),
  PUBLIC_SIMULATOR_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(300)
    .default(30),
  PUBLIC_SIMULATOR_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(3_600_000)
    .default(600_000),
  PUBLIC_SIMULATOR_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(5_000),
  PUBLIC_LEAD_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  PUBLIC_LEAD_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(3_600_000)
    .default(600_000),
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  REQUEST_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10_485_760)
    .default(1_048_576),
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(10_000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  AI_ENABLED: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .default(true),
  AI_PROVIDER: z.enum(['mock', 'external']).default('mock'),
  AI_MODEL: z.string().trim().min(1).max(120).default('larcarvalho-copilot-v1'),
  AI_API_KEY: z.string().trim().min(1).max(500).optional(),
  AI_BASE_URL: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .default('https://api.openai.com/v1'),
  AI_ALLOWED_MODELS: z.string().trim().default(''),
  AI_EMBEDDING_PROVIDER: z.enum(['none', 'external']).default('none'),
  AI_EMBEDDING_MODEL: z.string().trim().min(1).max(120).optional(),
  AI_STREAMING_ENABLED: z
    .enum(['true', 'false'])
    .transform((v: string) => v === 'true')
    .pipe(z.boolean())
    .default(true),
  AI_RETRIEVAL_MODE: z.enum(['lexical', 'hybrid']).default('lexical'),
  AI_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  AI_RRF_K: z.coerce.number().int().min(1).max(1000).default(60),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().int().min(0).max(100_000_000).optional(),
  AI_DAILY_COST_LIMIT_MICROS: z.coerce.number().int().min(0).optional(),
  AI_MONTHLY_COST_LIMIT_MICROS: z.coerce.number().int().min(0).optional(),
  AI_MAX_TOKENS_PER_REQUEST: z.coerce.number().int().min(1000).max(500_000).optional(),
  AI_FALLBACK_PROVIDER: z.enum(['none', 'external']).default('none'),
  AI_CONTEXT_RESERVE_TOKENS: z.coerce.number().int().min(256).max(16000).default(1000),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(8000).default(1200),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  AI_RESOURCES: z.string().trim().default('commercial_copilot,lead_analysis,simulation_explain,comparison_analysis,draft_messages,manager_summary,knowledge_grounded_answer,integration_analysis'),
  KNOWLEDGE_MAX_BYTES: z.coerce.number().int().min(1_024).max(20 * 1024 * 1024).default(15 * 1024 * 1024),
  KNOWLEDGE_STORAGE_DIR: z.string().trim().optional(),
  METRICS_ENABLED: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .default(false),
  METRICS_AUTH_TOKEN: z.string().trim().optional(),
  SLOW_REQUEST_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  SLOW_DATABASE_QUERY_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(30_000)
    .default(500),
  INTEGRATION_SECRETS_KEY: z.string().trim().min(32).max(120).optional(),
  INTEGRATION_SECRETS_KEY_VERSION: z.string().trim().min(1).max(20).default('v1'),
});

export type AppConfig = Readonly<z.infer<typeof environmentSchema>>;

export class EnvironmentConfigurationError extends Error {
  override readonly name = 'EnvironmentConfigurationError';
}

export function parseEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const invalidFields = [
      ...new Set(
        result.error.issues.map(
          (issue) => issue.path.join('.') || 'environment',
        ),
      ),
    ];

    throw new EnvironmentConfigurationError(
      `Invalid environment configuration: ${invalidFields.join(', ')}`,
    );
  }

  return Object.freeze(result.data);
}
