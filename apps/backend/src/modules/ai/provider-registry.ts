import type { AppConfig } from '../../config/env.js';
import type { EmbeddingProvider } from '../knowledge/embeddings.js';
import { DisabledEmbeddingProvider } from '../knowledge/embeddings.js';
import type { AiProvider } from './ai-provider.js';
import { MockAiProvider } from './ai-provider.js';
import { HttpEmbeddingProvider, MockEmbeddingProvider } from './http-embedding.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

/**
 * Multi-provider registry. The domain never branches on vendor names:
 * adding a provider means registering a new id + adapter class here.
 * 'external' currently resolves to the OpenAI-compatible HTTP adapter.
 */
export function createAiProvider(
  providerId: 'mock' | 'external',
  config: AppConfig,
  overrides?: { fetchImpl?: typeof fetch },
): AiProvider {
  if (providerId === 'mock') return new MockAiProvider();
  return new OpenAiCompatibleProvider({
    apiKey: config.AI_API_KEY ?? null,
    baseUrl: config.AI_BASE_URL,
    ...(overrides?.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
    timeoutMs: config.AI_TIMEOUT_MS,
  });
}

export function createEmbeddingProvider(
  providerId: 'none' | 'external',
  config: AppConfig,
  overrides?: { fetchImpl?: typeof fetch; mock?: boolean },
): EmbeddingProvider {
  if (overrides?.mock) return new MockEmbeddingProvider();
  if (providerId === 'none') return new DisabledEmbeddingProvider();
  const model = (config.AI_EMBEDDING_MODEL ?? '').trim();
  if (!model) return new DisabledEmbeddingProvider();
  return new HttpEmbeddingProvider({
    apiKey: config.AI_API_KEY ?? null,
    baseUrl: config.AI_BASE_URL,
    ...(overrides?.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
    model,
    timeoutMs: config.AI_TIMEOUT_MS,
  });
}
