import type {
  IntegrationConnectorType,
  IntegrationListQuery,
  IntegrationRunListQuery,
  IntegrationRunStatus,
  IntegrationStatus,
  IntegrationTrigger,
} from '@larcarvalho/shared';

import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';

export const integrationSelect = {
  id: true,
  administradoraId: true,
  fonteDadosId: true,
  nome: true,
  tipo: true,
  status: true,
  configuracaoNaoSensivel: true,
  secretRef: true,
  frequencia: true,
  ultimoSucessoEm: true,
  ultimaTentativaEm: true,
  proximaExecucaoEm: true,
  cursor: true,
  intervaloMinutos: true,
  syncLockedAt: true,
  syncLockedBy: true,
  createdAt: true,
  updatedAt: true,
  administradora: { select: { id: true, nome: true } },
  fonteDados: { select: { id: true, nome: true } },
} as const;

export const runSelect = {
  id: true,
  integrationId: true,
  importacaoId: true,
  status: true,
  trigger: true,
  iniciadoEm: true,
  finalizadoEm: true,
  registrosRecebidos: true,
  registrosValidos: true,
  registrosInvalidos: true,
  registrosCriados: true,
  registrosAtualizados: true,
  registrosIgnorados: true,
  registrosRejeitados: true,
  issuesCriadas: true,
  cursor: true,
  mappingVersion: true,
  normalizerVersion: true,
  providerSchemaVersion: true,
  erroCodigo: true,
  erroResumo: true,
  requestId: true,
  createdAt: true,
} as const;

export type IntegrationRecord = Prisma.IntegrationGetPayload<{
  select: typeof integrationSelect;
}>;
export type IntegrationRunRecord = Prisma.IntegrationRunGetPayload<{
  select: typeof runSelect;
}>;

export class IntegrationsRepository {
  constructor(readonly db: PrismaClient) {}

  async list(query: IntegrationListQuery) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
    } satisfies Prisma.IntegrationWhereInput;
    const [items, total] = await Promise.all([
      this.db.integration.findMany({
        where,
        select: integrationSelect,
        orderBy: [{ nome: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.integration.count({ where }),
    ]);
    return { items, total };
  }

  get(id: string) {
    return this.db.integration.findUnique({
      where: { id },
      select: integrationSelect,
    });
  }

  create(data: {
    id?: string;
    nome: string;
    tipo: IntegrationConnectorType;
    status: IntegrationStatus;
    administradoraId?: string | null;
    fonteDadosId?: string | null;
    configuracaoNaoSensivel: Prisma.InputJsonValue;
    secretRef?: string | null;
    frequencia?: string | null;
    proximaExecucaoEm?: Date | null;
  }) {
    return this.db.integration.create({
      data,
      select: integrationSelect,
    });
  }

  update(id: string, data: Prisma.IntegrationUpdateInput) {
    return this.db.integration.update({
      where: { id },
      data,
      select: integrationSelect,
    });
  }

  findRunByIdempotency(integrationId: string, idempotencyKey: string) {
    return this.db.integrationRun.findUnique({
      where: {
        integrationId_idempotencyKey: { integrationId, idempotencyKey },
      },
      select: runSelect,
    });
  }

  createRun(data: {
    integrationId: string;
    trigger: IntegrationTrigger;
    requestId: string;
    idempotencyKey?: string;
    importacaoId?: string;
  }) {
    return this.db.integrationRun.create({
      data,
      select: runSelect,
    });
  }

  startRun(id: string) {
    return this.db.integrationRun.update({
      where: { id },
      data: { status: 'EXECUTANDO' },
      select: runSelect,
    });
  }

  finishRun(
    id: string,
    data: {
      status: IntegrationRunStatus;
      registrosRecebidos: number;
      registrosValidos: number;
      registrosInvalidos: number;
      registrosCriados: number;
      registrosAtualizados: number;
      registrosIgnorados: number;
      registrosRejeitados?: number;
      issuesCriadas?: number;
      cursor?: string | null;
      mappingVersion?: string | null;
      normalizerVersion?: string | null;
      providerSchemaVersion?: string | null;
      erroCodigo?: string | null;
      erroResumo?: string | null;
    },
  ) {
    return this.db.integrationRun.update({
      where: { id },
      data: { ...data, finalizadoEm: new Date() },
      select: runSelect,
    });
  }

  async listRuns(integrationId: string, query: IntegrationRunListQuery) {
    const where = {
      integrationId,
      ...(query.status ? { status: query.status } : {}),
    } satisfies Prisma.IntegrationRunWhereInput;
    const [items, total] = await Promise.all([
      this.db.integrationRun.findMany({
        where,
        select: runSelect,
        orderBy: { iniciadoEm: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.integrationRun.count({ where }),
    ]);
    return { items, total };
  }

  getRun(id: string) {
    return this.db.integrationRun.findUnique({
      where: { id },
      select: runSelect,
    });
  }
}
