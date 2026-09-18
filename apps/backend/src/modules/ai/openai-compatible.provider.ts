import type {
  AiProviderCapabilities,
  AiStructuredResponse,
} from '@larcarvalho/shared';

import { AppError } from '../../core/errors/app-error.js';
import type {
  AiGenerateInput,
  AiGenerateResult,
  AiProvider,
  ProviderHealth,
  ProviderStreamChunk,
  ProviderTokenUsage,
} from './ai-provider.js';
import {
  type FetchImpl,
  mapProviderStatus,
  parseStructuredResponse,
  postJson,
  providerError,
  readJsonSafe,
} from './provider-http.js';

export interface OpenAiCompatibleOptions {
  readonly apiKey: string | null;
  readonly baseUrl: string;
  readonly fetchImpl?: FetchImpl;
  readonly maxRetries?: number;
  readonly timeoutMs: number;
}

interface ChatChoice {
  readonly message?: { readonly content?: unknown };
}

interface ChatCompletion {
  readonly choices?: readonly ChatChoice[];
  readonly usage?: {
    readonly completion_tokens?: unknown;
    readonly prompt_tokens?: unknown;
    readonly prompt_tokens_details?: { readonly cached_tokens?: unknown };
    readonly total_tokens?: unknown;
  } | null;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    return null;
  return value;
}

function extractUsage(payload: ChatCompletion): ProviderTokenUsage {
  return toProviderUsage(payload.usage ?? null);
}

function toProviderUsage(
  usage: ChatCompletion['usage'] | {
    readonly completion_tokens?: unknown;
    readonly prompt_tokens?: unknown;
    readonly prompt_tokens_details?: { readonly cached_tokens?: unknown };
    readonly total_tokens?: unknown;
  } | null,
): ProviderTokenUsage {
  if (!usage) {
    return {
      cachedTokens: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
  }
  return {
    cachedTokens: asNonNegativeInt(usage.prompt_tokens_details?.cached_tokens),
    inputTokens: asNonNegativeInt(usage.prompt_tokens),
    outputTokens: asNonNegativeInt(usage.completion_tokens),
    totalTokens: asNonNegativeInt(usage.total_tokens),
  };
}

function extractText(payload: ChatCompletion): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw providerError(
      'OUTPUT_INVALID',
      'Resposta inválida do provedor de IA.',
      502,
    );
  }
  return content;
}

