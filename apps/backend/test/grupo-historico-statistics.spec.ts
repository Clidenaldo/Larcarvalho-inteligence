import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { hasPermission } from '../src/core/auth/rbac.js';
import { decimalMedian } from '../src/modules/grupo-historico/snapshot-statistics.js';

describe('grupo snapshot exact statistics', () => {
  it('calculates odd, even and empty medians with Decimal precision', () => {
    expect(decimalMedian([])).toBeNull();
    expect(decimalMedian([new Prisma.Decimal('10.123456')])?.toString()).toBe(
      '10.123456',
    );
    expect(
      decimalMedian([
        new Prisma.Decimal('10.123456'),
        new Prisma.Decimal('20.654321'),
      ])?.toFixed(6),
    ).toBe('15.388889');
  });
  it('enforces the snapshot RBAC policy', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'GESTOR'] as const) {
      expect(hasPermission(role, 'historico_grupos.read')).toBe(true);
      expect(hasPermission(role, 'historico_grupos.create')).toBe(true);
    }
    for (const role of ['OPERADOR', 'VENDEDOR'] as const) {
      expect(hasPermission(role, 'historico_grupos.read')).toBe(role !== 'VENDEDOR');
      expect(hasPermission(role, 'historico_grupos.create')).toBe(false);
    }
  });
});
