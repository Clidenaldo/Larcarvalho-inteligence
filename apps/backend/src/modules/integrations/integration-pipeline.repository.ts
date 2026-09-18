import type { IntegrationEntityType } from '@larcarvalho/shared';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

type IntegrationPipelineDb = PrismaClient | Prisma.TransactionClient;

export interface StageIntegrationRecordInput {
  runId: string;
  integrationId: string;
  externalId: string;
  entityType: IntegrationEntityType;
  checksum: string;
  payload: Prisma.InputJsonValue;
  schemaVersion?: string;
}

export interface UpsertExternalMappingInput {
  integrationId: string;
  entityType: IntegrationEntityType;
  externalId: string;
  internalId: string;
  checksum?: string | null;
  externalUpdatedAt?: Date | null;
}

export class IntegrationPipelineRepository {
  constructor(private readonly db: PrismaClient) {}

  stage(input: StageIntegrationRecordInput) {
    return this.db.integrationStagingRecord.upsert({
      where: {
        runId_entityType_externalId: {
          runId: input.runId,
          entityType: input.entityType,
          externalId: input.externalId,
        },
      },
      create: {
        runId: input.runId,
        integrationId: input.integrationId,
        externalId: input.externalId,
        entityType: input.entityType,
        checksum: input.checksum,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 'CANONICAL_V1',
        status: 'PENDING',
      },
      update: {
        checksum: input.checksum,
        payload: input.payload,
        schemaVersion: input.schemaVersion ?? 'CANONICAL_V1',
        status: 'PENDING',
        errorCode: null,
      },
    });
  }

  getStageRecord(
    runId: string,
    entityType: IntegrationEntityType,
    externalId: string,
  ) {
    return this.db.integrationStagingRecord.findUnique({
      where: {
        runId_entityType_externalId: {
          runId,
          entityType,
          externalId,
        },
      },
    });
  }

  listStageRecords(runId: string) {
    return this.db.integrationStagingRecord.findMany({
      where: { runId },
      orderBy: [{ entityType: 'asc' }, { externalId: 'asc' }],
    });
  }

  markStageApplied(
    id: string,
    db: IntegrationPipelineDb = this.db,
  ) {
    return db.integrationStagingRecord.update({
      where: { id },
      data: {
        status: 'APPLIED',
        errorCode: null,
      },
    });
  }

  markStageRejected(
    id: string,
    errorCode: string,
    db: IntegrationPipelineDb = this.db,
  ) {
    return db.integrationStagingRecord.update({
      where: { id },
      data: {
        status: 'REJECTED',
        errorCode: errorCode.slice(0, 100),
      },
    });
  }

  findMapping(
    integrationId: string,
    entityType: IntegrationEntityType,
    externalId: string,
  ) {
    return this.db.externalEntityMapping.findUnique({
      where: {
        integrationId_entityType_externalId: {
          integrationId,
          entityType,
          externalId,
        },
      },
    });
  }

  upsertMapping(
    input: UpsertExternalMappingInput,
    db: IntegrationPipelineDb = this.db,
  ) {
    const now = new Date();

    return db.externalEntityMapping.upsert({
      where: {
        integrationId_entityType_externalId: {
          integrationId: input.integrationId,
          entityType: input.entityType,
          externalId: input.externalId,
        },
      },
      create: {
        integrationId: input.integrationId,
        entityType: input.entityType,
        externalId: input.externalId,
        internalId: input.internalId,
        checksum: input.checksum ?? null,
        externalUpdatedAt: input.externalUpdatedAt ?? null,
        lastSeenAt: now,
      },
      update: {
        internalId: input.internalId,
        checksum: input.checksum ?? null,
        externalUpdatedAt: input.externalUpdatedAt ?? null,
        lastSeenAt: now,
      },
    });
  }

  touchMapping(
    integrationId: string,
    entityType: IntegrationEntityType,
    externalId: string,
    db: IntegrationPipelineDb = this.db,
  ) {
    return db.externalEntityMapping.update({
      where: {
        integrationId_entityType_externalId: {
          integrationId,
          entityType,
          externalId,
        },
      },
      data: {
        lastSeenAt: new Date(),
      },
    });
  }

  countStage(runId: string) {
    return this.db.integrationStagingRecord.count({
      where: { runId },
    });
  }

  countStageByStatus(
    runId: string,
    status: 'PENDING' | 'APPLIED' | 'REJECTED',
  ) {
    return this.db.integrationStagingRecord.count({
      where: { runId, status },
    });
  }

  deleteStageForRun(runId: string) {
    return this.db.integrationStagingRecord.deleteMany({
      where: { runId },
    });
  }
}
