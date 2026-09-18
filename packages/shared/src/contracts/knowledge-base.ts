import { z } from 'zod';

export const knowledgeCategories = [
  'MANUAL',
  'REGULAMENTO',
  'TABELA',
  'PROCEDIMENTO',
  'PRODUTO',
  'COMERCIAL',
  'INSTITUCIONAL',
  'OUTRO',
] as const;
export const knowledgeCategorySchema = z.enum(knowledgeCategories);
export type KnowledgeCategory = z.infer<typeof knowledgeCategorySchema>;

export const knowledgeVisibilities = ['PUBLIC', 'TEAM', 'PRIVATE'] as const;
export const knowledgeVisibilitySchema = z.enum(knowledgeVisibilities);
export type KnowledgeVisibility = z.infer<typeof knowledgeVisibilitySchema>;

export const knowledgeDocumentStatuses = [
  'PROCESSING',
  'READY',
  'FAILED',
  'ARCHIVED',
] as const;
export const knowledgeDocumentStatusSchema = z.enum(
  knowledgeDocumentStatuses,
);
export type KnowledgeDocumentStatus = z.infer<
  typeof knowledgeDocumentStatusSchema
>;

export const knowledgeSourceTypes = ['MANUAL', 'UPLOAD'] as const;
export const knowledgeSourceTypeSchema = z.enum(knowledgeSourceTypes);
export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>;

export const knowledgeIngestionStatuses = [
  'PENDING',
  'EXTRACTING',
  'CHUNKING',
  'READY',
  'FAILED',
] as const;
export const knowledgeIngestionStatusSchema = z.enum(
  knowledgeIngestionStatuses,
);
export type KnowledgeIngestionStatus = z.infer<
  typeof knowledgeIngestionStatusSchema
>;

export const knowledgeSearchModes = ['LEXICAL', 'HYBRID'] as const;
export const knowledgeSearchModeSchema = z.enum(knowledgeSearchModes);
export type KnowledgeSearchMode = z.infer<typeof knowledgeSearchModeSchema>;

export const knowledgeRequestModes = ['lexical', 'semantic', 'hybrid'] as const;
export const knowledgeRequestModeSchema = z.enum(knowledgeRequestModes);
export type KnowledgeRequestMode = z.infer<typeof knowledgeRequestModeSchema>;

export const knowledgeEmbeddingStatuses = ['NONE', 'PENDING', 'READY', 'FAILED'] as const;
export const knowledgeEmbeddingStatusSchema = z.enum(knowledgeEmbeddingStatuses);
export type KnowledgeEmbeddingStatus = z.infer<typeof knowledgeEmbeddingStatusSchema>;

const tagSchema = z.string().trim().min(1).max(60);

export const knowledgeDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullable(),
  category: knowledgeCategorySchema,
  visibility: knowledgeVisibilitySchema,
  status: knowledgeDocumentStatusSchema,
  sourceType: knowledgeSourceTypeSchema,
  originalName: z.string().max(300).nullable(),
  mimeType: z.string().max(200).nullable(),
  sizeBytes: z.number().int().min(0),
  checksum: z.string().max(128).nullable(),
  ownerUserId: z.uuid().nullable(),
  ownerName: z.string().max(200).nullable(),
  teamId: z.uuid().nullable(),
  teamName: z.string().max(120).nullable(),
  version: z.number().int().min(1),
  documentGroupId: z.uuid(),
  tags: z.array(z.string()),
  chunkCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
  failureReason: z.string().max(500).nullable(),
  embeddingStatus: knowledgeEmbeddingStatusSchema.optional(),
  embeddingModel: z.string().max(120).nullable().optional(),
  embeddedAt: z.iso.datetime().nullable().optional(),
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const knowledgeChunkSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  ordinal: z.number().int().min(0),
  content: z.string(),
  section: z.string().max(300).nullable(),
  page: z.number().int().min(1).nullable(),
  tokens: z.number().int().min(0),
  createdAt: z.iso.datetime(),
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const knowledgeDocumentDetailSchema = knowledgeDocumentSchema.extend({
  chunks: z.array(knowledgeChunkSchema),
});
export type KnowledgeDocumentDetail = z.infer<
  typeof knowledgeDocumentDetailSchema
>;

