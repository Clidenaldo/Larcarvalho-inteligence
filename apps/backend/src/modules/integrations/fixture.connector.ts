import { randomUUID } from 'node:crypto';

import {
  fixtureIntegrationConfigSchema,
  type CanonicalIntegrationRecord,
  type FixtureIntegrationScenario,
  type IntegrationConfiguration,
} from '@larcarvalho/shared';

import {
  ConnectorError,
  type ConnectorContext,
  type ConnectorFetchResult,
  type IntegrationConnector,
} from './integration-connector.js';

function canonical(
  entityType: CanonicalIntegrationRecord['entityType'],
  externalId: string,
  data: Record<string, unknown>,
): CanonicalIntegrationRecord {
  return {
    entityType,
    externalId,
    data,
    sourceMetadata: { connector: 'FIXTURE' },
  };
}

export class FixtureIntegrationConnector implements IntegrationConnector {
  readonly type = 'FIXTURE' as const;

  validateConfiguration(configuration: IntegrationConfiguration): void {
    fixtureIntegrationConfigSchema.parse(configuration);
  }

  async testConnection(
    configuration: IntegrationConfiguration,
    _context: ConnectorContext,
  ) {
    const started = performance.now();
    fixtureIntegrationConfigSchema.parse(configuration);
    return {
      sucesso: true,
      latenciaMs: Math.max(0, Math.round(performance.now() - started)),
      mensagem: 'Connector fixture disponível',
    };
  }

  async fetchRecords(
    configuration: IntegrationConfiguration,
    _context: ConnectorContext,
  ): Promise<ConnectorFetchResult> {
    const config = fixtureIntegrationConfigSchema.parse(configuration);
    if (config.scenario === 'FAILURE')
      throw new ConnectorError(
        'FIXTURE_FAILURE',
        'Falha controlada do fixture',
        true,
      );

    const scenario: FixtureIntegrationScenario = config.scenario;
    const records = this.buildRecords(
      scenario,
      config.recordCount,
      config.cursor ?? undefined,
    );
    const invalid = records.filter((r) => r.data._invalid === true).length;
    const valid = records.length - invalid;

    return { records, received: records.length, valid, invalid };
  }

  private buildRecords(
    scenario: FixtureIntegrationScenario,
    count: number,
    cursor?: string,
  ): CanonicalIntegrationRecord[] {
    switch (scenario) {
      case 'COMMERCIAL_TABLE_OK':
        return Array.from({ length: count }, (_, i) =>
          canonical('TABELA_COMERCIAL', `fix-ct-${i + 1}`, {
            codigo: `TEST-A-${i + 1}`,
            nome: `Tabela Teste Fixture ${i + 1}`,
            categoria: 'AUTOMOVEL',
            inicioVigencia: '2026-01-01',
            itens: [
              {
                creditoReferencia: `CRE-${i + 1}-001`,
                prazoMeses: 12,
                modalidade: 'MISTO',
                parcelaPadrao: '100.00',
                taxaAdministracaoPercentual: '3.50',
              },
            ],
            _invalid: false,
          }),
        );
      case 'GROUP_OK':
        return Array.from({ length: count }, (_, i) =>
          canonical('GRUPO', `fix-grp-${i + 1}`, {
            codigo: `GRP-FIX-${i + 1}`,
            prazoMeses: 24,
            produtoCodigo: `PROD-FIX-${i + 1}`,
            _invalid: false,
          }),
        );
      case 'QUOTA_OK':
        return Array.from({ length: count }, (_, i) =>
          canonical('COTA', `fix-cota-${i + 1}`, {
            numero: `COTA-${i + 1}`,
            grupoCodigo: `GRP-FIX-${Math.floor(i / 2) + 1}`,
            nomeConsorciado: `Consorciado ${i + 1}`,
            _invalid: false,
          }),
        );
      case 'ASSEMBLY_OK':
        return Array.from({ length: count }, (_, i) => {
          const grp = `GRP-FIX-${Math.floor(i / 2) + 1}`;
          if (i % 3 === 0)
            return canonical('ASSEMBLEIA', `fix-asm-${i + 1}`, {
              numero: `ASM-${i + 1}`,
              grupoCodigo: grp,
              dataAssembleia: '2026-06-15T10:00:00Z',
              _invalid: false,
            });
          if (i % 3 === 1)
            return canonical('LANCE', `fix-lance-${i + 1}`, {
              assembleiaNumero: `ASM-${Math.floor(i / 3) + 1}`,
              grupoCodigo: grp,
              tipo: 'LANCE_LIVRE',
              percentual: '10.00',
              valor: '500.00',
              cotaNumero: `COTA-${i + 1}`,
              contemplado: i % 2 === 0,
              _invalid: false,
            });
          return canonical('CONTEMPLACAO', `fix-con-${i + 1}`, {
            assembleiaNumero: `ASM-${Math.floor(i / 3) + 1}`,
            grupoCodigo: grp,
            codigoExterno: `COTA-${i + 1}`,
            _invalid: false,
          });
        });
      case 'PARTIAL_ERROR': {
        const valid = Math.max(0, count - 1);
        const result: CanonicalIntegrationRecord[] = Array.from(
          { length: valid },
          (_, i) =>
            canonical('GRUPO', `fix-grp-${i + 1}`, {
              codigo: `GRP-FIX-${i + 1}`,
              prazoMeses: 24,
              _invalid: false,
            }),
        );
        result.push(
          canonical('GRUPO', 'fix-grp-invalid', {
            codigo: '',
            prazoMeses: -1,
            _invalid: true,
          }),
        );
        return result;
      }
      case 'CONFLICT':
        return [
          canonical('GRUPO', 'fix-conflict-1', {
            codigo: 'GRP-CONFLICT',
            prazoMeses: 24,
            _invalid: false,
          }),
          canonical('GRUPO', 'fix-conflict-2', {
            codigo: 'GRP-CONFLICT',
            prazoMeses: 36,
            _invalid: false,
          }),
        ];
      case 'EMPTY':
        return [];
      case 'INCREMENTAL':
        return Array.from({ length: count }, (_, i) =>
          canonical('GRUPO', `fix-inc-${i + 1}`, {
            codigo: `GRP-INC-${i + 1}`,
            prazoMeses: 12,
            _cursor: cursor ?? 'cursor-000',
            _invalid: false,
          }),
        );
      default:
        return [];
    }
  }
}
