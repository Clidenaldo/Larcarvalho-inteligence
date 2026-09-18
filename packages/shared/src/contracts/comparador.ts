import { z } from 'zod';
import {
  produtoCategoriaSchema,
  statusOperacionalSchema,
} from './operacional.js';

const uuid = z.uuid();
const optionalDecimal = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Valor inválido')
    .optional(),
);
const optionalInteger = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().nonnegative().max(1200).optional(),
);
export const comparadorSorts = [
  'codigo',
  'administradora',
  'creditoMinimo',
  'creditoMaximo',
  'prazo',
  'maisRecente',
] as const;
export const comparadorHistoryStates = [
  'INDISPONIVEL',
  'PARCIAL',
  'DISPONIVEL',
] as const;
export const comparadorCompatibilityStates = [
  'ATENDE',
  'NAO_ATENDE',
  'INDISPONIVEL',
] as const;
export const comparadorSearchQuerySchema = z
  .object({
    categoria: produtoCategoriaSchema.optional(),
    administradoraId: uuid.optional(),
    valorCreditoDesejado: optionalDecimal,
    parcelaMaxima: optionalDecimal,
    prazoMinimo: optionalInteger,
    prazoMaximo: optionalInteger,
    status: statusOperacionalSchema.default('ATIVO'),
    incluirInativos: z.preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean().default(false),
    ),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(comparadorSorts).default('codigo'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
  })
  .refine(
    (value) =>
      value.prazoMinimo === undefined ||
      value.prazoMaximo === undefined ||
      value.prazoMaximo >= value.prazoMinimo,
    'Intervalo de prazo inválido',
  );
const comparisonContext = {
  valorCreditoDesejado: optionalDecimal,
  parcelaMaxima: optionalDecimal,
  prazoMinimo: optionalInteger,
  prazoMaximo: optionalInteger,
};
export const compararGruposRequestSchema = z
  .object({
    grupoIds: z.array(uuid).min(1).max(5),
    permitirCategoriasDiferentes: z.boolean().default(false),
    ...comparisonContext,
  })
  .strict()
  .refine((value) => new Set(value.grupoIds).size === value.grupoIds.length, {
    message: 'Grupos duplicados não são permitidos',
    path: ['grupoIds'],
  })
  .refine(
    (value) =>
      value.prazoMinimo === undefined ||
      value.prazoMaximo === undefined ||
      value.prazoMaximo >= value.prazoMinimo,
    'Intervalo de prazo inválido',
  );
const nullableDecimal = z.string().nullable();
const compatibility = z.enum(comparadorCompatibilityStates);
export const comparadorGroupFinanceiroSchema = z.object({
  primeiraParcela: nullableDecimal,
  demaisParcelas: nullableDecimal,
  parcelaPadrao: nullableDecimal,
  seguro: nullableDecimal,
  taxaAntecipadaValor: nullableDecimal,
  taxaAntecipadaPercentual: nullableDecimal,
  fundoReservaPercentual: nullableDecimal,
  taxaAdministracaoPercentual: nullableDecimal,
  taxaTotalPercentual: nullableDecimal,
  seguroVidaPercentual: nullableDecimal,
  participantesGrupo: z.number().int().nullable(),
});
export const comparadorGroupSchema = z.object({
  origem: z.enum(['GRUPO', 'PLANO_COMERCIAL']).optional(),
  grupo: z.object({
    id: uuid,
    codigo: z.string(),
    status: z.string(),
    quantidadeCotas: z.number().int().nullable(),
  }),
  tabelaComercial: z
    .object({
      id: uuid,
      nome: z.string(),
      codigo: z.string(),
      itemId: uuid,
      codigoPlano: z.string().nullable(),
      modalidade: z.string(),
      vigenciaInicio: z.iso.datetime(),
      vigenciaFim: z.iso.datetime().nullable(),
    })
    .nullable()
    .optional(),
  administradora: z.object({ id: uuid, nome: z.string(), ativa: z.boolean() }),
  produto: z
    .object({
      id: uuid,
      nome: z.string(),
      categoria: produtoCategoriaSchema,
      ativo: z.boolean(),
    })
    .nullable(),
  credito: z.object({
    minimo: nullableDecimal,
    maximo: nullableDecimal,
    compatibilidade: compatibility.nullable(),
  }),
  parcela: z.object({
    valorConhecido: nullableDecimal,
    origem: z.enum(['SNAPSHOT', 'COTAS_ATUAIS']).nullable(),
    compatibilidade: compatibility.nullable(),
  }),
  prazo: z.object({
    totalMeses: z.number().int().nullable(),
    restanteMinimo: z.number().int().nullable(),
    restanteMaximo: z.number().int().nullable(),
    compatibilidade: compatibility.nullable(),
  }),
  historico: z.object({
    estado: z.enum(comparadorHistoryStates),
    snapshotId: uuid.nullable(),
    capturadoEm: z.iso.datetime().nullable(),
    assembleiasRealizadas: z.number().int().nullable(),
    lancesRegistrados: z.number().int().nullable(),
    lancesContemplados: z.number().int().nullable(),
    percentualLanceMinimo: nullableDecimal,
    percentualLanceMedio: nullableDecimal,
    percentualLanceMediano: nullableDecimal,
    percentualLanceMaximo: nullableDecimal,
    contemplacoesRegistradas: z.number().int().nullable(),
    contemplacoesSorteio: z.number().int().nullable(),
    contemplacoesLance: z.number().int().nullable(),
    contemplacoesOutras: z.number().int().nullable(),
  }),
  cobertura: z.object({
    assembleiasRealizadas: z.number().int().nullable(),
    assembleiasComDadosLance: z.number().int().nullable(),
    assembleiasComDadosContemplacao: z.number().int().nullable(),
    percentualLances: z.number().min(0).max(1).nullable(),
  }),
  qualidade: z.object({
    issuesAbertas: z.number().int(),
    issuesCriticas: z.number().int(),
  }),
  financeiro: comparadorGroupFinanceiroSchema.nullable().optional(),
  motivosCompatibilidade: z.array(z.string()),
});
export const comparadorSearchResponseSchema = z.object({
  items: z.array(comparadorGroupSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export const compararGruposResponseSchema = z.object({
  criterios: z.object({
    valorCreditoDesejado: z.string().optional(),
    parcelaMaxima: z.string().optional(),
    prazoMinimo: z.number().int().optional(),
    prazoMaximo: z.number().int().optional(),
  }),
  items: z.array(comparadorGroupSchema).min(1).max(5),
  disclaimer: z.string(),
});

export type ComparadorSearchQuery = z.infer<typeof comparadorSearchQuerySchema>;
export type CompararGruposRequest = z.infer<typeof compararGruposRequestSchema>;
export type ComparadorGroupFinanceiro = z.infer<
  typeof comparadorGroupFinanceiroSchema
>;
export type ComparadorGroup = z.infer<typeof comparadorGroupSchema>;
export type CompararGruposResponse = z.infer<
  typeof compararGruposResponseSchema
>;
