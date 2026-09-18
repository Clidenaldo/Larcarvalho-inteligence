export {
  administradoraListQuerySchema,
  administradoraListResponseSchema,
  administradoraSchema,
  createAdministradoraRequestSchema,
  isValidCnpj,
  normalizeCnpj,
  updateAdministradoraRequestSchema,
  updateAdministradoraStatusRequestSchema,
  type Administradora,
  type AdministradoraListQuery,
  type AdministradoraListResponse,
  type CreateAdministradoraRequest,
  type UpdateAdministradoraRequest,
} from './contracts/administradoras.js';

export * from './contracts/operacional.js';
export * from './contracts/historico.js';
export * from './contracts/importacoes.js';
export * from './contracts/import-matrix.js';
export * from './contracts/data-quality.js';
export * from './contracts/grupo-historico.js';
export * from './contracts/comparador.js';
export * from './contracts/indice-aderencia.js';
export * from './contracts/simulador-publico.js';
export * from './contracts/leads.js';
export * from './contracts/integrations.js';
export * from './contracts/dashboard.js';
export * from './contracts/commercial-intelligence.js';
export * from './contracts/analytics.js';
export * from './contracts/tabelas-comerciais.js';
export * from './contracts/simulations.js';
export * from './contracts/experience.js';

export {
  apiErrorCodeSchema,
  apiErrorResponseSchema,
  apiPrefix,
  apiVersion,
  type ApiErrorCode,
  type ApiErrorResponse,
} from './contracts/api.js';

export {
  healthResponseSchema,
  readinessCheckSchema,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessCheck,
  type ReadinessResponse,
} from './contracts/health.js';

export {
  authenticatedUserSchema,
  authResponseSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  loginRequestSchema,
  managedUserSchema,
  passwordSchema,
  permissions,
  permissionSchema,
  updateUserRoleRequestSchema,
  updateUserStatusRequestSchema,
  userListQuerySchema,
  userListResponseSchema,
  userRoles,
  userRoleSchema,
  type AuthenticatedUser,
  type AuthResponse,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type LoginRequest,
  type ManagedUser,
  type Permission,
  type UpdateUserRoleRequest,
  type UpdateUserStatusRequest,
  type UserListQuery,
  type UserListResponse,
  type UserRole,
} from './contracts/auth.js';
export * from './contracts/public-theme.js';
export * from './contracts/admin-theme.js';
export * from './contracts/access-management.js';
export * from './contracts/simulation-catalog.js';
export * from './contracts/follow-ups.js';
export * from './contracts/agenda.js';
export * from './contracts/ai.js';
export * from './contracts/knowledge-base.js';
export * from './contracts/sales.js';
