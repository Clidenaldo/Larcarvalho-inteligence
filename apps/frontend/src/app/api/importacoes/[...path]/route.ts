import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const query = url.search ? url.search : '';
  return `/api/v1/importacoes/${path.map(encodeURIComponent).join('/')}${query}`;
}
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context), 120_000);
}
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyIdentityRequest(request, await target(request, context), 120_000);
}
