import {
  fixtureIntegrationConfigSchema,
  integrationConfigurationSchema,
  integrationSecretWriteSchema,
  manualImportIntegrationConfigSchema,
  mockIntegrationConfigSchema,
  restIntegrationConfigSchema,
  syncPreviewSchema,
  type CreateIntegrationRequest,
  type ExecuteIntegrationRequest,
  type FixtureIntegrationScenario,
  type IntegrationConfiguration,
  type IntegrationConnectorType,
  type IntegrationListQuery,
  type IntegrationRunListQuery,
  type Permission,
  type UpdateIntegrationRequest,
  type ApiErrorCode,
} from '@larcarvalho/shared';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';

import type { AppConfig } from '../../config/env.js';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';
import type { ImportacoesService } from '../importacoes/importacoes.service.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import { IntegrationSecretService } from './integration-secret.service.js';
import { IntegrationPipelineRepository } from './integration-pipeline.repository.js';
import {
  persistPreparedIntegrationDomainRecord,
  prepareIntegrationDomainRecord,
} from './integration-domain-promoter.js';
import {
  ConnectorError,
  safeConnectorError,
  type IntegrationConnector,
} from './integration-connector.js';
import { FixtureIntegrationConnector } from './fixture.connector.js';
import type {
  IntegrationsRepository,
  IntegrationRecord,
  IntegrationRunRecord,
} from './integrations.repository.js';
import { MockIntegrationConnector } from './mock.connector.js';
import { RestIntegrationConnector } from './rest.connector.js';

const unavailableTypes = new Set<IntegrationConnectorType>([
  'SOAP',
  'SFTP',
  'FILE_PULL',
  'WEBHOOK',
]);
const entityOrder = new Map([
  ['ADMINISTRADORA', 0],
  ['PRODUTO', 1],
  ['GRUPO', 2],
  ['COTA', 3],
  ['ASSEMBLEIA', 4],
  ['LANCE', 5],
  ['CONTEMPLACAO', 5],
  ['TABELA_COMERCIAL', 0],
]);

