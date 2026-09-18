import type {
  AiPublicConfig,
  AiStatusResponse,
  UpdateAiConfigRequest,
} from '@larcarvalho/shared';

import type { AppConfig } from '../../config/env.js';

const MAX_RESOURCES = 20;

function parseResources(raw: string): readonly string[] {
  return Object.freeze(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, MAX_RESOURCES),
  );
}

function parseAllowedModels(raw: string): readonly string[] {
  return Object.freeze(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 50),
  );
}

/**
 * Administrative AI configuration.
 *
 * Foundation rule: no secret is persisted or returned. `providerConfigured`
 * is true only when provider=external AND an API key is present in the
 * environment. The UI must show configured true/false, never the key.
 */
export class AiConfigService {
  private overrides: UpdateAiConfigRequest = {};

  constructor(private readonly config: AppConfig) {}

  allowedModels(): readonly string[] {
    return parseAllowedModels(this.config.AI_ALLOWED_MODELS);
  }

  isProviderConfigured(): boolean {
    // "Configured" means an external credential is present. The mock never
    // counts as configured; readiness for mock is reported separately.
    const provider = this.overrides.provider ?? this.config.AI_PROVIDER;
    if (provider === 'mock') return false;
    return (this.config.AI_API_KEY ?? '').length > 0;
  }

  getPublicConfig(vectorSearchAvailable = false): AiPublicConfig {
    const enabled = this.overrides.enabled ?? this.config.AI_ENABLED;
    const provider = this.overrides.provider ?? this.config.AI_PROVIDER;
    const model = this.overrides.model ?? this.config.AI_MODEL;
    const maxOutputTokens =
      this.overrides.maxOutputTokens ?? this.config.AI_MAX_OUTPUT_TOKENS;
    const timeoutMs = this.overrides.timeoutMs ?? this.config.AI_TIMEOUT_MS;
    const enabledResources =
      this.overrides.enabledResources ?? parseResources(this.config.AI_RESOURCES);
    return Object.freeze({
      dailyCostLimitMicros:
        this.overrides.dailyCostLimitMicros ?? this.config.AI_DAILY_COST_LIMIT_MICROS ?? null,
      dailyTokenLimit:
        this.overrides.dailyTokenLimit ?? this.config.AI_DAILY_TOKEN_LIMIT ?? null,
      embeddingModel:
        this.overrides.embeddingModel ?? this.config.AI_EMBEDDING_MODEL ?? null,
      embeddingProvider:
        this.overrides.embeddingProvider ?? this.config.AI_EMBEDDING_PROVIDER,
      enabled,
      enabledResources: [...enabledResources],
      fallbackProvider:
        this.overrides.fallbackProvider ?? this.config.AI_FALLBACK_PROVIDER,
      maxOutputTokens,
      maxTokensPerRequest:
        this.overrides.maxTokensPerRequest ?? this.config.AI_MAX_TOKENS_PER_REQUEST ?? null,
      model,
      monthlyCostLimitMicros:
        this.overrides.monthlyCostLimitMicros ??
        this.config.AI_MONTHLY_COST_LIMIT_MICROS ??
        null,
      provider,
      providerConfigured: this.isProviderConfigured(),
      retrievalMode: this.overrides.retrievalMode ?? this.config.AI_RETRIEVAL_MODE,
      rrfK: this.overrides.rrfK ?? this.config.AI_RRF_K,
      streamingEnabled:
        this.overrides.streamingEnabled ?? this.config.AI_STREAMING_ENABLED,
      timeoutMs,
      topK: this.overrides.topK ?? this.config.AI_TOP_K,
      vectorSearchAvailable,
    });
  }

  getStatus(vectorSearchAvailable = false): AiStatusResponse {
    const publicConfig = this.getPublicConfig(vectorSearchAvailable);
    if (!publicConfig.enabled) {
      return {
        config: publicConfig,
        message: 'Inteligência Artificial desabilitada pelo administrador.',
        ready: false,
      };
    }
    if (publicConfig.provider === 'mock' || publicConfig.providerConfigured) {
      return {
        config: publicConfig,
        message:
          publicConfig.provider === 'mock'
            ? 'Provedor simulado ativo. Nenhum provedor externo foi chamado.'
            : 'Provedor externo configurado.',
        ready: true,
      };
    }
    return {
      config: publicConfig,
      message:
        'Inteligência Artificial ainda não configurada. Nenhum provedor externo foi chamado.',
      ready: false,
    };
  }

  updateConfig(input: UpdateAiConfigRequest): AiPublicConfig {
    this.overrides = Object.freeze({ ...this.overrides, ...input });
    return this.getPublicConfig();
  }
}
