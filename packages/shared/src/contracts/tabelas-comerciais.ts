import { z } from 'zod';

import { produtoCategoriaSchema } from './operacional.js';

export const tabelaComercialStatuses = [
  'ATIVA',
  'INATIVA',
  'ENCERRADA',
] as const;
export const tabelaComercialStatusSchema = z.enum(tabelaComercialStatuses);
export const modalidadesComerciais = [
  'NORMAL',
  'MAIS_POR_MENOS',
  'OUTRA',
] as const;
export const modalidadeComercialSchema = z.enum(modalidadesComerciais);
export const tabelaComercialOrigens = [
  'MANUAL',
  'IMPORTACAO',
  'INTEGRACAO',
] as const;
export const tabelaComercialOrigemSchema = z.enum(tabelaComercialOrigens);
export const tabelaComercialArquivamentos = [
  'ATIVAS',
  'ARQUIVADAS',
  'TODAS',
] as const;
export const tabelaComercialArquivamentoSchema = z.enum(
  tabelaComercialArquivamentos,
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(max).optional(),
  );
const nullableText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

function decimalAtMost(value: string, maximum: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return false;
  const [integer = '0', fraction = ''] = value.split('.');
  const [maximumInteger = '0', maximumFraction = ''] = maximum.split('.');
  const normalizedInteger = integer.replace(/^0+(?=\d)/, '');
  if (normalizedInteger.length !== maximumInteger.length)
    return normalizedInteger.length < maximumInteger.length;
  if (normalizedInteger !== maximumInteger)
    return normalizedInteger < maximumInteger;
  return fraction.padEnd(6, '0') <= maximumFraction.padEnd(6, '0');
}

const decimal = (maximum = '99999999999999999.99') =>
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((value) => /^\d+(?:\.\d{1,6})?$/.test(value), 'Decimal inválido')
    .refine((value) => decimalAtMost(value, maximum), 'Valor acima do limite');
const optionalMoney = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  decimal().optional(),
);
const optionalPercent = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  decimal('100').optional(),
);
const nullableMoney = decimal().nullable().optional();
const nullablePercent = decimal('100').nullable().optional();
const optionalInteger = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().nonnegative().max(10_000_000).optional(),
);
const nullableInteger = z
  .number()
  .int()
  .nonnegative()
  .max(10_000_000)
  .nullable()
  .optional();

const tableCreateFields = {
  administradoraId: z.uuid(),
  produtoId: z.uuid().optional(),
  nome: z.string().trim().min(2).max(200),
  codigo: z.string().trim().min(1).max(100),
  categoria: produtoCategoriaSchema,
  inicioVigencia: z.iso.date(),
  fimVigencia: z.iso.date().optional(),
  status: tabelaComercialStatusSchema.default('ATIVA'),
  descricao: optionalText(5000),
  indiceCorrecao: optionalText(100),
  regraSeguro: optionalText(5000),
  regraContemplacao: optionalText(5000),
  lanceFacilitado: z.boolean().optional(),
  cartaoCredito: z.boolean().optional(),
  descricaoBem: optionalText(5000),
  fundoReservaPercentual: optionalPercent,
  taxaAdministracaoPercentual: optionalPercent,
  taxaTotalPercentual: optionalPercent,
  seguroVidaPercentual: optionalPercent,
  participantesGrupo: optionalInteger,
  codigoPlanoNormal: optionalText(100),
  codigoPlanoMaisPorMenos: optionalText(100),
} as const;

function validPeriod(value: {
  inicioVigencia: string;
  fimVigencia?: string | undefined;
}) {
  return !value.fimVigencia || value.fimVigencia >= value.inicioVigencia;
}

export const createTabelaComercialRequestSchema = z
  .object(tableCreateFields)
  .strict()
  .refine(validPeriod, {
    message: 'Fim da vigência deve ser igual ou posterior ao início',
  });

export const updateTabelaComercialRequestSchema = z
  .object({
    produtoId: z.uuid().nullable().optional(),
    nome: z.string().trim().min(2).max(200).optional(),
    categoria: produtoCategoriaSchema.optional(),
    fimVigencia: z.iso.date().nullable().optional(),
    descricao: nullableText(5000),
    indiceCorrecao: nullableText(100),
    regraSeguro: nullableText(5000),
    regraContemplacao: nullableText(5000),
    lanceFacilitado: z.boolean().nullable().optional(),
    cartaoCredito: z.boolean().nullable().optional(),
    descricaoBem: nullableText(5000),
    fundoReservaPercentual: nullablePercent,
    taxaAdministracaoPercentual: nullablePercent,
    taxaTotalPercentual: nullablePercent,
    seguroVidaPercentual: nullablePercent,
    participantesGrupo: nullableInteger,
    codigoPlanoNormal: nullableText(100),
    codigoPlanoMaisPorMenos: nullableText(100),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos um campo',
  );

export const updateTabelaComercialStatusRequestSchema = z
  .object({ status: tabelaComercialStatusSchema })
  .strict();

export const tabelaComercialListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  administradoraId: z.uuid().optional(),
  categoria: produtoCategoriaSchema.optional(),
  status: tabelaComercialStatusSchema.optional(),
  arquivamento: tabelaComercialArquivamentoSchema.default('ATIVAS'),
  vigencia: z.iso.date().optional(),
  search: optionalText(200),
});

