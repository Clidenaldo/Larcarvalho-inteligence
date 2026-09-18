import { Prisma } from '../../generated/prisma/client.js';

export const FinancialDecimal = Prisma.Decimal.clone({ precision: 50 });

export function hasChanges(
  current: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  return Object.entries(values).some(([key, value]) => {
    if (value === undefined) return false;
    const previous = current[key];
    if (previous instanceof Date)
      return previous.getTime() !== new Date(String(value)).getTime();
    if (Prisma.Decimal.isDecimal(previous))
      return value === null || !previous.eq(String(value));
    return previous !== value;
  });
}
