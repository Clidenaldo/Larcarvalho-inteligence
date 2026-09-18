import {
  updateUserRequestSchema, resetUserPasswordSchema, updatePermissionsSchema, userPermissionsSchema, permissionMatrixSchema,
  createTeamSchema, updateTeamSchema, assignTeamMemberSchema, teamListSchema,
  createUserRequestSchema,
  managedUserSchema,
  updateUserRoleRequestSchema,
  updateUserStatusRequestSchema,
  userListQuerySchema,
  userListResponseSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type { IdentityService } from '../identity/identity.service.js';

interface UsersRoutesOptions {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
}

const userParamsSchema = z.object({ id: z.uuid() });

function requestMetadata(request: FastifyRequest): {
  ipAddress: string;
  userAgent?: string;
} {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip,
    ...(userAgent === undefined ? {} : { userAgent }),
  };
}

export const usersRoutes: FastifyPluginAsync<UsersRoutesOptions> = async (
  app,
  options,
) => {
  const authenticate = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const trustedOrigin = createRequireTrustedOrigin(options.config);
  app.get('/audit', { preHandler: [authenticate, requirePermission('audit.read')] }, async (request) => options.identityService.listAccessAudit(authenticatedContext(request), z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(request.query).page));

  app.get('/permission-matrix', { preHandler: [authenticate, requirePermission('users.permissions.manage')] }, async (request) => permissionMatrixSchema.parse(options.identityService.permissionMatrix(authenticatedContext(request))));
  app.get('/assignment-options', { preHandler: [authenticate, requirePermission('leads.assign')] }, async (request) => options.identityService.assignmentUsers(authenticatedContext(request)));
  app.patch('/:id', { preHandler: [trustedOrigin, authenticate, requirePermission('users.update')] }, async (request) => managedUserSchema.parse(await options.identityService.updateUser(authenticatedContext(request), userParamsSchema.parse(request.params).id, updateUserRequestSchema.parse(request.body), requestMetadata(request))));
  app.get('/:id/permissions', { preHandler: [authenticate, requirePermission('users.permissions.manage')] }, async (request) => userPermissionsSchema.parse(await options.identityService.getUserPermissions(authenticatedContext(request), userParamsSchema.parse(request.params).id)));
  app.put('/:id/permissions', { preHandler: [trustedOrigin, authenticate, requirePermission('users.permissions.manage')] }, async (request) => userPermissionsSchema.parse(await options.identityService.setUserPermissions(authenticatedContext(request), userParamsSchema.parse(request.params).id, updatePermissionsSchema.parse(request.body).overrides, requestMetadata(request))));
  app.post('/:id/reset-password', { preHandler: [trustedOrigin, authenticate, requirePermission('users.reset_password')] }, async (request, reply) => { await options.identityService.resetUserPassword(authenticatedContext(request), userParamsSchema.parse(request.params).id, resetUserPasswordSchema.parse(request.body).password, requestMetadata(request)); return reply.code(204).send(); });

  app.post(
    '/',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('users.create'),
      ],
    },
    async (request, reply) => {
      const input = createUserRequestSchema.parse(request.body);
      const user = await options.identityService.createUser(
        authenticatedContext(request),
        input,
        requestMetadata(request),
      );
      return reply.code(201).send(managedUserSchema.parse(user));
    },
  );

  app.get(
    '/',
    { preHandler: [authenticate, requirePermission('users.read')] },
    async (request) => {
      const query = userListQuerySchema.parse(request.query);
      const result = await options.identityService.listUsers(
        authenticatedContext(request),
        query,
      );
      return userListResponseSchema.parse(result);
    },
  );

  app.get(
    '/:id',
    { preHandler: [authenticate, requirePermission('users.read')] },
    async (request) => {
      const { id } = userParamsSchema.parse(request.params);
      const user = await options.identityService.getUser(
        authenticatedContext(request),
        id,
      );
      return managedUserSchema.parse(user);
    },
  );

  app.patch(
    '/:id/status',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('users.deactivate'),
      ],
    },
    async (request) => {
      const { id } = userParamsSchema.parse(request.params);
      const { ativo } = updateUserStatusRequestSchema.parse(request.body);
      const user = await options.identityService.setUserStatus(
        authenticatedContext(request),
        id,
        ativo,
        requestMetadata(request),
      );
      return managedUserSchema.parse(user);
    },
  );

  app.patch(
    '/:id/role',
    {
      preHandler: [
        trustedOrigin,
        authenticate,
        requirePermission('users.changeRole'),
      ],
    },
    async (request) => {
      const { id } = userParamsSchema.parse(request.params);
      const { role } = updateUserRoleRequestSchema.parse(request.body);
      const user = await options.identityService.changeUserRole(
        authenticatedContext(request),
        id,
        role,
        requestMetadata(request),
      );
      return managedUserSchema.parse(user);
    },
  );
};

export const teamsRoutes: FastifyPluginAsync<UsersRoutesOptions> = async (app, options) => {
  const authenticate = createAuthenticateRequest(options.identityService, options.config);
  const trustedOrigin = createRequireTrustedOrigin(options.config);
  app.get('/', { preHandler: [authenticate, requirePermission('teams.read')] }, async (request) => teamListSchema.parse(await options.identityService.listTeams(authenticatedContext(request))));
  app.post('/', { preHandler: [trustedOrigin, authenticate, requirePermission('teams.create')] }, async (request, reply) => reply.code(201).send(await options.identityService.saveTeam(authenticatedContext(request), null, createTeamSchema.parse(request.body), requestMetadata(request))));
  app.patch('/:id', { preHandler: [trustedOrigin, authenticate, requirePermission('teams.update')] }, async (request) => options.identityService.saveTeam(authenticatedContext(request), userParamsSchema.parse(request.params).id, updateTeamSchema.parse(request.body), requestMetadata(request)));
  app.put('/members', { preHandler: [trustedOrigin, authenticate, requirePermission('teams.assign')] }, async (request, reply) => { const input = assignTeamMemberSchema.parse(request.body); await options.identityService.assignTeamMember(authenticatedContext(request), input.userId, input.teamId, requestMetadata(request)); return reply.code(204).send(); });
};
