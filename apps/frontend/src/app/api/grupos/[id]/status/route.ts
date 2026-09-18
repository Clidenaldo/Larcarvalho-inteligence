import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(
    request,
    `/api/v1/grupos/${(await context.params).id}/status`,
  );
}
