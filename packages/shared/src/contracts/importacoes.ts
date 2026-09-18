import { z } from 'zod';

import {
  classificacaoArquivoSchema,
  importacaoTipos,
} from './import-matrix.js';

export const importacaoTipoSchema = z.enum(importacaoTipos);
export const importacaoStatusSchema = z.enum([
  'PENDENTE',
  'VALIDANDO',
  'PRONTA',
  'PROCESSANDO',
  'CONCLUIDA',
  'CONCLUIDA_COM_ERROS',
  'FALHOU',
]);
export const importacaoEstrategiaSchema = z.enum(['IGNORAR', 'ATUALIZAR']);

export const mappingRequestSchema = z
  .object({
    aba: z.string().trim().min(1).max(200).optional(),
    mapeamento: z.record(
      z.string().min(1).max(100),
      z.string().min(1).max(300),
    ),
  })
  .strict();
export const classifyImportacaoRequestSchema = z
  .object({ classificacaoArquivo: classificacaoArquivoSchema })
  .strict();
export const validateImportacaoRequestSchema = z
  .object({ estrategia: importacaoEstrategiaSchema })
  .strict();
export const importacaoListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: importacaoStatusSchema.optional(),
  tipo: importacaoTipoSchema.optional(),
});
export const importacaoIssueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const userSummary = z
  .object({ id: z.uuid(), nome: z.string(), email: z.string() })
  .nullable();
export const importacaoSchema = z.object({
  id: z.uuid(),
  tipo: importacaoTipoSchema,
  classificacaoArquivo: classificacaoArquivoSchema.nullable(),
  nomeArquivo: z.string(),
  mimeType: z.string(),
  tamanhoBytes: z.number().int(),
  status: importacaoStatusSchema,
  abaSelecionada: z.string().nullable(),
  abas: z.array(z.string()),
  colunas: z.array(z.string()),
  mapeamento: z.record(z.string(), z.string()).nullable(),
  estrategia: importacaoEstrategiaSchema.nullable(),
  iniciadaEm: z.iso.datetime(),
  validadaEm: z.iso.datetime().nullable(),
  finalizadaEm: z.iso.datetime().nullable(),
  totalRegistros: z.number().int(),
  registrosValidos: z.number().int(),
  registrosInvalidos: z.number().int(),
  registrosCriados: z.number().int(),
  registrosAtualizados: z.number().int(),
  registrosComAviso: z.number().int(),
  registrosIgnorados: z.number().int(),
  registrosProcessados: z.number().int(),
  erroResumo: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  criadoPor: userSummary,
});
export const importacaoListResponseSchema = z.object({
  items: z.array(importacaoSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export const importacaoPreviewSchema = z.object({
  importacao: importacaoSchema,
  preview: z.array(z.record(z.string(), cellValueSchema)),
  quantidadeAproximada: z.number().int(),
  needsReview: z.array(z.string()).default([]),
});
export const executionStates = [
  'CREATE',
  'UPDATE',
  'UNCHANGED',
  'CONFLICT',
  'INVALID',
  'SKIPPED',
] as const;
export const executionStateSchema = z.enum(executionStates);
export type ExecutionState = z.infer<typeof executionStateSchema>;

export const executionDiffSchema = z.object({
  changed: z.boolean(),
  field: z.string(),
  from: z.string().nullable(),
  policy: z.enum(['update', 'fill_empty', 'never', 'review']),
  to: z.string().nullable(),
});

export const executionRowSchema = z.object({
  diffs: z.array(executionDiffSchema),
  entityId: z.string().nullable(),
  key: z.string().nullable(),
  row: z.number().int(),
  skippedByPolicy: z.array(z.string()),
  state: executionStateSchema,
});

export const executionEntityPlanSchema = z.object({
  conflicts: z.number().int(),
  creates: z.number().int(),
  entity: importacaoTipoSchema,
  errors: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      row: z.number().int().nullable(),
    }),
  ),
  invalid: z.number().int(),
  rows: z.number().int(),
  sample: z.array(executionRowSchema),
  skipped: z.number().int(),
  unchanged: z.number().int(),
  updates: z.number().int(),
});

export const importExecutionPlanSchema = z.object({
  entities: z.array(executionEntityPlanSchema),
  importId: z.uuid(),
  fileType: classificacaoArquivoSchema.nullable(),
});

export const importacaoValidationSchema = z.object({
  total: z.number().int(),
  validas: z.number().int(),
  avisos: z.number().int(),
  erros: z.number().int(),
  novas: z.number().int(),
  duplicadas: z.number().int(),
  atualizaveis: z.number().int(),
  ignoradas: z.number().int(),
});
export const importacaoIssueSchema = z.object({
  id: z.uuid(),
  linha: z.number().int().nullable(),
  campo: z.string().nullable(),
  valorRecebido: z.string().nullable(),
  codigo: z.string(),
  severidade: z.enum(['INFO', 'WARNING', 'ERROR', 'CRITICAL']),
  mensagem: z.string(),
  createdAt: z.iso.datetime(),
});
export const importacaoIssueListResponseSchema = z.object({
  items: z.array(importacaoIssueSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type ImportacaoEstrategia = z.infer<typeof importacaoEstrategiaSchema>;
export type ImportacaoMappingRequest = z.infer<typeof mappingRequestSchema>;
export type ClassifyImportacaoRequest = z.infer<typeof classifyImportacaoRequestSchema>;
export type ImportacaoListQuery = z.infer<typeof importacaoListQuerySchema>;
export type ImportacaoIssueQuery = z.infer<typeof importacaoIssueQuerySchema>;
export type Importacao = z.infer<typeof importacaoSchema>;
export type ImportacaoValidation = z.infer<typeof importacaoValidationSchema>;
export type ImportExecutionPlan = z.infer<typeof importExecutionPlanSchema>;
export type ExecutionEntityPlan = z.infer<typeof executionEntityPlanSchema>;
export type ExecutionRow = z.infer<typeof executionRowSchema>;
export type ImportacaoIssue = z.infer<typeof importacaoIssueSchema>;
export type ImportacaoIssueListResponse = z.infer<
  typeof importacaoIssueListResponseSchema
>;
