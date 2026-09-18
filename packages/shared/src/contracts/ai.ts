import { z } from 'zod';

export const aiProviders = ['mock', 'external'] as const;
export const aiProviderSchema = z.enum(aiProviders);
export type AiProviderName = z.infer<typeof aiProviderSchema>;

export const aiContextTypes = [
  'GENERAL',
  'LEAD',
  'SIMULATION',
  'COMPARATOR',
  'PROPOSAL',
  'SALE',
  'DASHBOARD',
  'COMMERCIAL_MANAGEMENT',
  'KNOWLEDGE',
] as const;
export const aiContextTypeSchema = z.enum(aiContextTypes);
export type AiContextType = z.infer<typeof aiContextTypeSchema>;

export const aiPromptIds = [
  'commercial-copilot',
  'lead-analysis',
  'simulation-explanation',
  'comparison-analysis',
  'follow-up-draft',
  'manager-summary',
  'customer-360',
  'my-day',
  'sale-summary',
  'knowledge-grounded-answer',
  'integration-analysis',
] as const;
export const aiPromptIdSchema = z.enum(aiPromptIds);
export type AiPromptId = z.infer<typeof aiPromptIdSchema>;

export const aiPromptDefinitionSchema = z.object({
  id: aiPromptIdSchema,
  outputSchema: z.string().min(1),
  purpose: z.string().min(1),
  requiredContext: z.array(aiContextTypeSchema),
  version: z.string().min(1),
});
export type AiPromptDefinition = z.infer<typeof aiPromptDefinitionSchema>;

export const aiSourceSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  documentId: z.uuid().nullable().optional(),
  chunkId: z.uuid().nullable().optional(),
  section: z.string().max(300).nullable().optional(),
  page: z.number().int().min(1).nullable().optional(),
  href: z.string().max(2048).nullable().optional(),
});
export type AiSource = z.infer<typeof aiSourceSchema>;

export const aiActionDraftSchema = z.object({
  dueAt: z.iso.datetime().nullable().optional(),
  followUpId: z.uuid().nullable().optional(),
  leadId: z.uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  type: z.enum(['CREATE_FOLLOWUP', 'RESCHEDULE_FOLLOWUP', 'CREATE_INTERACTION']),
});
export type AiActionDraft = z.infer<typeof aiActionDraftSchema>;

export const aiStructuredResponseSchema = z.object({
  attentionPoints: z.array(z.string()),
  draft: z.string().nullable(),
  facts: z.array(z.string()),
  grounded: z.boolean().optional(),
  missingInformation: z.array(z.string()),
  sources: z.array(aiSourceSchema),
  suggestedAction: aiActionDraftSchema.nullable().optional(),
  suggestedActions: z.array(z.string()),
  summary: z.string().min(1),
  usage: z
    .object({
      costMicros: z.number().int().min(0).nullable().optional(),
      currency: z.string().min(1).max(8).nullable().optional(),
      estimated: z.boolean().optional(),
      inputTokens: z.number().int().min(0).nullable().optional(),
      latencyMs: z.number().int().min(0).nullable().optional(),
      outputTokens: z.number().int().min(0).nullable().optional(),
      totalTokens: z.number().int().min(0).nullable().optional(),
    })
    .optional(),
  warnings: z.array(z.string().max(300)).max(10).optional(),
});
export type AiStructuredResponse = z.infer<typeof aiStructuredResponseSchema>;

