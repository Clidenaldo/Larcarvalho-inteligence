import { proxyIdentityRequest } from '../../../services/api/identity-proxy';

export async function GET(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/appearance');
}

export async function PATCH(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/appearance');
}
