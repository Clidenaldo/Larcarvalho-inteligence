import type { AuthResponse, UserRole } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';

import { visibleNavigation } from '../src/components/app-shell';

function identity(
  role: UserRole,
  permissions: AuthResponse['permissions'],
): AuthResponse {
  return {
    permissions,
    user: {
      email: 'user@example.com',
      id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
      nome: 'Usuário',
      role,
    },
  };
}

function labels(value: AuthResponse): string[] {
  return visibleNavigation(value).flatMap((group) =>
    group.items.map((item) => item.label),
  );
}

describe('visual RBAC navigation', () => {
  it('does not expose administration to an operator', () => {
    const items = labels(identity('OPERADOR', ['dashboard.read']));
    expect(items).toContain('Visão geral');
    expect(items).not.toContain('Usuários');
    expect(items).not.toContain('Auditoria');
  });

  it('shows read-only user access to a manager', () => {
    const items = labels(identity('GESTOR', ['users.read']));
    expect(items).toContain('Usuários');
    expect(items).not.toContain('Integrações');
  });

  it('shows integrations only when the technical capability is granted', () => {
    expect(labels(identity('OPERADOR', ['integrations.read']))).toContain(
      'Integrações',
    );
    expect(labels(identity('VENDEDOR', []))).not.toContain('Integrações');
  });

  it('shows system navigation only to a super administrator', () => {
    const permissions: AuthResponse['permissions'] = [
      'users.read',
      'users.create',
      'users.update',
      'users.changeRole',
      'users.deactivate',
    ];
    expect(labels(identity('ADMIN', permissions))).not.toContain('Auditoria');
    expect(labels(identity('SUPER_ADMIN', [...permissions, 'audit.read']))).toContain('Auditoria');
  });

  it('limits appearance configuration to administrators', () => {
    expect(labels(identity('ADMIN', ['themes.admin.manage']))).toContain('Aparencia');
    expect(labels(identity('SUPER_ADMIN', ['themes.public.manage']))).toContain('Aparencia');
    expect(
      labels(identity('GESTOR', ['commercial_config.update'])),
    ).not.toContain('Aparencia');
  });

  it('keeps account and help available to authenticated users', () => {
    const items = labels(identity('VENDEDOR', []));
    expect(items).toEqual(expect.arrayContaining(['Minha conta', 'Ajuda']));
  });

  it('shows the knowledge base only with the read permission', () => {
    expect(labels(identity('OPERADOR', ['knowledge.read']))).toContain(
      'Base de conhecimento',
    );
    expect(labels(identity('VENDEDOR', []))).not.toContain(
      'Base de conhecimento',
    );
  });
});
