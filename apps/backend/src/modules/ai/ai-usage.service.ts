import type { AiUsageStatus } from '@larcarvalho/shared';

import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { AiPricingService } from './ai-pricing.service.js';

export interface UsageLimits {
  readonly dailyCostLimitMicros: number | null;
  readonly dailyTokenLimit: number | null;
  readonly maxTokensPerRequest: number | null;
  readonly monthlyCostLimitMicros: number | null;
}

export interface UsageReservation {
  readonly estimated: boolean;
  readonly usageId: string;
}

export interface UsageActuals {
  readonly costMicros: number | null;
  readonly currency: string | null;
  readonly errorCode?: string | null;
  readonly estimated: boolean;
  readonly inputTokens: number | null;
  readonly latencyMs: number;
  readonly outputTokens: number | null;
  readonly status: AiUsageStatus;
  readonly totalTokens: number | null;
}

const WARNING_RATIO = 0.8;
const RESERVATION_TTL_MINUTES = 15;

/**
 * Telemetry + hard-limit enforcement. Concurrency-safe by design:
 * reserve-check pairs run serialized under a transaction-scoped advisory
 * lock, so two simultaneous requests cannot both slip under a hard limit
 * (fail-closed on contention, never over-admission).
 */
export class AiUsageService {
  constructor(
    private readonly db: PrismaClient,
    private readonly pricing: AiPricingService,
  ) {}

  private lockKey(scope: string): string {
    return `ai_limit:${scope}`;
  }

