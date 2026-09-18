import type { Prisma } from '../../generated/prisma/client.js';

export function decimalMedian(
  orderedValues: readonly Prisma.Decimal[],
): Prisma.Decimal | null {
  if (orderedValues.length === 0) return null;
  if (orderedValues.length === 1) return orderedValues[0] ?? null;
  const left = orderedValues[0];
  const right = orderedValues[1];
  if (!left || !right) return null;
  return left.plus(right).dividedBy(2).toDecimalPlaces(6);
}