/**
 * HTTP adapter for any OpenAI-compatible chat-completions endpoint
 * (OpenAI, Azure OpenAI, compatible gateways). The domain never branches on
 * vendor names: this class is selected by the provider registry.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'external' as const;
  private readonly fetchImpl: FetchImpl;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return (this.options.apiKey ?? '').length > 0;
  }

  getCapabilities(): AiProviderCapabilities {
    return {
      embeddings: false,
      streaming: true,
      structuredOutput: true,
      toolCalling: false,
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return {
        capabilities: null,
        configured: false,
        latencyMs: null,
        reachable: false,
      };
    }
    // Minimal, cheap probe: list models. Never sends prompts or secrets in logs.
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(this.options.timeoutMs, 10_000),
    );
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/models`, {
        headers: { authorization: `Bearer ${this.options.apiKey}` },
        method: 'GET',
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) {
        return {
          capabilities: null,
          configured: true,
          latencyMs,
          reachable: false,
        };
      }
      return {
        capabilities: this.getCapabilities(),
        configured: true,
        latencyMs,
        reachable: response.ok,
      };
    } catch {
      return {
        capabilities: null,
        configured: true,
        latencyMs: Date.now() - startedAt,
        reachable: false,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private requireKey(): string {
    const key = this.options.apiKey;
    if (!key) {
      throw providerError(
        'PROVIDER_NOT_CONFIGURED',
        'Provedor externo não configurado. Defina AI_API_KEY.',
        503,
      );
    }
    return key;
  }

  private payload(
    input: AiGenerateInput,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      max_tokens: input.maxOutputTokens,
      messages: [
        { content: input.systemInstructions, role: 'system' },
        {
          content: `${input.toolDataSummary}\n\n${input.userMessage}`,
          role: 'user',
        },
      ],
      model: input.model,
      response_format: { type: 'json_object' },
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      temperature: input.temperature,
    };
  }

  private parseStructured(text: string): AiStructuredResponse {
    return parseStructuredResponse(text);
  }

  private async complete(
    input: AiGenerateInput,
  ): Promise<{ text: string; usage: ProviderTokenUsage }> {
    const key = this.requireKey();
    const { requestId, response } = await postJson(
      this.options.baseUrl,
      key,
      {
        body: this.payload(input, false),
        fetchImpl: this.fetchImpl,
        path: '/chat/completions',
        timeoutMs: this.options.timeoutMs,
      },
    );
    void requestId;
    const payload = (await readJsonSafe(response)) as ChatCompletion;
    const text = extractText(payload);
    const usage = extractUsage(payload);
    return { text, usage };
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const { text, usage } = await this.complete(input);
    const estimated = usage.inputTokens === null && usage.outputTokens === null;
    return {
      inputTokens: usage.inputTokens ?? Math.max(1, Math.ceil(text.length / 4)),
      model: input.model,
      outputTokens:
        usage.outputTokens ?? Math.max(1, Math.ceil(text.length / 4)),
      provider: 'external',
      text,
      usageEstimated: estimated,
    };
  }

  async structuredOutput(
    input: AiGenerateInput,
  ): Promise<{ response: AiStructuredResponse; usage: ProviderTokenUsage | null }> {
    const { text, usage } = await this.complete(input);
    return { response: this.parseStructured(text), usage };
  }

  async *stream(
    input: AiGenerateInput,
    signal: AbortSignal,
  ): AsyncIterable<ProviderStreamChunk> {
    const key = this.requireKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.options.baseUrl}/chat/completions`,
        {
          body: JSON.stringify(this.payload(input, true)),
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
    } catch (error) {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return;
      if (error instanceof Error && error.name === 'AbortError') {
        throw providerError(
          'PROVIDER_TIMEOUT',
          'Tempo esgotado no provedor de IA.',
          504,
        );
      }
      throw providerError(
        'PROVIDER_UNAVAILABLE',
        'Provedor de IA indisponível.',
        503,
      );
    }
    if (!response.ok) {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      const mapped = mapProviderStatus(response.status, '/chat/completions');
      throw providerError(
        mapped.code,
        `Provedor de IA respondeu com erro (${mapped.code}).`,
        mapped.statusCode,
      );
    }
    // Streaming is NOT retried: partial output cannot be resumed safely.
    try {
      const reader = response.body?.getReader();
      if (!reader) {
        throw providerError(
          'OUTPUT_INVALID',
          'Resposta inválida do provedor de IA.',
          502,
        );
      }
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        if (signal.aborted) {
          await reader.cancel().catch(() => undefined);
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') continue;
            let chunk: unknown;
            try {
              chunk = JSON.parse(data) as unknown;
            } catch {
              throw providerError(
                'OUTPUT_INVALID',
                'Resposta inválida do provedor de IA.',
                502,
              );
            }
            const delta = (
              chunk as {
                choices?: readonly { delta?: { content?: unknown } }[];
              }
            ).choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0)
              yield { delta };
            const usage = (chunk as { usage?: unknown }).usage;
            if (usage && typeof usage === 'object') {
              yield {
                usage: toProviderUsage(
                  usage as {
                    readonly completion_tokens?: unknown;
                    readonly prompt_tokens?: unknown;
                    readonly prompt_tokens_details?: {
                      readonly cached_tokens?: unknown;
                    };
                    readonly total_tokens?: unknown;
                  },
                ),
              };
            }
          }
        }
      }
      const requestId = response.headers.get('x-request-id');
      if (requestId) yield { requestId };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw providerError(
        'OUTPUT_INVALID',
        'Resposta inválida do provedor de IA.',
        502,
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }
}
