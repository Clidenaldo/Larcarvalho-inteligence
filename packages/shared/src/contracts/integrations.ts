import { z } from 'zod';

export const integrationConnectorTypes = [
  'MOCK',
  'REST_API',
  'SOAP',
  'SFTP',
  'FILE_PULL',
  'WEBHOOK',
  'MANUAL_IMPORT',
  'FIXTURE',
] as const;
export const integrationStatuses = [
  'NAO_CONFIGURADA',
  'ATIVA',
  'PAUSADA',
  'ERRO',
  'DESABILITADA',
] as const;
export const integrationRunStatuses = [
  'PENDENTE',
  'EXECUTANDO',
  'SUCESSO',
  'SUCESSO_PARCIAL',
  'FALHA',
  'CANCELADA',
] as const;
export const integrationTriggers = [
  'MANUAL',
  'SCHEDULED',
  'WEBHOOK',
  'RETRY',
  'SYSTEM',
] as const;
export const integrationEntityTypes = [
  'ADMINISTRADORA',
  'PRODUTO',
  'GRUPO',
  'COTA',
  'ASSEMBLEIA',
  'LANCE',
  'CONTEMPLACAO',
  'TABELA_COMERCIAL',
] as const;

export const integrationConnectorTypeSchema = z.enum(integrationConnectorTypes);
export const integrationStatusSchema = z.enum(integrationStatuses);
export const integrationRunStatusSchema = z.enum(integrationRunStatuses);
export const integrationTriggerSchema = z.enum(integrationTriggers);
export const integrationEntityTypeSchema = z.enum(integrationEntityTypes);

const secretRefSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const mockIntegrationConfigSchema = z
  .object({
    scenario: z.enum(['SUCCESS', 'PARTIAL', 'FAILURE']).default('SUCCESS'),
    recordCount: z.number().int().min(0).max(100).default(3),
  })
  .strict();

export const integrationCapabilities = [
  'PRODUCTS',
  'COMMERCIAL_TABLES',
  'GROUPS',
  'QUOTAS',
  'ASSEMBLIES',
  'BIDS',
  'CONTEMPLATIONS',
  'DOCUMENTS',
  'WEBHOOKS',
  'STATUS',
  'INCREMENTAL_SYNC',
] as const;
export const integrationCapabilitySchema = z.enum(integrationCapabilities);
export type IntegrationCapability = z.infer<typeof integrationCapabilitySchema>;

export const restIntegrationConfigSchema = z
  .object({
    baseUrl: z.url().max(2048),
    authType: z.enum(['NONE', 'BEARER_SECRET_REF']).default('NONE'),
    paginationType: z.literal('NONE').default('NONE'),
    mappingProfile: z.literal('CANONICAL_V1').default('CANONICAL_V1'),
    capabilities: z.array(integrationCapabilitySchema).min(1).max(11).default(['STATUS']),
    timeoutMs: z.number().int().min(250).max(15_000).default(5_000),
    maxResponseBytes: z
      .number()
      .int()
      .min(1_024)
      .max(2_097_152)
      .default(524_288),
    maxRetries: z.number().int().min(0).max(2).default(1),
  })
  .strict();

export const manualImportIntegrationConfigSchema = z
  .object({ importacaoId: z.uuid() })
  .strict();
const emptyConfigSchema = z.object({}).strict();

export const fixtureIntegrationScenarios = [
  'COMMERCIAL_TABLE_OK',
  'GROUP_OK',
  'QUOTA_OK',
  'ASSEMBLY_OK',
  'PARTIAL_ERROR',
  'CONFLICT',
  'EMPTY',
  'FAILURE',
  'INCREMENTAL',
] as const;
export const fixtureIntegrationScenarioSchema = z.enum(fixtureIntegrationScenarios);
export type FixtureIntegrationScenario = z.infer<typeof fixtureIntegrationScenarioSchema>;

