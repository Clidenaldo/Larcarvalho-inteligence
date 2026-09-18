import { z } from 'zod';

import { produtoCategoriaSchema } from './operacional.js';

const id = z.uuid();
const iso = z.iso.datetime();
const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value),
    'Valor monetário inválido',
  )
  .refine((value) => Number(value) >= 0 && Number(value) <= 100_000_000);
const positiveMoney = money.refine((value) => Number(value) > 0);
const percentage = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine((value) => /^\d+(\.\d{1,6})?$/.test(value), 'Percentual inválido')
  .refine((value) => Number(value) >= 0 && Number(value) <= 100);
const nullableMoney = z.string().nullable();

export const simulationCreditModeSchema = z.enum([
  'CONTRACTED_CREDIT',
  'NET_CREDIT',
  'CATEGORY_VALUE',
]);
export const embeddedBidBasisSchema = z.enum([
  'CONTRACTED_CREDIT',
  'PLAN_TOTAL',
]);
export const bidTypeSchema = z.enum(['FIXED', 'FREE', 'PERCENTUAL']);
export const simulationStatusSchema = z.enum([
  'DRAFT',
  'CALCULATED',
  'ARCHIVED',
]);
export const simulationCalculationStatusSchema = z.enum([
  'COMPLETE',
  'INCOMPLETE_DATA',
  'INELIGIBLE',
]);
export const simulationResultBadgeSchema = z.enum([
  'LOWEST_INSTALLMENT',
  'HIGHEST_NET_CREDIT',
  'SHORTEST_TERM',
  'BEST_ADHERENCE',
  'PENDING_DATA',
  'INELIGIBLE',
]);
export const simulationSortSchema = z.enum([
  'LOWEST_INSTALLMENT',
  'HIGHEST_NET_CREDIT',
  'SHORTEST_TERM',
  'ADHERENCE',
]);
export const proposalStatusSchema = z.enum([
  'DRAFT',
  'GENERATED',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
]);

const selectionSchema = z.array(id).max(100).default([]);
export const createSimulationRequestSchema = z
  .object({
    leadId: id.optional(),
    category: produtoCategoriaSchema,
    creditMode: simulationCreditModeSchema,
    requestedCredit: positiveMoney,
    desiredTermMonths: z.coerce.number().int().min(1).max(1200),
    ownBidAmount: money.default('0'),
    embeddedBidPercent: percentage.default('0'),
    includeInsurance: z.boolean().default(true),
    includeEmbeddedBid: z.boolean().default(true),
    paidInstallments: z.coerce.number().int().min(0).max(1200).default(0),
    structuredOperation: z.boolean().default(false),
    administratorIds: selectionSchema,
    productIds: selectionSchema,
    groupIds: selectionSchema,
    quotaIds: selectionSchema,
    notes: z.string().trim().max(1000).optional(),
    sort: simulationSortSchema.default('ADHERENCE'),
  })
  .strict();

export const updateSimulationRequestSchema = createSimulationRequestSchema
  .omit({ sort: true })
  .partial()
  .extend({ status: simulationStatusSchema.optional() })
  .strict();

export const simulationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: produtoCategoriaSchema.optional(),
  status: simulationStatusSchema.optional(),
  leadId: id.optional(),
  createdById: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const calculateSimulationRequestSchema = z
  .object({
    sort: simulationSortSchema.default('ADHERENCE'),
    scenarioName: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .default('Cenário principal'),
    pin: z.boolean().default(false),
    termMonths: z.coerce.number().int().min(1).max(1200).optional(),
    includeInsurance: z.boolean().default(true),
    includeEmbeddedBid: z.boolean().default(true),
  })
  .strict();

export const simulationResultSchema = z.object({
  id,
  comparisonContext: z.object({
    paidInstallments: z.number().int().nonnegative().nullable(),
    administrationFeePercent: z.string().nullable(),
    maxEmbeddedBidPercent: z.string().nullable(),
    diluteReducedInstallments: z.boolean().nullable(),
    reducedUntilContemplation: z.boolean().nullable(),
    includeInsurance: z.boolean().nullable(),
  }).optional(),
  badges: z.array(simulationResultBadgeSchema),
  calculationStatus: simulationCalculationStatusSchema,
  calculationWarnings: z.array(z.string()),
  ruleVersion: z.string(),
  sourceDataUpdatedAt: iso,
  administratorId: id,
  administratorName: z.string(),
  productId: id.nullable(),
  productName: z.string().nullable(),
  groupId: id.nullable(),
  groupCode: z.string().nullable(),
  quotaId: id.nullable(),
  quotaNumber: z.string().nullable(),
  category: produtoCategoriaSchema,
  contractedCredit: nullableMoney,
  netCredit: nullableMoney,
  totalTermMonths: z.number().int().nullable(),
  remainingTermMonths: z.number().int().nullable(),
  initialInstallment: nullableMoney,
  reducedInstallment: nullableMoney,
  laterInstallment: nullableMoney,
  ownBidAmount: nullableMoney,
  embeddedBidAmount: nullableMoney,
  totalBidAmount: nullableMoney,
  totalBidPercent: z.string().nullable(),
  administrationFee: nullableMoney,
  reserveFund: nullableMoney,
  insurance: nullableMoney,
  adhesionFee: nullableMoney,
  adherenceScore: z.number().int().min(0).max(100).nullable(),
  assumptions: z.array(z.string()),
});

