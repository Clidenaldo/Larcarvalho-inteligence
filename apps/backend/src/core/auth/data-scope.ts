import type { Permission } from '@larcarvalho/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from './auth-context.js';
import { hasPermission } from './rbac.js';
import { AppError } from '../errors/app-error.js';

export function requireAccess(actor: AuthContext, permission: Permission) {
  if (!hasPermission(actor, permission)) throw new AppError({ code: 'FORBIDDEN', message: 'Acesso não autorizado', statusCode: 403 });
}
export function dataScope(actor: AuthContext, module: 'leads' | 'simulations' | 'proposals' | 'sales', action: 'read' | 'update' | 'delete' = 'read'): 'OWN' | 'TEAM' | 'ALL' {
  if (hasPermission(actor, `${module}.${action}_all` as Permission)) return 'ALL';
  if (hasPermission(actor, `${module}.${action}_team` as Permission)) return 'TEAM';
  if (hasPermission(actor, `${module}.${action}_own` as Permission)) return 'OWN';
  throw new AppError({ code: 'FORBIDDEN', message: 'Acesso não autorizado', statusCode: 403 });
}
export function scopedUsers(actor: AuthContext): Prisma.UserWhereInput {
  return { OR: [{ id: actor.user.id }, { teamId: { in: [...(actor.teamIds ?? [])] } }, { managedTeams: { some: { id: { in: [...(actor.teamIds ?? [])] }, active: true } } }] };
}
export function leadScope(actor: AuthContext, action: 'read' | 'update' = 'read'): Prisma.LeadWhereInput {
  const scope = dataScope(actor, 'leads', action);
  if (scope === 'ALL') return {};
  return scope === 'OWN' ? { responsavelId: actor.user.id } : { responsavel: scopedUsers(actor) };
}
export function commercialScope(actor: AuthContext, module: 'simulations' | 'proposals', action: 'read' | 'update' | 'delete' = 'read') {
  const scope = dataScope(actor, module, action);
  if (scope === 'ALL') return {};
  if (scope === 'OWN') return { OR: [{ createdById: actor.user.id }, { lead: { responsavelId: actor.user.id } }] };
  return { OR: [{ createdBy: scopedUsers(actor) }, { lead: { responsavel: scopedUsers(actor) } }] };
}
export function saleScope(actor: AuthContext, action: 'read' | 'update' = 'read'): Prisma.SaleWhereInput {
  const scope = dataScope(actor, 'sales', action);
  if (scope === 'ALL') return {};
  if (scope === 'OWN') return { responsavelUserId: actor.user.id };
  return { responsavel: scopedUsers(actor) };
}
