import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/core/auth/auth-context.js';
import { canDelegate, hasPermission, permissionsForActor } from '../src/core/auth/rbac.js';
import { dataScope, leadScope } from '../src/core/auth/data-scope.js';
const actor: AuthContext = { sessionId: 'session', user: { id: 'user', nome: 'Maria', email: 'maria@example.test', role: 'VENDEDOR' } };
describe('individual permissions and scopes', () => {
  it('denies role defaults, allows individual grants, and resolves conflicting records as DENY', () => {
    const restricted: AuthContext = { ...actor, permissionOverrides: [{ permission: 'comparador.read', effect: 'DENY' }, { permission: 'users.read', effect: 'ALLOW' }] };
    expect(hasPermission(restricted, 'comparador.read')).toBe(false);
    expect(hasPermission(restricted, 'users.read')).toBe(true);
    expect(permissionsForActor(restricted)).not.toContain('comparador.read');
    expect(hasPermission({ ...restricted, permissionOverrides: [...restricted.permissionOverrides!, { permission: 'users.read', effect: 'DENY' }] }, 'users.read')).toBe(false);
  });
  it('keeps SUPER_ADMIN complete and prohibits administrative delegation of security capabilities', () => {
    const admin = { ...actor, user: { ...actor.user, role: 'ADMIN' as const } };
    expect(canDelegate(admin, 'comparador.read')).toBe(true);
    expect(canDelegate(admin, 'users.permissions.manage')).toBe(false);
    expect(canDelegate(admin, 'themes.admin.manage')).toBe(false);
    expect(canDelegate({ ...admin, permissionOverrides: [{ permission: 'comparador.read', effect: 'DENY' }] }, 'comparador.read')).toBe(false);
    expect(hasPermission({ ...actor, user: { ...actor.user, role: 'SUPER_ADMIN' }, permissionOverrides: [{ permission: 'users.read', effect: 'DENY' }] }, 'users.read')).toBe(true);
  });
  it('requires an explicit data scope even for an owned record', () => {
    expect(dataScope(actor, 'leads')).toBe('OWN');
    expect(leadScope(actor)).toEqual({ responsavelId: 'user' });
    expect(() => dataScope({ ...actor, permissionOverrides: [{ permission: 'leads.read_own', effect: 'DENY' }] }, 'leads')).toThrow();
    expect(dataScope({ ...actor, permissionOverrides: [{ permission: 'leads.read_team', effect: 'ALLOW' }] }, 'leads')).toBe('TEAM');
    expect(dataScope({ ...actor, permissionOverrides: [{ permission: 'leads.read_all', effect: 'ALLOW' }] }, 'leads')).toBe('ALL');
  });
});
