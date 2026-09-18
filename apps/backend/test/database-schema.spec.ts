import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const schemaPath = fileURLToPath(
  new URL('../../../database/prisma/schema.prisma', import.meta.url),
);
const migrationPath = fileURLToPath(
  new URL(
    '../../../database/prisma/migrations/20260831130000_initial/migration.sql',
    import.meta.url,
  ),
);
const commercialMigrationPath = fileURLToPath(
  new URL(
    '../../../database/prisma/migrations/20260906160000_add_tabelas_comerciais/migration.sql',
    import.meta.url,
  ),
);

describe('database artifacts', () => {
  it('keeps all initial entities in the Prisma schema', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    const models = schema.match(/^model\s+\w+/gm) ?? [];

    expect(models).toHaveLength(52);
    expect(schema).toContain('model Team');
    expect(schema).toContain('model UserPermissionOverride');
    expect(schema).toContain('model SellerProfile');
    expect(schema).toContain('model Administradora');
    expect(schema).toContain('model GrupoHistorico');
    expect(schema).toContain('model AuditLog');
    expect(schema).toContain('model User');
    expect(schema).toContain('model Session');
    expect(schema).toContain('model Lead');
    expect(schema).toContain('model LeadInteresse');
    expect(schema).toContain('model LeadInteracao');
    expect(schema).toContain('model FollowUp');
    expect(schema).toContain('model IntegrationRun');
    expect(schema).toContain('model ExternalEntityMapping');
    expect(schema).toContain('model AnalyticsSession');
    expect(schema).toContain('model AnalyticsEvent');
    expect(schema).toContain('model TabelaComercial');
    expect(schema).toContain('model TabelaComercialItem');
    expect(schema).toContain('model CommercialConfiguration');
    expect(schema).toContain('model AppearanceConfiguration');
    expect(schema).toContain('model ProductCommercialRule');
    expect(schema).toContain('model Simulation');
    expect(schema).toContain('model SimulationScenario');
    expect(schema).toContain('model SimulationCalculationSnapshot');
    expect(schema).toContain('model SimulationResult');
    expect(schema).toContain('model SimulationFavorite');
    expect(schema).toContain('model Proposal');
    expect(schema).toContain('model ProposalItem');
    expect(schema).toContain('model ProposalStatusHistory');
    expect(schema).toContain('model KnowledgeDocument');
    expect(schema).toContain('model KnowledgeChunk');
    expect(schema).toContain('model KnowledgeIngestion');
    expect(schema).toContain('model AiUsage');
    expect(schema).toContain('model AiPricing');
  });

  it('never uses Float for financial values', async () => {
    const schema = await readFile(schemaPath, 'utf8');

    expect(schema).not.toMatch(/\bFloat\b/);
    expect(schema).toContain('@db.Decimal(19, 2)');
    expect(schema).toContain('@db.Decimal(9, 6)');
  });

  it('preserves custom PostgreSQL constraints in the migration', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('grupos_valores_credito_ck');
    expect(migration).toContain('data_quality_issues_resolucao_ck');
    expect(migration).toContain('audit_logs_identificacao_ck');
  });

  it('models commercial tables with deterministic keys and database checks', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    const migration = await readFile(commercialMigrationPath, 'utf8');
    expect(schema).toContain(
      '@@unique([administradoraId, codigo, inicioVigencia])',
    );
    expect(schema).toContain(
      '@@unique([tabelaComercialId, creditoReferencia, prazoMeses, modalidade, codigoPlano])',
    );
    expect(migration).toContain('tabelas_comerciais_vigencia_check');
    expect(migration).toContain('tabelas_comerciais_itens_monetarios_check');
    expect(migration).toContain('tabelas_comerciais_itens_percentuais_check');
    expect(migration).not.toContain('FLOAT');
  });
});
