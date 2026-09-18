import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(
    request,
    `/api/v1/cotas/${(await context.params).id}/status`,
  );
}