export const aiChatRequestSchema = z.object({
  contextId: z.string().trim().min(1).max(200).optional(),
  contextType: aiContextTypeSchema.default('GENERAL'),
  message: z.string().trim().min(1).max(4000),
  promptId: aiPromptIdSchema.default('commercial-copilot'),
  resultIds: z.array(z.uuid()).max(5).optional(),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

export const aiChatResponseSchema = z.object({
  provider: aiProviderSchema,
  response: aiStructuredResponseSchema,
});
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;

export const aiPublicConfigSchema = z.object({
  dailyCostLimitMicros: z.number().int().min(0).nullable().optional(),
  dailyTokenLimit: z.number().int().min(0).nullable().optional(),
  embeddingModel: z.string().min(1).nullable().optional(),
  embeddingProvider: z.enum(['none', 'external']).optional(),
  enabled: z.boolean(),
  enabledResources: z.array(z.string()),
  fallbackProvider: z.enum(['none', 'external']).optional(),
  maxOutputTokens: z.number().int(),
  maxTokensPerRequest: z.number().int().min(0).nullable().optional(),
  model: z.string().min(1),
  monthlyCostLimitMicros: z.number().int().min(0).nullable().optional(),
  provider: aiProviderSchema,
  providerConfigured: z.boolean(),
  retrievalMode: z.enum(['lexical', 'hybrid']).optional(),
  rrfK: z.number().int().min(1).optional(),
  streamingEnabled: z.boolean().optional(),
  timeoutMs: z.number().int(),
  topK: z.number().int().min(1).optional(),
  vectorSearchAvailable: z.boolean().optional(),
});
export type AiPublicConfig = z.infer<typeof aiPublicConfigSchema>;

export const aiStatusResponseSchema = z.object({
  config: aiPublicConfigSchema,
  message: z.string().min(1),
  ready: z.boolean(),
});
export type AiStatusResponse = z.infer<typeof aiStatusResponseSchema>;

export const updateAiConfigRequestSchema = z.object({
  dailyCostLimitMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  dailyTokenLimit: z.number().int().min(0).max(100_000_000).nullable().optional(),
  embeddingModel: z.string().trim().min(1).max(120).nullable().optional(),
  embeddingProvider: z.enum(['none', 'external']).optional(),
  enabled: z.boolean().optional(),
  enabledResources: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  fallbackProvider: z.enum(['none', 'external']).optional(),
  maxOutputTokens: z.number().int().min(128).max(8000).optional(),
  maxTokensPerRequest: z.number().int().min(1000).max(500_000).nullable().optional(),
  model: z.string().trim().min(1).max(120).optional(),
  monthlyCostLimitMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  provider: aiProviderSchema.optional(),
  retrievalMode: z.enum(['lexical', 'hybrid']).optional(),
  rrfK: z.number().int().min(1).max(1000).optional(),
  streamingEnabled: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});
export type UpdateAiConfigRequest = z.infer<typeof updateAiConfigRequestSchema>;

export const aiProviderCapabilitiesSchema = z.object({
  embeddings: z.boolean(),
  estimated: z.boolean().optional(),
  streaming: z.boolean(),
  structuredOutput: z.boolean(),
  toolCalling: z.boolean(),
});
export type AiProviderCapabilities = z.infer<typeof aiProviderCapabilitiesSchema>;

export const aiProviderTestSchema = z.object({
  capabilities: aiProviderCapabilitiesSchema.nullable(),
  configured: z.boolean(),
  latencyMs: z.number().int().min(0).nullable(),
  model: z.string().min(1),
  provider: aiProviderSchema,
  reachable: z.boolean(),
});
export type AiProviderTest = z.infer<typeof aiProviderTestSchema>;

export const aiStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), model: z.string().min(1), provider: aiProviderSchema }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('fact'), text: z.string().min(1) }),
  z.object({ type: z.literal('source'), source: aiSourceSchema }),
  z.object({
    type: z.literal('usage'),
    usage: z.object({
      costMicros: z.number().int().min(0).nullable(),
      currency: z.string().min(1).max(8).nullable(),
      estimated: z.boolean(),
      inputTokens: z.number().int().min(0).nullable(),
      outputTokens: z.number().int().min(0).nullable(),
      totalTokens: z.number().int().min(0).nullable(),
    }),
  }),
  z.object({
    type: z.literal('done'),
    grounded: z.boolean().optional(),
    warnings: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('error'), code: z.string().min(1), message: z.string().min(1) }),
]);
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;

export const aiUsageStatusSchema = z.enum(['ok', 'error', 'timeout', 'cancelled', 'limit']);
export type AiUsageStatus = z.infer<typeof aiUsageStatusSchema>;

export const aiUsageSchema = z.object({
  contextType: z.string().min(1),
  costMicros: z.number().int().min(0).nullable(),
  createdAt: z.iso.datetime(),
  currency: z.string().min(1).max(8).nullable(),
  errorCode: z.string().max(80).nullable(),
  estimated: z.boolean(),
  id: z.uuid(),
  inputTokens: z.number().int().min(0).nullable(),
  latencyMs: z.number().int().min(0),
  model: z.string().min(1),
  outputTokens: z.number().int().min(0).nullable(),
  promptId: z.string().min(1).nullable(),
  promptVersion: z.string().min(1).nullable(),
  provider: aiProviderSchema,
  status: aiUsageStatusSchema,
  totalTokens: z.number().int().min(0).nullable(),
  userId: z.string().min(1).nullable(),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

export const aiUsageListQuerySchema = z.object({
  contextType: z.string().trim().max(60).optional(),
  from: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: aiUsageStatusSchema.optional(),
  to: z.iso.datetime().optional(),
});
export type AiUsageListQuery = z.infer<typeof aiUsageListQuerySchema>;

export const aiUsageSummarySchema = z.object({
  costMicros: z.number().int().min(0).nullable(),
  currency: z.string().min(1).max(8).nullable(),
  dailyCostLimitMicros: z.number().int().min(0).nullable(),
  dailyTokenLimit: z.number().int().min(0).nullable(),
  inputTokens: z.number().int().min(0),
  monthlyCostLimitMicros: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0),
  period: z.string().min(1),
  requests: z.number().int().min(0),
  tokensToday: z.number().int().min(0),
  warning: z.string().min(1).nullable(),
});
export type AiUsageSummary = z.infer<typeof aiUsageSummarySchema>;

export const aiPricingSchema = z.object({
  active: z.boolean(),
  cachedPerMillionMicros: z.number().int().min(0).nullable(),
  createdAt: z.iso.datetime(),
  currency: z.string().min(1).max(8),
  id: z.uuid(),
  inputPerMillionMicros: z.number().int().min(0),
  model: z.string().min(1),
  outputPerMillionMicros: z.number().int().min(0),
  provider: aiProviderSchema,
  updatedAt: z.iso.datetime(),
  validFrom: z.iso.datetime(),
});
export type AiPricing = z.infer<typeof aiPricingSchema>;

export const upsertAiPricingRequestSchema = z.object({
  active: z.boolean().default(true),
  cachedPerMillionMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('USD'),
  inputPerMillionMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  model: z.string().trim().min(1).max(120),
  outputPerMillionMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  provider: aiProviderSchema,
  validFrom: z.iso.datetime().optional(),
});
export type UpsertAiPricingRequest = z.infer<typeof upsertAiPricingRequestSchema>;

export const aiCostUnknownMessage = 'Custo não configurado para este modelo.' as const;
