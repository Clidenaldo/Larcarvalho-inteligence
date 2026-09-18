import {
  mockIntegrationConfigSchema,
  type CanonicalIntegrationRecord,
  type IntegrationConfiguration,
} from '@larcarvalho/shared';

import {
  ConnectorError,
  type ConnectorContext,
  type ConnectorFetchResult,
  type IntegrationConnector,
} from './integration-connector.js';

export class MockIntegrationConnector implements IntegrationConnector {
  readonly type = 'MOCK' as const;

  validateConfiguration(configuration: IntegrationConfiguration): void {
    mockIntegrationConfigSchema.parse(configuration);
  }

  async testConnection(
    configuration: IntegrationConfiguration,
    _context: ConnectorContext,
  ) {
    const started = performance.now();
    const config = mockIntegrationConfigSchema.parse(configuration);
    if (config.scenario === 'FAILURE')
      return {
        sucesso: false,
        latenciaMs: Math.max(0, Math.round(performance.now() - started)),
        mensagem: 'Falha controlada do connector de teste',
      };
    return {
      sucesso: true,
      latenciaMs: Math.max(0, Math.round(performance.now() - started)),
      mensagem: 'Connector de teste disponível',
    };
  }

  async fetchRecords(
    configuration: IntegrationConfiguration,
    _context: ConnectorContext,
  ): Promise<ConnectorFetchResult> {
    const config = mockIntegrationConfigSchema.parse(configuration);
    if (config.scenario === 'FAILURE')
      throw new ConnectorError(
        'MOCK_FAILURE',
        'Falha controlada do connector de teste',
      );
    const validCount =
      config.scenario === 'PARTIAL'
        ? Math.max(0, config.recordCount - 1)
        : config.recordCount;
    const records: CanonicalIntegrationRecord[] = Array.from(
      { length: validCount },
      (_, index) => ({
        entityType: 'ADMINISTRADORA',
        externalId: `mock-administradora-${index + 1}`,
        data: {           nome: `Mock Administradora ${index + 1}`,           codigoExterno: `MOCK-ADMIN-${index + 1}`,         },
        sourceMetadata: { connector: 'MOCK' },
      }),
    );
    return {
      records,
      received: config.recordCount,
      valid: validCount,
      invalid: config.recordCount - validCount,
    };
  }
}