  private dayStart(now = new Date()): Date {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private monthStart(now = new Date()): Date {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async reserveAndCheck(
    entry: {
      contextType: string;
      estimatedTotalTokens: number;
      model: string;
      promptId?: string;
      promptVersion?: string;
      provider: string;
      userId: string | null;
    },
    limits: UsageLimits,
  ): Promise<UsageReservation> {
    // The check runs inside a transaction (lock + reserve + aggregate) so
    // concurrent requests serialize. A violation is recorded OUTSIDE the
    // transaction: throwing inside would roll the audit row back.
    let reservationId: string | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.lockKey('global')}))`;
        const created = await tx.aiUsage.create({
          data: {
            contextType: entry.contextType,
            estimated: true,
            latencyMs: 0,
            model: entry.model,
            promptId: entry.promptId ?? null,
            promptVersion: entry.promptVersion ?? null,
            provider: entry.provider,
            status: 'reserved',
            totalTokens: entry.estimatedTotalTokens,
            userId: entry.userId,
          },
          select: { id: true },
        });
        reservationId = created.id;
        const now = new Date();
        const recentReserved = {
          status: 'reserved',
          createdAt: {
            gt: new Date(now.getTime() - RESERVATION_TTL_MINUTES * 60_000),
          },
        };
        // Quota counts real consumption + in-flight reservations. Denied
        // attempts (status 'limit') never consume quota.
        const consumed = { status: { in: ['ok', 'error', 'timeout', 'cancelled'] } };
        const sums = await tx.aiUsage.aggregate({
          _sum: { costMicros: true, totalTokens: true },
          where: {
            OR: [consumed, recentReserved],
            createdAt: { gte: this.dayStart(now) },
          },
        });
        const monthSums = await tx.aiUsage.aggregate({
          _sum: { costMicros: true },
          where: {
            OR: [consumed, recentReserved],
            createdAt: { gte: this.monthStart(now) },
          },
        });
        const tokensToday = Number(sums._sum.totalTokens ?? 0n);
        const costToday = sums._sum.costMicros === null ? 0 : Number(sums._sum.costMicros);
        const costMonth =
          monthSums._sum.costMicros === null ? 0 : Number(monthSums._sum.costMicros);
        const violation =
          (limits.dailyTokenLimit !== null &&
            tokensToday > limits.dailyTokenLimit) ||
          (limits.dailyCostLimitMicros !== null &&
            costToday > limits.dailyCostLimitMicros) ||
          (limits.monthlyCostLimitMicros !== null &&
            costMonth > limits.monthlyCostLimitMicros);
        if (violation) throw new Error('AI_USAGE_LIMIT_VIOLATION');
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'AI_USAGE_LIMIT_VIOLATION') {
        // The check transaction rolled back: persist the blocked attempt
        // separately so denials stay observable.
        await this.recordDirect({
          contextType: entry.contextType,
          costMicros: null,
          currency: null,
          errorCode: 'USAGE_LIMIT_EXCEEDED',
          estimated: true,
          inputTokens: null,
          latencyMs: 0,
          model: entry.model,
          outputTokens: null,
          promptId: entry.promptId,
          promptVersion: entry.promptVersion,
          provider: entry.provider,
          status: 'limit',
          totalTokens: entry.estimatedTotalTokens,
          userId: entry.userId,
        }).catch(() => undefined);
        throw new AppError({
          code: 'USAGE_LIMIT_EXCEEDED',
          message: 'Limite de consumo de IA atingido. Tente novamente mais tarde.',
          statusCode: 429,
        });
      }
      throw error;
    }
    if (!reservationId) throw new Error('AI_USAGE_RESERVATION_LOST');
    return { estimated: true, usageId: reservationId };
  }

  async finalize(usageId: string, actuals: UsageActuals): Promise<void> {
    await this.db.aiUsage.update({
      data: {
        costMicros:
          actuals.costMicros === null ? null : BigInt(actuals.costMicros),
        currency: actuals.currency,
        errorCode: actuals.errorCode ?? null,
        estimated: actuals.estimated,
        inputTokens: actuals.inputTokens,
        latencyMs: actuals.latencyMs,
        outputTokens: actuals.outputTokens,
        status: actuals.status,
        totalTokens: actuals.totalTokens,
      },
      where: { id: usageId },
    });
  }

  async recordDirect(
    entry: {
      contextType: string;
      costMicros: number | null;
      currency: string | null;
      errorCode?: string | null | undefined;
      estimated: boolean;
      inputTokens: number | null;
      latencyMs: number;
      model: string;
      outputTokens: number | null;
      promptId?: string | undefined;
      promptVersion?: string | undefined;
      provider: string;
      status: AiUsageStatus;
      totalTokens: number | null;
      userId: string | null;
    },
  ): Promise<{ id: string }> {
    const row = await this.db.aiUsage.create({
      data: {
        contextType: entry.contextType,
        costMicros: entry.costMicros === null ? null : BigInt(entry.costMicros),
        currency: entry.currency,
        errorCode: entry.errorCode ?? null,
        estimated: entry.estimated,
        inputTokens: entry.inputTokens,
        latencyMs: entry.latencyMs,
        model: entry.model,
        outputTokens: entry.outputTokens,
        promptId: entry.promptId ?? null,
        promptVersion: entry.promptVersion ?? null,
        provider: entry.provider,
        status: entry.status,
        totalTokens: entry.totalTokens,
        userId: entry.userId,
      },
      select: { id: true },
    });
    return { id: row.id };
  }

  async summarize(limits: UsageLimits): Promise<{
    costMicros: number | null;
    currency: string | null;
    dailyCostLimitMicros: number | null;
    dailyTokenLimit: number | null;
    inputTokens: number;
    monthlyCostLimitMicros: number | null;
    outputTokens: number;
    period: string;
    requests: number;
    tokensToday: number;
    warning: string | null;
  }> {
    const now = new Date();
    const [today, month, priced] = await Promise.all([
      this.db.aiUsage.aggregate({
        _count: true,
        _sum: { costMicros: true, inputTokens: true, outputTokens: true, totalTokens: true },
        where: { createdAt: { gte: this.dayStart(now) }, status: 'ok' },
      }),
      this.db.aiUsage.aggregate({
        _sum: { costMicros: true },
        where: { createdAt: { gte: this.monthStart(now) }, status: 'ok' },
      }),
      this.db.aiUsage.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { currency: true },
        where: { costMicros: { not: null }, createdAt: { gte: this.dayStart(now) } },
      }),
    ]);
    const tokensToday = Number(today._sum.totalTokens ?? 0n);
    const costSum = today._sum.costMicros;
    const monthCostSum = month._sum.costMicros;
    let warning: string | null = null;
    if (
      limits.dailyTokenLimit !== null &&
      tokensToday >= limits.dailyTokenLimit * WARNING_RATIO
    ) {
      warning = `Consumo diário em ${Math.round((tokensToday / limits.dailyTokenLimit) * 100)}% do limite.`;
    }
    const costTodayValue = costSum === null ? null : Number(costSum);
    if (
      warning === null &&
      limits.dailyCostLimitMicros !== null &&
      costTodayValue !== null &&
      costTodayValue >= limits.dailyCostLimitMicros * WARNING_RATIO
    ) {
      warning = 'Custo diário próximo do limite configurado.';
    }
    if (
      warning === null &&
      limits.monthlyCostLimitMicros !== null &&
      monthCostSum !== null &&
      Number(monthCostSum) >= limits.monthlyCostLimitMicros * WARNING_RATIO
    ) {
      warning = 'Custo mensal próximo do limite configurado.';
    }
    return {
      costMicros: costTodayValue,
      currency: costTodayValue === null ? null : (priced?.currency ?? null),
      dailyCostLimitMicros: limits.dailyCostLimitMicros,
      dailyTokenLimit: limits.dailyTokenLimit,
      inputTokens: Number(today._sum.inputTokens ?? 0n),
      monthlyCostLimitMicros: limits.monthlyCostLimitMicros,
      outputTokens: Number(today._sum.outputTokens ?? 0n),
      period: 'today',
      requests: today._count,
      tokensToday,
      warning,
    };
  }

  async list(
    filters: {
      contextType?: string | undefined;
      from?: string | undefined;
      page: number;
      pageSize: number;
      status?: AiUsageStatus | undefined;
      to?: string | undefined;
    },
  ): Promise<{ items: readonly Record<string, unknown>[]; total: number }> {
    const where: Prisma.AiUsageWhereInput = {
      ...(filters.contextType ? { contextType: filters.contextType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.db.aiUsage.count({ where }),
      this.db.aiUsage.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        where,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        costMicros: row.costMicros === null ? null : Number(row.costMicros),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
    };
  }
}
