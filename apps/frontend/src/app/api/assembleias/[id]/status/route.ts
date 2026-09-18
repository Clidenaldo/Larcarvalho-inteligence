import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(
    r,
    `/api/v1/assembleias/${(await c.params).id}/status`,
  );
}
