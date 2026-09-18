import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/core/auth/password.js';
import {
  canAssignRole,
  canManageUserRole,
  hasPermission,
  permissionsForRole,
} from '../src/core/auth/rbac.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../src/core/auth/session-token.js';

describe('authentication cryptography', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const hash = await hashPassword('uma frase senha segura');

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'uma frase senha segura')).resolves.toBe(
      true,
    );
    await expect(verifyPassword(hash, 'senha incorreta')).resolves.toBe(false);
    await expect(
      verifyPassword('invalid-hash', 'qualquer senha'),
    ).resolves.toBe(false);
  });

  it('creates opaque tokens and deterministic non-reversible hashes', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toBe(second);
    expect(first).not.toContain('=');
    expect(hashSessionToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
    expect(hashSessionToken(first)).not.toContain(first);
  });
});

describe('central RBAC policy', () => {
  it('grants capabilities explicitly instead of by implicit hierarchy', () => {
    expect(hasPermission('SUPER_ADMIN', 'users.changeRole')).toBe(true);
    expect(hasPermission('ADMIN', 'users.create')).toBe(true);
    expect(hasPermission('GESTOR', 'users.read')).toBe(false);
    expect(hasPermission('GESTOR', 'users.create')).toBe(false);
    expect(hasPermission('VENDEDOR', 'administradoras.read')).toBe(false);
    expect(hasPermission('OPERADOR', 'administradoras.create')).toBe(false);
  });

  it('prevents ADMIN from managing privileged roles', () => {
    expect(canAssignRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'GESTOR')).toBe(true);
    expect(canManageUserRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canManageUserRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
  });

  it('returns the effective capabilities for the authenticated identity', () => {
    expect(permissionsForRole('GESTOR')).toEqual([
      'dashboard.read', 'leads.read_team', 'leads.update_team', 'simulations.read_team', 'simulations.update_team', 'proposals.read_team', 'proposals.update_team', 'teams.read',
      'assembleias.read',
      'assembleias.create',
      'assembleias.update',
      'lances.read',
      'lances.create',
      'lances.update',
      'contemplacoes.read',
      'contemplacoes.create',
      'contemplacoes.update',
      'produtos.read',
      'produtos.create',
      'produtos.update',
      'grupos.read',
      'grupos.create',
      'grupos.update',
      'cotas.read',
      'cotas.create',
      'cotas.update',
      'administradoras.read',
      'importacoes.read',
      'importacoes.create',
      'importacoes.execute',
      'tabelas_comerciais.read',
      'tabelas_comerciais.create',
      'tabelas_comerciais.update',
      'tabelas_comerciais.import',
      'data_quality.read',
      'data_quality.review',
      'data_quality.resolve',
      'data_quality.scan',
      'historico_grupos.read',
      'historico_grupos.create',
      'comparador.read',
      'indice_aderencia.read',
      'leads.create',
      'leads.assign',
      'leads.change_status',
      'leads.add_interaction',
      'integrations.read',
      'integrations.execute',
      'integrations.logs',
      'integrations.test_connection',
      'simulations.create',
      'proposals.create',
      'proposals.export',
      'commercial_config.read',
      'commercial_rules.read',
      'ai.use',
      'ai.lead_analysis',
      'ai.simulation_explain',
      'ai.comparison_analysis',
      'ai.draft_messages',
      'ai.manager_summary',
      'ai.sales_summary',
      'sales.read_team',
      'sales.create',
      'sales.update_team',
      'sales.change_status',
      'sales.assign',
      'sales.cancel',
      'contracts.read',
      'contracts.create',
      'contracts.update',
      'commissions.read',
      'commissions.create',
      'commissions.confirm',
      'commission_rules.read',
      'knowledge.read',
      'knowledge.search',
      'knowledge.create',
      'knowledge.update',
      'knowledge.process',
      'knowledge.archive',
    ]);
    expect(permissionsForRole('OPERADOR')).toEqual([
      'dashboard.read',
      'assembleias.read',
      'lances.read',
      'contemplacoes.read',
      'produtos.read',
      'grupos.read',
      'cotas.read',
      'administradoras.read',
      'importacoes.read',
      'importacoes.create',
      'importacoes.execute',
      'tabelas_comerciais.read',
      'tabelas_comerciais.import',
      'data_quality.read',
      'data_quality.review',
      'historico_grupos.read',
      'comparador.read',
      'indice_aderencia.read',
      'integrations.read',
      'integrations.execute',
      'integrations.logs',
      'simulations.read_own',
      'proposals.read_own',
      'commercial_config.read',
      'commercial_rules.read',
      'ai.use',
      'knowledge.read',
      'knowledge.search',
    ]);
  });
});