export const knowledgeDocumentListQuerySchema = z.object({
  busca: z.string().trim().max(200).optional(),
  categoria: knowledgeCategorySchema.optional(),
  status: knowledgeDocumentStatusSchema.optional(),
  visibilidade: knowledgeVisibilitySchema.optional(),
  tag: z.string().trim().max(60).optional(),
  incluirArquivados: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type KnowledgeDocumentListQuery = z.infer<
  typeof knowledgeDocumentListQuerySchema
>;

export const knowledgeDocumentListResponseSchema = z.object({
  items: z.array(knowledgeDocumentSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type KnowledgeDocumentListResponse = z.infer<
  typeof knowledgeDocumentListResponseSchema
>;

const metadataFieldsSchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  category: knowledgeCategorySchema,
  visibility: knowledgeVisibilitySchema.default('PUBLIC'),
  teamId: z.uuid().nullable().optional(),
  tags: z.array(tagSchema).max(20).optional(),
});

export const createKnowledgeTextRequestSchema = metadataFieldsSchema.extend({
  content: z.string().trim().min(20).max(200_000),
});
export type CreateKnowledgeTextRequest = z.infer<
  typeof createKnowledgeTextRequestSchema
>;

export const knowledgeUploadMetadataSchema = metadataFieldsSchema;
export type KnowledgeUploadMetadata = z.infer<
  typeof knowledgeUploadMetadataSchema
>;

export const updateKnowledgeDocumentRequestSchema = z
  .object({
    title: z.string().trim().min(2).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: knowledgeCategorySchema.optional(),
    visibility: knowledgeVisibilitySchema.optional(),
    teamId: z.uuid().nullable().optional(),
    tags: z.array(tagSchema).max(20).optional(),
  })
  .strict();
export type UpdateKnowledgeDocumentRequest = z.infer<
  typeof updateKnowledgeDocumentRequestSchema
>;

export const knowledgeSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(500),
  category: knowledgeCategorySchema.optional(),
  documentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  mode: knowledgeRequestModeSchema.default('lexical'),
});
export type KnowledgeSearchQuery = z.infer<typeof knowledgeSearchQuerySchema>;

export const knowledgeSearchResultSchema = z.object({
  documentId: z.uuid(),
  documentTitle: z.string().min(1),
  category: knowledgeCategorySchema,
  visibility: knowledgeVisibilitySchema,
  chunkId: z.uuid(),
  ordinal: z.number().int().min(0),
  section: z.string().max(300).nullable(),
  page: z.number().int().min(1).nullable(),
  score: z.number(),
  excerpt: z.string(),
});
export type KnowledgeSearchResult = z.infer<
  typeof knowledgeSearchResultSchema
>;

export const knowledgeSearchResponseSchema = z.object({
  query: z.string(),
  mode: knowledgeSearchModeSchema,
  semanticEnabled: z.boolean(),
  grounded: z.boolean(),
  message: z.string().nullable(),
  total: z.number().int().min(0),
  results: z.array(knowledgeSearchResultSchema),
});
export type KnowledgeSearchResponse = z.infer<
  typeof knowledgeSearchResponseSchema
>;

export const knowledgeIngestionSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  status: knowledgeIngestionStatusSchema,
  chunksCreated: z.number().int().min(0),
  error: z.string().max(500).nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type KnowledgeIngestion = z.infer<typeof knowledgeIngestionSchema>;

export const knowledgeIngestionListResponseSchema = z.object({
  items: z.array(knowledgeIngestionSchema),
});
export type KnowledgeIngestionListResponse = z.infer<
  typeof knowledgeIngestionListResponseSchema
>;

export const knowledgeErrorMessage = {
  emptyFile: 'Arquivo vazio não é aceito.',
  fileTooLarge: 'Arquivo excede o limite permitido para a base de conhecimento.',
  mimeMismatch: 'Tipo de arquivo não permitido para a base de conhecimento.',
  contentMismatch: 'Conteúdo do arquivo não corresponde à extensão informada.',
  unsupportedFormat:
    'Formato não suportado. Envie TXT, Markdown ou PDF com texto selecionável.',
  insufficientText:
    'Não foi possível extrair texto suficiente do arquivo. PDFs digitalizados (imagem) exigem OCR, que não faz parte desta fase.',
  notFound: 'Documento de conhecimento não encontrado.',
  conflict: 'Já existe um documento com este conteúdo na base de conhecimento.',
} as const;
