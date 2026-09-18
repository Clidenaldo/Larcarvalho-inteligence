import { z } from 'zod';

export const analyticsEventTypes = [
  'LANDING_VIEWED',
  'LANDING_CTA_CLICKED',
  'SIMULATION_STARTED',
  'SIMULATION_COMPLETED',
  'RESULTS_VIEWED',
  'LEAD_FORM_OPENED',
  'LEAD_FORM_SUBMITTED',
  'LEAD_CREATED',
  'LEAD_CREATION_FAILED',
  'WHATSAPP_CLICKED',
  'PRIVACY_VIEWED',
] as const;
export const analyticsEventTypeSchema = z.enum(analyticsEventTypes);
export const analyticsDeviceSchema = z.enum([
  'DESKTOP',
  'MOBILE',
  'TABLET',
  'UNKNOWN',
]);
export const analyticsCategorySchema = z.enum([
  'IMOVEL',
  'AUTOMOVEL',
  'MOTOCICLETA',
  'PESADOS',
  'SERVICOS',
  'OUTROS',
]);
export const analyticsCreditBandSchema = z.enum([
  'CREDIT_0_100K',
  'CREDIT_100K_300K',
  'CREDIT_300K_500K',
  'CREDIT_500K_PLUS',
]);
const text = (max: number) => z.string().trim().max(max).optional().nullable();
export const analyticsEventRequestSchema = z
  .object({
    anonymousId: z.uuid(),
    type: analyticsEventTypeSchema,
    path: z.string().trim().min(1).max(200),
    category: analyticsCategorySchema.optional().nullable(),
    metadata: z
      .object({
        creditBand: analyticsCreditBandSchema.optional().nullable(),
        deviceClass: analyticsDeviceSchema.optional(),
      })
      .strict()
      .optional(),
    utmSource: text(100),
    utmMedium: text(100),
    utmCampaign: text(150),
    utmContent: text(150),
    utmTerm: text(150),
    referrerHost: text(255),
  })
  .strict();
export const analyticsPeriodSchema = z.enum([
  'today',
  '7d',
  '30d',
  '90d',
  'custom',
]);
export const analyticsQuerySchema = z
  .object({
    period: analyticsPeriodSchema.default('30d'),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.period === 'custom' && (!value.from || !value.to))
      ctx.addIssue({
        code: 'custom',
        message: 'Período personalizado exige from e to',
      });
    if (value.from && value.to && new Date(value.from) >= new Date(value.to))
      ctx.addIssue({ code: 'custom', message: 'from deve ser anterior a to' });
  });
const row = z.object({
  key: z.string(),
  label: z.string(),
  simulations: z.number().int(),
  leads: z.number().int(),
  conversion: z.number().nullable(),
});
export const analyticsOverviewSchema = z.object({
  period: analyticsPeriodSchema,
  from: z.string(),
  to: z.string(),
  visits: z.number().int().nonnegative(),
  simulationsStarted: z.number().int().nonnegative(),
  simulationsCompleted: z.number().int().nonnegative(),
  resultsViewed: z.number().int().nonnegative(),
  formsOpened: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  whatsappClicks: z.number().int().nonnegative(),
  rates: z.object({
    landingToSimulation: z.number().nullable(),
    startedToCompleted: z.number().nullable(),
    resultsToForm: z.number().nullable(),
    formToLead: z.number().nullable(),
    completedToLead: z.number().nullable(),
    landingToLead: z.number().nullable(),
  }),
  campaigns: z.array(
    row.extend({
      campaign: z.string(),
      source: z.string(),
      medium: z.string(),
      visits: z.number().int(),
    }),
  ),
  channels: z.array(
    row.extend({
      source: z.string(),
      medium: z.string(),
      referrerHost: z.string(),
      visits: z.number().int(),
    }),
  ),
  categories: z.array(row),
  devices: z.array(
    row.extend({ device: z.string(), visits: z.number().int() }),
  ),
});
export type AnalyticsEventRequest = z.infer<typeof analyticsEventRequestSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;
