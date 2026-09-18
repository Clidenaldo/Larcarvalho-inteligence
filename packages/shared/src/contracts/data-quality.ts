import { z } from 'zod';

export const dataQualityStatuses = [
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'IGNORED',
] as const;
export const dataQualityStatusSchema = z.enum(dataQualityStatuses);
export const dataQualitySeverities = [
  'INFO',
  'WARNING',
  'ERROR',
  'CRITICAL',
] as const;
export const dataQualitySeveritySchema = z.enum(dataQualitySeverities);
export const dataQualityOrigins = [
  'IMPORTACAO',
  'VALIDACAO_INTERNA',
  'PROCESSAMENTO',
  'INTEGRACAO_FUTURA',
  'AUDITORIA_MANUAL',
] as const;
export const dataQualityOriginSchema = z.enum(dataQualityOrigins);
export const dataQualityEntities = [
  'Administradora',
  'Produto',
  'Grupo',
  'Cota',
  'Assembleia',
  'Lance',
  'Contemplacao',
  'Importacao',
] as const;
export const dataQualityEntitySchema = z.enum(dataQualityEntities);

const optional = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(max).optional(),
  );
export const dataQualityListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: dataQualityStatusSchema.optional(),
    severidade: dataQualitySeveritySchema.optional(),
    origem: dataQualityOriginSchema.optional(),
    codigo: optional(100),
    entidade: dataQualityEntitySchema.optional(),
    importacaoId: z.uuid().optional(),
    administradoraId: z.uuid().optional(),
    produtoId: z.uuid().optional(),
    grupoId: z.uuid().optional(),
    dataInicio: z.iso.date().optional(),
    dataFim: z.iso.date().optional(),
    search: optional(200),
    pendentes: z.preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean().optional(),
    ),
  })
  .refine(
    (value) =>
      !value.dataInicio || !value.dataFim || value.dataFim >= value.dataInicio,
    'Intervalo inválido',
  );
export const reviewIssueRequestSchema = z
  .object({ status: z.literal('IN_REVIEW'), observacao: optional(1000) })
  .strict();
export const resolveIssueRequestSchema = z
  .object({
    acaoRealizada: z.string().trim().min(2).max(300),
    observacao: optional(2000),
  })
  .strict();
export const ignoreIssueRequestSchema = z
  .object({ justificativa: z.string().trim().min(2).max(2000) })
  .strict();
export const reopenIssueRequestSchema = z
  .object({ observacao: optional(2000) })
  .strict();
export const createManualIssueRequestSchema = z
  .object({
    entidade: dataQualityEntitySchema,
    entidadeId: z.uuid(),
    severidade: dataQualitySeveritySchema,
    mensagem: z.string().trim().min(3).max(2000),
    campo: optional(100),
  })
  .strict();

const actor = z
  .object({ id: z.uuid(), nome: z.string(), email: z.string() })
  .nullable();
const issueBase = z.object({
  id: z.uuid(),
  codigo: z.string(),
  severidade: dataQualitySeveritySchema,
  status: dataQualityStatusSchema,
  origem: dataQualityOriginSchema,
  entidade: z.string(),
  registroId: z.string().nullable(),
  campo: z.string().nullable(),
  linha: z.number().int().nullable(),
  valorRecebido: z.string().nullable(),
  mensagem: z.string(),
  metadata: z.unknown().nullable(),
  importacaoId: z.uuid().nullable(),
  administradoraId: z.uuid().nullable(),
  produtoId: z.uuid().nullable(),
  grupoId: z.uuid().nullable(),
  resolvido: z.boolean(),
  resolvedAt: z.iso.datetime().nullable(),
  resolvedBy: actor,
  resolutionAction: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const dataQualityIssueSchema = issueBase.extend({
  contexto: z.object({
    titulo: z.string(),
    href: z.string().nullable(),
    administradora: z.string().nullable(),
    grupo: z.string().nullable(),
  }),
  importacao: z
    .object({
      id: z.uuid(),
      nomeArquivo: z.string().nullable(),
      fonte: z.string(),
    })
    .nullable(),
  historico: z.array(
    z.object({
      action: z.string(),
      actorId: z.string().nullable(),
      createdAt: z.iso.datetime(),
      metadata: z.unknown().nullable(),
    }),
  ),
});
export const dataQualityIssueListResponseSchema = z.object({
  items: z.array(
    issueBase.omit({ metadata: true }).extend({
      contexto: z.object({
        titulo: z.string(),
        href: z.string().nullable(),
        administradora: z.string().nullable(),
        grupo: z.string().nullable(),
      }),
    }),
  ),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export const dataQualitySummarySchema = z.object({
  abertas: z.number().int(),
  criticas: z.number().int(),
  erros: z.number().int(),
  avisos: z.number().int(),
  resolvidas: z.number().int(),
});
export const dataQualityScanResultSchema = z.object({
  registrosAvaliados: z.number().int(),
  issuesNovas: z.number().int(),
  issuesExistentes: z.number().int(),
  resolvidasAutomaticamente: z.number().int(),
});

export type DataQualityListQuery = z.infer<typeof dataQualityListQuerySchema>;
export type DataQualityIssue = z.infer<typeof dataQualityIssueSchema>;
export type DataQualityStatus = z.infer<typeof dataQualityStatusSchema>;
export type CreateManualIssueRequest = z.infer<
  typeof createManualIssueRequestSchema
>;
