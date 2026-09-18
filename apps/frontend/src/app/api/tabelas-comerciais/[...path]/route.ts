import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const url = new URL(request.url);
  return `/api/v1/tabelas-comerciais/${path.map(encodeURIComponent).join('/')}${url.search}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context));
}
