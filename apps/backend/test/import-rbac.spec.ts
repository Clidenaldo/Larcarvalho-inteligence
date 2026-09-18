import { describe, expect, it } from 'vitest';
import { hasPermission } from '../src/core/auth/rbac.js';

describe('import RBAC', () => {
  it('allows operational roles to execute and denies sellers operational access', () => {
    for (const role of [
      'SUPER_ADMIN',
      'ADMIN',
      'GESTOR',
      'OPERADOR',
    ] as const) {
      expect(hasPermission(role, 'importacoes.read')).toBe(true);
      expect(hasPermission(role, 'importacoes.create')).toBe(true);
      expect(hasPermission(role, 'importacoes.execute')).toBe(true);
    }
    expect(hasPermission('VENDEDOR', 'importacoes.read')).toBe(false);
    expect(hasPermission('VENDEDOR', 'importacoes.create')).toBe(false);
    expect(hasPermission('VENDEDOR', 'importacoes.execute')).toBe(false);
  });
  it('applies the commercial table capability matrix', () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'GESTOR'] as const) {
      expect(hasPermission(role, 'tabelas_comerciais.read')).toBe(true);
      expect(hasPermission(role, 'tabelas_comerciais.create')).toBe(true);
      expect(hasPermission(role, 'tabelas_comerciais.update')).toBe(true);
      expect(hasPermission(role, 'tabelas_comerciais.import')).toBe(true);
    }
    expect(hasPermission('OPERADOR', 'tabelas_comerciais.read')).toBe(true);
    expect(hasPermission('OPERADOR', 'tabelas_comerciais.import')).toBe(true);
    expect(hasPermission('OPERADOR', 'tabelas_comerciais.create')).toBe(false);
    expect(hasPermission('VENDEDOR', 'tabelas_comerciais.read')).toBe(false);
    expect(hasPermission('VENDEDOR', 'tabelas_comerciais.import')).toBe(false);
  });
});
