import { z } from 'zod';
import {
  indiceAderenciaComponentNames,
  indiceAderenciaComponentStatuses,
} from './indice-aderencia.js';
import { produtoCategoriaSchema } from './operacional.js';

const publicMoney = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value),
    'Valor monetário inválido',
  )
  .refine(
    (value) => Number(value) > 0 && Number(value) <= 100_000_000,
    'Valor monetário fora do limite',
  );
const optionalMoney = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  publicMoney.optional(),
);
const optionalTerm = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(1200).optional(),
);
const optionalBid = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), 'Percentual inválido')
    .refine(
      (value) => Number(value) >= 0 && Number(value) <= 100,
      'Percentual fora do limite',
    )
    .optional(),
);

export const simuladorPublicoPerfilSchema = z
  .object({
    categoria: produtoCategoriaSchema,
    valorCreditoDesejado: publicMoney,
    parcelaMaxima: optionalMoney,
    prazoMaximo: optionalTerm,
    lanceDisponivelPercentual: optionalBid,
  })
  .strict();

export const simuladorPublicoRequestSchema = z
  .object({
    perfil: simuladorPublicoPerfilSchema,
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce.number().int().min(1).max(12).default(6),
  })
  .strict();

const nullableDecimal = z.string().nullable();
export const simuladorPublicoItemSchema = z.object({
  origem: z.enum(['GRUPO', 'PLANO_COMERCIAL']).optional(),
  administradora: z.string(),
  grupo: z.string(),
  tabelaComercial: z.object({
    id: z.uuid(),
    codigo: z.string(),
    nome: z.string(),
    itemId: z.uuid(),
  }).nullable().optional(),
  categoria: produtoCategoriaSchema,
  credito: z.object({ minimo: nullableDecimal, maximo: nullableDecimal }),
  parcelaConhecida: nullableDecimal,
  prazoMeses: z.number().int().nullable(),
  indiceAderencia: z.number().int().min(0).max(100).nullable(),
  classificacao: z
    .enum([
      'ALTA_ADERENCIA',
      'ADERENCIA_MODERADA',
      'BAIXA_ADERENCIA',
      'MUITO_BAIXA_ADERENCIA',
    ])
    .nullable(),
  coberturaAvaliacao: z.number().min(0).max(100),
  historicoStatus: z.enum([
    'DADOS_DISPONIVEIS',
    'DADOS_HISTORICOS_PARCIAIS',
    'DADOS_INSUFICIENTES',
  ]),
  historicoObservado: z.object({
    lanceMinimo: nullableDecimal,
    lanceMediano: nullableDecimal,
    lanceMaximo: nullableDecimal,
    assembleiasAnalisadas: z.number().int().nullable(),
  }),
  componentes: z.array(
    z.object({
      nome: z.enum(indiceAderenciaComponentNames),
      status: z.enum(indiceAderenciaComponentStatuses),
      pesoAvaliado: z.number().min(0).max(100),
      pontuacaoPonderada: z.number().min(0).max(100).nullable(),
      explicacao: z.string(),
    }),
  ),
});

export const simuladorPublicoResponseSchema = z.object({
  items: z.array(simuladorPublicoItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  totalCandidatos: z.number().int(),
  limiteCandidatos: z.number().int(),
  limiteAtingido: z.boolean(),
  disclaimer: z.string(),
});

export type SimuladorPublicoPerfil = z.infer<
  typeof simuladorPublicoPerfilSchema
>;
export type SimuladorPublicoRequest = z.infer<
  typeof simuladorPublicoRequestSchema
>;
export type SimuladorPublicoItem = z.infer<typeof simuladorPublicoItemSchema>;
export type SimuladorPublicoResponse = z.infer<
  typeof simuladorPublicoResponseSchema
>;
