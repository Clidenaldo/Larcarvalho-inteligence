import { proxyIdentityRequest } from '../../../services/api/identity-proxy';

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyIdentityRequest(
    request,
    `/api/v1/users?${url.searchParams.toString()}`,
  );
}

export async function POST(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/users');
}