export const simulationScenarioSchema = z.object({
  id,
  name: z.string(),
  sort: simulationSortSchema,
  pinned: z.boolean(),
  calculatedAt: iso.nullable(),
  engineVersion: z.string().nullable(),
  results: z.array(simulationResultSchema),
});

export const simulationSchema = z.object({
  id,
  number: z.string(),
  createdById: id,
  createdByName: z.string(),
  leadId: id.nullable(),
  leadName: z.string().nullable(),
  category: produtoCategoriaSchema,
  creditMode: simulationCreditModeSchema,
  requestedCredit: z.string(),
  desiredTermMonths: z.number().int(),
  ownBidAmount: z.string(),
  embeddedBidPercent: z.string(),
  paidInstallments: z.number().int(),
  structuredOperation: z.boolean(),
  administratorIds: z.array(id),
  productIds: z.array(id),
  groupIds: z.array(id),
  quotaIds: z.array(id),
  status: simulationStatusSchema,
  notes: z.string().nullable(),
  favorite: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
  scenarios: z.array(simulationScenarioSchema).optional(),
});

export const simulationListResponseSchema = z.object({
  items: z.array(simulationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const simulationCatalogFavoriteTypeSchema = z.enum([
  'ADMINISTRATOR',
  'PRODUCT',
]);
export const simulationCatalogFavoritesSchema = z.object({
  administratorIds: z.array(id),
  productIds: z.array(id),
});

export const commercialConfigurationSchema = z.object({
  id,
  organizationName: z.string(),
  currency: z.literal('BRL'),
  roundingMode: z.enum(['HALF_UP', 'UP', 'DOWN']),
  proposalValidityDays: z.number().int(),
  ruleVersionPrefix: z.string(),
  requiredDisclaimer: z.string(),
  active: z.boolean(),
  version: z.number().int(),
  createdAt: iso,
  updatedAt: iso,
});
export const updateCommercialConfigurationRequestSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(200).optional(),
    roundingMode: z.enum(['HALF_UP', 'UP', 'DOWN']).optional(),
    proposalValidityDays: z.coerce.number().int().min(1).max(365).optional(),
    ruleVersionPrefix: z.string().trim().min(1).max(20).optional(),
    requiredDisclaimer: z.string().trim().min(20).max(1000).optional(),
    active: z.boolean().optional(),
  })
  .strict();

const commercialRuleFields = {
  administradoraId: id,
  produtoId: id.nullable().optional(),
  category: produtoCategoriaSchema,
  name: z.string().trim().min(2).max(200),
  validFrom: z.iso.datetime(),
  validUntil: z.iso.datetime().nullable().optional(),
  administrationFeePercent: percentage.nullable().optional(),
  administrationFeeAmount: money.nullable().optional(),
  reserveFundPercent: percentage.nullable().optional(),
  insurancePercent: percentage.nullable().optional(),
  insuranceAmount: money.nullable().optional(),
  adhesionFeePercent: percentage.nullable().optional(),
  adhesionFeeAmount: money.nullable().optional(),
  maxEmbeddedBidPercent: percentage.nullable().optional(),
  embeddedBidBasis: embeddedBidBasisSchema.default('CONTRACTED_CREDIT'),
  minimumTermMonths: z.coerce
    .number()
    .int()
    .min(1)
    .max(1200)
    .nullable()
    .optional(),
  maximumTermMonths: z.coerce
    .number()
    .int()
    .min(1)
    .max(1200)
    .nullable()
    .optional(),
  reducedInstallmentPercent: percentage.nullable().optional(),
  reducedUntilContemplation: z.boolean().default(false),
  diluteReducedInstallments: z.boolean().default(false),
  categoryValueCreditRatio: percentage.nullable().optional(),
  bidType: bidTypeSchema.default('FREE'),
  ownBidMaxPercent: percentage.nullable().optional(),
  inProgressAllowed: z.boolean().default(false),
  structuredOperationEligible: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
};
export const createProductCommercialRuleRequestSchema = z
  .object(commercialRuleFields)
  .strict();
export const updateProductCommercialRuleRequestSchema = z
  .object(commercialRuleFields)
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict();
export const productCommercialRuleSchema = z.object({
  id,
  ...z.object(commercialRuleFields).shape,
  produtoId: id.nullable(),
  productName: z.string().nullable(),
  administratorName: z.string(),
  version: z.number().int(),
  active: z.boolean(),
  createdAt: iso,
  updatedAt: iso,
});
export const productCommercialRuleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: produtoCategoriaSchema.optional(),
  administradoraId: id.optional(),
  produtoId: id.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export const productCommercialRuleListResponseSchema = z.object({
  items: z.array(productCommercialRuleSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const createProposalRequestSchema = z
  .object({
    leadId: id,
    resultIds: z.array(id).min(1).max(3),
    title: z.string().trim().min(2).max(200),
    objectiveSummary: z.string().trim().min(10).max(1000),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export const updateProposalStatusRequestSchema = z
  .object({
    status: proposalStatusSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export const updateProposalRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    objectiveSummary: z.string().trim().min(10).max(1000).optional(),
    title: z.string().trim().min(2).max(200).optional(),
  })
  .strict()
  .refine((value) =>
    ['title', 'objectiveSummary', 'notes'].some(
      (key) => value[key as 'title' | 'objectiveSummary' | 'notes'] !== undefined,
    ),
  );
export const createProposalVersionRequestSchema = z
  .object({
    notes: z.string().trim().max(2000).nullable().optional(),
    objectiveSummary: z.string().trim().min(10).max(1000).optional(),
    title: z.string().trim().min(2).max(200).optional(),
  })
  .strict();
export const proposalVersionChainSchema = z.object({
  currentId: z.string(),
  items: z.array(
    z.object({
      createdAt: iso,
      id,
      number: z.string(),
      status: proposalStatusSchema,
      version: z.number().int(),
    }),
  ),
  rootId: z.string(),
});
export const proposalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: proposalStatusSchema.optional(),
  category: produtoCategoriaSchema.optional(),
  administratorId: id.optional(),
  leadId: id.optional(),
  createdById: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export const proposalSchema = z.object({
  id,
  number: z.string(),
  parentId: id.nullable(),
  simulationId: id,
  createdById: id,
  sellerName: z.string(),
  leadId: id,
  clientName: z.string(),
  status: proposalStatusSchema,
  title: z.string(),
  objectiveSummary: z.string(),
  notes: z.string().nullable(),
  version: z.number().int(),
  issuedAt: iso.nullable(),
  validUntil: iso,
  createdAt: iso,
  updatedAt: iso,
  items: z.array(
    z.object({
      id,
      resultId: id.nullable(),
      position: z.number().int(),
      description: z.string(),
      financialSnapshot: simulationResultSchema.omit({ id: true }),
    }),
  ),
  statusHistory: z.array(
    z.object({
      id,
      fromStatus: proposalStatusSchema.nullable(),
      toStatus: proposalStatusSchema,
      changedById: id,
      reason: z.string().nullable(),
      createdAt: iso,
    }),
  ),
});
export const proposalListResponseSchema = z.object({
  items: z.array(proposalSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type CreateSimulationRequest = z.infer<
  typeof createSimulationRequestSchema
>;
export type UpdateSimulationRequest = z.infer<
  typeof updateSimulationRequestSchema
>;
export type SimulationListQuery = z.infer<typeof simulationListQuerySchema>;
export type CalculateSimulationRequest = z.infer<
  typeof calculateSimulationRequestSchema
>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type SimulationResultBadge = z.infer<typeof simulationResultBadgeSchema>;
export type Simulation = z.infer<typeof simulationSchema>;
export type SimulationListResponse = z.infer<
  typeof simulationListResponseSchema
>;
export type SimulationCatalogFavorites = z.infer<
  typeof simulationCatalogFavoritesSchema
>;
export type CommercialConfiguration = z.infer<
  typeof commercialConfigurationSchema
>;
export type UpdateCommercialConfigurationRequest = z.infer<
  typeof updateCommercialConfigurationRequestSchema
>;
export type CreateProductCommercialRuleRequest = z.infer<
  typeof createProductCommercialRuleRequestSchema
>;
export type UpdateProductCommercialRuleRequest = z.infer<
  typeof updateProductCommercialRuleRequestSchema
>;
export type ProductCommercialRule = z.infer<typeof productCommercialRuleSchema>;
export type ProductCommercialRuleListQuery = z.infer<
  typeof productCommercialRuleListQuerySchema
>;
export type CreateProposalRequest = z.infer<typeof createProposalRequestSchema>;
export type UpdateProposalStatusRequest = z.infer<
  typeof updateProposalStatusRequestSchema
>;
export type UpdateProposalRequest = z.infer<typeof updateProposalRequestSchema>;
export type CreateProposalVersionRequest = z.infer<
  typeof createProposalVersionRequestSchema
>;
export type ProposalVersionChain = z.infer<typeof proposalVersionChainSchema>;
export type ProposalListQuery = z.infer<typeof proposalListQuerySchema>;
export type Proposal = z.infer<typeof proposalSchema>;
