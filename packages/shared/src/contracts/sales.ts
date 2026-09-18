import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Valor monetário inválido');
const nullableMoneyString = moneyString.nullable().optional();
const optionalMoneyString = moneyString.optional();
const percentualString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Percentual inválido');
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().max(max).optional(),
  );

// ---------------------------------------------------------------------------
// Venda
// ---------------------------------------------------------------------------

export const saleStatuses = [
  'RASCUNHO',
  'AGUARDANDO_DOCUMENTOS',
  'DOCUMENTOS_RECEBIDOS',
  'ENVIADA_ADMINISTRADORA',
  'EM_ANALISE',
  'APROVADA',
  'CONTRATADA',
  'RECUSADA',
  'CANCELADA',
] as const;
export const saleStatusSchema = z.enum(saleStatuses);
export type SaleStatus = z.infer<typeof saleStatusSchema>;

export const saleTransitions: Record<SaleStatus, SaleStatus[]> = {
  RASCUNHO: ['AGUARDANDO_DOCUMENTOS', 'CANCELADA'],
  AGUARDANDO_DOCUMENTOS: ['DOCUMENTOS_RECEBIDOS', 'CANCELADA'],
  DOCUMENTOS_RECEBIDOS: ['ENVIADA_ADMINISTRADORA', 'CANCELADA'],
  ENVIADA_ADMINISTRADORA: ['EM_ANALISE', 'CANCELADA'],
  EM_ANALISE: ['APROVADA', 'RECUSADA', 'CANCELADA'],
  APROVADA: ['CONTRATADA', 'CANCELADA'],
  CONTRATADA: [],
  RECUSADA: [],
  CANCELADA: [],
};

export const saleOrigins = [
  'SIMULADOR_PUBLICO',
  'CRM',
  'INDICACAO',
  'WHATSAPP',
  'INSTAGRAM',
  'SITE',
  'MANUAL',
  'OUTRO',
] as const;
export const saleOriginSchema = z.enum(saleOrigins);
export type SaleOrigin = z.infer<typeof saleOriginSchema>;

export const saleCancelReasons = [
  'CLIENTE_DESISTIU',
  'CREDITO_NEGADO',
  'DOCUMENTACAO_REPROVADA',
  'VALOR_ALTERADO',
  'ESCOLHEU_CONCORRENTE',
  'OUTRO',
] as const;
export const saleCancelReasonSchema = z.enum(saleCancelReasons);

export const saleNumberSchema = z
  .string()
  .regex(/^VEN-\d{4}-\d{6}$/, 'Número de venda inválido');

export const commercialSnapshotSchema = z
  .object({
    administradoraId: z.string().nullable().optional(),
    administradoraNome: z.string().nullable().optional(),
    produtoId: z.string().nullable().optional(),
    produtoNome: z.string().nullable().optional(),
    categoria: z.string().nullable().optional(),
    plano: z.string().nullable().optional(),
    credito: z.string().nullable().optional(),
    parcela: z.string().nullable().optional(),
    prazoMeses: z.number().int().nullable().optional(),
    taxaAdministracao: z.string().nullable().optional(),
    fundoReserva: z.string().nullable().optional(),
    seguro: z.string().nullable().optional(),
    lance: z.string().nullable().optional(),
    regraComercial: z.string().nullable().optional(),
    propostaNumero: z.string().nullable().optional(),
    propostaVersao: z.number().int().nullable().optional(),
    propostaEmitidaEm: z.string().nullable().optional(),
    itemDescricao: z.string().nullable().optional(),
  })
  .catchall(z.unknown());

const actorSchema = z.object({ id: z.uuid(), nome: z.string() });

