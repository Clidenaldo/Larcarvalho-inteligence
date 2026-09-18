import type { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Versioned pricing. Prices are stored as integer micros per million tokens
 * (1 currency unit = 1.000.000 micros) — never float. Unknown model →
 * cost null (never invented, never R$ 0,00).
 */
export class AiPricingService {
  constructor(private readonly db: PrismaClient) {}

  async getActivePrice(
    provider: string,
    model: string,
  ): Promise<{
    currency: string;
    inputPerMillionMicros: bigint;
    outputPerMillionMicros: bigint;
    cachedPerMillionMicros: bigint | null;
  } | null> {
    const row = await this.db.aiPricing.findFirst({
      where: { active: true, model, provider },
      orderBy: { validFrom: 'desc' },
    });
    if (!row) return null;
    return {
      cachedPerMillionMicros: row.cachedPerMillionMicros,
      currency: row.currency,
      inputPerMillionMicros: row.inputPerMillionMicros,
      outputPerMillionMicros: row.outputPerMillionMicros,
    };
  }

  /**
   * Exact integer math in micros. All intermediate values stay far below
   * 2^53 under enforced token limits; result is returned as a safe number
   * for JSON transport.
   */
  computeCostMicros(
    inputTokens: number | null,
    outputTokens: number | null,
    cachedTokens: number | null,
    price: {
      cachedPerMillionMicros: bigint | null;
      inputPerMillionMicros: bigint;
      outputPerMillionMicros: bigint;
    },
  ): number {
    const input = BigInt(Math.max(0, inputTokens ?? 0));
    const output = BigInt(Math.max(0, outputTokens ?? 0));
    const cached = BigInt(Math.max(0, cachedTokens ?? 0));
    const cachedRate = price.cachedPerMillionMicros ?? price.inputPerMillionMicros;
    const total =
      (input * price.inputPerMillionMicros +
        output * price.outputPerMillionMicros +
        cached * cachedRate +
        500_000n) /
      1_000_000n;
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('AI_COST_OVERFLOW');
    }
    return Number(total);
  }

  async listActive(): Promise<
    readonly {
      active: boolean;
      cachedPerMillionMicros: number | null;
      createdAt: string;
      currency: string;
      id: string;
      inputPerMillionMicros: number;
      model: string;
      outputPerMillionMicros: number;
      provider: string;
      updatedAt: string;
      validFrom: string;
    }[]
  > {
    const rows = await this.db.aiPricing.findMany({
      orderBy: [{ provider: 'asc' }, { model: 'asc' }],
    });
    return rows.map((row) => ({
      active: row.active,
      cachedPerMillionMicros:
        row.cachedPerMillionMicros === null ? null : Number(row.cachedPerMillionMicros),
      createdAt: row.createdAt.toISOString(),
      currency: row.currency,
      id: row.id,
      inputPerMillionMicros: Number(row.inputPerMillionMicros),
      model: row.model,
      outputPerMillionMicros: Number(row.outputPerMillionMicros),
      provider: row.provider,
      updatedAt: row.updatedAt.toISOString(),
      validFrom: row.validFrom.toISOString(),
    }));
  }

  async upsert(input: {
    active: boolean;
    cachedPerMillionMicros?: number | null | undefined;
    currency: string;
    inputPerMillionMicros: number;
    model: string;
    outputPerMillionMicros: number;
    provider: string;
    validFrom?: string | undefined;
  }): Promise<{ id: string }> {
    const row = await this.db.aiPricing.upsert({
      create: {
        active: input.active,
        cachedPerMillionMicros:
          input.cachedPerMillionMicros === undefined
            ? null
            : input.cachedPerMillionMicros === null
              ? null
              : BigInt(input.cachedPerMillionMicros),
        currency: input.currency,
        inputPerMillionMicros: BigInt(input.inputPerMillionMicros),
        model: input.model,
        outputPerMillionMicros: BigInt(input.outputPerMillionMicros),
        provider: input.provider,
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
      },
      update: {
        active: input.active,
        cachedPerMillionMicros:
          input.cachedPerMillionMicros === undefined
            ? null
            : input.cachedPerMillionMicros === null
              ? null
              : BigInt(input.cachedPerMillionMicros),
        currency: input.currency,
        inputPerMillionMicros: BigInt(input.inputPerMillionMicros),
        outputPerMillionMicros: BigInt(input.outputPerMillionMicros),
        validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
      },
      where: {
        provider_model: { model: input.model, provider: input.provider },
      },
    });
    return { id: row.id };
  }
}
