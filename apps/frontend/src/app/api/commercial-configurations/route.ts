import { proxyIdentityRequest } from '../../../services/api/identity-proxy';

export async function GET(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/commercial-configurations');
}
export async function PATCH(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/commercial-configurations');
}
