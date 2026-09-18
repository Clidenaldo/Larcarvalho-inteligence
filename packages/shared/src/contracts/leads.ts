import { z } from 'zod';

import { produtoCategoriaSchema } from './operacional.js';

export const leadOrigins = [
  'SIMULADOR_PUBLICO',
  'CADASTRO_MANUAL',
  'WHATSAPP',
  'INDICACAO',
  'OUTRO',
] as const;
export const leadOriginSchema = z.enum(leadOrigins);
export const leadStatuses = [
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'QUALIFICADO',
  'PROPOSTA',
  'NEGOCIACAO',
  'CONVERTIDO',
  'PERDIDO',
] as const;
export const leadStatusSchema = z.enum(leadStatuses);
export const leadLossReasons = [
  'SEM_INTERESSE',
  'SEM_RETORNO',
  'VALOR_INCOMPATIVEL',
  'PARCELA_INCOMPATIVEL',
  'PRAZO_INCOMPATIVEL',
  'ESCOLHEU_CONCORRENTE',
  'ADIADO',
  'OUTRO',
] as const;
export const leadLossReasonSchema = z.enum(leadLossReasons);
export const leadInteractionTypes = [
  'NOTA',
  'LIGACAO',
  'WHATSAPP',
  'EMAIL',
  'REUNIAO',
  'STATUS',
  'OUTRO',
] as const;
export const leadInteractionTypeSchema = z.enum(leadInteractionTypes);

const decimal = (max = 100_000_000) =>
  z
    .string()
    .regex(/^\d+(?:\.\d{1,2})?$/)
    .refine((value) => Number(value) > 0 && Number(value) <= max);
const percentage = z
  .string()
  .regex(/^\d+(?:\.\d{1,4})?$/)
  .refine((value) => Number(value) >= 0 && Number(value) <= 100);
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().max(max).optional(),
  );

export const leadNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.string().min(2).max(120));
export const leadPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine(
    (value) =>
      /^[1-9]{2}\d{8,9}$/.test(value) || /^55[1-9]{2}\d{8,9}$/.test(value),
  )
  .transform((value) => (value.length <= 11 ? `55${value}` : value));
export const leadEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

const contactFields = {
  nome: leadNameSchema,
  telefone: leadPhoneSchema.optional(),
  email: leadEmailSchema.optional(),
};
const requireContact = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine(
    (value) => {
      const contact = value as { telefone?: unknown; email?: unknown };
      return Boolean(contact.telefone || contact.email);
    },
    {
      message: 'Informe telefone ou e-mail',
      path: ['telefone'],
    },
  );
const profileFields = {
  categoriaInteresse: produtoCategoriaSchema.optional(),
  valorCreditoDesejado: decimal().optional(),
  parcelaMaxima: decimal().optional(),
  prazoMinimo: z.number().int().min(1).max(1200).optional(),
  prazoMaximo: z.number().int().min(1).max(1200).optional(),
  lanceDisponivelPercentual: percentage.optional(),
};

export const publicLeadRequestSchema = requireContact(
  z
    .object({
      ...contactFields,
      ...profileFields,
      consentimento: z.literal(true),
      versaoTextoConsentimento: z.literal('2026-09-02.v1'),
      website: z.string().max(200).optional(),
      analyticsAnonymousId: z.uuid().optional(),
      interesse: z
        .object({
          administradora: z.string().trim().min(1).max(200),
          grupo: z.string().trim().min(1).max(100),
          indiceAderenciaCapturado: z.number().min(0).max(100).nullable(),
          coberturaAvaliacaoCapturada: z.number().min(0).max(100),
        })
        .strict()
        .optional(),
    })
    .strict(),
);
export const publicLeadResponseSchema = z.object({
  message: z.literal(
    'Recebemos sua solicitação. Nossa equipe poderá entrar em contato pelos dados informados.',
  ),
});

