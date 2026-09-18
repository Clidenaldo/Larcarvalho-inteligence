import type { AiProviderCapabilities } from '@larcarvalho/shared';

export interface ModelCapabilities extends AiProviderCapabilities {
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
}

/**
 * Model registry: capabilities per known model. Unknown models are allowed
 * only when explicitly listed in AI_ALLOWED_MODELS and receive conservative
 * estimated capabilities (never assumed).
 */
const KNOWN_MODELS: Readonly<Record<string, ModelCapabilities>> = {
  'gpt-4o-mini': {
    contextWindowTokens: 128_000,
    estimated: false,
    embeddings: false,
    maxOutputTokens: 16_384,
    streaming: true,
    structuredOutput: true,
    toolCalling: true,
  },
  'gpt-4o': {
    contextWindowTokens: 128_000,
    estimated: false,
    embeddings: false,
    maxOutputTokens: 16_384,
    streaming: true,
    structuredOutput: true,
    toolCalling: true,
  },
  'gpt-4.1-mini': {
    contextWindowTokens: 1_047_576,
    estimated: false,
    embeddings: false,
    maxOutputTokens: 32_768,
    streaming: true,
    structuredOutput: true,
    toolCalling: true,
  },
  'larcarvalho-copilot-v1': {
    contextWindowTokens: 32_000,
    estimated: false,
    embeddings: false,
    maxOutputTokens: 8_000,
    streaming: true,
    structuredOutput: true,
    toolCalling: false,
  },
};

const CONSERVATIVE_DEFAULT: ModelCapabilities = {
  contextWindowTokens: 32_000,
  estimated: true,
  embeddings: false,
  maxOutputTokens: 4_000,
  streaming: true,
  structuredOutput: true,
  toolCalling: false,
};

export function getModelCapabilities(
  model: string,
  allowedModels: readonly string[],
): ModelCapabilities | null {
  const known = KNOWN_MODELS[model];
  if (known) return known;
  if (allowedModels.includes(model)) return { ...CONSERVATIVE_DEFAULT };
  return null;
}

export function listKnownModels(): readonly string[] {
  return Object.keys(KNOWN_MODELS);
}
