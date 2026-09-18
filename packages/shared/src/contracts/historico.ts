import { z } from 'zod';

const uuid = z.uuid();
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(1).max(max).optional(),
  );
const decimal = (scale: number, max?: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .union([z.string(), z.number()])
      .transform(String)
      .refine(
        (v) => new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(v),
        'Decimal inválido',
      )
      .refine((v) => Number(v) >= 0, 'Decimal não pode ser negativo')
      .refine(
        (v) => max === undefined || Number(v) <= max,
        'Decimal fora do intervalo',
      )
      .optional(),
  );
const instant = z.preprocess(
  (v) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? `${v}T00:00:00.000Z`
      : v,
  z.iso.datetime(),
);
const optionalDate = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.iso.date().optional(),
);
const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const interval = <T extends Record<string, unknown>>(v: T) =>
  !(
    typeof v.dataInicio === 'string' &&
    typeof v.dataFim === 'string' &&
    v.dataFim < v.dataInicio
  );

export const assembleiaStatuses = [
  'AGENDADA',
  'REALIZADA',
  'CANCELADA',
] as const;
export const assembleiaStatusSchema = z.enum(assembleiaStatuses);
export const lanceTipos = ['LIVRE', 'FIXO', 'EMBUTIDO', 'OUTRO'] as const;
export const lanceTipoSchema = z.enum(lanceTipos);
export const lanceOrigens = [
  'MANUAL',
  'IMPORTACAO',
  'INTEGRACAO',
  'PUBLICO',
  'OUTRO',
] as const;
export const lanceOrigemSchema = z.enum(lanceOrigens);
export const contemplacaoTipos = ['SORTEIO', 'LANCE', 'OUTRO'] as const;
export const contemplacaoTipoSchema = z.enum(contemplacaoTipos);

const assembleiaFields = {
  grupoId: uuid,
  numero: optionalText(50),
  dataAssembleia: instant,
  status: assembleiaStatusSchema,
};
export const createAssembleiaRequestSchema = z
  .object(assembleiaFields)
  .strict();
export const updateAssembleiaRequestSchema = z
  .object(assembleiaFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo');
export const updateAssembleiaStatusRequestSchema = z
  .object({ status: assembleiaStatusSchema })
  .strict();
export const assembleiaListQuerySchema = z
  .object({
    ...page,
    search: optionalText(200),
    administradoraId: uuid.optional(),
    produtoId: uuid.optional(),
    grupoId: uuid.optional(),
    status: assembleiaStatusSchema.optional(),
    dataInicio: optionalDate,
    dataFim: optionalDate,
  })
  .refine(interval, 'Intervalo de datas inválido');

const lanceFields = {
  assembleiaId: uuid,
  cotaId: uuid.optional(),
  tipo: lanceTipoSchema,
  percentual: decimal(6, 999.999999),
  valor: decimal(2),
  contemplado: z.boolean().optional(),
  origem: lanceOrigemSchema,
};
export const createLanceRequestSchema = z.object(lanceFields).strict();
export const updateLanceRequestSchema = z
  .object(lanceFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo');
export const lanceListQuerySchema = z
  .object({
    ...page,
    assembleiaId: uuid.optional(),
    grupoId: uuid.optional(),
    administradoraId: uuid.optional(),
    tipo: lanceTipoSchema.optional(),
    contemplado: z.preprocess(
      (v) => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean().optional(),
    ),
    dataInicio: optionalDate,
    dataFim: optionalDate,
  })
  .refine(interval, 'Intervalo de datas inválido');

const contemplacaoFields = {
  assembleiaId: uuid,
  cotaId: uuid.optional(),
  tipo: contemplacaoTipoSchema,
  codigoExterno: optionalText(100),
  valorLance: decimal(2),
  percentualLance: decimal(6, 999.999999),
};
export const createContemplacaoRequestSchema = z
  .object(contemplacaoFields)
  .strict();
export const updateContemplacaoRequestSchema = z
  .object(contemplacaoFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe ao menos um campo');
export const contemplacaoListQuerySchema = z
  .object({
    ...page,
    assembleiaId: uuid.optional(),
    grupoId: uuid.optional(),
    administradoraId: uuid.optional(),
    tipo: contemplacaoTipoSchema.optional(),
    dataInicio: optionalDate,
    dataFim: optionalDate,
  })
  .refine(interval, 'Intervalo de datas inválido');

const admin = z.object({ id: uuid, nome: z.string() });
const produto = z.object({ id: uuid, nome: z.string() }).nullable();
const grupo = z.object({
  id: uuid,
  codigo: z.string(),
  administradora: admin,
  produto,
});
const cota = z.object({ id: uuid, numero: z.string() }).nullable();
export const assembleiaSchema = z.object({
  id: uuid,
  grupoId: uuid,
  numero: z.string().nullable(),
  dataAssembleia: z.iso.datetime(),
  status: assembleiaStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  grupo,
});
export const lanceSchema = z.object({
  id: uuid,
  assembleiaId: uuid,
  cotaId: uuid.nullable(),
  tipo: lanceTipoSchema,
  percentual: z.string().nullable(),
  valor: z.string().nullable(),
  contemplado: z.boolean().nullable(),
  origem: lanceOrigemSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  assembleia: z.object({
    id: uuid,
    numero: z.string().nullable(),
    dataAssembleia: z.iso.datetime(),
    grupo,
  }),
  cota,
});
export const contemplacaoSchema = z.object({
  id: uuid,
  assembleiaId: uuid,
  cotaId: uuid.nullable(),
  tipo: contemplacaoTipoSchema,
  codigoExterno: z.string().nullable(),
  valorLance: z.string().nullable(),
  percentualLance: z.string().nullable(),
  createdAt: z.iso.datetime(),
  assembleia: z.object({
    id: uuid,
    numero: z.string().nullable(),
    dataAssembleia: z.iso.datetime(),
    grupo,
  }),
  cota,
});
const list = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
export const assembleiaListResponseSchema = list(assembleiaSchema);
export const lanceListResponseSchema = list(lanceSchema);
export const contemplacaoListResponseSchema = list(contemplacaoSchema);

export type Assembleia = z.infer<typeof assembleiaSchema>;
export type AssembleiaListQuery = z.infer<typeof assembleiaListQuerySchema>;
export type CreateAssembleiaRequest = z.infer<
  typeof createAssembleiaRequestSchema
>;
export type UpdateAssembleiaRequest = z.infer<
  typeof updateAssembleiaRequestSchema
>;
export type Lance = z.infer<typeof lanceSchema>;
export type LanceListQuery = z.infer<typeof lanceListQuerySchema>;
export type CreateLanceRequest = z.infer<typeof createLanceRequestSchema>;
export type UpdateLanceRequest = z.infer<typeof updateLanceRequestSchema>;
export type Contemplacao = z.infer<typeof contemplacaoSchema>;
export type ContemplacaoListQuery = z.infer<typeof contemplacaoListQuerySchema>;
export type CreateContemplacaoRequest = z.infer<
  typeof createContemplacaoRequestSchema
>;
export type UpdateContemplacaoRequest = z.infer<
  typeof updateContemplacaoRequestSchema
>;