export const saleSchema = z.object({
  id: z.uuid(),
  numero: saleNumberSchema,
  leadId: z.uuid(),
  lead: z.object({ id: z.uuid(), nome: z.string() }).nullable().optional(),
  proposalId: z.uuid(),
  proposalNumero: z.string().nullable().optional(),
  proposalItemId: z.uuid().nullable().optional(),
  administradoraId: z.uuid().nullable().optional(),
  administradora: actorSchema.nullable().optional(),
  produtoId: z.uuid().nullable().optional(),
  produto: actorSchema.nullable().optional(),
  grupoId: z.uuid().nullable().optional(),
  cotaId: z.uuid().nullable().optional(),
  responsavelUserId: z.uuid(),
  responsavel: actorSchema.nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  origemVenda: saleOriginSchema,
  canalVenda: z.string().max(120).nullable().optional(),
  valorCreditoContratado: z.string(),
  valorParcelaContratada: z.string().nullable().optional(),
  prazoContratado: z.number().int().nullable().optional(),
  status: saleStatusSchema,
  dataAceite: z.iso.datetime(),
  dataVenda: z.iso.datetime().nullable().optional(),
  dataEnvioAdministradora: z.iso.datetime().nullable().optional(),
  dataContratacao: z.iso.datetime().nullable().optional(),
  dataCancelamento: z.iso.datetime().nullable().optional(),
  motivoCancelamento: saleCancelReasonSchema.nullable().optional(),
  observacoes: z.string().nullable().optional(),
  snapshot: commercialSnapshotSchema,
  createdById: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Sale = z.infer<typeof saleSchema>;

export const createSaleRequestSchema = z
  .object({
    proposalId: z.uuid(),
    proposalItemId: z.uuid(),
    grupoId: z.uuid().nullable().optional(),
    cotaId: z.uuid().nullable().optional(),
    responsavelUserId: z.uuid().optional(),
    teamId: z.uuid().nullable().optional(),
    origemVenda: saleOriginSchema.default('CRM'),
    canalVenda: z.string().trim().max(120).nullable().optional(),
    dataAceite: z.iso.datetime().optional(),
    observacoes: optionalText(2000),
  })
  .strict();
export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;

export const updateSaleRequestSchema = z
  .object({
    grupoId: z.uuid().nullable().optional(),
    cotaId: z.uuid().nullable().optional(),
    canalVenda: z.string().trim().max(120).nullable().optional(),
    observacoes: optionalText(2000).nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
  );
export type UpdateSaleRequest = z.infer<typeof updateSaleRequestSchema>;

export const changeSaleStatusRequestSchema = z
  .object({
    observacoes: optionalText(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
    status: saleStatusSchema,
  })
  .strict();
export type ChangeSaleStatusRequest = z.infer<
  typeof changeSaleStatusRequestSchema
>;

export const assignSaleRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime().optional(),
    motivo: optionalText(500),
    responsavelUserId: z.uuid(),
  })
  .strict();
export type AssignSaleRequest = z.infer<typeof assignSaleRequestSchema>;

export const cancelSaleRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime().optional(),
    motivo: saleCancelReasonSchema,
    observacoes: optionalText(2000),
  })
  .strict();
export type CancelSaleRequest = z.infer<typeof cancelSaleRequestSchema>;

export const saleListQuerySchema = z
  .object({
    administradoraId: z.uuid().optional(),
    comVenda: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    periodoDe: z.iso.date().optional(),
    periodoAte: z.iso.date().optional(),
    produtoId: z.uuid().optional(),
    responsavelUserId: z.uuid().optional(),
    search: z.string().trim().max(200).optional(),
    status: saleStatusSchema.optional(),
    teamId: z.uuid().optional(),
  })
  .strict();
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;

