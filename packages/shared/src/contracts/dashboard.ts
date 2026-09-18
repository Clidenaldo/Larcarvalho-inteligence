import { z } from 'zod';

export const dashboardPeriods = [
  'today',
  '7d',
  '30d',
  '90d',
  'custom',
] as const;
export const dashboardPeriodSchema = z.enum(dashboardPeriods);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const dashboardQuerySchema = z
  .object({
    period: dashboardPeriodSchema.default('30d'),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    responsibleId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.period === 'custom' && (!value.from || !value.to)) {
      context.addIssue({
        code: 'custom',
        message: 'from e to são obrigatórios no período personalizado',
      });
    }
    if (value.period !== 'custom' && (value.from || value.to)) {
      context.addIssue({
        code: 'custom',
        message: 'from e to só podem ser usados com period=custom',
      });
    }
    if (value.from && value.to) {
      const from = Date.parse(`${value.from}T00:00:00-03:00`);
      const to = Date.parse(`${value.to}T00:00:00-03:00`);
      if (from > to)
        context.addIssue({
          code: 'custom',
          message: 'from deve ser anterior ou igual a to',
        });
      if ((to - from) / 86_400_000 + 1 > 365)
        context.addIssue({
          code: 'custom',
          message: 'O período máximo é de 365 dias',
        });
    }
  });

const countItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number().int().nonnegative(),
});
const comparisonSchema = z.object({
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
  changePercent: z.number().nullable(),
});
const recentItemSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  status: z.string(),
  occurredAt: z.iso.datetime(),
  href: z.string().startsWith('/dashboard/'),
});

const consorciosSchema = z.object({
  totals: z.object({
    administradorasAtivas: z.number().int(),
    produtosAtivos: z.number().int(),
    gruposAtivos: z.number().int(),
    cotasAtivas: z.number().int(),
    assembleias: z.number().int(),
    lances: z.number().int(),
    contemplacoes: z.number().int(),
  }),
  categories: z.array(countItemSchema),
  administrators: z.array(countItemSchema),
  creditBands: z.array(countItemSchema),
  snapshots: z.object({
    total: z.number().int(),
    staleGroups: z.number().int(),
    averageBidCoverage: z.number().nullable(),
    averageAwardCoverage: z.number().nullable(),
    staleAfterDays: z.number().int(),
  }),
});
const qualitySchema = z.object({
  statuses: z.array(countItemSchema),
  severities: z.array(countItemSchema),
  resolvedInPeriod: comparisonSchema,
  topRules: z.array(countItemSchema),
  criticalOpen: z.number().int(),
});
const integrationsSchema = z.object({
  statuses: z.array(countItemSchema),
  runs: z.array(countItemSchema),
  successRate: z.number().nullable(),
  averageDurationMs: z.number().nullable(),
  processedRecords: z.number().int(),
  lastSuccessAt: z.iso.datetime().nullable(),
  recent: z.array(recentItemSchema),
});
const importsSchema = z.object({
  statuses: z.array(countItemSchema),
  processedRecords: z.number().int(),
  generatedIssues: z.number().int(),
  recent: z.array(recentItemSchema),
});
const crmSchema = z.object({
  scope: z.enum(['ALL', 'OWN', 'TEAM', 'RESPONSIBLE']),
  activeNow: z.number().int(),
  newInPeriod: comparisonSchema,
  convertedInPeriod: comparisonSchema,
  lostNow: z.number().int(),
  funnel: z.array(countItemSchema),
  origins: z.array(countItemSchema),
  categories: z.array(countItemSchema),
  contacts: z.object({
    today: z.number().int(),
    overdue: z.number().int(),
    upcoming: z.number().int(),
    withoutNextContact: z.number().int(),
  }),
  unassignedActive: z.number().int(),
  team: z.array(
    z.object({
      responsibleId: z.uuid(),
      responsible: z.string(),
      assigned: z.number().int(),
      active: z.number().int(),
      contactsPerformed: z.number().int(),
      converted: z.number().int(),
      lost: z.number().int(),
      overdue: z.number().int(),
    }),
  ),
});
export const dashboardOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  period: z.object({
    preset: dashboardPeriodSchema,
    label: z.string(),
    timezone: z.literal('America/Fortaleza'),
    from: z.iso.datetime(),
    toExclusive: z.iso.datetime(),
    previousFrom: z.iso.datetime(),
    previousToExclusive: z.iso.datetime(),
  }),
  consorcios: consorciosSchema.nullable(),
  quality: qualitySchema.nullable(),
  integrations: integrationsSchema.nullable(),
  imports: importsSchema.nullable(),
  crm: crmSchema.nullable(),
  attention: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['CRITICO', 'ALTO', 'MEDIO', 'INFORMATIVO']),
      title: z.string(),
      detail: z.string(),
      value: z.number().int(),
      href: z.string().startsWith('/dashboard/'),
    }),
  ),
  activity: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['LEAD', 'INTERACTION', 'INTEGRATION', 'IMPORT', 'QUALITY']),
      label: z.string(),
      detail: z.string(),
      occurredAt: z.iso.datetime(),
      href: z.string().startsWith('/dashboard/'),
    }),
  ),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type DashboardComparison = z.infer<typeof comparisonSchema>;
