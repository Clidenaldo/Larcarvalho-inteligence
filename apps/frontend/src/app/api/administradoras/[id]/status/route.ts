import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyIdentityRequest(request, `/api/v1/administradoras/${id}/status`);
}
