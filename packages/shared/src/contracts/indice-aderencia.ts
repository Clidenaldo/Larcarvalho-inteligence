import { z } from 'zod';
import { produtoCategoriaSchema } from './operacional.js';

const optionalDecimal = (maximum?: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z
      .union([z.string(), z.number()])
      .transform(String)
      .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), 'Valor inválido')
      .refine(
        (value) => maximum === undefined || Number(value) <= maximum,
        `Valor deve ser menor ou igual a ${maximum}`,
      )
      .optional(),
  );
const optionalTerm = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().nonnegative().max(1200).optional(),
);

export const perfilAderenciaSchema = z
  .object({
    categoria: produtoCategoriaSchema.optional(),
    valorCreditoDesejado: optionalDecimal(),
    parcelaMaxima: optionalDecimal(),
    prazoMinimo: optionalTerm,
    prazoMaximo: optionalTerm,
    lanceDisponivelPercentual: optionalDecimal(100),
  })
  .strict()
  .refine(
    (value) =>
      value.valorCreditoDesejado !== undefined ||
      value.parcelaMaxima !== undefined ||
      value.prazoMinimo !== undefined ||
      value.prazoMaximo !== undefined ||
      value.lanceDisponivelPercentual !== undefined,
    'Informe ao menos um critério principal do perfil',
  )
  .refine(
    (value) =>
      value.prazoMinimo === undefined ||
      value.prazoMaximo === undefined ||
      value.prazoMaximo >= value.prazoMinimo,
    'Intervalo de prazo inválido',
  );

export const indiceAderenciaComponentNames = [
  'CREDITO',
  'PARCELA',
  'PRAZO',
  'HISTORICO_LANCES',
  'COBERTURA_HISTORICA',
  'CARACTERISTICAS_GRUPO',
  'QUALIDADE_DADOS',
] as const;
export const indiceAderenciaComponentStatuses = [
  'ATENDE',
  'PARCIAL',
  'NAO_ATENDE',
  'INDISPONIVEL',
] as const;

export const indiceAderenciaComponentSchema = z.object({
  nome: z.enum(indiceAderenciaComponentNames),
  peso: z.number().min(0).max(100),
  pesoAvaliado: z.number().min(0).max(100),
  pontuacaoBruta: z.number().min(0).max(100).nullable(),
  pontuacaoPonderada: z.number().min(0).max(100).nullable(),
  status: z.enum(indiceAderenciaComponentStatuses),
  explicacao: z.string(),
  dadosUtilizados: z.record(z.string(), z.string().nullable()),
});

export const indiceAderenciaResultSchema = z.object({
  grupoId: z.uuid(),
  indice: z.number().int().min(0).max(100).nullable(),
  classificacao: z
    .enum([
      'ALTA_ADERENCIA',
      'ADERENCIA_MODERADA',
      'BAIXA_ADERENCIA',
      'MUITO_BAIXA_ADERENCIA',
    ])
    .nullable(),
  coberturaAvaliacao: z.number().min(0).max(100),
  pesoTotalAvaliavel: z.number().min(0).max(100),
  componentes: z.array(indiceAderenciaComponentSchema).length(7),
  disclaimer: z.string(),
});

export const calcularIndiceAderenciaRequestSchema = z
  .object({
    perfil: perfilAderenciaSchema,
    grupoIds: z.array(z.uuid()).min(1).max(5),
  })
  .strict()
  .refine((value) => new Set(value.grupoIds).size === value.grupoIds.length, {
    message: 'Grupos duplicados não são permitidos',
    path: ['grupoIds'],
  });

export const calcularIndiceAderenciaResponseSchema = z.object({
  perfil: perfilAderenciaSchema,
  resultados: z.array(indiceAderenciaResultSchema).min(1).max(5),
});

export type PerfilAderencia = z.infer<typeof perfilAderenciaSchema>;
export type IndiceAderenciaComponent = z.infer<
  typeof indiceAderenciaComponentSchema
>;
export type IndiceAderenciaResult = z.infer<typeof indiceAderenciaResultSchema>;
export type CalcularIndiceAderenciaRequest = z.infer<
  typeof calcularIndiceAderenciaRequestSchema
>;
export type CalcularIndiceAderenciaResponse = z.infer<
  typeof calcularIndiceAderenciaResponseSchema
>;
