import {
  compararGruposRequestSchema,
  comparadorSearchQuerySchema,
} from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';
import { hasPermission } from '../src/core/auth/rbac.js';

describe('objective comparator contracts', () => {
  it('uses neutral defaults and a safe sort whitelist', () => {
    expect(comparadorSearchQuerySchema.parse({})).toMatchObject({
      status: 'ATIVO',
      incluirInativos: false,
      page: 1,
      pageSize: 20,
      sort: 'codigo',
      sortDirection: 'asc',
    });
    expect(() =>
      comparadorSearchQuerySchema.parse({ sort: 'DROP TABLE' }),
    ).toThrow();
  });
  it('accepts only one to five unique groups or plans', () => {
    const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
    expect(
      compararGruposRequestSchema.parse({ grupoIds: [ids[0]] }).grupoIds,
    ).toHaveLength(1);
    expect(() => compararGruposRequestSchema.parse({ grupoIds: [] })).toThrow();
    expect(() =>
      compararGruposRequestSchema.parse({ grupoIds: ids }),
    ).toThrow();
    expect(() =>
      compararGruposRequestSchema.parse({ grupoIds: [ids[0], ids[0]] }),
    ).toThrow();
    expect(
      compararGruposRequestSchema.parse({ grupoIds: ids.slice(0, 5) }).grupoIds,
    ).toHaveLength(5);
  });
  it('grants read-only comparison to every authenticated role', () => {
    for (const role of [
      'SUPER_ADMIN',
      'ADMIN',
      'GESTOR',
      'OPERADOR',
      'VENDEDOR',
    ] as const) {
      expect(hasPermission(role, 'comparador.read')).toBe(true);
      expect(hasPermission(role, 'indice_aderencia.read')).toBe(true);
    }
  });
});