export const createLeadRequestSchema = requireContact(
  z
    .object({
      ...contactFields,
      ...profileFields,
      observacoes: optionalText(500),
      proximoContatoEm: z.iso.datetime().optional(),
    })
    .strict(),
);
export const updateLeadRequestSchema = z
  .object({
    nome: leadNameSchema.optional(),
    telefone: leadPhoneSchema.nullable().optional(),
    email: leadEmailSchema.nullable().optional(),
    ...profileFields,
    observacoes: optionalText(500).nullable(),
    objetivo: optionalText(500).nullable(),
    dataPretendidaAquisicao: z.iso.date().nullable().optional(),
    restricoes: optionalText(1000).nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
  );
export const assignLeadRequestSchema = z
  .object({
    responsavelId: z.uuid().nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export const changeLeadStatusRequestSchema = z
  .object({
    status: leadStatusSchema,
    motivoPerda: leadLossReasonSchema.optional(),
    descricaoMotivoPerda: optionalText(300),
    observacao: optionalText(500),
    grupoId: z.uuid().optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'PERDIDO' && !value.motivoPerda)
      context.addIssue({
        code: 'custom',
        message: 'Motivo da perda é obrigatório',
        path: ['motivoPerda'],
      });
    if (value.motivoPerda === 'OUTRO' && !value.descricaoMotivoPerda)
      context.addIssue({
        code: 'custom',
        message: 'Descreva o motivo da perda',
        path: ['descricaoMotivoPerda'],
      });
  });
export const createLeadInteractionRequestSchema = z
  .object({
    tipo: leadInteractionTypeSchema.exclude(['STATUS']),
    descricao: z.string().trim().min(2).max(2000),
    ocorridoEm: z.iso.datetime().optional(),
  })
  .strict();
export const createLeadInterestRequestSchema = z
  .object({
    grupoId: z.uuid(),
    indiceAderenciaCapturado: z.number().min(0).max(100).nullable().optional(),
    coberturaAvaliacaoCapturada: z.number().min(0).max(100).optional(),
    principal: z.boolean().default(false),
  })
  .strict();
export const setLeadNextContactRequestSchema = z
  .object({
    proximoContatoEm: z.iso.datetime().nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();

export const leadListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: leadStatusSchema.optional(),
    responsavelId: z.uuid().optional(),
    origem: leadOriginSchema.optional(),
    categoria: produtoCategoriaSchema.optional(),
    criadoDe: z.iso.datetime().optional(),
    criadoAte: z.iso.datetime().optional(),
    proximoContato: z.enum(['HOJE', 'ATRASADO', 'FUTURO']).optional(),
    semResponsavel: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    busca: z.string().trim().min(1).max(120).optional(),
    sort: z
      .enum(['maisRecentes', 'maisAntigos', 'proximoContato', 'nome', 'status'])
      .default('maisRecentes'),
  })
  .strict();

export const leadUserSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  role: z.string(),
});
export const leadInterestSchema = z.object({
  id: z.uuid(),
  grupoId: z.uuid(),
  grupo: z.string(),
  administradora: z.string(),
  indiceAderenciaCapturado: z.number().nullable(),
  coberturaAvaliacaoCapturada: z.number().nullable(),
  capturadoEm: z.iso.datetime(),
  principal: z.boolean(),
  createdAt: z.iso.datetime(),
});
export const leadInteractionSchema = z.object({
  id: z.uuid(),
  tipo: leadInteractionTypeSchema,
  descricao: z.string(),
  criadoPor: leadUserSchema.nullable(),
  ocorridoEm: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export const leadSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  telefone: z.string().nullable(),
  email: z.string().nullable(),
  origem: leadOriginSchema,
  status: leadStatusSchema,
  responsavel: leadUserSchema.nullable(),
  categoriaInteresse: produtoCategoriaSchema.nullable(),
  valorCreditoDesejado: z.string().nullable(),
  parcelaMaxima: z.string().nullable(),
  prazoMinimo: z.number().nullable(),
  prazoMaximo: z.number().nullable(),
  lanceDisponivelPercentual: z.string().nullable(),
  observacoes: z.string().nullable(),
  objetivo: z.string().nullable(),
  dataPretendidaAquisicao: z.iso.date().nullable(),
  restricoes: z.string().nullable(),
  proximoContatoEm: z.iso.datetime().nullable(),
  convertidoEm: z.iso.datetime().nullable(),
  motivoPerda: leadLossReasonSchema.nullable(),
  descricaoMotivoPerda: z.string().nullable(),
  consentimentoContatoEm: z.iso.datetime().nullable(),
  versaoTextoConsentimento: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  atrasado: z.boolean(),
});
export const leadDetailSchema = leadSchema.extend({
  interesses: z.array(leadInterestSchema),
  interacoes: z.array(leadInteractionSchema),
});
export const leadSummarySchema = z.object({
  NOVO: z.number().int(),
  EM_ATENDIMENTO: z.number().int(),
  CONTATO_REALIZADO: z.number().int(),
  QUALIFICADO: z.number().int(),
  PROPOSTA: z.number().int(),
  NEGOCIACAO: z.number().int(),
  CONVERTIDO: z.number().int(),
  PERDIDO: z.number().int(),
  semResponsavel: z.number().int(),
  atrasados: z.number().int(),
});
export const leadListResponseSchema = z.object({
  items: z.array(leadSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  summary: leadSummarySchema,
});

export type PublicLeadRequest = z.infer<typeof publicLeadRequestSchema>;
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;
export type AssignLeadRequest = z.infer<typeof assignLeadRequestSchema>;
export type ChangeLeadStatusRequest = z.infer<
  typeof changeLeadStatusRequestSchema
>;
export type CreateLeadInteractionRequest = z.infer<
  typeof createLeadInteractionRequestSchema
>;
export type CreateLeadInterestRequest = z.infer<
  typeof createLeadInterestRequestSchema
>;
export type SetLeadNextContactRequest = z.infer<
  typeof setLeadNextContactRequestSchema
>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type LeadDetail = z.infer<typeof leadDetailSchema>;
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;
