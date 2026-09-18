import type { ApiErrorCode, AiStructuredResponse } from '@larcarvalho/shared';
import { aiStructuredResponseSchema } from '@larcarvalho/shared';

import { AppError } from '../../core/errors/app-error.js';

export type FetchImpl = typeof fetch;

export interface HttpCallOptions {
  readonly body: unknown;
  readonly fetchImpl: FetchImpl;
  readonly maxRetries?: number;
  readonly path: string;
  readonly timeoutMs: number;
}

export interface HttpCallResult {
  readonly requestId: string | null;
  readonly response: Response;
}

const RETRIABLE_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  const exponential = 300 * 2 ** attempt;
  return Math.min(5_000, exponential + Math.floor(Math.random() * 250));
}

export function mapProviderStatus(
  status: number,
  _context: string,
): { code: ApiErrorCode; statusCode: number } {
  if (status === 401 || status === 403)
    return { code: 'PROVIDER_AUTH_ERROR', statusCode: 502 };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMITED', statusCode: 429 };
  if (status === 408 || status === 504)
    return { code: 'PROVIDER_TIMEOUT', statusCode: 504 };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', statusCode: 503 };
  return { code: 'INTERNAL_ERROR', statusCode: 500 };
}

export function providerError(
  code: ApiErrorCode,
  message: string,
  statusCode: number,
): AppError {
  // Never include prompt content, keys or response bodies: only the category.
  return new AppError({ code, message, statusCode });
}

/**
 * POST JSON with timeout + retry for transient statuses only (429/502/503/504).
 * Never retries 400/401/403/validation errors. Never logs request bodies.
 */
export async function postJson(
  baseUrl: string,
  apiKey: string,
  options: HttpCallOptions,
): Promise<HttpCallResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await options.fetchImpl(`${baseUrl}${options.path}`, {
        body: JSON.stringify(options.body),
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') {
        if (attempt < maxRetries) {
          attempt += 1;
          await sleep(backoffMs(attempt));
          continue;
        }
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
    clearTimeout(timer);
    if (response.ok) {
      return {
        requestId: response.headers.get('x-request-id'),
        response,
      };
    }
    const mapped = mapProviderStatus(response.status, options.path);
    if (RETRIABLE_STATUS.has(response.status) && attempt < maxRetries) {
      attempt += 1;
      await sleep(backoffMs(attempt));
      continue;
    }
    throw providerError(
      mapped.code,
      `Provedor de IA respondeu com erro (${mapped.code}).`,
      mapped.statusCode,
    );
  }
}

export async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw providerError(
      'OUTPUT_INVALID',
      'Resposta inválida do provedor de IA.',
      502,
    );
  }
}

/** Shared strict parser: provider text must match the structured contract. */
export function parseStructuredResponse(text: string): AiStructuredResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw providerError(
      'OUTPUT_INVALID',
      'Resposta inválida do provedor de IA.',
      502,
    );
  }
  const result = aiStructuredResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw providerError(
      'OUTPUT_INVALID',
      'Resposta inválida do provedor de IA.',
      502,
    );
  }
  return result.data;
}