export const fixtureIntegrationConfigSchema = z
  .object({
    scenario: fixtureIntegrationScenarioSchema.default('COMMERCIAL_TABLE_OK'),
    recordCount: z.number().int().min(0).max(100).default(3),
    cursor: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const integrationConfigurationSchema = z.union([
  mockIntegrationConfigSchema,
  restIntegrationConfigSchema,
  manualImportIntegrationConfigSchema,
  fixtureIntegrationConfigSchema,
  emptyConfigSchema,
]);

const baseCreate = {
  administradoraId: z.uuid().nullable().optional(),
  fonteDadosId: z.uuid().nullable().optional(),
  nome: z.string().trim().min(2).max(200),
  secretRef: secretRefSchema.nullable().optional(),
  frequencia: z.string().trim().min(2).max(100).nullable().optional(),
  proximaExecucaoEm: z.iso.datetime({ offset: true }).nullable().optional(),
};

export const createIntegrationRequestSchema = z.discriminatedUnion('tipo', [
  z
    .object({
      ...baseCreate,
      tipo: z.literal('MOCK'),
      configuracao: mockIntegrationConfigSchema,
    })
    .strict(),
  z
    .object({
      ...baseCreate,
      tipo: z.literal('REST_API'),
      configuracao: restIntegrationConfigSchema,
    })
    .strict(),
  z
    .object({
      ...baseCreate,
      tipo: z.literal('MANUAL_IMPORT'),
      configuracao: manualImportIntegrationConfigSchema,
    })
    .strict(),
  z
    .object({
      ...baseCreate,
      tipo: z.literal('FIXTURE'),
      configuracao: fixtureIntegrationConfigSchema,
    })
    .strict(),
  ...(['SOAP', 'SFTP', 'FILE_PULL', 'WEBHOOK'] as const).map((tipo) =>
    z
      .object({
        ...baseCreate,
        tipo: z.literal(tipo),
        configuracao: emptyConfigSchema,
      })
      .strict(),
  ),
]);

export const updateIntegrationRequestSchema = z
  .object({
    nome: z.string().trim().min(2).max(200).optional(),
    administradoraId: z.uuid().nullable().optional(),
    fonteDadosId: z.uuid().nullable().optional(),
    secretRef: secretRefSchema.nullable().optional(),
    frequencia: z.string().trim().min(2).max(100).nullable().optional(),
    proximaExecucaoEm: z.iso.datetime({ offset: true }).nullable().optional(),
    configuracao: integrationConfigurationSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos uma alteração',
  );

export const integrationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: integrationStatusSchema.optional(),
  tipo: integrationConnectorTypeSchema.optional(),
  administradoraId: z.uuid().optional(),
});

const relationSummarySchema = z.object({ id: z.uuid(), nome: z.string() });
export const integrationHealthStatuses = [
  'HEALTHY',
  'DEGRADED',
  'FAILING',
  'DISABLED',
  'NOT_CONFIGURED',
] as const;
export const integrationHealthSchema = z.enum(integrationHealthStatuses);
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

export const integrationSchema = z.object({
  id: z.uuid(),
  administradoraId: z.uuid().nullable(),
  fonteDadosId: z.uuid().nullable(),
  nome: z.string(),
  tipo: integrationConnectorTypeSchema,
  status: integrationStatusSchema,
  configuracao: integrationConfigurationSchema,
  configurado: z.boolean(),
  secretRef: secretRefSchema.nullable(),
  secretConfigurado: z.boolean().optional(),
  saude: integrationHealthSchema.optional(),
  frequencia: z.string().nullable(),
  ultimoSucessoEm: z.iso.datetime().nullable(),
  ultimaTentativaEm: z.iso.datetime().nullable(),
  proximaExecucaoEm: z.iso.datetime().nullable(),
  cursor: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  administradora: relationSummarySchema.nullable(),
  fonteDados: relationSummarySchema.nullable(),
});

export const integrationListResponseSchema = z.object({
  items: z.array(integrationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const executeIntegrationRequestSchema = z
  .object({
    trigger: integrationTriggerSchema.default('MANUAL'),
    idempotencyKey: z.string().trim().min(8).max(200).optional(),
  })
  .strict();

export const integrationRunSchema = z.object({
  id: z.uuid(),
  integrationId: z.uuid(),
  importacaoId: z.uuid().nullable(),
  status: integrationRunStatusSchema,
  trigger: integrationTriggerSchema,
  iniciadoEm: z.iso.datetime(),
  finalizadoEm: z.iso.datetime().nullable(),
  registrosRecebidos: z.number().int(),
  registrosValidos: z.number().int(),
  registrosInvalidos: z.number().int(),
  registrosCriados: z.number().int(),
  registrosAtualizados: z.number().int(),
  registrosIgnorados: z.number().int(),
  registrosRejeitados: z.number().int().optional(),
  issuesCriadas: z.number().int().optional(),
  erroCodigo: z.string().nullable(),
  erroResumo: z.string().nullable(),
  requestId: z.string().nullable(),
  cursor: z.string().nullable().optional(),
  mappingVersion: z.string().nullable().optional(),
  normalizerVersion: z.string().nullable().optional(),
  providerSchemaVersion: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});

export const integrationRunListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: integrationRunStatusSchema.optional(),
});
export const integrationRunListResponseSchema = z.object({
  items: z.array(integrationRunSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const integrationLogSchema = z.object({
  id: z.uuid(),
  integrationId: z.uuid(),
  runId: z.uuid().nullable(),
  requestId: z.string().nullable(),
  evento: z.string().nullable(),
  status: z.string(),
  iniciadaEm: z.iso.datetime(),
  finalizadaEm: z.iso.datetime().nullable(),
  duracaoMs: z.number().int().nullable(),
  quantidade: z.number().int().nullable(),
  erroCodigo: z.string().nullable(),
  mensagem: z.string().nullable(),
});
export const integrationLogListResponseSchema = z.object({
  items: z.array(integrationLogSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const connectionTestResponseSchema = z.object({
  sucesso: z.boolean(),
  latenciaMs: z.number().int().nonnegative(),
  mensagem: z.string(),
  capabilities: z.array(integrationCapabilitySchema).optional(),
});

export const canonicalIntegrationRecordSchema = z.object({
  entityType: integrationEntityTypeSchema,
  externalId: z.string().trim().min(1).max(255),
  data: z.record(z.string(), z.unknown()),
  sourceMetadata: z.record(z.string(), z.unknown()).optional(),
});
export const canonicalIntegrationPayloadSchema = z.object({
  records: z.array(canonicalIntegrationRecordSchema).max(10_000),
});

export type IntegrationConnectorType = z.infer<
  typeof integrationConnectorTypeSchema
>;
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type IntegrationRunStatus = z.infer<typeof integrationRunStatusSchema>;
export type IntegrationTrigger = z.infer<typeof integrationTriggerSchema>;
export type IntegrationEntityType = z.infer<typeof integrationEntityTypeSchema>;
export type IntegrationConfiguration = z.infer<
  typeof integrationConfigurationSchema
>;
export type CreateIntegrationRequest = z.infer<
  typeof createIntegrationRequestSchema
>;
export type UpdateIntegrationRequest = z.infer<
  typeof updateIntegrationRequestSchema
>;
export type IntegrationListQuery = z.infer<typeof integrationListQuerySchema>;
export type IntegrationRunListQuery = z.infer<
  typeof integrationRunListQuerySchema
>;
export type ExecuteIntegrationRequest = z.infer<
  typeof executeIntegrationRequestSchema
>;
export type CanonicalIntegrationRecord = z.infer<
  typeof canonicalIntegrationRecordSchema
>;
export type Integration = z.infer<typeof integrationSchema>;
export type IntegrationRun = z.infer<typeof integrationRunSchema>;
export type IntegrationLog = z.infer<typeof integrationLogSchema>;

// ---------------------------------------------------------------------------
// Fase 30 — Hub de integrações: segredos, preview, webhooks, normalização
// ---------------------------------------------------------------------------

export const integrationSecretWriteSchema = z
  .object({
    keyName: z.string().trim().min(2).max(80).default('default'),
    value: z.string().min(8).max(4_096),
  })
  .strict();
export type IntegrationSecretWrite = z.infer<typeof integrationSecretWriteSchema>;

export const syncDestinations = [
  'COMMERCIAL_TABLE',
  'GROUP_PORTFOLIO',
  'QUOTA_PORTFOLIO',
  'ASSEMBLY_HISTORY',
] as const;
export const syncDestinationSchema = z.enum(syncDestinations);
export type SyncDestination = z.infer<typeof syncDestinationSchema>;

export const NORMALIZER_VERSION = 'NORM_V1' as const;
export const MAPPING_VERSION = 'MAP_V1' as const;

const normalizedBase = {
  externalUpdatedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  inativo: z.boolean().optional(),
};

export const normalizedAdministradoraSchema = z
  .object({
    ...normalizedBase,
    cnpj: z.string().trim().min(14).max(14).nullable().optional(),
    nome: z.string().trim().min(2).max(200).optional(),
  })
  .strict();

export const normalizedProductSchema = z
  .object({
    ...normalizedBase,
    nome: z.string().trim().min(2).max(200),
    categoria: z.string().trim().min(2).max(80),
    descricao: z.string().trim().max(2_000).nullable().optional(),
    codigoExterno: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

export const normalizedGroupSchema = z
  .object({
    ...normalizedBase,
    codigo: z.string().trim().min(1).max(60),
    prazoMeses: z.number().int().min(1).max(600).nullable().optional(),
  })
  .strict();

export const normalizedQuotaSchema = z
  .object({
    ...normalizedBase,
    numero: z.string().trim().min(1).max(60),
    grupoCodigo: z.string().trim().min(1).max(60),
  })
  .strict();

export const normalizedAssemblySchema = z
  .object({
    ...normalizedBase,
    numero: z.string().trim().min(1).max(60),
    grupoCodigo: z.string().trim().min(1).max(60),
    dataAssembleia: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const normalizedBidSchema = z
  .object({
    ...normalizedBase,
    assembleiaNumero: z.string().trim().min(1).max(60),
    grupoCodigo: z.string().trim().min(1).max(60),
    tipo: z.string().trim().min(1).max(80),
    percentual: z.string().trim().min(1).max(40).nullable().optional(),
    valor: z.string().trim().min(1).max(40).nullable().optional(),
    cotaNumero: z.string().trim().min(1).max(60).nullable().optional(),
    contemplado: z.boolean().nullable().optional(),
  })
  .strict();

export const normalizedContemplationSchema = z
  .object({
    ...normalizedBase,
    assembleiaNumero: z.string().trim().min(1).max(60),
    grupoCodigo: z.string().trim().min(1).max(60),
    codigoExterno: z.string().trim().min(1).max(100).nullable().optional(),
    cotaNumero: z.string().trim().min(1).max(60).nullable().optional(),
  })
  .strict();

export const normalizedCommercialTableItemSchema = z
  .object({
    creditoReferencia: z.string().trim().min(1).max(40),
    prazoMeses: z.number().int().min(1).max(600),
    modalidade: z.string().trim().min(1).max(40),
    codigoPlano: z.string().trim().min(1).max(60).nullable().optional(),
    parcelaPadrao: z.string().trim().min(1).max(40).nullable().optional(),
    taxaAdministracaoPercentual: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .strict();

export const normalizedCommercialTableSchema = z
  .object({
    ...normalizedBase,
    codigo: z.string().trim().min(1).max(60),
    nome: z.string().trim().min(2).max(200).optional(),
    categoria: z.string().trim().min(2).max(80),
    inicioVigencia: z.iso.date(),
    itens: z.array(normalizedCommercialTableItemSchema).max(500).optional(),
  })
  .strict();

export const syncPreviewItemSchema = z.object({
  externalId: z.string(),
  entityType: integrationEntityTypeSchema,
  decisao: z.enum(['CREATE', 'UPDATE', 'IGNORE', 'REJECT']),
  motivo: z.string().nullable(),
});
export type SyncPreviewItem = z.infer<typeof syncPreviewItemSchema>;

export const syncPreviewSchema = z.object({
  integrationId: z.uuid(),
  destination: syncDestinationSchema.nullable(),
  recebidos: z.number().int(),
  validos: z.number().int(),
  novos: z.number().int(),
  atualizaveis: z.number().int(),
  ignorados: z.number().int(),
  rejeitados: z.number().int(),
  issues: z.number().int(),
  mappingVersion: z.string(),
  normalizerVersion: z.string(),
  items: z.array(syncPreviewItemSchema).max(200),
});
export type SyncPreview = z.infer<typeof syncPreviewSchema>;

export const webhookEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  eventType: z.string().trim().min(1).max(120),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  records: z.array(canonicalIntegrationRecordSchema).max(1_000).optional(),
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookAckSchema = z.object({
  received: z.boolean(),
  eventId: z.string(),
  duplicate: z.boolean(),
});
export type WebhookAck = z.infer<typeof webhookAckSchema>;

export const integrationStagingStatusSchema = z.enum(['PENDING', 'APPLIED', 'REJECTED']);
export type IntegrationStagingStatus = z.infer<typeof integrationStagingStatusSchema>;
