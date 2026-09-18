import { proxyIdentityRequest } from '../../../../../../services/api/identity-proxy';

async function target(
  request: Request,
  context: { params: Promise<{ id: string; path?: string[] }> },
) {
  const { id, path = [] } = await context.params;
  const url = new URL(request.url);
  const suffix = path.length
    ? `/${path.map(encodeURIComponent).join('/')}`
    : '';
  return `/api/v1/grupos/${encodeURIComponent(id)}/historico${suffix}${url.search}`;
}
type Context = { params: Promise<{ id: string; path?: string[] }> };
export async function GET(request: Request, context: Context) {
  return proxyIdentityRequest(request, await target(request, context));
}
export async function POST(request: Request, context: Context) {
  return proxyIdentityRequest(request, await target(request, context), 120_000);
}
