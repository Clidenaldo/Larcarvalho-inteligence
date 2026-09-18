import { createHash } from 'node:crypto';
import { permissionOverrideSchema, permissions, userRoles, type UpdateUserRequest, type PermissionOverride, type CreateTeam, type UpdateTeam } from '@larcarvalho/shared';

import type {
  AuthenticatedUser,
  CreateUserRequest,
  ManagedUser,
  Permission,
  UserListQuery,
  UserListResponse,
  UserRole,
} from '@larcarvalho/shared';

import type { AppConfig } from '../../config/env.js';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hashPassword, verifyPassword } from '../../core/auth/password.js';
import {
  canAssignRole,
  canManageUserRole,
  hasPermission,
  permissionsForActor,
  permissionsForRole,
  canDelegate,
} from '../../core/auth/rbac.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../core/auth/session-token.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { scopedUsers } from '../../core/auth/data-scope.js';

export interface RequestMetadata {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface LoginResult {
  readonly permissions?: readonly Permission[];
  readonly expiresAt: Date;
  readonly token: string;
  readonly user: AuthenticatedUser;
}

interface SafeUserRecord {
  readonly telefoneWhatsapp?: string | null;
  readonly teamId?: string | null;
  readonly team?: { id: string; name: string; manager: { id: string; nome: string } | null } | null;
  readonly sellerProfile?: { registration: string | null; hiredAt: Date | null; notes: string | null } | null;
  readonly ativo: boolean;
  readonly createdAt: Date;
  readonly email: string;
  readonly emailVerificadoEm: Date | null;
  readonly id: string;
  readonly nome: string;
  readonly role: UserRole;
  readonly ultimoLoginEm: Date | null;
  readonly updatedAt: Date;
}

const safeUserSelect = {
  telefoneWhatsapp: true,
  teamId: true,
  team: { select: { id: true, name: true, manager: { select: { id: true, nome: true } } } },
  sellerProfile: { select: { registration: true, hiredAt: true, notes: true } },
  ativo: true,
  createdAt: true,
  email: true,
  emailVerificadoEm: true,
  id: true,
  nome: true,
  role: true,
  ultimoLoginEm: true,
  updatedAt: true,
} as const;

const authUserSelect = { ...safeUserSelect,
  permissionOverrides: { select: { permission: true, effect: true } },
  team: { select: { id: true, name: true, active: true, manager: { select: { id: true, nome: true } } } },
  managedTeams: { where: { active: true }, select: { id: true } },
} as const;
function contextFor(sessionId: string, user: SafeUserRecord & {
  permissionOverrides?: Array<{ permission: string; effect: string }>;
  team?: (NonNullable<SafeUserRecord['team']> & { active?: boolean }) | null;
  managedTeams?: Array<{ id: string }>;
}): AuthContext {
  const overrides = permissionOverrideSchema.array().parse(user.permissionOverrides ?? []);
  const teamIds = [...new Set([...(user.team?.active ? [user.team.id] : []), ...(user.managedTeams ?? []).map((team) => team.id)])];
  return { sessionId, user: authenticationUser(user), ...(overrides.length ? { permissionOverrides: overrides } : {}), ...(teamIds.length ? { teamIds } : {}) };
}

const dummyPasswordHashPromise = hashPassword(
  'constant-time-login-verification-only',
);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function authenticationUser(user: SafeUserRecord): AuthenticatedUser {
  return {
    email: user.email,
    id: user.id,
    nome: user.nome,
    role: user.role,
  };
}

function managedUser(user: SafeUserRecord): ManagedUser {
  return {
    ...authenticationUser(user),
    telefoneWhatsapp: user.telefoneWhatsapp ?? null,
    teamId: user.teamId ?? null,
    team: user.team ?? null,
    sellerProfile: user.sellerProfile ? { ...user.sellerProfile, hiredAt: user.sellerProfile.hiredAt?.toISOString().slice(0, 10) ?? null } : null,
    ativo: user.ativo,
    createdAt: user.createdAt.toISOString(),
    emailVerificadoEm: user.emailVerificadoEm?.toISOString() ?? null,
    ultimoLoginEm: user.ultimoLoginEm?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}

function emailFingerprint(email: string): string {
  return createHash('sha256').update(email, 'utf8').digest('hex').slice(0, 16);
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function unauthorized(message = 'Não autenticado'): AppError {
  return new AppError({ code: 'UNAUTHORIZED', message, statusCode: 401 });
}

function forbidden(message = 'Acesso não autorizado'): AppError {
  return new AppError({ code: 'FORBIDDEN', message, statusCode: 403 });
}

function notFound(): AppError {
  return new AppError({
    code: 'NOT_FOUND',
    message: 'Usuário não encontrado',
    statusCode: 404,
  });
}

export class IdentityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
  ) {}

  private assertPermission(actor: AuthContext, permission: Permission): void {
    if (!hasPermission(actor, permission)) {
      throw forbidden();
    }
  }

  private async writeAudit(
    action: string,
    actorId: string | null,
    entityId: string | null,
    metadata: Record<string, boolean | number | string | null> | undefined,
    requestMetadata: RequestMetadata,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorId,
        entity: 'User',
        entityId,
        ipAddress: requestMetadata.ipAddress ?? null,
        ...(metadata === undefined ? {} : { metadata }),
        userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
      },
    });
  }

  async login(
    emailInput: string,
    password: string,
    requestMetadata: RequestMetadata,
  ): Promise<LoginResult> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordHash = user?.passwordHash ?? (await dummyPasswordHashPromise);
    const passwordMatches = await verifyPassword(passwordHash, password);

    if (!user || !passwordMatches || !user.ativo) {
      await this.writeAudit(
        'LOGIN_FAILED',
        null,
        null,
        { emailFingerprint: emailFingerprint(email) },
        requestMetadata,
      );
      throw unauthorized('Credenciais inválidas');
    }

    const token = createSessionToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000,
    );

    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      await transaction.session.create({
        data: {
          createdAt: now,
          expiresAt,
          ipAddress: requestMetadata.ipAddress ?? null,
          lastUsedAt: now,
          tokenHash: hashSessionToken(token),
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
          userId: user.id,
        },
      });
      const result = await transaction.user.update({
        data: { ultimoLoginEm: now },
        select: authUserSelect,
        where: { id: user.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'LOGIN_SUCCESS',
          actorId: user.id,
          entity: 'User',
          entityId: user.id,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
        },
      });
      return result;
    });

    return { expiresAt, token, user: authenticationUser(updatedUser), permissions: permissionsForActor(contextFor('', updatedUser)) };
  }

  async authenticate(token: string | undefined): Promise<AuthContext | null> {
    if (!token || token.length < 32 || token.length > 128) {
      return null;
    }

    const session = await this.prisma.session.findUnique({
      include: { user: { select: authUserSelect } },
      where: { tokenHash: hashSessionToken(token) },
    });
    const now = new Date();

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.ativo
    ) {
      if (session && !session.revokedAt) {
        await this.prisma.session.update({
          data: { revokedAt: now },
          where: { id: session.id },
        });
      }
      return null;
    }

    if (
      !session.lastUsedAt ||
      now.getTime() - session.lastUsedAt.getTime() >= 5 * 60 * 1000
    ) {
      await this.prisma.session.update({
        data: { lastUsedAt: now },
        where: { id: session.id },
      });
    }

    return contextFor(session.id, session.user);
  }

  async logout(
    actor: AuthContext,
    requestMetadata: RequestMetadata,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        data: { revokedAt: new Date() },
        where: { id: actor.sessionId, revokedAt: null },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'LOGOUT',
          actorId: actor.user.id,
          entity: 'User',
          entityId: actor.user.id,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
        },
      }),
    ]);
  }

  async changePassword(
    actor: AuthContext,
    currentPassword: string,
    newPassword: string,
    requestMetadata: RequestMetadata,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      select: { passwordHash: true },
      where: { id: actor.user.id },
    });

    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw unauthorized('Senha atual inválida');
    }

    if (await verifyPassword(user.passwordHash, newPassword)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'A nova senha deve ser diferente da senha atual',
        statusCode: 400,
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        data: { passwordHash },
        where: { id: actor.user.id },
      }),
      this.prisma.session.updateMany({
        data: { revokedAt: new Date() },
        where: {
          id: { not: actor.sessionId },
          revokedAt: null,
          userId: actor.user.id,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'PASSWORD_CHANGED',
          actorId: actor.user.id,
          entity: 'User',
          entityId: actor.user.id,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
        },
      }),
    ]);
  }

  async createUser(
    actor: AuthContext,
    input: CreateUserRequest,
    requestMetadata: RequestMetadata,
  ): Promise<ManagedUser> {
    this.assertPermission(actor, 'users.create');
    if (!canAssignRole(actor.user.role, input.role)) {
      throw forbidden('Papel não permitido para este administrador');
    }

    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
        await this.validateTeam(transaction, actor, input.teamId);
        if (input.sellerProfile && input.role !== 'VENDEDOR') throw forbidden('Perfil comercial exclusivo de vendedor');
        const created = await transaction.user.create({
          data: {
            email,
            nome: input.nome.trim(),
            passwordHash,
            role: input.role,
            ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
            ...(input.telefoneWhatsapp !== undefined ? { telefoneWhatsapp: input.telefoneWhatsapp } : {}),
            ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
            ...(input.role === 'VENDEDOR' ? { sellerProfile: { create: { registration: input.sellerProfile?.registration ?? null, notes: input.sellerProfile?.notes ?? null, hiredAt: input.sellerProfile?.hiredAt ? new Date(input.sellerProfile.hiredAt) : null } } } : {}),
          },
          select: safeUserSelect,
        });
        await transaction.auditLog.create({
          data: {
            action: 'USER_CREATED',
            actorId: actor.user.id,
            entity: 'User',
            entityId: created.id,
            ipAddress: requestMetadata.ipAddress ?? null,
            metadata: { role: created.role },
            userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
          },
        });
        return created;
      });
      return managedUser(user);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Já existe um usuário com este email',
          statusCode: 409,
        });
      }
      throw error;
    }
  }

  async listUsers(
    actor: AuthContext,
    query: UserListQuery,
  ): Promise<UserListResponse> {
    this.assertPermission(actor, 'users.read');
    const skip = (query.page - 1) * query.pageSize;
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.ativo ? { ativo: query.ativo === 'true' } : {}),
      ...(query.busca ? { OR: [{ nome: { contains: query.busca, mode: 'insensitive' } }, { email: { contains: query.busca, mode: 'insensitive' } }] } : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        select: safeUserSelect,
        skip,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map(managedUser),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async getUser(actor: AuthContext, id: string): Promise<ManagedUser> {
    this.assertPermission(actor, 'users.read');
    const user = await this.prisma.user.findUnique({
      select: safeUserSelect,
      where: { id },
    });
    if (!user) throw notFound();
    return managedUser(user);
  }

  async setUserStatus(
    actor: AuthContext,
    id: string,
    ativo: boolean,
    requestMetadata: RequestMetadata,
  ): Promise<ManagedUser> {
    this.assertPermission(actor, 'users.deactivate');
    const target = await this.prisma.user.findUnique({
      select: safeUserSelect,
      where: { id },
    });
    if (!target) throw notFound();
    if (actor.user.id === id && !ativo) {
      throw forbidden('Não é permitido desativar o próprio usuário');
    }
    if (!canManageUserRole(actor.user.role, target.role)) {
      throw forbidden('Este usuário não pode ser administrado pelo seu papel');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      if (!ativo && target.role === 'SUPER_ADMIN') {
        const activeSuperAdmins = await transaction.user.count({
          where: { ativo: true, role: 'SUPER_ADMIN' },
        });
        if (activeSuperAdmins <= 1) {
          throw new AppError({
            code: 'CONFLICT',
            message: 'O último SUPER_ADMIN ativo não pode ser desativado',
            statusCode: 409,
          });
        }
      }
      const user = await transaction.user.update({
        data: { ativo },
        select: safeUserSelect,
        where: { id },
      });
      if (!ativo) {
        await transaction.session.updateMany({
          data: { revokedAt: new Date() },
          where: { revokedAt: null, userId: id },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: ativo ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          actorId: actor.user.id,
          entity: 'User',
          entityId: id,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
        },
      });
      return user;
    });

    return managedUser(updated);
  }

  async changeUserRole(
    actor: AuthContext,
    id: string,
    role: UserRole,
    requestMetadata: RequestMetadata,
  ): Promise<ManagedUser> {
    this.assertPermission(actor, 'users.changeRole');
    if (actor.user.id === id) {
      throw forbidden('Não é permitido alterar o próprio papel');
    }
    const target = await this.prisma.user.findUnique({
      select: safeUserSelect,
      where: { id },
    });
    if (!target) throw notFound();
    if (
      !canManageUserRole(actor.user.role, target.role) ||
      !canAssignRole(actor.user.role, role)
    ) {
      throw forbidden('Alteração de papel não permitida');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const activeSuperAdmins = await transaction.user.count({
          where: { ativo: true, role: 'SUPER_ADMIN' },
        });
        if (target.ativo && activeSuperAdmins <= 1) {
          throw new AppError({
            code: 'CONFLICT',
            message: 'O último SUPER_ADMIN ativo não pode perder seu papel',
            statusCode: 409,
          });
        }
      }
      const user = await transaction.user.update({
        data: { role },
        select: safeUserSelect,
        where: { id },
      });
      await transaction.session.updateMany({
        data: { revokedAt: new Date() },
        where: { revokedAt: null, userId: id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'USER_ROLE_CHANGED',
          actorId: actor.user.id,
          entity: 'User',
          entityId: id,
          ipAddress: requestMetadata.ipAddress ?? null,
          metadata: { from: target.role, to: role },
          userAgent: requestMetadata.userAgent?.slice(0, 2048) ?? null,
        },
      });
      return user;
    });

    return managedUser(updated);
  }

  private async manageable(transaction: Prisma.TransactionClient, actor: AuthContext, id: string) {
    const target = await transaction.user.findUnique({ where: { id }, select: safeUserSelect });
    if (!target) throw notFound();
    if (actor.user.id === id || !canManageUserRole(actor.user.role, target.role)) throw forbidden('Este usuário não pode ser alterado por você');
    return target;
  }

  private async validateTeam(transaction: Prisma.TransactionClient, actor: AuthContext, teamId: string | null | undefined) {
    if (teamId === undefined) return;
    this.assertPermission(actor, 'teams.assign');
    if (teamId && !await transaction.team.findFirst({ where: { id: teamId, active: true } })) throw forbidden('Equipe indisponível');
  }

  private auditData(actor: AuthContext, action: string, entity: string, entityId: string, metadata: RequestMetadata) {
    return { actorId: actor.user.id, action, entity, entityId, ipAddress: metadata.ipAddress ?? null, userAgent: metadata.userAgent?.slice(0, 2048) ?? null };
  }

  async updateUser(actor: AuthContext, id: string, input: UpdateUserRequest, metadata: RequestMetadata) {
    this.assertPermission(actor, 'users.update');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
        const target = await this.manageable(transaction, actor, id);
        await this.validateTeam(transaction, actor, input.teamId);
        if (input.sellerProfile && target.role !== 'VENDEDOR') throw forbidden('Perfil comercial exclusivo de vendedor');
        const profile = input.sellerProfile ? { ...(input.sellerProfile.registration !== undefined ? { registration: input.sellerProfile.registration } : {}), ...(input.sellerProfile.notes !== undefined ? { notes: input.sellerProfile.notes } : {}), ...(input.sellerProfile.hiredAt !== undefined ? { hiredAt: input.sellerProfile.hiredAt ? new Date(input.sellerProfile.hiredAt) : null } : {}) } : undefined;
        const user = await transaction.user.update({ where: { id }, select: safeUserSelect, data: {
          ...(input.nome !== undefined ? { nome: input.nome } : {}), ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
          ...(input.telefoneWhatsapp !== undefined ? { telefoneWhatsapp: input.telefoneWhatsapp } : {}),
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
          ...(profile ? { sellerProfile: { upsert: { create: profile, update: profile } } } : {}),
        } });
        await transaction.auditLog.create({ data: this.auditData(actor, 'USER_UPDATED', 'User', id, metadata) });
        if (input.teamId !== undefined && input.teamId !== target.teamId) {
          await transaction.auditLog.create({ data: { ...this.auditData(actor, 'USER_TEAM_CHANGED', 'User', id, metadata), metadata: { from: target.teamId ?? null, to: input.teamId } } });
        }
        return managedUser(user);
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new AppError({ code: 'CONFLICT', message: 'Email já cadastrado', statusCode: 409 });
      throw error;
    }
  }

  async resetUserPassword(actor: AuthContext, id: string, password: string, metadata: RequestMetadata) {
    this.assertPermission(actor, 'users.reset_password');
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      await this.manageable(transaction, actor, id);
      await transaction.user.update({ where: { id }, data: { passwordHash } });
      await transaction.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await transaction.auditLog.create({ data: this.auditData(actor, 'USER_PASSWORD_RESET', 'User', id, metadata) });
    });
  }

  permissionMatrix(actor: AuthContext) {
    this.assertPermission(actor, 'users.permissions.manage');
    return { permissions, roles: userRoles.map((role) => ({ role, permissions: permissionsForRole(role) })), delegable: permissions.filter((permission) => canDelegate(actor, permission)) };
  }

  async getUserPermissions(actor: AuthContext, id: string) {
    this.assertPermission(actor, 'users.permissions.manage');
    const target = await this.prisma.user.findUnique({ where: { id }, select: authUserSelect });
    if (!target) throw notFound();
    if (!canManageUserRole(actor.user.role, target.role)) throw forbidden();
    const context = contextFor('', target);
    return { userId: id, role: target.role, overrides: context.permissionOverrides ?? [], effective: permissionsForActor(context), roleDefaults: permissionsForRole(target.role) };
  }

  async setUserPermissions(actor: AuthContext, id: string, overrides: PermissionOverride[], metadata: RequestMetadata) {
    this.assertPermission(actor, 'users.permissions.manage');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      const target = await this.manageable(transaction, actor, id);
      if (target.role === 'SUPER_ADMIN') throw forbidden('SUPER_ADMIN mantém acesso integral');
      const before = permissionOverrideSchema.array().parse(await transaction.userPermissionOverride.findMany({ where: { userId: id }, select: { permission: true, effect: true } }));
      const affected = new Set([...before, ...overrides].filter((entry) => before.find((x) => x.permission === entry.permission)?.effect !== overrides.find((x) => x.permission === entry.permission)?.effect).map((entry) => entry.permission));
      if ([...affected].some((permission) => !canDelegate(actor, permission))) throw forbidden('Permissão fora dos limites de delegação');
      await transaction.userPermissionOverride.deleteMany({ where: { userId: id } });
      if (overrides.length) await transaction.userPermissionOverride.createMany({ data: overrides.map((entry) => ({ ...entry, userId: id })) });
      await transaction.auditLog.create({ data: { ...this.auditData(actor, 'USER_PERMISSIONS_CHANGED', 'User', id, metadata), metadata: { before, after: overrides } } });
    });
    return this.getUserPermissions(actor, id);
  }

  async listTeams(actor: AuthContext) {
    this.assertPermission(actor, 'teams.read');
    const teams = await this.prisma.team.findMany({
      where: hasPermission(actor, 'teams.read_all') ? {} : { id: { in: [...(actor.teamIds ?? [])] }, active: true },
      orderBy: { name: 'asc' }, include: { manager: { select: { id: true, nome: true } }, members: { select: safeUserSelect, orderBy: { nome: 'asc' } } },
    });
    return { items: teams.map((team) => ({ ...team, members: team.members.map(managedUser), createdAt: team.createdAt.toISOString(), updatedAt: team.updatedAt.toISOString() })) };
  }

  async saveTeam(actor: AuthContext, id: string | null, input: CreateTeam | UpdateTeam, metadata: RequestMetadata) {
    this.assertPermission(actor, id ? 'teams.update' : 'teams.create');
    if (actor.user.role !== 'SUPER_ADMIN' && actor.user.role !== 'ADMIN') throw forbidden();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      if (input.managerId && !await transaction.user.findFirst({ where: { id: input.managerId, ativo: true, role: { in: ['GESTOR', 'ADMIN', 'SUPER_ADMIN'] } } })) throw forbidden('Gestor indisponível');
      if (id && !await transaction.team.findUnique({ where: { id } })) throw notFound();
      const data = { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.managerId !== undefined ? { managerId: input.managerId } : {}), ...(input.active !== undefined ? { active: input.active } : {}) };
      const team = id ? await transaction.team.update({ where: { id }, data }) : await transaction.team.create({ data: { ...data, name: input.name! } });
      await transaction.auditLog.create({ data: this.auditData(actor, id ? 'TEAM_UPDATED' : 'TEAM_CREATED', 'Team', team.id, metadata) });
      return { id: team.id };
    });
  }

  async assignTeamMember(actor: AuthContext, userId: string, teamId: string | null, metadata: RequestMetadata) {
    this.assertPermission(actor, 'teams.assign');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
      await this.manageable(transaction, actor, userId);
      await this.validateTeam(transaction, actor, teamId);
      const before = await transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { teamId: true } });
      await transaction.user.update({ where: { id: userId }, data: { teamId } });
      await transaction.auditLog.create({ data: { ...this.auditData(actor, 'USER_TEAM_CHANGED', 'User', userId, metadata), metadata: { from: before.teamId, to: teamId } } });
    });
  }

  async assignmentUsers(actor: AuthContext) {
    this.assertPermission(actor, 'leads.assign');
    return { items: (await this.prisma.user.findMany({ where: { AND: [{ ativo: true }, hasPermission(actor, 'leads.read_all') ? {} : scopedUsers(actor)] }, select: safeUserSelect, orderBy: { nome: 'asc' } })).map(managedUser) };
  }

  async listAccessAudit(actor: AuthContext, page: number) {
    this.assertPermission(actor, 'audit.read');
    const where = { entity: { in: ['User', 'Team', 'Lead', 'AppearanceConfiguration'] } };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50, select: { id: true, action: true, entity: true, entityId: true, createdAt: true, actorId: true } }),
      this.prisma.auditLog.count({ where }),
    ]);
    const ids = items.map((item) => item.actorId).filter((id): id is string => Boolean(id && /^[0-9a-f-]{36}$/i.test(id)));
    const actors = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } });
    return { items: items.map((item) => ({ ...item, actor: actors.find((user) => user.id === item.actorId) ?? null, createdAt: item.createdAt.toISOString() })), page, total, totalPages: Math.ceil(total / 50) };
  }

  async createFirstSuperAdmin(input: {
    readonly email: string;
    readonly nome: string;
    readonly password: string;
  }): Promise<ManagedUser> {
    const passwordHash = await hashPassword(input.password);
    const email = normalizeEmail(input.email);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(73003)`;
        if (
          (await transaction.user.count({ where: { role: 'SUPER_ADMIN' } })) > 0
        ) {
          throw new AppError({
            code: 'CONFLICT',
            message: 'O primeiro SUPER_ADMIN já foi criado',
            statusCode: 409,
          });
        }
        const created = await transaction.user.create({
          data: {
            email,
            nome: input.nome.trim(),
            passwordHash,
            role: 'SUPER_ADMIN',
          },
          select: safeUserSelect,
        });
        await transaction.auditLog.create({
          data: {
            action: 'USER_CREATED',
            entity: 'User',
            entityId: created.id,
            metadata: { bootstrap: true, role: 'SUPER_ADMIN' },
          },
        });
        return created;
      });
      return managedUser(user);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Já existe um usuário com este email',
          statusCode: 409,
        });
      }
      throw error;
    }
  }
}
