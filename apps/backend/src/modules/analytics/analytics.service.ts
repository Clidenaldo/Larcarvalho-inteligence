import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type {
  AnalyticsEventRequest,
  AnalyticsOverview,
  AnalyticsQuery,
} from '@larcarvalho/shared';

const clean = (value: string | null | undefined, max: number) =>
  value?.trim().slice(0, max) || null;
const cleanHost = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return (
      new URL(value.includes('://') ? value : `https://${value}`).hostname
        .toLowerCase()
        .slice(0, 255) || null
    );
  } catch {
    return null;
  }
};
const rate = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;
const fortalezaToday = () => {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const parts = date.split('-');
  const year = Number(parts[0] ?? 0);
  const month = Number(parts[1] ?? 0);
  const day = Number(parts[2] ?? 0);
  return new Date(Date.UTC(year, month - 1, day, 3));
};

export class AnalyticsService {
  constructor(private readonly db: PrismaClient) {}

  async record(input: AnalyticsEventRequest): Promise<void> {
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const session = await tx.analyticsSession.upsert({
        where: { anonymousId: input.anonymousId },
        create: {
          anonymousId: input.anonymousId,
          startedAt: now,
          lastSeenAt: now,
          landingPath: input.path,
          referrerHost: cleanHost(input.referrerHost),
          utmSource: clean(input.utmSource, 100),
          utmMedium: clean(input.utmMedium, 100),
          utmCampaign: clean(input.utmCampaign, 150),
          utmContent: clean(input.utmContent, 150),
          utmTerm: clean(input.utmTerm, 150),
          deviceClass: input.metadata?.deviceClass ?? null,
        },
        // First-touch fields are intentionally never updated.
        update: { lastSeenAt: now },
      });
      await tx.analyticsEvent.create({
        data: {
          sessionId: session.id,
          type: input.type,
          path: input.path,
          category: clean(input.category, 40),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
    });
  }

  async overview(query: AnalyticsQuery): Promise<AnalyticsOverview> {
    const now = new Date();
    const to = query.period === 'custom' ? new Date(query.to as string) : now;
    const from =
      query.period === 'custom'
        ? new Date(query.from as string)
        : query.period === 'today'
          ? fortalezaToday()
          : new Date(
              to.getTime() - Number(query.period.slice(0, -1)) * 86400000,
            );
    const rows = await this.db.$queryRaw<
      Array<{ type: string; count: bigint }>
    >(Prisma.sql`
      SELECT type, COUNT(*)::bigint AS count FROM analytics_events
      WHERE occurred_at >= ${from} AND occurred_at < ${to} GROUP BY type`);
    const counts = new Map(rows.map((item) => [item.type, Number(item.count)]));
    const value = (type: string) => counts.get(type) ?? 0;
    const visits = value('LANDING_VIEWED'),
      started = value('SIMULATION_STARTED');
    const completed = value('SIMULATION_COMPLETED'),
      results = value('RESULTS_VIEWED');
    const forms = value('LEAD_FORM_OPENED'),
      leads = value('LEAD_CREATED');
    const [campaigns, channels, categories, devices] = await Promise.all([
      this.db.$queryRaw<
        Array<{
          campaign: string;
          source: string;
          medium: string;
          visits: bigint;
          simulations: bigint;
          leads: bigint;
        }>
      >(Prisma.sql`
        SELECT COALESCE(s.utm_campaign,'(direct)') campaign, COALESCE(s.utm_source,'(direct)') source,
          COALESCE(s.utm_medium,'(none)') medium,
          COUNT(*) FILTER (WHERE e.type='LANDING_VIEWED') visits,
          COUNT(*) FILTER (WHERE e.type='SIMULATION_STARTED') simulations,
          COUNT(*) FILTER (WHERE e.type='LEAD_CREATED') leads
        FROM analytics_sessions s JOIN analytics_events e ON e.session_id=s.id
        WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to}
        GROUP BY 1,2,3 ORDER BY leads DESC, simulations DESC LIMIT 50`),
      this.db.$queryRaw<
        Array<{
          source: string;
          medium: string;
          referrer_host: string;
          visits: bigint;
          simulations: bigint;
          leads: bigint;
        }>
      >(Prisma.sql`
        SELECT COALESCE(s.utm_source,'(direct)') source, COALESCE(s.utm_medium,'(none)') medium,
          COALESCE(s.referrer_host,'(none)') referrer_host,
          COUNT(*) FILTER (WHERE e.type='LANDING_VIEWED') visits,
          COUNT(*) FILTER (WHERE e.type='SIMULATION_STARTED') simulations,
          COUNT(*) FILTER (WHERE e.type='LEAD_CREATED') leads
        FROM analytics_sessions s JOIN analytics_events e ON e.session_id=s.id
        WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to}
        GROUP BY 1,2,3 ORDER BY leads DESC LIMIT 50`),
      this.db.$queryRaw<
        Array<{ key: string; simulations: bigint; leads: bigint }>
      >(Prisma.sql`
        SELECT COALESCE(e.category,'OUTROS') key, COUNT(*) FILTER (WHERE e.type='SIMULATION_STARTED') simulations,
          COUNT(*) FILTER (WHERE e.type='LEAD_CREATED') leads FROM analytics_events e
        WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to} GROUP BY 1 ORDER BY leads DESC`),
      this.db.$queryRaw<
        Array<{
          device: string;
          visits: bigint;
          simulations: bigint;
          leads: bigint;
        }>
      >(Prisma.sql`
        SELECT COALESCE(s.device_class,'UNKNOWN') device, COUNT(*) FILTER (WHERE e.type='LANDING_VIEWED') visits,
          COUNT(*) FILTER (WHERE e.type='SIMULATION_STARTED') simulations, COUNT(*) FILTER (WHERE e.type='LEAD_CREATED') leads
        FROM analytics_sessions s JOIN analytics_events e ON e.session_id=s.id
        WHERE e.occurred_at >= ${from} AND e.occurred_at < ${to} GROUP BY 1 ORDER BY leads DESC`),
    ]);
    const mapRow = (item: {
      key: string;
      simulations: bigint;
      leads: bigint;
    }) => ({
      key: item.key,
      label: item.key,
      simulations: Number(item.simulations),
      leads: Number(item.leads),
      conversion: rate(Number(item.leads), Number(item.simulations)),
    });
    return {
      period: query.period,
      from: from.toISOString(),
      to: to.toISOString(),
      visits,
      simulationsStarted: started,
      simulationsCompleted: completed,
      resultsViewed: results,
      formsOpened: forms,
      leads,
      whatsappClicks: value('WHATSAPP_CLICKED'),
      rates: {
        landingToSimulation: rate(started, visits),
        startedToCompleted: rate(completed, started),
        resultsToForm: rate(forms, results),
        formToLead: rate(leads, forms),
        completedToLead: rate(leads, completed),
        landingToLead: rate(leads, visits),
      },
      campaigns: campaigns.map((x) => ({
        ...x,
        key: x.campaign,
        label: x.campaign,
        visits: Number(x.visits),
        simulations: Number(x.simulations),
        leads: Number(x.leads),
        conversion: rate(Number(x.leads), Number(x.visits)),
      })),
      channels: channels.map((x) => ({
        ...x,
        key: `${x.source}:${x.medium}:${x.referrer_host}`,
        label: `${x.source} / ${x.medium}`,
        referrerHost: x.referrer_host,
        visits: Number(x.visits),
        simulations: Number(x.simulations),
        leads: Number(x.leads),
        conversion: rate(Number(x.leads), Number(x.visits)),
      })),
      categories: categories.map(mapRow),
      devices: devices.map((x) => ({
        key: x.device,
        label: x.device,
        device: x.device,
        visits: Number(x.visits),
        simulations: Number(x.simulations),
        leads: Number(x.leads),
        conversion: rate(Number(x.leads), Number(x.visits)),
      })),
    };
  }
}
