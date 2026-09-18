import { z } from 'zod';

export const userRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'GESTOR',
  'VENDEDOR',
  'OPERADOR',
] as const;

export const userRoleSchema = z.enum(userRoles);
export const permissions = [
  'dashboard.read',
  'leads.read_team',
  'leads.update_team',
  'simulations.read_team',
  'simulations.update_team',
  'simulations.delete_team',
  'proposals.read_team',
  'proposals.update_team',
  'users.permissions.manage',
  'users.reset_password',
  'teams.read',
  'teams.read_all',
  'teams.create',
  'teams.update',
  'teams.assign',
  'themes.public.manage',
  'themes.admin.manage',
  'audit.read',
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
  'produtos.deactivate',
  'grupos.read',
  'grupos.create',
  'grupos.update',
  'grupos.deactivate',
  'cotas.read',
  'cotas.create',
  'cotas.update',
  'cotas.deactivate',
  'administradoras.read',
  'administradoras.create',
  'administradoras.update',
  'administradoras.deactivate',
  'importacoes.read',
  'importacoes.create',
  'importacoes.execute',
  'tabelas_comerciais.read',
  'tabelas_comerciais.create',
  'tabelas_comerciais.update',
  'tabelas_comerciais.import',
  'tabelas_comerciais.delete',
  'data_quality.read',
  'data_quality.review',
  'data_quality.resolve',
  'data_quality.scan',
  'historico_grupos.read',
  'historico_grupos.create',
  'comparador.read',
  'indice_aderencia.read',
  'leads.read_own',
  'leads.read_all',
  'leads.create',
  'leads.update_own',
  'leads.update_all',
  'leads.assign',
  'leads.change_status',
  'leads.add_interaction',
  'integrations.read',
  'integrations.create',
  'integrations.update',
  'integrations.execute',
  'integrations.logs',
  'integrations.test_connection',
  'integrations.pause',
  'integrations.credentials',
  'analytics.read',
  'simulations.read_own',
  'simulations.read_all',
  'simulations.create',
  'simulations.update_own',
  'simulations.update_all',
  'simulations.delete_own',
  'simulations.delete_all',
  'proposals.read_own',
  'proposals.read_all',
  'proposals.create',
  'proposals.update_own',
  'proposals.update_all',
  'proposals.export',
  'commercial_config.read',
  'commercial_config.update',
  'commercial_rules.read',
  'commercial_rules.manage',
  'users.read',
  'users.create',
  'users.update',
  'users.changeRole',
  'users.deactivate',
  'ai.use',
  'ai.lead_analysis',
  'ai.simulation_explain',
  'ai.comparison_analysis',
  'ai.draft_messages',
  'ai.manager_summary',
  'ai.sales_summary',
  'ai.settings',
  'ai.usage',
  'sales.read_own',
  'sales.read_team',
  'sales.read_all',
  'sales.create',
  'sales.update_own',
  'sales.update_team',
  'sales.update_all',
  'sales.change_status',
  'sales.assign',
  'sales.cancel',
  'contracts.read',
  'contracts.create',
  'contracts.update',
  'commissions.read',
  'commissions.create',
  'commissions.confirm',
  'commissions.receive',
  'commissions.reverse',
  'commission_rules.read',
  'commission_rules.manage',
  'knowledge.read',
  'knowledge.search',
  'knowledge.create',
  'knowledge.update',
  'knowledge.process',
  'knowledge.archive',
  'knowledge.manage',
] as const;
export const permissionSchema = z.enum(permissions);
export const passwordSchema = z.string().min(12).max(128);

const emailSchema = z.string().trim().max(254).pipe(z.email());
const userIdSchema = z.uuid();

export const authenticatedUserSchema = z.object({
  email: emailSchema,
  id: userIdSchema,
  nome: z.string().min(1).max(200),
  role: userRoleSchema,
});

export const managedUserSchema = authenticatedUserSchema.extend({
  telefoneWhatsapp: z.string().nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  team: z.object({ id: z.uuid(), name: z.string(), manager: z.object({ id: z.uuid(), nome: z.string() }).nullable() }).nullable().optional(),
  sellerProfile: z.object({ registration: z.string().nullable(), hiredAt: z.string().nullable(), notes: z.string().nullable() }).nullable().optional(),
  ativo: z.boolean(),
  createdAt: z.iso.datetime(),
  emailVerificadoEm: z.iso.datetime().nullable(),
  ultimoLoginEm: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const authResponseSchema = z.object({
  permissions: z.array(permissionSchema),
  user: authenticatedUserSchema,
});

export const changePasswordRequestSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const createUserRequestSchema = z.object({
  telefoneWhatsapp: z.string().trim().max(30).nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  ativo: z.boolean().optional(),
  sellerProfile: z.object({ registration: z.string().trim().max(80).nullable().optional(), hiredAt: z.iso.date().nullable().optional(), notes: z.string().trim().max(2000).nullable().optional() }).strict().optional(),
  email: emailSchema,
  nome: z.string().trim().min(2).max(200),
  password: passwordSchema,
  role: userRoleSchema,
});

export const updateUserStatusRequestSchema = z.object({
  ativo: z.boolean(),
});

export const updateUserRoleRequestSchema = z.object({
  role: userRoleSchema,
});

export const userListQuerySchema = z.object({
  busca: z.string().trim().max(200).optional(),
  role: userRoleSchema.optional(),
  teamId: z.uuid().optional(),
  ativo: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const userListResponseSchema = z.object({
  items: z.array(managedUserSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type UpdateUserRoleRequest = z.infer<typeof updateUserRoleRequestSchema>;
export type UpdateUserStatusRequest = z.infer<
  typeof updateUserStatusRequestSchema
>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
