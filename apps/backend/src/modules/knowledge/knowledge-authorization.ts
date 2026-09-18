import type { KnowledgeDocumentStatus } from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface KnowledgeDocumentScopeFields {
  readonly ownerUserId: string | null;
  readonly status: KnowledgeDocumentStatus;
  readonly teamId: string | null;
  readonly visibility: 'PUBLIC' | 'TEAM' | 'PRIVATE';
}

export function knowledgeCanSeeAll(actor: AuthContext): boolean {
  return hasPermission(actor, 'knowledge.manage');
}

/**
 * SQL/Prisma predicate mirroring the row-level visibility rule. Documents are
 * only loaded when the actor would already be allowed to open them.
 */
export function knowledgeVisibilityFilter(
  actor: AuthContext,
): Prisma.KnowledgeDocumentWhereInput {
  if (knowledgeCanSeeAll(actor)) return {};
  const teamIds = [...(actor.teamIds ?? [])];
  const or: Prisma.KnowledgeDocumentWhereInput[] = [
    { visibility: 'PUBLIC' },
    { visibility: 'PRIVATE', ownerUserId: actor.user.id },
  ];
  if (teamIds.length > 0) or.push({ visibility: 'TEAM', teamId: { in: teamIds } });
  return { OR: or };
}

/**
 * Raw-SQL mirror of {@link knowledgeVisibilityFilter}, used by the ranked
 * lexical query so restricted documents are never returned by the database.
 */
export function knowledgeVisibilitySql(actor: AuthContext): Prisma.Sql {
  if (knowledgeCanSeeAll(actor)) return Prisma.sql`TRUE`;
  const parts: Prisma.Sql[] = [
    Prisma.sql`d."visibility" = 'PUBLIC'`,
    Prisma.sql`(d."visibility" = 'PRIVATE' AND d."owner_user_id" = ${actor.user.id}::uuid)`,
  ];
  const teamIds = [...(actor.teamIds ?? [])];
  if (teamIds.length > 0) {
    parts.push(
      Prisma.sql`(d."visibility" = 'TEAM' AND d."team_id" IN (${Prisma.join(
        teamIds.map((id) => Prisma.sql`${id}::uuid`),
      )}))`,
    );
  }
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

export function canViewDocument(
  actor: AuthContext,
  document: KnowledgeDocumentScopeFields,
): boolean {
  if (knowledgeCanSeeAll(actor)) return true;
  if (document.ownerUserId === actor.user.id) return true;
  if (document.visibility === 'PUBLIC') return true;
  if (
    document.visibility === 'TEAM' &&
    document.teamId !== null &&
    (actor.teamIds ?? []).includes(document.teamId)
  )
    return true;
  return false;
}

export function canManageDocument(
  actor: AuthContext,
  document: KnowledgeDocumentScopeFields,
): boolean {
  if (knowledgeCanSeeAll(actor)) return true;
  if (document.ownerUserId === actor.user.id) return true;
  return (
    hasPermission(actor, 'knowledge.update') &&
    document.visibility === 'TEAM' &&
    document.teamId !== null &&
    (actor.teamIds ?? []).includes(document.teamId)
  );
}

export function assertCanViewDocument(
  actor: AuthContext,
  document: KnowledgeDocumentScopeFields,
): void {
  if (!canViewDocument(actor, document))
    throw new AppError({
      code: 'KNOWLEDGE_NOT_FOUND',
      message: 'Documento de conhecimento não encontrado.',
      statusCode: 404,
    });
}

export function assertCanManageDocument(
  actor: AuthContext,
  document: KnowledgeDocumentScopeFields,
): void {
  if (!canViewDocument(actor, document))
    throw new AppError({
      code: 'KNOWLEDGE_NOT_FOUND',
      message: 'Documento de conhecimento não encontrado.',
      statusCode: 404,
    });
  if (!canManageDocument(actor, document))
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Acesso não autorizado',
      statusCode: 403,
    });
}
