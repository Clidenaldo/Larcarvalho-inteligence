import { z } from 'zod';

import { dashboardPeriodSchema } from './dashboard.js';

export const commercialScopes = ['OWN', 'TEAM', 'ALL'] as const;
export const commercialScopeSchema = z.enum(commercialScopes);

export const commercialIntelligenceQuerySchema = z
  .object({
    period: dashboardPeriodSchema.default('30d'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    scope: commercialScopeSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.period === 'custom' && (!value.from || !value.to))
      context.addIssue({ code: 'custom', message: 'from e to sao obrigatorios' });
    if (value.period !== 'custom' && (value.from || value.to))
      context.addIssue({ code: 'custom', message: 'datas exigem period=custom' });
    if (value.from && value.to && value.from > value.to)
      context.addIssue({ code: 'custom', message: 'periodo invalido' });
    if (value.from && value.to && (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 > 365)
      context.addIssue({ code: 'custom', message: 'periodo maximo de 365 dias' });
  });

const comparisonSchema = z.object({
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
  changePercent: z.number().nullable(),
});
const moneySchema = z.string().regex(/^-?\d+\.\d{2}$/);
const stageSchema = z.object({
  key: z.string(), label: z.string(), count: z.number().int().nonnegative(),
  href: z.string().startsWith('/'),
});

export const commercialIntelligenceSchema = z.object({
  generatedAt: z.iso.datetime(),
  scope: commercialScopeSchema,
  availableScopes: z.array(commercialScopeSchema),
  period: z.object({
    preset: dashboardPeriodSchema, label: z.string(), timezone: z.literal('America/Fortaleza'),
    from: z.iso.datetime(), toExclusive: z.iso.datetime(),
    previousFrom: z.iso.datetime(), previousToExclusive: z.iso.datetime(),
  }),
  summary: z.object({
    activeClients: z.number().int(), pendingFollowUps: z.number().int(), overdueFollowUps: z.number().int(),
    simulations: comparisonSchema, proposals: comparisonSchema, acceptedProposals: comparisonSchema,
    openSales: z.number().int(), completedSales: comparisonSchema, canceledSales: comparisonSchema,
    pendingDocuments: z.number().int(), pendingContracts: z.number().int(),
  }),
  financial: z.object({
    expected: moneySchema, confirmed: moneySchema, received: moneySchema, confirmedReceivable: moneySchema,
  }).optional(),
  pipeline: z.array(stageSchema),
  conversions: z.array(z.object({
    key: z.string(), label: z.string(), numerator: z.number().int(), denominator: z.number().int(), rate: z.number().nullable(),
  })),
  attention: z.array(z.object({
    type: z.string(), severity: z.enum(['HIGH', 'MEDIUM', 'LOW']), reason: z.string(),
    count: z.number().int(), href: z.string().startsWith('/'),
  })),
  performance: z.array(z.object({
    sellerId: z.uuid(), seller: z.string(), activeClients: z.number().int(), overdueFollowUps: z.number().int(),
    simulations: z.number().int(), proposals: z.number().int(), acceptedProposals: z.number().int(), sales: z.number().int(), contracts: z.number().int(),
  })),
  timeseries: z.array(z.object({ date: z.string(), simulations: z.number().int(), proposals: z.number().int(), sales: z.number().int() })),
  sources: z.array(z.string()),
});

export type CommercialIntelligenceQuery = z.infer<typeof commercialIntelligenceQuerySchema>;
export type CommercialIntelligence = z.infer<typeof commercialIntelligenceSchema>;
