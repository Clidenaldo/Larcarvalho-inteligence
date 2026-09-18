import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(
    request,
    `/api/v1/produtos/${(await context.params).id}`,
  );
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(
    request,
    `/api/v1/produtos/${(await context.params).id}`,
  );
}
