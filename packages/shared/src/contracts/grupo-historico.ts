import { z } from 'zod';

const uuid = z.uuid();
const nullableDecimal = z.string().nullable();
const optionalDate = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.iso.date().optional(),
);
export const grupoSnapshotOrigins = [
  'MANUAL',
  'IMPORTACAO',
  'INTEGRACAO_FUTURA',
  'PROCESSAMENTO_INTERNO',
] as const;
export const grupoSnapshotOriginSchema = z.enum(grupoSnapshotOrigins);
export const grupoHistoricoListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    dataInicio: optionalDate,
    dataFim: optionalDate,
  })
  .refine(
    (value) =>
      !value.dataInicio || !value.dataFim || value.dataFim >= value.dataInicio,
    'Intervalo de datas inválido',
  );
export const createGrupoSnapshotRequestSchema = z
  .object({ idempotencyKey: uuid })
  .strict();

const actor = z
  .object({ id: uuid, nome: z.string(), email: z.string() })
  .nullable();
const snapshot = z.object({
  id: uuid,
  grupoId: uuid,
  capturadoEm: z.iso.datetime(),
  origem: grupoSnapshotOriginSchema,
  estado: z.object({
    status: z.string().nullable(),
    prazoMeses: z.number().int().nullable(),
    quantidadeCotasDeclarada: z.number().int().nullable(),
    quantidadeCotasRegistradas: z.number().int().nullable(),
    quantidadeCotasAtivas: z.number().int().nullable(),
    valorCreditoMinimo: nullableDecimal,
    valorCreditoMaximo: nullableDecimal,
    parcelaMedia: nullableDecimal,
  }),
  metricas: z.object({
    assembleiasRealizadas: z.number().int().nullable(),
    lancesRegistrados: z.number().int().nullable(),
    lancesContemplados: z.number().int().nullable(),
    contemplacoesRegistradas: z.number().int().nullable(),
    contemplacoesSorteio: z.number().int().nullable(),
    contemplacoesLance: z.number().int().nullable(),
    contemplacoesOutras: z.number().int().nullable(),
    percentualLanceContempladoMinimo: nullableDecimal,
    percentualLanceContempladoMaximo: nullableDecimal,
    percentualLanceContempladoMedio: nullableDecimal,
    percentualLanceContempladoMediano: nullableDecimal,
  }),
  cobertura: z.object({
    assembleiasAnalisadas: z.number().int().nullable(),
    assembleiasComDadosLance: z.number().int().nullable(),
    assembleiasComDadosContemplacao: z.number().int().nullable(),
  }),
  qualidade: z.object({
    issuesAbertas: z.number().int().nullable(),
    issuesCriticas: z.number().int().nullable(),
  }),
  grupo: z.object({
    id: uuid,
    codigo: z.string(),
    administradora: z.object({ id: uuid, nome: z.string() }),
    produto: z.object({ id: uuid, nome: z.string() }).nullable(),
  }),
  criadoPor: actor,
  fonteDados: z.object({ id: uuid, nome: z.string() }).nullable(),
  importacao: z
    .object({ id: uuid, nomeArquivo: z.string().nullable() })
    .nullable(),
  createdAt: z.iso.datetime(),
});
export const grupoSnapshotSchema = snapshot.extend({
  anterior: z
    .object({
      id: uuid,
      capturadoEm: z.iso.datetime(),
      valorCreditoMinimo: nullableDecimal,
      valorCreditoMaximo: nullableDecimal,
      prazoMeses: z.number().int().nullable(),
      quantidadeCotasDeclarada: z.number().int().nullable(),
    })
    .nullable(),
});
export const grupoHistoricoListResponseSchema = z.object({
  items: z.array(snapshot),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export const grupoHistoricoSeriesSchema = z.object({
  grupoId: uuid,
  pontos: z.array(
    z.object({
      snapshotId: uuid,
      capturadoEm: z.iso.datetime(),
      valorCreditoMinimo: nullableDecimal,
      valorCreditoMaximo: nullableDecimal,
      prazoMeses: z.number().int().nullable(),
      quantidadeCotasDeclarada: z.number().int().nullable(),
      percentualLanceContempladoMinimo: nullableDecimal,
      percentualLanceContempladoMaximo: nullableDecimal,
      percentualLanceContempladoMedio: nullableDecimal,
      percentualLanceContempladoMediano: nullableDecimal,
      contemplacoesRegistradas: z.number().int().nullable(),
    }),
  ),
});

export type GrupoHistoricoListQuery = z.infer<
  typeof grupoHistoricoListQuerySchema
>;
export type GrupoSnapshot = z.infer<typeof grupoSnapshotSchema>;
export type GrupoHistoricoSeries = z.infer<typeof grupoHistoricoSeriesSchema>;