export const saleListResponseSchema = z.object({
  items: z.array(saleSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export const contractStatuses = [
  'RASCUNHO',
  'EMITIDO',
  'ASSINADO',
  'ATIVO',
  'CANCELADO',
] as const;
export const contractStatusSchema = z.enum(contractStatuses);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const contractTransitions: Record<ContractStatus, ContractStatus[]> = {
  RASCUNHO: ['EMITIDO', 'CANCELADO'],
  EMITIDO: ['ASSINADO', 'CANCELADO'],
  ASSINADO: ['ATIVO', 'CANCELADO'],
  ATIVO: [],
  CANCELADO: [],
};

export const saleContractSchema = z.object({
  id: z.uuid(),
  numeroContrato: z.string().nullable().optional(),
  numeroPropostaAdministradora: z.string().nullable().optional(),
  numeroCota: z.string().nullable().optional(),
  grupoCodigo: z.string().nullable().optional(),
  saleId: z.uuid(),
  statusContrato: contractStatusSchema,
  dataEmissao: z.iso.datetime().nullable().optional(),
  dataAssinatura: z.iso.datetime().nullable().optional(),
  dataInicio: z.iso.datetime().nullable().optional(),
  valorCredito: z.string().nullable().optional(),
  valorParcela: z.string().nullable().optional(),
  prazo: z.number().int().nullable().optional(),
  documentoReferencia: z.string().max(2048).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SaleContract = z.infer<typeof saleContractSchema>;

export const createContractRequestSchema = z
  .object({
    numeroContrato: z.string().trim().min(1).max(100).nullable().optional(),
    numeroPropostaAdministradora: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
    numeroCota: z.string().trim().min(1).max(50).nullable().optional(),
    grupoCodigo: z.string().trim().min(1).max(100).nullable().optional(),
    dataEmissao: z.iso.datetime().nullable().optional(),
    dataAssinatura: z.iso.datetime().nullable().optional(),
    dataInicio: z.iso.datetime().nullable().optional(),
    valorCredito: nullableMoneyString,
    valorParcela: nullableMoneyString,
    prazo: z.number().int().min(1).max(600).nullable().optional(),
    documentoReferencia: z.string().trim().max(2048).nullable().optional(),
    observacoes: optionalText(2000),
  })
  .strict();
export type CreateContractRequest = z.infer<typeof createContractRequestSchema>;

export const updateContractRequestSchema = z
  .object({
    numeroContrato: z.string().trim().min(1).max(100).nullable().optional(),
    numeroPropostaAdministradora: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
    numeroCota: z.string().trim().min(1).max(50).nullable().optional(),
    grupoCodigo: z.string().trim().min(1).max(100).nullable().optional(),
    statusContrato: contractStatusSchema.optional(),
    dataEmissao: z.iso.datetime().nullable().optional(),
    dataAssinatura: z.iso.datetime().nullable().optional(),
    dataInicio: z.iso.datetime().nullable().optional(),
    valorCredito: nullableMoneyString,
    valorParcela: nullableMoneyString,
    prazo: z.number().int().min(1).max(600).nullable().optional(),
    documentoReferencia: z.string().trim().max(2048).nullable().optional(),
    observacoes: optionalText(2000).nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
  );
export type UpdateContractRequest = z.infer<typeof updateContractRequestSchema>;

// ---------------------------------------------------------------------------
// Documentos (checklist, sem binário)
// ---------------------------------------------------------------------------

export const saleDocumentTypes = [
  'CPF',
  'RG_CNH',
  'COMPROVANTE_RESIDENCIA',
  'COMPROVANTE_RENDA',
  'FICHA_CADASTRAL',
  'CONTRATO_ASSINADO',
  'OUTRO',
] as const;
export const saleDocumentTypeSchema = z.enum(saleDocumentTypes);

export const saleDocumentStatuses = [
  'PENDENTE',
  'RECEBIDO',
  'VALIDADO',
  'REJEITADO',
  'DISPENSADO',
] as const;
export const saleDocumentStatusSchema = z.enum(saleDocumentStatuses);

export const SALE_DOCUMENT_TEMPLATE: ReadonlyArray<{
  tipo: (typeof saleDocumentTypes)[number];
  obrigatorio: boolean;
}> = [
  { tipo: 'CPF', obrigatorio: true },
  { tipo: 'RG_CNH', obrigatorio: true },
  { tipo: 'COMPROVANTE_RESIDENCIA', obrigatorio: true },
  { tipo: 'COMPROVANTE_RENDA', obrigatorio: true },
  { tipo: 'FICHA_CADASTRAL', obrigatorio: true },
  { tipo: 'CONTRATO_ASSINADO', obrigatorio: false },
];

export const saleDocumentSchema = z.object({
  id: z.uuid(),
  saleId: z.uuid(),
  status: saleDocumentStatusSchema,
  tipo: saleDocumentTypeSchema,
  obrigatorio: z.boolean(),
  referencia: z.string().max(2048).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  recebidoEm: z.iso.datetime().nullable().optional(),
  validadoEm: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SaleDocument = z.infer<typeof saleDocumentSchema>;

export const updateDocumentStatusRequestSchema = z
  .object({
    status: saleDocumentStatusSchema,
    referencia: z.string().trim().max(2048).nullable().optional(),
    observacoes: optionalText(2000).nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type UpdateDocumentStatusRequest = z.infer<
  typeof updateDocumentStatusRequestSchema
>;

// ---------------------------------------------------------------------------
// Comissão
// ---------------------------------------------------------------------------

export const commissionTypes = [
  'PRINCIPAL',
  'BONIFICACAO',
  'CAMPANHA',
  'REPASSE',
  'ESTORNO',
] as const;
export const commissionTypeSchema = z.enum(commissionTypes);
export type CommissionType = z.infer<typeof commissionTypeSchema>;

export const commissionStatuses = [
  'PREVISTA',
  'CONFIRMADA',
  'PARCIALMENTE_RECEBIDA',
  'RECEBIDA',
  'CANCELADA',
  'ESTORNADA',
] as const;
export const commissionStatusSchema = z.enum(commissionStatuses);
export type CommissionStatus = z.infer<typeof commissionStatusSchema>;

export const commissionBases = [
  'CREDITO',
  'TAXA_ADMINISTRACAO',
  'PARCELA',
  'VALOR_FIXO',
  'OUTRA',
] as const;
export const commissionBaseSchema = z.enum(commissionBases);

export const commissionSchema = z.object({
  id: z.uuid(),
  saleId: z.uuid(),
  administradoraId: z.uuid().nullable().optional(),
  tipo: commissionTypeSchema,
  status: commissionStatusSchema,
  baseCalculo: commissionBaseSchema,
  baseValor: z.string(),
  percentual: z.string().nullable().optional(),
  valorPrevisto: z.string(),
  valorConfirmado: z.string().nullable().optional(),
  valorRecebido: z.string(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida'),
  dataPrevistaPagamento: z.iso.datetime().nullable().optional(),
  dataConfirmacao: z.iso.datetime().nullable().optional(),
  dataRecebimento: z.iso.datetime().nullable().optional(),
  referenciaExterna: z.string().max(200).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  regraSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  estornoDeId: z.uuid().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Commission = z.infer<typeof commissionSchema>;

export const createCommissionRequestSchema = z
  .object({
    administradoraId: z.uuid().nullable().optional(),
    tipo: commissionTypeSchema.default('PRINCIPAL'),
    baseCalculo: commissionBaseSchema,
    baseValor: moneyString,
    percentual: percentualString.nullable().optional(),
    valorPrevisto: moneyString.optional(),
    competencia: z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida'),
    dataPrevistaPagamento: z.iso.datetime().nullable().optional(),
    referenciaExterna: z.string().trim().max(200).nullable().optional(),
    observacoes: optionalText(2000),
    regraId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.valorPrevisto !== undefined ||
      value.percentual !== undefined ||
      value.regraId !== undefined,
    'Informe valorPrevisto, percentual ou regraId',
  );
export type CreateCommissionRequest = z.infer<
  typeof createCommissionRequestSchema
>;

export const confirmCommissionRequestSchema = z
  .object({
    valorConfirmado: moneyString,
    dataConfirmacao: z.iso.datetime().optional(),
    observacoes: optionalText(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ConfirmCommissionRequest = z.infer<
  typeof confirmCommissionRequestSchema
>;

export const receiveCommissionRequestSchema = z
  .object({
    valorRecebido: moneyString,
    dataRecebimento: z.iso.datetime().optional(),
    referenciaExterna: z.string().trim().max(200).nullable().optional(),
    observacoes: optionalText(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ReceiveCommissionRequest = z.infer<
  typeof receiveCommissionRequestSchema
>;

export const reverseCommissionRequestSchema = z
  .object({
    motivo: z.enum(['CANCELAMENTO_VENDA', 'PAGAMENTO_INDEVIDO', 'OUTRO']),
    observacoes: optionalText(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ReverseCommissionRequest = z.infer<
  typeof reverseCommissionRequestSchema
>;

export const commissionListQuerySchema = z
  .object({
    administradoraId: z.uuid().optional(),
    competencia: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Competência inválida')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    periodoDe: z.iso.date().optional(),
    periodoAte: z.iso.date().optional(),
    recebida: z.enum(['true', 'false']).optional(),
    responsavelUserId: z.uuid().optional(),
    saleId: z.uuid().optional(),
    status: commissionStatusSchema.optional(),
    teamId: z.uuid().optional(),
    tipo: commissionTypeSchema.optional(),
  })
  .strict();
export type CommissionListQuery = z.infer<typeof commissionListQuerySchema>;

export const commissionListResponseSchema = z.object({
  items: z.array(commissionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  resumo: z.object({
    aReceber: z.string(),
    confirmadas: z.string(),
    estornadas: z.string(),
    previstas: z.string(),
    recebidas: z.string(),
  }),
  total: z.number().int(),
  totalPages: z.number().int(),
});

// ---------------------------------------------------------------------------
// Regra de comissão
// ---------------------------------------------------------------------------

export const commissionRuleSchema = z.object({
  id: z.uuid(),
  administradoraId: z.uuid(),
  produtoId: z.uuid().nullable().optional(),
  categoria: z.string().nullable().optional(),
  tipoBase: commissionBaseSchema,
  percentual: z.string().nullable().optional(),
  valorFixo: z.string().nullable().optional(),
  vigenciaInicio: z.iso.date(),
  vigenciaFim: z.iso.date().nullable().optional(),
  ativo: z.boolean(),
  prioridade: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CommissionRule = z.infer<typeof commissionRuleSchema>;

export const createCommissionRuleRequestSchema = z
  .object({
    administradoraId: z.uuid(),
    produtoId: z.uuid().nullable().optional(),
    categoria: z.string().trim().max(80).nullable().optional(),
    tipoBase: commissionBaseSchema,
    percentual: percentualString.nullable().optional(),
    valorFixo: optionalMoneyString,
    vigenciaInicio: z.iso.date(),
    vigenciaFim: z.iso.date().nullable().optional(),
    ativo: z.boolean().default(true),
    prioridade: z.number().int().min(0).max(1000).default(0),
  })
  .strict()
  .refine(
    (value) => value.percentual !== undefined || value.valorFixo !== undefined,
    'Informe percentual ou valorFixo',
  );
export type CreateCommissionRuleRequest = z.infer<
  typeof createCommissionRuleRequestSchema
>;

export const updateCommissionRuleRequestSchema = z
  .object({
    produtoId: z.uuid().nullable().optional(),
    categoria: z.string().trim().max(80).nullable().optional(),
    tipoBase: commissionBaseSchema.optional(),
    percentual: percentualString.nullable().optional(),
    valorFixo: moneyString.nullable().optional(),
    vigenciaInicio: z.iso.date().optional(),
    vigenciaFim: z.iso.date().nullable().optional(),
    ativo: z.boolean().optional(),
    prioridade: z.number().int().min(0).max(1000).optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
  );
export type UpdateCommissionRuleRequest = z.infer<
  typeof updateCommissionRuleRequestSchema
>;

export const commissionRuleListQuerySchema = z
  .object({
    administradoraId: z.uuid().optional(),
    ativo: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type CommissionRuleListQuery = z.infer<
  typeof commissionRuleListQuerySchema
>;

export const commissionRuleListResponseSchema = z.object({
  items: z.array(commissionRuleSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const saleDetailSchema = saleSchema.extend({
  auditTrail: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      entity: z.string(),
      createdAt: z.iso.datetime(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  commissions: z.array(commissionSchema),
  commissionsHidden: z.boolean(),
  contracts: z.array(saleContractSchema),
  documents: z.array(saleDocumentSchema),
  statusHistory: z.array(
    z.object({
      id: z.uuid(),
      fromStatus: saleStatusSchema.nullable(),
      toStatus: saleStatusSchema,
      reason: z.string().nullable(),
      changedBy: z.object({ id: z.uuid(), nome: z.string() }),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type SaleDetail = z.infer<typeof saleDetailSchema>;
