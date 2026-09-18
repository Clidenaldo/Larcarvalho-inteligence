import { z } from 'zod';
import { managedUserSchema, permissionMatrixSchema, teamListSchema, userPermissionsSchema } from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

async function read<T>(path: string, parse: (value: unknown) => T): Promise<T | 'unauthorized' | 'forbidden'> {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/${path}`, { cache: 'no-store', headers: { cookie: (await cookies()).toString() }, signal: AbortSignal.timeout(config.apiTimeoutMs) });
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403 || response.status === 404) return 'forbidden';
  if (!response.ok) throw new Error('Não foi possível carregar a gestão de acesso');
  return parse(await response.json());
}
export const getManagedUser = (id: string) => read(`users/${encodeURIComponent(id)}`, managedUserSchema.parse);
export const getTeams = () => read('teams', teamListSchema.parse);
export const getPermissionMatrix = () => read('users/permission-matrix', permissionMatrixSchema.parse);
export const getUserPermissions = (id: string) => read(`users/${encodeURIComponent(id)}/permissions`, userPermissionsSchema.parse);


export const getAssignmentUsers = () => read('users/assignment-options', z.object({ items: managedUserSchema.array() }).parse);
export const getAccessAudit = (page: number) => read(`users/audit?page=${page}`, z.object({ page: z.number(), total: z.number(), totalPages: z.number(), items: z.array(z.object({ id: z.string(), action: z.string(), entity: z.string(), entityId: z.string().nullable(), createdAt: z.string(), actor: z.object({ id: z.string(), nome: z.string() }).nullable() })) }).parse);
