import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';

export async function POST(request: Request) {
  return proxyIdentityRequest(request, '/api/v1/appearance/admin-theme/reset');
}
