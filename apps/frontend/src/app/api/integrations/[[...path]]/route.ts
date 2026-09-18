import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path?.join('/') ?? '';
  return `/api/v1/integrations${path ? `/${path}` : ''}${new URL(request.url).search}`;
}
export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
export async function POST(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context), 30_000);
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
