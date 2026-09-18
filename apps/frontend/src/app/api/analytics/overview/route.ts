import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';
export async function GET(request: Request) {
  return proxyIdentityRequest(
    request,
    `/api/v1/analytics/overview${new URL(request.url).search}`,
  );
}
