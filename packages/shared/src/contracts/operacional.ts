import { z } from 'zod';

const uuid = z.uuid();
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(maximum).optional(),
  );
const optionalDecimal = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .refine(
      (value) => /^\d+(\.\d{1,2})?$/.test(value),
      'Valor monetário inválido',
    )
    .refine((value) => Number(value) >= 0, 'Valor não pode ser negativo')
    .optional(),
);
const optionalDate = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.iso.date().optional(),
);
const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalText(200),
};

export const produtoCategorias = [
  'IMOVEL',
  'AUTOMOVEL',
  'MOTOCICLETA',
  'PESADOS',
  'SERVICOS',
  'OUTROS',
] as const;
export const produtoCategoriaSchema = z.enum(produtoCategorias);
export const statusOperacionais = [
  'ATIVO',
  'INATIVO',
  'ENCERRADO',
  'SUSPENSO',
  'OUTRO',
] as const;
export const statusOperacionalSchema = z.enum(statusOperacionais);

const produtoFields = {
  administradoraId: uuid,
  categoria: produtoCategoriaSchema,
  codigoExterno: optionalText(100),
  descricao: optionalText(5000),
  nome: z.string().trim().min(2).max(200),
};
export const createProdutoRequestSchema = z.object(produtoFields).strict();
export const updateProdutoRequestSchema = z
  .object(produtoFields)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos um campo',
  );
export const updateProdutoStatusRequestSchema = z
  .object({ ativo: z.boolean() })
  .strict();
export const produtoListQuerySchema = z.object({
  ...pageFields,
  administradoraId: uuid.optional(),
  categoria: produtoCategoriaSchema.optional(),
  status: z.enum(['todos', 'ativos', 'inativos']).default('todos'),
});

const grupoFields = {
  administradoraId: uuid,
  codigo: z.string().trim().min(1).max(100),
  dataEncerramento: optionalDate,
  dataInicio: optionalDate,
  prazoMeses: z.coerce.number().int().positive().max(1200).optional(),
  produtoId: uuid.optional(),
  quantidadeCotas: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(10_000_000)
    .optional(),
  status: statusOperacionalSchema,
  valorCreditoMaximo: optionalDecimal,
  valorCreditoMinimo: optionalDecimal,
};
const coherentGroup = <T extends Record<string, unknown>>(value: T) => {
  const start = value.dataInicio;
  const end = value.dataEncerramento;
  const min = value.valorCreditoMinimo;
  const max = value.valorCreditoMaximo;
  return !(
    (typeof start === 'string' && typeof end === 'string' && end < start) ||
    (typeof min === 'string' &&
      typeof max === 'string' &&
      Number(max) < Number(min))
  );
};
export const createGrupoRequestSchema = z
  .object(grupoFields)
  .strict()
  .refine(coherentGroup, 'Datas ou valores de crédito incoerentes');
export const updateGrupoRequestSchema = z
  .object(grupoFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo')
  .refine(coherentGroup, 'Datas ou valores de crédito incoerentes');
export const updateGrupoStatusRequestSchema = z
  .object({ status: statusOperacionalSchema })
  .strict();
export const grupoListQuerySchema = z.object({
  ...pageFields,
  administradoraId: uuid.optional(),
  produtoId: uuid.optional(),
  status: statusOperacionalSchema.optional(),
});

const cotaFields = {
  codigoExterno: optionalText(100),
  grupoId: uuid,
  numero: z.string().trim().min(1).max(50),
  parcelaAtual: optionalDecimal,
  prazoRestante: z.coerce.number().int().nonnegative().max(1200).optional(),
  status: statusOperacionalSchema,
  valorCredito: optionalDecimal,
};
export const createCotaRequestSchema = z.object(cotaFields).strict();
export const updateCotaRequestSchema = z
  .object(cotaFields)
  .partial()
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos um campo',
  );
export const updateCotaStatusRequestSchema = z
  .object({ status: statusOperacionalSchema })
  .strict();
export const cotaListQuerySchema = z.object({
  ...pageFields,
  administradoraId: uuid.optional(),
  grupoId: uuid.optional(),
  produtoId: uuid.optional(),
  status: statusOperacionalSchema.optional(),
});

const administradoraSummarySchema = z.object({ id: uuid, nome: z.string() });
const produtoSummarySchema = z.object({
  id: uuid,
  nome: z.string(),
  categoria: produtoCategoriaSchema,
});
const grupoSummarySchema = z.object({
  id: uuid,
  codigo: z.string(),
  status: statusOperacionalSchema,
});
const iso = z.iso.datetime();
export const produtoSchema = z.object({
  administradora: administradoraSummarySchema,
  administradoraId: uuid,
  ativo: z.boolean(),
  categoria: produtoCategoriaSchema,
  codigoExterno: z.string().nullable(),
  createdAt: iso,
  descricao: z.string().nullable(),
  id: uuid,
  nome: z.string(),
  updatedAt: iso,
});
export const grupoSchema = z.object({
  administradora: administradoraSummarySchema,
  administradoraId: uuid,
  codigo: z.string(),
  createdAt: iso,
  dataEncerramento: z.iso.date().nullable(),
  dataInicio: z.iso.date().nullable(),
  id: uuid,
  prazoMeses: z.number().int().nullable(),
  produto: produtoSummarySchema.nullable(),
  produtoId: uuid.nullable(),
  quantidadeCotas: z.number().int().nullable(),
  status: statusOperacionalSchema,
  updatedAt: iso,
  valorCreditoMaximo: z.string().nullable(),
  valorCreditoMinimo: z.string().nullable(),
});
export const cotaSchema = z.object({
  codigoExterno: z.string().nullable(),
  createdAt: iso,
  grupo: grupoSummarySchema.extend({
    administradora: administradoraSummarySchema,
    produto: produtoSummarySchema.nullable(),
  }),
  grupoId: uuid,
  id: uuid,
  numero: z.string(),
  parcelaAtual: z.string().nullable(),
  prazoRestante: z.number().int().nullable(),
  status: statusOperacionalSchema,
  updatedAt: iso,
  valorCredito: z.string().nullable(),
});
const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
export const produtoListResponseSchema = paginated(produtoSchema);
export const grupoListResponseSchema = paginated(grupoSchema);
export const cotaListResponseSchema = paginated(cotaSchema);

export type CreateProdutoRequest = z.infer<typeof createProdutoRequestSchema>;
export type UpdateProdutoRequest = z.infer<typeof updateProdutoRequestSchema>;
export type ProdutoListQuery = z.infer<typeof produtoListQuerySchema>;
export type Produto = z.infer<typeof produtoSchema>;
export type CreateGrupoRequest = z.infer<typeof createGrupoRequestSchema>;
export type UpdateGrupoRequest = z.infer<typeof updateGrupoRequestSchema>;
export type GrupoListQuery = z.infer<typeof grupoListQuerySchema>;
export type Grupo = z.infer<typeof grupoSchema>;
export type CreateCotaRequest = z.infer<typeof createCotaRequestSchema>;
export type UpdateCotaRequest = z.infer<typeof updateCotaRequestSchema>;
export type CotaListQuery = z.infer<typeof cotaListQuerySchema>;
export type Cota = z.infer<typeof cotaSchema>;
