import {
  canonicalIntegrationPayloadSchema,
  restIntegrationConfigSchema,
  type IntegrationConfiguration,
} from '@larcarvalho/shared';

import {
  ConnectorError,
  type ConnectorContext,
  type IntegrationConnector,
} from './integration-connector.js';
import { assertSafeExternalUrl, type NetworkPolicy } from './network-policy.js';

const retryableStatuses = new Set([429, 502, 503, 504]);

async function readLimited(response: Response, limit: number): Promise<string> {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > limit)
    throw new ConnectorError(
      'RESPONSE_TOO_LARGE',
      'Resposta excede o limite permitido',
    );
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ConnectorError(
        'RESPONSE_TOO_LARGE',
        'Resposta excede o limite permitido',
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export class RestIntegrationConnector implements IntegrationConnector {
  readonly type = 'REST_API' as const;

  constructor(
    private readonly networkPolicy: NetworkPolicy,
    private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> = (
      milliseconds,
    ) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  validateConfiguration(configuration: IntegrationConfiguration): void {
    restIntegrationConfigSchema.parse(configuration);
  }

  private async request(
    configuration: IntegrationConfiguration,
    context: ConnectorContext,
  ): Promise<Response> {
    const config = restIntegrationConfigSchema.parse(configuration);
    const url = await assertSafeExternalUrl(config.baseUrl, this.networkPolicy);
    const headers = new Headers({ accept: 'application/json' });
    if (config.authType === 'BEARER_SECRET_REF') {
      if (!context.secretRef)
        throw new ConnectorError(
          'SECRET_NOT_CONFIGURED',
          'Credencial não configurada',
        );
      const secret = context.resolveSecret(context.secretRef);
      if (!secret)
        throw new ConnectorError(
          'SECRET_NOT_AVAILABLE',
          'Credencial não disponível',
        );
      headers.set('authorization', `Bearer ${secret}`);
    }
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          headers,
          redirect: 'manual',
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400)
          throw new ConnectorError(
            'REDIRECT_BLOCKED',
            'Redirecionamento externo bloqueado',
          );
        if (
          retryableStatuses.has(response.status) &&
          attempt < config.maxRetries
        ) {
          await response.body?.cancel();
          await this.wait(100 * 2 ** attempt);
          continue;
        }
        if (!response.ok)
          throw new ConnectorError(
            `HTTP_${response.status}`,
            'Endpoint remoto recusou a solicitação',
            retryableStatuses.has(response.status),
          );
        return response;
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        if (attempt < config.maxRetries) {
          await this.wait(100 * 2 ** attempt);
          continue;
        }
        throw new ConnectorError(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'TIMEOUT'
            : 'NETWORK_FAILURE',
          'Falha de comunicação com o endpoint remoto',
          true,
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ConnectorError(
      'RETRY_EXHAUSTED',
      'Tentativas do connector esgotadas',
    );
  }

  async testConnection(
    configuration: IntegrationConfiguration,
    context: ConnectorContext,
  ) {
    const started = performance.now();
    try {
      const response = await this.request(configuration, context);
      await response.body?.cancel();
      return {
        sucesso: true,
        latenciaMs: Math.max(0, Math.round(performance.now() - started)),
        mensagem: 'Conexão estabelecida com sucesso',
      };
    } catch (error) {
      const safe =
        error instanceof ConnectorError ? error.message : 'Falha de conexão';
      return {
        sucesso: false,
        latenciaMs: Math.max(0, Math.round(performance.now() - started)),
        mensagem: safe,
      };
    }
  }

  async fetchRecords(
    configuration: IntegrationConfiguration,
    context: ConnectorContext,
  ) {
    const config = restIntegrationConfigSchema.parse(configuration);
    const response = await this.request(config, context);
    const text = await readLimited(response, config.maxResponseBytes);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ConnectorError(
        'INVALID_JSON',
        'Resposta não contém JSON válido',
      );
    }
    const result = canonicalIntegrationPayloadSchema.safeParse(raw);
    if (!result.success)
      throw new ConnectorError(
        'INVALID_CANONICAL_PAYLOAD',
        'Resposta não segue o formato canônico CANONICAL_V1',
      );
    return {
      records: result.data.records,
      received: result.data.records.length,
      valid: result.data.records.length,
      invalid: 0,
    };
  }
}
