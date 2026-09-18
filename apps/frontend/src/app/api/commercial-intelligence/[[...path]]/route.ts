import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = (await context.params).path ?? [];
  return proxyIdentityRequest(request, `/api/v1/commercial-intelligence/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`);
}
