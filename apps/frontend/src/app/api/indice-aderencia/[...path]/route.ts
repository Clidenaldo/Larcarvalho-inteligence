import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return `/api/v1/indice-aderencia/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
