import { z } from 'zod';

import { leadDetailSchema, leadStatusSchema } from './leads.js';
import { produtoCategoriaSchema } from './operacional.js';

export const followUpTypes = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'OTHER',
] as const;
export const followUpTypeSchema = z.enum(followUpTypes);
export const followUpStatuses = ['PENDING', 'COMPLETED', 'CANCELED'] as const;
export const followUpStatusSchema = z.enum(followUpStatuses);

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const actorSchema = z.object({ id: z.uuid(), nome: z.string() });

export const followUpSchema = z.object({
  assignedUser: actorSchema.nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: actorSchema.nullable(),
  dueAt: z.iso.datetime(),
  id: z.uuid(),
  isOverdue: z.boolean(),
  lead: z.object({ id: z.uuid(), nome: z.string() }),
  leadId: z.uuid(),
  notes: z.string().nullable(),
  status: followUpStatusSchema,
  title: z.string(),
  type: followUpTypeSchema,
  updatedAt: z.iso.datetime(),
});

export const createFollowUpRequestSchema = z
  .object({
    assignedUserId: z.uuid().nullable().optional(),
    dueAt: z.iso.datetime(),
    leadId: z.uuid(),
    notes: optionalText(2000),
    title: z.string().trim().min(1).max(200),
    type: followUpTypeSchema.default('CALL'),
  })
  .strict();

export const updateFollowUpRequestSchema = z
  .object({
    assignedUserId: z.uuid().nullable().optional(),
    dueAt: z.iso.datetime().optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
    notes: optionalText(2000).nullable(),
    title: z.string().trim().min(1).max(200).optional(),
    type: followUpTypeSchema.optional(),
  })
  .strict()
  .refine((value) =>
    Object.keys(value).some((key) => key !== 'expectedUpdatedAt'),
  );

export const setFollowUpStatusRequestSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime().optional(),
    status: z.enum(['COMPLETED', 'CANCELED']),
  })
  .strict();

export const followUpListQuerySchema = z
  .object({
    assignedToMe: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    leadId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    scope: z.enum(['today', 'overdue', 'upcoming', 'all']).default('all'),
    sort: z.enum(['dueAt', 'createdAt']).default('dueAt'),
    status: followUpStatusSchema.optional(),
  })
  .strict();

export const followUpListResponseSchema = z.object({
  items: z.array(followUpSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const timelineKinds = [
  'LEAD_CREATED',
  'INTERACTION',
  'SIMULATION_CREATED',
  'PROPOSAL_CREATED',
  'PROPOSAL_STATUS_CHANGED',
  'FOLLOWUP_SCHEDULED',
  'FOLLOWUP_COMPLETED',
  'FOLLOWUP_CANCELED',
  'SALE_CREATED',
  'SALE_STATUS_CHANGED',
  'CONTRACT_CREATED',
  'CONTRACT_STATUS_CHANGED',
  'COMMISSION_CREATED',
  'COMMISSION_STATUS_CHANGED',
] as const;
export const timelineKindSchema = z.enum(timelineKinds);

export const timelineItemSchema = z.object({
  actorName: z.string().nullable(),
  id: z.string(),
  kind: timelineKindSchema,
  occurredAt: z.iso.datetime(),
  origin: z.enum(['followup', 'interaction', 'lead', 'proposal', 'simulation', 'sale', 'contract', 'commission']),
  summary: z.string(),
});

export const customerTimelineResponseSchema = z.object({
  items: z.array(timelineItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const profileCompletenessSchema = z.object({
  missingFields: z.array(z.string()),
  percent: z.number().int().min(0).max(100),
});

export const portfolioSummarySchema = z.object({
  followUpsToday: z.number().int(),
  incompleteProfiles: z.number().int(),
  overdueFollowUps: z.number().int(),
  proposalsAwaiting: z.number().int(),
  staleContacts: z.number().int(),
  totalLeads: z.number().int(),
});

export const myFollowUpsResponseSchema = z.object({
  overdue: z.array(followUpSchema),
  today: z.array(followUpSchema),
  upcoming: z.array(followUpSchema),
});

export const walletSorts = [
  'proximoFollowUp',
  'ultimoContato',
  'criacao',
  'nome',
] as const;

export const walletQuerySchema = z
  .object({
    categoria: produtoCategoriaSchema.optional(),
    comProposta: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    comVenda: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    emContratacao: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    contratada: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    vendaCancelada: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    comSimulacao: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    followUp: z.enum(['overdue', 'today', 'upcoming', 'none']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    perfilIncompleto: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    responsavelId: z.uuid().optional(),
    semContatoRecente: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    sort: z.enum(walletSorts).default('proximoFollowUp'),
    status: leadStatusSchema.optional(),
    teamId: z.uuid().optional(),
  })
  .strict();

export const walletItemSchema = z.object({
  activeFollowUps: z.number().int(),
  completeness: z.number().int().min(0).max(100),
  hasProposal: z.boolean(),
  hasSimulation: z.boolean(),
  hasSale: z.boolean(),
  saleStatus: z.string().nullable(),
  saleNumero: z.string().nullable(),
  id: z.uuid(),
  nome: z.string(),
  overdueFollowUps: z.number().int(),
  proximoContatoEm: z.iso.datetime().nullable(),
  responsavel: actorSchema.nullable(),
  status: leadStatusSchema,
  ultimoContatoEm: z.iso.datetime().nullable(),
});

export const walletResponseSchema = z.object({
  items: z.array(walletItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const customer360ResponseSchema = z.object({
  activeFollowUps: z.array(followUpSchema),
  completeness: profileCompletenessSchema,
  lead: leadDetailSchema,
  proposalCount: z.number().int(),
  recentTimeline: z.array(timelineItemSchema),
  saleCount: z.number().int(),
  simulationCount: z.number().int(),
});

export type FollowUp = z.infer<typeof followUpSchema>;
export type CreateFollowUpRequest = z.infer<typeof createFollowUpRequestSchema>;
export type UpdateFollowUpRequest = z.infer<typeof updateFollowUpRequestSchema>;
export type SetFollowUpStatusRequest = z.infer<typeof setFollowUpStatusRequestSchema>;
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type ProfileCompleteness = z.infer<typeof profileCompletenessSchema>;
export type PortfolioSummary = z.infer<typeof portfolioSummarySchema>;
export type WalletQuery = z.infer<typeof walletQuerySchema>;
export type WalletItem = z.infer<typeof walletItemSchema>;
export type Customer360Response = z.infer<typeof customer360ResponseSchema>;