const relationSummary = z.object({ id: z.uuid(), nome: z.string() });
const decimalOutput = z.string().nullable();
export const tabelaComercialSchema = z.object({
  id: z.uuid(),
  administradoraId: z.uuid(),
  produtoId: z.uuid().nullable(),
  nome: z.string(),
  codigo: z.string(),
  categoria: produtoCategoriaSchema,
  inicioVigencia: z.iso.date(),
  fimVigencia: z.iso.date().nullable(),
  status: tabelaComercialStatusSchema,
  descricao: z.string().nullable(),
  origem: tabelaComercialOrigemSchema,
  deletedAt: z.iso.datetime().nullable(),
  indiceCorrecao: z.string().nullable(),
  regraSeguro: z.string().nullable(),
  regraContemplacao: z.string().nullable(),
  lanceFacilitado: z.boolean().nullable(),
  cartaoCredito: z.boolean().nullable(),
  descricaoBem: z.string().nullable(),
  fundoReservaPercentual: decimalOutput,
  taxaAdministracaoPercentual: decimalOutput,
  taxaTotalPercentual: decimalOutput,
  seguroVidaPercentual: decimalOutput,
  participantesGrupo: z.number().int().nullable(),
  codigoPlanoNormal: z.string().nullable(),
  codigoPlanoMaisPorMenos: z.string().nullable(),
  quantidadeItens: z.number().int().nonnegative(),
  administradora: relationSummary,
  produto: relationSummary.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const tabelaComercialListResponseSchema = z.object({
  items: z.array(tabelaComercialSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const itemFields = {
  codigoExterno: optionalText(100),
  creditoReferencia: decimal(),
  seguro: optionalMoney,
  taxaAntecipadaValor: optionalMoney,
  taxaAntecipadaPercentual: optionalPercent,
  prazoMeses: z.coerce.number().int().positive().max(1200),
  modalidade: modalidadeComercialSchema,
  primeiraParcela: optionalMoney,
  demaisParcelas: optionalMoney,
  parcelaPadrao: optionalMoney,
  fundoReservaPercentual: optionalPercent,
  taxaAdministracaoPercentual: optionalPercent,
  taxaTotalPercentual: optionalPercent,
  seguroVidaPercentual: optionalPercent,
  participantesGrupo: optionalInteger,
  codigoPlano: optionalText(100),
} as const;

export const createTabelaComercialItemRequestSchema = z
  .object(itemFields)
  .strict();
export const updateTabelaComercialItemRequestSchema = z
  .object({
    codigoExterno: nullableText(100),
    creditoReferencia: decimal().optional(),
    seguro: nullableMoney,
    taxaAntecipadaValor: nullableMoney,
    taxaAntecipadaPercentual: nullablePercent,
    prazoMeses: z.number().int().positive().max(1200).optional(),
    modalidade: modalidadeComercialSchema.optional(),
    primeiraParcela: nullableMoney,
    demaisParcelas: nullableMoney,
    parcelaPadrao: nullableMoney,
    fundoReservaPercentual: nullablePercent,
    taxaAdministracaoPercentual: nullablePercent,
    taxaTotalPercentual: nullablePercent,
    seguroVidaPercentual: nullablePercent,
    participantesGrupo: nullableInteger,
    codigoPlano: nullableText(100),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Informe ao menos um campo',
  );

export const tabelaComercialItemSchema = z.object({
  id: z.uuid(),
  tabelaComercialId: z.uuid(),
  codigoExterno: z.string().nullable(),
  creditoReferencia: z.string(),
  seguro: decimalOutput,
  taxaAntecipadaValor: decimalOutput,
  taxaAntecipadaPercentual: decimalOutput,
  prazoMeses: z.number().int(),
  modalidade: modalidadeComercialSchema,
  primeiraParcela: decimalOutput,
  demaisParcelas: decimalOutput,
  parcelaPadrao: decimalOutput,
  fundoReservaPercentual: decimalOutput,
  taxaAdministracaoPercentual: decimalOutput,
  taxaTotalPercentual: decimalOutput,
  seguroVidaPercentual: decimalOutput,
  participantesGrupo: z.number().int().nullable(),
  codigoPlano: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const tabelaComercialItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const tabelaComercialItemListResponseSchema = z.object({
  items: z.array(tabelaComercialItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const tabelaComercialAuditSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  createdAt: z.iso.datetime(),
});
export const tabelaComercialDeleteRequestSchema = z
  .object({ confirmacao: z.literal('EXCLUIR') })
  .strict();
export const tabelaComercialDeletionPolicySchema = z.object({
  permitida: z.boolean(),
  motivos: z.array(z.string()),
});
export const tabelaComercialDetailSchema = tabelaComercialSchema.extend({
  auditoria: z.array(tabelaComercialAuditSchema),
  exclusaoFisica: tabelaComercialDeletionPolicySchema,
});

export type TabelaComercial = z.infer<typeof tabelaComercialSchema>;
export type TabelaComercialDetail = z.infer<typeof tabelaComercialDetailSchema>;
export type TabelaComercialListQuery = z.infer<
  typeof tabelaComercialListQuerySchema
>;
export type TabelaComercialItem = z.infer<typeof tabelaComercialItemSchema>;
export type TabelaComercialItemListQuery = z.infer<
  typeof tabelaComercialItemListQuerySchema
>;
export type CreateTabelaComercialRequest = z.infer<
  typeof createTabelaComercialRequestSchema
>;
export type UpdateTabelaComercialRequest = z.infer<
  typeof updateTabelaComercialRequestSchema
>;
export type CreateTabelaComercialItemRequest = z.infer<
  typeof createTabelaComercialItemRequestSchema
>;
export type UpdateTabelaComercialItemRequest = z.infer<
  typeof updateTabelaComercialItemRequestSchema
>;
