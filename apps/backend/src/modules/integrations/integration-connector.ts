import type {
  CanonicalIntegrationRecord,
  IntegrationConfiguration,
  IntegrationConnectorType,
} from '@larcarvalho/shared';

export interface ConnectorContext {
  readonly requestId: string;
  readonly secretRef: string | null;
  readonly resolveSecret: (reference: string) => string | undefined;
}

export interface ConnectionTestResult {
  readonly sucesso: boolean;
  readonly latenciaMs: number;
  readonly mensagem: string;
}

export interface ConnectorFetchResult {
  readonly records: readonly CanonicalIntegrationRecord[];
  readonly received: number;
  readonly valid: number;
  readonly invalid: number;
}

export interface IntegrationConnector {
  readonly type: IntegrationConnectorType;
  validateConfiguration(configuration: IntegrationConfiguration): void;
  testConnection(
    configuration: IntegrationConfiguration,
    context: ConnectorContext,
  ): Promise<ConnectionTestResult>;
  fetchRecords(
    configuration: IntegrationConfiguration,
    context: ConnectorContext,
  ): Promise<ConnectorFetchResult>;
}

export class ConnectorError extends Error {
  override readonly name = 'ConnectorError';

  constructor(
    readonly code: string,
    message: string,
    readonly transient = false,
  ) {
    super(message);
  }
}

export function safeConnectorError(error: unknown): {
  code: string;
  summary: string;
} {
  if (error instanceof ConnectorError)
    return { code: error.code, summary: error.message.slice(0, 1_000) };
  return {
    code: 'CONNECTOR_FAILURE',
    summary: 'Falha técnica no connector',
  };
}
