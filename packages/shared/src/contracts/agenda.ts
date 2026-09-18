import { z } from 'zod';

import { followUpTypeSchema } from './follow-ups.js';
import { leadStatusSchema } from './leads.js';
import { produtoCategoriaSchema } from './operacional.js';

export const agendaItemKinds = [
  'FOLLOWUP_OVERDUE',
  'FOLLOWUP_TODAY',
  'FOLLOWUP_UPCOMING',
  'PROPOSAL_NO_FOLLOWUP',
  'SALE_AWAITING_DOCUMENTS',
  'NO_NEXT_ACTION',
  'STALE_CONTACT',
] as const;
export const agendaItemKindSchema = z.enum(agendaItemKinds);

/**
 * Prioridade operacional determinística e explicável (sem score oculto):
 * 1 atrasados, 2 vencem hoje, 3 proposta sem retorno ou venda aguardando
 * documentos, 4 sem próxima ação, 5 contato desatualizado, 6 demais próximos.
 */
export const agendaItemSchema = z.object({
  categoria: produtoCategoriaSchema.nullable(),
  dueAt: z.iso.datetime().nullable(),
  followUpId: z.uuid().nullable(),
  followUpTitle: z.string().nullable(),
  followUpType: followUpTypeSchema.nullable(),
  kind: agendaItemKindSchema,
  leadId: z.uuid(),
  leadNome: z.string(),
  leadStatus: leadStatusSchema,
  priority: z.number().int().min(1).max(6),
  reason: z.string().min(1),
  responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
});

export const agendaDistributionSchema = z.object({
  nome: z.string(),
  overdue: z.number().int(),
  today: z.number().int(),
  userId: z.uuid(),
});

export const agendaResponseSchema = z.object({
  completedToday: z.number().int(),
  distribution: z.array(agendaDistributionSchema),
  noNextAction: z.array(agendaItemSchema),
  overdue: z.array(agendaItemSchema),
  proposalsAwaiting: z.array(agendaItemSchema),
  salesAwaiting: z.array(agendaItemSchema),
  staleContacts: z.array(agendaItemSchema),
  today: z.array(agendaItemSchema),
  totals: z.object({
    noNextAction: z.number().int(),
    overdue: z.number().int(),
    proposalsAwaiting: z.number().int(),
    salesAwaiting: z.number().int(),
    staleContacts: z.number().int(),
    today: z.number().int(),
    upcoming: z.number().int(),
  }),
  upcoming: z.array(agendaItemSchema),
  withoutFutureAgenda: z.array(
    z.object({ nome: z.string(), userId: z.uuid() }),
  ),
});

export const agendaQuerySchema = z
  .object({
    categoria: produtoCategoriaSchema.optional(),
    days: z.coerce.number().int().min(1).max(30).default(7),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    responsavelId: z.uuid().optional(),
    semResponsavel: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    stage: leadStatusSchema.optional(),
    teamId: z.uuid().optional(),
    type: followUpTypeSchema.optional(),
  })
  .strict();

export type AgendaItem = z.infer<typeof agendaItemSchema>;
export type AgendaResponse = z.infer<typeof agendaResponseSchema>;
export type AgendaQuery = z.infer<typeof agendaQuerySchema>;
