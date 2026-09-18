import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return proxyIdentityRequest(r, `/api/v1/lances/${(await c.params).id}`);
}
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  return proxyIdentityRequest(r, `/api/v1/lances/${(await c.params).id}`);
}
