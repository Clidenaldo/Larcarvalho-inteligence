import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path?.join('/') ?? '';
  const search = new URL(request.url).search;
  return `/api/v1/agenda${path ? `/${path}` : ''}${search}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
