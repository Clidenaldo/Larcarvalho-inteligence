import { z } from 'zod';
import { createUserRequestSchema, managedUserSchema, permissionSchema, userRoleSchema, passwordSchema } from './auth.js';

export const permissionOverrideSchema = z.object({ permission: permissionSchema, effect: z.enum(['ALLOW', 'DENY']) }).strict();
export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;
export const userPermissionsSchema = z.object({
  userId: z.uuid(), role: userRoleSchema, overrides: z.array(permissionOverrideSchema),
  effective: z.array(permissionSchema), roleDefaults: z.array(permissionSchema),
});
export type UserPermissions = z.infer<typeof userPermissionsSchema>;
export const updatePermissionsSchema = z.object({
  overrides: z.array(permissionOverrideSchema).max(200).refine((items) => new Set(items.map((x) => x.permission)).size === items.length, 'Permissão repetida.'),
}).strict();
export const permissionMatrixSchema = z.object({
  permissions: z.array(permissionSchema),
  roles: z.array(z.object({ role: userRoleSchema, permissions: z.array(permissionSchema) })),
  delegable: z.array(permissionSchema),
});
export type PermissionMatrix = z.infer<typeof permissionMatrixSchema>;
export const updateUserRequestSchema = createUserRequestSchema.omit({ password: true, role: true, ativo: true }).partial().strict();
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export const resetUserPasswordSchema = z.object({ password: passwordSchema }).strict();
export const teamSchema = z.object({
  id: z.uuid(), name: z.string(), description: z.string().nullable(), active: z.boolean(),
  manager: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  members: z.array(managedUserSchema), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type Team = z.infer<typeof teamSchema>;
export const createTeamSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).nullable().optional(), managerId: z.uuid().nullable().optional(), active: z.boolean().optional() }).strict();
export const updateTeamSchema = createTeamSchema.partial().strict();
export type CreateTeam = z.infer<typeof createTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;
export const assignTeamMemberSchema = z.object({ userId: z.uuid(), teamId: z.uuid().nullable() }).strict();
export const teamListSchema = z.object({ items: z.array(teamSchema) });