const fail = (code: ApiErrorCode, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableJson(item)).join(',') + ']';
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();

  return (
    '{' +
    keys
      .map(
        (key) =>
          JSON.stringify(key) + ':' + stableJson(object[key]),
      )
      .join(',') +
    '}'
  );
}
function deterministicChecksum(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function domainValuesFromCanonical(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const {
    _invalid: _invalid,
    _cursor: _cursor,
    _conflict: _conflict,
    ...values
  } = data;

  void _invalid;
  void _cursor;
  void _conflict;

  return values;
}

function parseConfiguration(
  type: IntegrationConnectorType,
  value: unknown,
): IntegrationConfiguration {
  if (type === 'MOCK') return mockIntegrationConfigSchema.parse(value);
  if (type === 'REST_API') return restIntegrationConfigSchema.parse(value);
  if (type === 'MANUAL_IMPORT')
    return manualImportIntegrationConfigSchema.parse(value);
  if (type === 'FIXTURE') return fixtureIntegrationConfigSchema.parse(value);
  return integrationConfigurationSchema.parse(value);
}

function runDto(record: IntegrationRunRecord) {
  return {
    ...record,
    iniciadoEm: record.iniciadoEm.toISOString(),
    finalizadoEm: record.finalizadoEm?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

function redactSecrets(input: unknown): unknown {
  if (typeof input === 'string') {
    const lower = input.toLowerCase();
    if (
      lower.includes('authorization') ||
      lower.includes('apikey') ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('client_secret') ||
      lower.includes('cookie')
    )
      return '[REDACTED]';
    return input;
  }
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactSecrets(v);
    }
    return out;
  }
  return input;
}

export class IntegrationsService {
  private readonly connectors: ReadonlyMap<
    IntegrationConnectorType,
    IntegrationConnector
  >;
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly secretService: IntegrationSecretService;
  private readonly pipelineRepository: IntegrationPipelineRepository;

  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly config: AppConfig,
    private readonly importacoesService?: ImportacoesService,
  ) {
    this.allowedHosts = new Set(
      config.INTEGRATION_REST_ALLOWED_HOSTS.split(',')
        .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
        .filter(Boolean),
    );
    this.secretService = new IntegrationSecretService(config);
    this.pipelineRepository = new IntegrationPipelineRepository(repository.db);
    const connectors: IntegrationConnector[] = [
      new MockIntegrationConnector(),
      new RestIntegrationConnector({
        allowedHosts: this.allowedHosts,
        allowPrivateAddresses: config.NODE_ENV === 'test',
      }),
      new FixtureIntegrationConnector(),
    ];
    this.connectors = new Map(
      connectors.map((connector) => [connector.type, connector]),
    );
  }

  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw fail('FORBIDDEN', 'Acesso não autorizado', 403);
  }

  private connector(type: IntegrationConnectorType): IntegrationConnector {
    const connector = this.connectors.get(type);
    if (!connector)
      throw new ConnectorError(
        'CONNECTOR_NOT_CONFIGURED',
        'Connector preparado, mas ainda não configurado',
      );
    return connector;
  }

  private configured(
    type: IntegrationConnectorType,
    configuration: IntegrationConfiguration,
    secretRef: string | null,
  ): boolean {
    if (unavailableTypes.has(type)) return false;
    if (type === 'REST_API') {
      const rest = restIntegrationConfigSchema.parse(configuration);
      try {
        const hostname = new URL(rest.baseUrl).hostname
          .toLowerCase()
          .replace(/\.$/, '');
        if (!this.allowedHosts.has(hostname)) return false;
      } catch {
        return false;
      }
      return (
        rest.authType === 'NONE' || Boolean(secretRef && process.env[secretRef])
      );
    }
    return true;
  }

  private dto(record: IntegrationRecord, includeHealth = false) {
    const configuration = parseConfiguration(
      record.tipo,
      record.configuracaoNaoSensivel ?? {},
    );
    const dto: Record<string, unknown> = {
      id: record.id,
      administradoraId: record.administradoraId,
      fonteDadosId: record.fonteDadosId,
      nome: record.nome,
      tipo: record.tipo,
      status: record.status,
      configuracao: configuration,
      configurado: this.configured(
        record.tipo,
        configuration,
        record.secretRef,
      ),
      secretRef: record.secretRef,
      frequencia: record.frequencia,
      ultimoSucessoEm: record.ultimoSucessoEm?.toISOString() ?? null,
      ultimaTentativaEm: record.ultimaTentativaEm?.toISOString() ?? null,
      proximaExecucaoEm: record.proximaExecucaoEm?.toISOString() ?? null,
      cursor: record.cursor ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      administradora: record.administradora,
      fonteDados: record.fonteDados,
    };
    if (includeHealth) {
      dto.saude = this.computeHealth(record);
    }
    return dto;
  }

  private computeHealth(record: IntegrationRecord) {
    if (record.status === 'DESABILITADA') return 'DISABLED';
    if (record.status === 'NAO_CONFIGURADA') return 'NOT_CONFIGURED';
    if (
      record.syncLockedAt &&
      new Date(record.syncLockedAt) > new Date(Date.now() - 600_000)
    )
      return 'DEGRADED';
    if (record.status === 'ERRO') return 'FAILING';
    return 'HEALTHY';
  }

  private async record(id: string): Promise<IntegrationRecord> {
    const record = await this.repository.get(id);
    if (!record)
      throw fail('INTEGRATION_NOT_FOUND', 'Integração não encontrada', 404);
    return record;
  }

  private async ensureRelations(
    administradoraId?: string | null,
    fonteDadosId?: string | null,
  ) {
    const [administradora, fonte] = await Promise.all([
      administradoraId
        ? this.repository.db.administradora.findUnique({
            where: { id: administradoraId },
            select: { id: true },
          })
        : null,
      fonteDadosId
        ? this.repository.db.fonteDados.findUnique({
            where: { id: fonteDadosId },
            select: { id: true, administradoraId: true },
          })
        : null,
    ]);
    if (administradoraId && !administradora)
      throw fail(
        'ADMINISTRADORA_NOT_FOUND',
        'Administradora não encontrada',
        404,
      );
    if (fonteDadosId && !fonte)
      throw fail('FONTE_DADOS_NOT_FOUND', 'Fonte de dados não encontrada', 404);
    if (
      administradoraId &&
      fonte?.administradoraId &&
      fonte.administradoraId !== administradoraId
    )
      throw fail(
        'INTEGRATION_RELATION_CONFLICT',
        'Fonte de dados não pertence à administradora',
        409,
      );
  }

  private audit(
    action: string,
    actor: AuthContext,
    entityId: string,
    metadata: Prisma.InputJsonObject,
    request: RequestMetadata,
  ) {
    return this.repository.db.auditLog.create({
      data: {
        action,
        actorId: actor.user.id,
        entity: 'Integration',
        entityId,
        metadata: redactSecrets(metadata) as Prisma.InputJsonObject,
        ipAddress: request.ipAddress ?? null,
        userAgent: request.userAgent?.slice(0, 2_048) ?? null,
      },
    });
  }

  async list(actor: AuthContext, query: IntegrationListQuery) {
    this.allow(actor, 'integrations.read');
    const { items, total } = await this.repository.list(query);
    return {
      items: items.map((item) => this.dto(item, true)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async get(actor: AuthContext, id: string) {
    this.allow(actor, 'integrations.read');
    return this.dto(await this.record(id), true);
  }

  async create(
    actor: AuthContext,
    input: CreateIntegrationRequest,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.create');
    await this.ensureRelations(input.administradoraId, input.fonteDadosId);
    const configuration = parseConfiguration(input.tipo, input.configuracao);
    this.connectors.get(input.tipo)?.validateConfiguration(configuration);
    const secretRef = input.secretRef ?? null;
    const status = this.configured(input.tipo, configuration, secretRef)
      ? 'ATIVA'
      : 'NAO_CONFIGURADA';
    const id = randomUUID();
    const [record] = await this.repository.db.$transaction([
      this.repository.create({
        id,
        nome: input.nome,
        tipo: input.tipo,
        status,
        administradoraId: input.administradoraId ?? null,
        fonteDadosId: input.fonteDadosId ?? null,
        configuracaoNaoSensivel: configuration as Prisma.InputJsonValue,
        secretRef,
        frequencia: input.frequencia ?? null,
        proximaExecucaoEm: input.proximaExecucaoEm
          ? new Date(input.proximaExecucaoEm)
          : null,
      }),
      this.audit(
        'INTEGRATION_CREATED',
        actor,
        id,
        { tipo: input.tipo, status, configured: status === 'ATIVA' },
        request,
      ),
    ]);
    return this.dto(record, true);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateIntegrationRequest,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.update');
    const current = await this.record(id);
    await this.ensureRelations(
      input.administradoraId === undefined
        ? current.administradoraId
        : input.administradoraId,
      input.fonteDadosId === undefined
        ? current.fonteDadosId
        : input.fonteDadosId,
    );
    const configuration = parseConfiguration(
      current.tipo,
      input.configuracao ?? current.configuracaoNaoSensivel ?? {},
    );
    this.connectors.get(current.tipo)?.validateConfiguration(configuration);
    const secretRef =
      input.secretRef === undefined ? current.secretRef : input.secretRef;
    const configured = this.configured(current.tipo, configuration, secretRef);
    const [record] = await this.repository.db.$transaction([
      this.repository.update(id, {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.administradoraId !== undefined
          ? {
              administradora: input.administradoraId
                ? { connect: { id: input.administradoraId } }
                : { disconnect: true },
            }
          : {}),
        ...(input.fonteDadosId !== undefined
          ? {
              fonteDados: input.fonteDadosId
                ? { connect: { id: input.fonteDadosId } }
                : { disconnect: true },
            }
          : {}),
        ...(input.configuracao !== undefined
          ? { configuracaoNaoSensivel: configuration as Prisma.InputJsonValue }
          : {}),
        ...(input.secretRef !== undefined
          ? { secretRef: input.secretRef }
          : {}),
        ...(input.frequencia !== undefined
          ? { frequencia: input.frequencia }
          : {}),
        ...(input.proximaExecucaoEm !== undefined
          ? {
              proximaExecucaoEm: input.proximaExecucaoEm
                ? new Date(input.proximaExecucaoEm)
                : null,
            }
          : {}),
        ...(!configured ? { status: 'NAO_CONFIGURADA' } : {}),
      }),
      this.audit(
        'INTEGRATION_UPDATED',
        actor,
        id,
        { tipo: current.tipo, configured },
        request,
      ),
    ]);
    return this.dto(record, true);
  }

  async setPaused(
    actor: AuthContext,
    id: string,
    paused: boolean,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.pause');
    const current = await this.record(id);
    const configuration = parseConfiguration(
      current.tipo,
      current.configuracaoNaoSensivel ?? {},
    );
    if (
      !paused &&
      !this.configured(current.tipo, configuration, current.secretRef)
    )
      throw fail(
        'INTEGRATION_NOT_CONFIGURED',
        'Integração ainda não possui configuração utilizável',
        409,
      );
    const [record] = await this.repository.db.$transaction([
      this.repository.update(id, {
        status: paused ? 'PAUSADA' : 'ATIVA',
      }),
      this.audit(
        paused ? 'INTEGRATION_PAUSED' : 'INTEGRATION_RESUMED',
        actor,
        id,
        { tipo: current.tipo },
        request,
      ),
    ]);
    return this.dto(record, true);
  }

  private connectorContext(record: IntegrationRecord, requestId: string) {
    return {
      requestId,
      secretRef: record.secretRef,
      resolveSecret: (reference: string) => process.env[reference],
    };
  }

  async testConnection(
    actor: AuthContext,
    id: string,
    requestId: string,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.test_connection');
    const record = await this.record(id);
    const configuration = parseConfiguration(
      record.tipo,
      record.configuracaoNaoSensivel ?? {},
    );
    const startedAt = new Date();
    let result;
    if (record.tipo === 'MANUAL_IMPORT') {
      const { importacaoId } =
        manualImportIntegrationConfigSchema.parse(configuration);
      const importacao = await this.repository.db.importacao.findUnique({
        where: { id: importacaoId },
        select: { status: true },
      });
      result = {
        sucesso: Boolean(importacao),
        latenciaMs: Date.now() - startedAt.getTime(),
        mensagem: importacao
          ? `Importação disponível no estado ${importacao.status}`
          : 'Importação configurada não foi encontrada',
      };
    } else {
      try {
        result = await this.connector(record.tipo).testConnection(
          configuration,
          this.connectorContext(record, requestId),
        );
      } catch (error) {
        result = {
          sucesso: false,
          latenciaMs: Date.now() - startedAt.getTime(),
          mensagem: safeConnectorError(error).summary,
        };
      }
    }
    await this.repository.db.$transaction([
      this.repository.db.integrationLog.create({
        data: {
          integrationId: id,
          requestId,
          evento: 'CONNECTION_TESTED',
          tipoOperacao: 'TEST_CONNECTION',
          status: result.sucesso ? 'SUCESSO' : 'FALHA',
          iniciadaEm: startedAt,
          finalizadaEm: new Date(),
          duracaoMs: result.latenciaMs,
          mensagem: result.mensagem,
        },
      }),
      this.repository.db.auditLog.create({
        data: {
          action: 'INTEGRATION_CONNECTION_TESTED',
          actorId: actor.user.id,
          entity: 'Integration',
          entityId: id,
          metadata: { success: result.sucesso },
          ipAddress: request.ipAddress ?? null,
          userAgent: request.userAgent?.slice(0, 2_048) ?? null,
        },
      }),
    ]);
    const capabilities =
      record.tipo === 'REST_API'
        ? restIntegrationConfigSchema.parse(configuration).capabilities
        : record.tipo === 'FIXTURE'
          ? fixtureIntegrationConfigSchema.parse(configuration).scenario ===
            'INCREMENTAL'
            ? ['STATUS', 'INCREMENTAL_SYNC']
            : ['STATUS']
          : ['STATUS'];
    return {
      ...result,
      capabilities,
    };
  }

  async preview(
    actor: AuthContext,
    id: string,
    input: ExecuteIntegrationRequest,
    requestId: string,
    _request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.read');
    const integration = await this.record(id);
    if (integration.status !== 'ATIVA')
      throw fail('INTEGRATION_NOT_ACTIVE', 'Integração não está ativa', 409);
    const configuration = parseConfiguration(
      integration.tipo,
      integration.configuracaoNaoSensivel ?? {},
    );
    if (integration.tipo === 'MANUAL_IMPORT')
      throw fail(
        'VALIDATION_ERROR',
        'Preview não disponível para MANUAL_IMPORT',
        400,
      );

    let result;
    try {
      result = await this.connector(integration.tipo).fetchRecords(
        configuration,
        this.connectorContext(integration, requestId),
      );
    } catch (error) {
      const safe = safeConnectorError(error);
      throw fail(safe.code as ApiErrorCode, safe.summary, 400);
    }

    const mappingVersion = 'MAP_V1';
    const normalizerVersion = 'NORM_V1';
    const items = result.records.slice(0, 200).map((record) => {
      let decisao: 'CREATE' | 'UPDATE' | 'IGNORE' | 'REJECT' = 'CREATE';
      let motivo: string | null = null;
      if (record.data._invalid === true) {
        decisao = 'REJECT';
        motivo = 'Registro inválido no fixture';
      } else if (record.data._conflict === true) {
        decisao = 'REJECT';
        motivo = 'Conflito de identidade externa';
      } else if (record.data._cursor) {
        decisao = 'IGNORE';
        motivo = 'Cursor incremental já processado';
      }
      return {
        externalId: record.externalId,
        entityType: record.entityType,
        decisao,
        motivo,
      };
    });

    const novo = items.filter((i) => i.decisao === 'CREATE').length;
    const atualizaveis = 0;
    const ignorados = items.filter((i) => i.decisao === 'IGNORE').length;
    const rejeitados = items.filter((i) => i.decisao === 'REJECT').length;
    const issues = rejeitados;

    return syncPreviewSchema.parse({
      integrationId: id,
      destination:
        integration.tipo === 'FIXTURE'
          ? this.mapScenarioToDestination(
              fixtureIntegrationConfigSchema.parse(configuration).scenario,
            )
          : null,
      recebidos: result.received,
      validos: result.valid,
      novos: novo,
      atualizaveis,
      ignorados,
      rejeitados,
      issues,
      mappingVersion,
      normalizerVersion,
      items,
    });
  }

  private mapScenarioToDestination(
    scenario: FixtureIntegrationScenario,
  ): string | null {
    const map: Record<FixtureIntegrationScenario, string | null> = {
      COMMERCIAL_TABLE_OK: 'COMMERCIAL_TABLE',
      GROUP_OK: 'GROUP_PORTFOLIO',
      QUOTA_OK: 'QUOTA_PORTFOLIO',
      ASSEMBLY_OK: 'ASSEMBLY_HISTORY',
      PARTIAL_ERROR: 'GROUP_PORTFOLIO',
      CONFLICT: 'GROUP_PORTFOLIO',
      EMPTY: null,
      FAILURE: null,
      INCREMENTAL: 'GROUP_PORTFOLIO',
    };
    return map[scenario] ?? null;
  }

  async execute(
    actor: AuthContext,
    id: string,
    input: ExecuteIntegrationRequest,
    requestId: string,
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.execute');
    const integration = await this.record(id);
    if (integration.status !== 'ATIVA')
      throw fail('INTEGRATION_NOT_ACTIVE', 'Integração não está ativa', 409);
    if (input.idempotencyKey) {
      const previous = await this.repository.findRunByIdempotency(
        id,
        input.idempotencyKey,
      );
      if (previous) return runDto(previous);
    }
    const configuration = parseConfiguration(
      integration.tipo,
      integration.configuracaoNaoSensivel ?? {},
    );
    const importacaoId =
      integration.tipo === 'MANUAL_IMPORT'
        ? manualImportIntegrationConfigSchema.parse(configuration).importacaoId
        : undefined;
    let run: IntegrationRunRecord;
    try {
      run = await this.repository.createRun({
        integrationId: id,
        trigger: input.trigger,
        requestId,
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
        ...(importacaoId ? { importacaoId } : {}),
      });
    } catch (error) {
      if (
        input.idempotencyKey &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.repository.findRunByIdempotency(
          id,
          input.idempotencyKey,
        );
        if (concurrent) return runDto(concurrent);
      }
      throw error;
    }
    await this.repository.startRun(run.id);
    await this.repository.db.integration.update({
      where: { id },
      data: { ultimaTentativaEm: new Date() },
    });
    const startedAt = Date.now();
    try {
      let counts;
      if (integration.tipo === 'MANUAL_IMPORT') {
        if (!this.importacoesService)
          throw new ConnectorError(
            'IMPORT_PIPELINE_UNAVAILABLE',
            'Pipeline de importação indisponível',
          );
        const result = await this.importacoesService.execute(
          actor,
          importacaoId!,
          request,
        );
        counts = {
          received: result.totalRegistros,
          valid: result.totalRegistros - result.registrosInvalidos,
          invalid: result.registrosInvalidos,
          created: result.registrosCriados,
          updated: result.registrosAtualizados,
          ignored: result.registrosIgnorados,
        };
      } else {
        const result = await this.connector(integration.tipo).fetchRecords(
          configuration,
          this.connectorContext(integration, requestId),
        );
        const ordered = [...result.records].sort(
          (left, right) =>
            (entityOrder.get(left.entityType) ?? 99) -
            (entityOrder.get(right.entityType) ?? 99),
        );

        const stagedRecords = [];

        for (const record of ordered) {
          const payload = {
            data: record.data,
            ...(record.sourceMetadata
              ? { sourceMetadata: record.sourceMetadata }
              : {}),
          };

          const checksum = deterministicChecksum({
            entityType: record.entityType,
            externalId: record.externalId,
            data: record.data,
          });

          const stage = await this.pipelineRepository.stage({
            runId: run.id,
            integrationId: id,
            externalId: record.externalId,
            entityType: record.entityType,
            checksum,
            payload: payload as Prisma.InputJsonValue,
            schemaVersion: 'CANONICAL_V1',
          });

          stagedRecords.push({
            record,
            stage,
            checksum,
          });
        }

        let created = 0;
        let updated = 0;
        let ignored = 0;
        let rejected = 0;

        for (let index = 0; index < stagedRecords.length; index += 1) {
          const { record, stage, checksum } = stagedRecords[index]!;

          if (record.data._invalid === true) {
            await this.pipelineRepository.markStageRejected(
              stage.id,
              'CANONICAL_RECORD_INVALID',
            );
            rejected += 1;
            continue;
          }

          try {
            const preparedResult = await prepareIntegrationDomainRecord({
              db: this.repository.db,
              entityType: record.entityType,
              values: domainValuesFromCanonical(record.data),
              row: index + 1,
              auditContext: {
                actorId: actor.user.id,
                sourceMetadata: {
                  integrationId: id,
                  runId: run.id,
                  connectorType: integration.tipo,
                  entityType: record.entityType,
                  externalId: record.externalId,
                },
                meta: request,
              },
            });

            const prepared = preparedResult.prepared;

            if (prepared.action === 'ERROR') {
              await this.pipelineRepository.markStageRejected(
                stage.id,
                prepared.issues[0]?.code ?? 'DOMAIN_VALIDATION_ERROR',
              );
              rejected += 1;
              continue;
            }

            if (prepared.action === 'IGNORE') {
              await this.repository.db.$transaction(async (tx) => {
                if (prepared.existingId) {
                  await this.pipelineRepository.upsertMapping(
                    {
                      integrationId: id,
                      entityType: record.entityType,
                      externalId: record.externalId,
                      internalId: prepared.existingId,
                      checksum,
                    },
                    tx,
                  );
                }

                await this.pipelineRepository.markStageApplied(stage.id, tx);
              });

              ignored += 1;
              continue;
            }

            await this.repository.db.$transaction(async (tx) => {
              const persisted =
                await persistPreparedIntegrationDomainRecord({
                  tx,
                  tipo: preparedResult.tipo,
                  prepared,
                  auditContext: {
                    actorId: actor.user.id,
                    sourceMetadata: {
                      integrationId: id,
                      runId: run.id,
                      connectorType: integration.tipo,
                      entityType: record.entityType,
                      externalId: record.externalId,
                    },
                    meta: request,
                  },
                });

              await this.pipelineRepository.upsertMapping(
                {
                  integrationId: id,
                  entityType: record.entityType,
                  externalId: record.externalId,
                  internalId: persisted.internalId,
                  checksum,
                },
                tx,
              );

              await this.pipelineRepository.markStageApplied(stage.id, tx);
            });

            if (prepared.action === 'CREATE') {
              created += 1;
            }

            if (prepared.action === 'UPDATE') {
              updated += 1;
            }
          } catch (error) {
            const safe = safeConnectorError(error);

            await this.pipelineRepository.markStageRejected(
              stage.id,
              safe.code || 'DOMAIN_PERSISTENCE_ERROR',
            );

            rejected += 1;
          }
        }

        const effectiveInvalid = Math.max(result.invalid, rejected);

        counts = {
          received: result.received,
          valid: Math.max(0, result.received - effectiveInvalid),
          invalid: effectiveInvalid,
          created,
          updated,
          ignored,
        };
        if (result.invalid > 0)
          await this.repository.db.dataQualityIssue.create({
            data: {
              entidade: 'INTEGRATION_RUN',
              registroId: run.id,
              codigo: 'INVALID_CANONICAL_RECORD',
              severidade: 'ERROR',
              origem: 'INTEGRACAO_FUTURA',
              mensagem:
                'Registros inválidos foram isolados no staging da integração',
              administradoraId: integration.administradoraId,
              dedupKey: `integration-run:${run.id}:invalid-canonical`,
              metadata: { integrationId: id, invalidCount: result.invalid },
            },
          });
      }
      const status = counts.invalid > 0 ? 'SUCESSO_PARCIAL' : 'SUCESSO';
      const metrics = getBusinessMetrics();
      metrics.recordIntegrationRun(
        status === 'SUCESSO' ? 'success' : 'partial',
        integration.tipo,
        Date.now() - startedAt,
      );
      metrics.recordIntegrationRecords('received', counts.received);
      metrics.recordIntegrationRecords('created', counts.created);
      metrics.recordIntegrationRecords('updated', counts.updated);
      metrics.recordIntegrationRecords('rejected', counts.invalid);
      const finished = await this.repository.finishRun(run.id, {
        status,
        registrosRecebidos: counts.received,
        registrosValidos: counts.valid,
        registrosInvalidos: counts.invalid,
        registrosCriados: counts.created,
        registrosAtualizados: counts.updated,
        registrosIgnorados: counts.ignored,
        registrosRejeitados: counts.invalid,
        issuesCriadas: counts.invalid,
      });
      await this.repository.db.$transaction([
        this.repository.db.integration.update({
          where: { id },
          data: { ultimoSucessoEm: new Date(), status: 'ATIVA' },
        }),
        this.repository.db.integrationLog.create({
          data: {
            integrationId: id,
            runId: run.id,
            requestId,
            evento: 'RUN_COMPLETED',
            tipoOperacao: 'EXECUTE',
            status,
            iniciadaEm: new Date(startedAt),
            finalizadaEm: new Date(),
            duracaoMs: Date.now() - startedAt,
            quantidade: counts.received,
            registrosProcessados: counts.valid,
            mensagem: 'Execução concluída pelo pipeline de integração',
          },
        }),
        this.repository.db.auditLog.create({
          data: {
            action: 'INTEGRATION_EXECUTED',
            actorId: actor.user.id,
            entity: 'IntegrationRun',
            entityId: run.id,
            metadata: { integrationId: id, status, received: counts.received },
            ipAddress: request.ipAddress ?? null,
            userAgent: request.userAgent?.slice(0, 2_048) ?? null,
          },
        }),
      ]);
      return runDto(finished);
    } catch (error) {
      const safe = safeConnectorError(error);
      getBusinessMetrics().recordIntegrationRun(
        'failed',
        integration.tipo,
        Date.now() - startedAt,
      );
      const finished = await this.repository.finishRun(run.id, {
        status: 'FALHA',
        registrosRecebidos: 0,
        registrosValidos: 0,
        registrosInvalidos: 0,
        registrosCriados: 0,
        registrosAtualizados: 0,
        registrosIgnorados: 0,
        erroCodigo: safe.code,
        erroResumo: safe.summary,
      });
      await this.repository.db.$transaction([
        this.repository.db.integration.update({
          where: { id },
          data: { status: 'ERRO' },
        }),
        this.repository.db.integrationLog.create({
          data: {
            integrationId: id,
            runId: run.id,
            requestId,
            evento: 'RUN_FAILED',
            tipoOperacao: 'EXECUTE',
            status: 'FALHA',
            iniciadaEm: new Date(startedAt),
            finalizadaEm: new Date(),
            duracaoMs: Date.now() - startedAt,
            erroCodigo: safe.code,
            mensagem: safe.summary,
          },
        }),
        this.repository.db.auditLog.create({
          data: {
            action: 'INTEGRATION_EXECUTION_FAILED',
            actorId: actor.user.id,
            entity: 'IntegrationRun',
            entityId: run.id,
            metadata: { integrationId: id, errorCode: safe.code },
            ipAddress: request.ipAddress ?? null,
            userAgent: request.userAgent?.slice(0, 2_048) ?? null,
          },
        }),
      ]);
      return runDto(finished);
    }
  }

  async listRuns(
    actor: AuthContext,
    integrationId: string,
    query: IntegrationRunListQuery,
  ) {
    this.allow(actor, 'integrations.logs');
    await this.record(integrationId);
    const { items, total } = await this.repository.listRuns(
      integrationId,
      query,
    );
    return {
      items: items.map(runDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async getRun(actor: AuthContext, id: string) {
    this.allow(actor, 'integrations.logs');
    const run = await this.repository.getRun(id);
    if (!run)
      throw fail('INTEGRATION_RUN_NOT_FOUND', 'Execução não encontrada', 404);
    return runDto(run);
  }

  async listLogs(
    actor: AuthContext,
    integrationId: string,
    query: IntegrationRunListQuery,
  ) {
    this.allow(actor, 'integrations.logs');
    await this.record(integrationId);
    const where = { integrationId };
    const [items, total] = await Promise.all([
      this.repository.db.integrationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.repository.db.integrationLog.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        integrationId: item.integrationId,
        runId: item.runId,
        requestId: item.requestId,
        evento: item.evento,
        status: item.status,
        iniciadaEm: item.iniciadaEm.toISOString(),
        finalizadaEm: item.finalizadaEm?.toISOString() ?? null,
        duracaoMs: item.duracaoMs,
        quantidade: item.quantidade,
        erroCodigo: item.erroCodigo,
        mensagem: item.mensagem,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async setCredentials(
    actor: AuthContext,
    id: string,
    input: { keyName: string; value: string },
    request: RequestMetadata,
  ) {
    this.allow(actor, 'integrations.credentials');
    await this.record(id);
    const parsed = integrationSecretWriteSchema.parse(input);
    const encrypted = this.secretService.encrypt(parsed.value);
    const [secret] = await this.repository.db.$transaction([
      this.repository.db.integrationSecret.upsert({
        where: {
          integrationId_keyName: {
            integrationId: id,
            keyName: parsed.keyName,
          },
        },
        create: {
          id: randomUUID(),
          integrationId: id,
          keyName: parsed.keyName,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
        update: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
          rotatedAt: new Date(),
        },
        select: { id: true, keyName: true, keyVersion: true, updatedAt: true },
      }),
      this.audit(
        'INTEGRATION_CREDENTIALS_CHANGED',
        actor,
        id,
        { keyName: parsed.keyName, keyVersion: encrypted.keyVersion },
        request,
      ),
    ]);
    return { configured: true, ...secret };
  }

  async getCredentials(
    actor: AuthContext,
    id: string,
  ): Promise<{
    configured: boolean;
    keyName: string;
    keyVersion: string;
    updatedAt: string;
  }> {
    this.allow(actor, 'integrations.credentials');
    await this.record(id);
    const secret = await this.repository.db.integrationSecret.findFirst({
      where: { integrationId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!secret)
      return {
        configured: false,
        keyName: '',
        keyVersion: '',
        updatedAt: new Date().toISOString(),
      };
    return {
      configured: true,
      keyName: secret.keyName,
      keyVersion: secret.keyVersion,
      updatedAt: secret.updatedAt.toISOString(),
    };
  }

  async webhook(
    integrationId: string,
    input: {
      eventId: string;
      eventType: string;
      occurredAt?: string;
      records?: unknown[];
      signature?: string;
    },
  ) {
    const integration = await this.record(integrationId);
    if (integration.status !== 'ATIVA')
      throw fail('INTEGRATION_NOT_ACTIVE', 'Integração não está ativa', 409);

    const checksum = randomUUID();
    const duplicate =
      await this.repository.db.integrationWebhookEvent.findUnique({
        where: {
          integrationId_eventId: {
            integrationId,
            eventId: input.eventId,
          },
        },
        select: { id: true },
      });

    if (duplicate) {
      await this.repository.db.integrationWebhookEvent.update({
        where: { id: duplicate.id },
        data: { status: 'DUPLICATE' },
      });
      return { received: true, eventId: input.eventId, duplicate: true };
    }

    await this.repository.db.integrationWebhookEvent.create({
      data: {
        id: randomUUID(),
        integrationId,
        eventId: input.eventId,
        checksum,
        payload: input as Prisma.InputJsonValue,
        status: 'RECEIVED',
      },
    });

    return { received: true, eventId: input.eventId, duplicate: false };
  }

  async health(actor: AuthContext) {
    this.allow(actor, 'integrations.read');
    const integrations = await this.repository.db.integration.findMany({
      where: { status: { in: ['ATIVA', 'ERRO', 'PAUSADA'] } },
      select: {
        id: true,
        nome: true,
        tipo: true,
        status: true,
        ultimoSucessoEm: true,
        ultimaTentativaEm: true,
      },
    });
    const now = Date.now();
    const items = integrations.map((r) => {
      const lastSuccess = r.ultimoSucessoEm
        ? now - r.ultimoSucessoEm.getTime()
        : Infinity;
      let saude: 'HEALTHY' | 'DEGRADED' | 'FAILING' = 'HEALTHY';
      if (lastSuccess > 86_400_000) saude = 'DEGRADED';
      if (r.status === 'ERRO' || lastSuccess > 172_800_000) saude = 'FAILING';
      return {
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        status: r.status,
        saude,
        ultimoSucessoEm: r.ultimoSucessoEm?.toISOString() ?? null,
      };
    });
    return {
      healthy: items.filter((i) => i.saude === 'HEALTHY').length,
      degraded: items.filter((i) => i.saude === 'DEGRADED').length,
      failing: items.filter((i) => i.saude === 'FAILING').length,
      items,
    };
  }
}
