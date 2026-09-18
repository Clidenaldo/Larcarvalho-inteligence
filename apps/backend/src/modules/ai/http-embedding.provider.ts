import type { EmbeddingProvider } from '../knowledge/embeddings.js';
import {
  type FetchImpl,
  postJson,
  providerError,
  readJsonSafe,
} from './provider-http.js';

/**
 * Embedding adapter for any OpenAI-compatible `/embeddings` endpoint.
 * Independent from AiProvider: text generation and vectorization never share
 * responsibilities. Batch calls are capped; only transient failures retry.
 */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly enabled = true;
  private readonly fetchImpl: FetchImpl;

  constructor(
    private readonly options: {
      readonly apiKey: string | null;
      readonly baseUrl: string;
      readonly batchSize?: number;
      readonly fetchImpl?: FetchImpl;
      readonly model: string;
      readonly timeoutMs: number;
    },
  ) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get name(): string {
    return 'http';
  }

  get model(): string {
    return this.options.model;
  }

  get dimensions(): number | null {
    // Dimension depends on the embedding model and is only known after a
    // successful call (or the model registry). Never assumed.
    return null;
  }

  private requireKey(): string {
    const key = this.options.apiKey;
    if (!key) {
      throw providerError(
        'EMBEDDING_UNAVAILABLE',
        'Embeddings indisponíveis: provedor não configurado.',
        503,
      );
    }
    return key;
  }

  async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    const key = this.requireKey();
    if (texts.length === 0) return [];
    const batchSize = Math.min(Math.max(this.options.batchSize ?? 32, 1), 64);
    const out: number[][] = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      const { response } = await postJson(this.options.baseUrl, key, {
        body: { input: [...batch], model: this.options.model },
        fetchImpl: this.fetchImpl,
        path: '/embeddings',
        timeoutMs: this.options.timeoutMs,
      });
      const payload = (await readJsonSafe(response)) as {
        data?: readonly { embedding?: unknown }[];
      };
      if (!Array.isArray(payload.data) || payload.data.length !== batch.length) {
        throw providerError(
          'OUTPUT_INVALID',
          'Resposta inválida do provedor de embeddings.',
          502,
        );
      }
      for (const item of payload.data) {
        const embedding: unknown = item.embedding;
        if (
          !Array.isArray(embedding) ||
          !embedding.every((value: unknown) => typeof value === 'number')
        ) {
          throw providerError(
            'OUTPUT_INVALID',
            'Resposta inválida do provedor de embeddings.',
            502,
          );
        }
        out.push([...(embedding as number[])]);
      }
    }
    return out;
  }
}

/**
 * Deterministic pseudo-embeddings for offline tests and pipeline drills.
 * Stable per text, fixed dimension, zero network. NEVER used in production
 * retrieval: production hybrid search requires a real vector store.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 64;
  readonly enabled = true;
  readonly model = 'mock-hash-64';
  readonly name = 'mock';

  async embed(texts: readonly string[]): Promise<readonly (readonly number[])[]> {
    return texts.map((text) => pseudoVector(text));
  }
}

function pseudoVector(text: string): readonly number[] {
  const vector: number[] = new Array(64).fill(0);
  let hash = 2166136261;
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/u)
    .filter((token) => token.length >= 3);
  for (const token of tokens) {
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % 64;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}
