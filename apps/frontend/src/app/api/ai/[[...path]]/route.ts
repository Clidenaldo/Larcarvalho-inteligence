import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';
import { proxyIdentityStream } from '../../../../services/api/identity-stream';

async function target(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path?.join('/') ?? '';
  const search = new URL(request.url).search;
  return {
    backendPath: `/api/v1/ai${path ? `/${path}` : ''}${search}`,
    isStream: path === 'chat/stream',
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, (await target(request, context)).backendPath);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { backendPath, isStream } = await target(request, context);
  if (isStream) return proxyIdentityStream(request, backendPath);
  return proxyIdentityRequest(request, backendPath);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, (await target(request, context)).backendPath);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return proxyIdentityRequest(request, (await target(request, context)).backendPath);
}
