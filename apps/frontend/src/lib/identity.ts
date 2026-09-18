import type { UserRole } from '@larcarvalho/shared';

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  OPERADOR: 'Operador',
  SUPER_ADMIN: 'Super administrador',
  VENDEDOR: 'Vendedor',
};
