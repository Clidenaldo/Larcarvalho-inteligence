import type { AuthenticatedUser, PermissionOverride } from '@larcarvalho/shared';

export interface AuthContext {
  readonly permissionOverrides?: readonly PermissionOverride[];
  readonly teamIds?: readonly string[];
  readonly sessionId: string;
  readonly user: AuthenticatedUser;
}
