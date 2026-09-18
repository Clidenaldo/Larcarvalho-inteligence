import type {
  ImportacaoTipo,
  IntegrationEntityType,
} from '@larcarvalho/shared';

import type {
  Prisma,
} from '../../generated/prisma/client.js';
import {
  persistDomainRecord,
  prepareDomainRecord,
  type DomainAuditContext,
  type DomainIngestionDb,
  type PreparedDomainRecord,
} from '../domain-ingestion/domain-ingestion.js';

const importTypeByEntity = {
  ADMINISTRADORA: 'ADMINISTRADORAS',
  PRODUTO: 'PRODUTOS',
  GRUPO: 'GRUPOS',
  COTA: 'COTAS',
  ASSEMBLEIA: 'ASSEMBLEIAS',
  LANCE: 'LANCES',
  CONTEMPLACAO: 'CONTEMPLACOES',
  TABELA_COMERCIAL: 'TABELAS_COMERCIAIS',
} as const satisfies Record<IntegrationEntityType, ImportacaoTipo>;

export interface PromoteDomainRecordInput {
  db: DomainIngestionDb;
  entityType: IntegrationEntityType;
  values: Record<string, unknown>;
  row: number;
  auditContext: DomainAuditContext;
}

export interface PreparedIntegrationDomainRecord {
  tipo: ImportacaoTipo;
  prepared: PreparedDomainRecord;
}

export interface PersistPreparedIntegrationDomainRecordInput {
  tx: Prisma.TransactionClient;
  tipo: ImportacaoTipo;
  prepared: PreparedDomainRecord;
  auditContext: DomainAuditContext;
}

export function integrationEntityToImportType(
  entityType: IntegrationEntityType,
): ImportacaoTipo {
  return importTypeByEntity[entityType];
}

export async function prepareIntegrationDomainRecord(
  input: PromoteDomainRecordInput,
): Promise<PreparedIntegrationDomainRecord> {
  const tipo = integrationEntityToImportType(input.entityType);

  const prepared = await prepareDomainRecord(
    input.db,
    tipo,
    input.values,
    input.row,
    'ATUALIZAR',
  );

  return {
    tipo,
    prepared,
  };
}

export async function persistPreparedIntegrationDomainRecord(
  input: PersistPreparedIntegrationDomainRecordInput,
): Promise<{ internalId: string }> {
  const persisted = await persistDomainRecord(
    input.tx,
    input.tipo,
    input.prepared,
    input.auditContext,
  );

  return {
    internalId: persisted.id,
  };
}